#!/usr/bin/env bash
# Compare every built extension image of a runtime with the sysroot it was
# built from, and fail if an image holds fewer files than its sysroot.
#
# Catches the failure in avocado-cli#283: an image built from an unpopulated
# sysroot and then reused by every later build because its inputs never
# changed. Read-only: the build volume is mounted :ro and each image is
# loop-mounted read-only in a throwaway container.
#
# Usage: check-avocado-build.sh [project-dir] [runtime] [target]
#   project-dir  defaults to .
#   runtime      defaults to default_runtime in avocado.yaml
#   target       defaults to default_target in avocado.yaml
set -euo pipefail

proj=${1:-.}
runtime=${2:-}
target=${3:-}

yaml_scalar() { # yaml_scalar <key> <file>: top-level scalar, quotes stripped
	sed -n "s/^$1:[[:space:]]*//p" "$2" | head -n1 | tr -d "\"'" | sed 's/[[:space:]]*#.*//'
}

[ -f "$proj/avocado.yaml" ] || { echo "no avocado.yaml in $proj" >&2; exit 2; }
[ -f "$proj/.avocado-state" ] || { echo "no .avocado-state in $proj (never built?)" >&2; exit 2; }

runtime=${runtime:-$(yaml_scalar default_runtime "$proj/avocado.yaml")}
target=${target:-$(yaml_scalar default_target "$proj/avocado.yaml")}
[ -n "$runtime" ] || { echo "pass a runtime (no default_runtime in avocado.yaml)" >&2; exit 2; }
[ -n "$target" ] || { echo "pass a target (no default_target in avocado.yaml)" >&2; exit 2; }

volume=$(sed -n 's/.*"volume_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$proj/.avocado-state")
[ -n "$volume" ] || { echo "could not read volume_name from .avocado-state" >&2; exit 2; }

# On macOS/Windows the SDK runs inside avocado-vm, not the host Docker.
if [ -z "${DOCKER_HOST:-}" ] && [ -S "$HOME/.avocado/vm/docker.sock" ]; then
	export DOCKER_HOST="unix://$HOME/.avocado/vm/docker.sock"
fi

# `docker run -v name:...` silently CREATES a missing volume. Refuse instead,
# so a stale .avocado-state can't leave an empty volume behind.
if ! docker volume inspect "$volume" >/dev/null 2>&1; then
	echo "volume $volume does not exist (did 'avocado clean' replace it?)" >&2
	exit 2
fi

sdk_image=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -m1 '^avocadolinux/sdk:' || true)
[ -n "$sdk_image" ] || { echo "no local avocadolinux/sdk image to run checks in" >&2; exit 2; }

ext_dir="/v/$target/runtimes/$runtime/extensions"
# Pair each extension sysroot with its image. Both names and versions may
# contain '-', so read the exact <name>-<version> from the extension's own
# release file (extension-release.<name>-<version>) rather than guessing.
pairs=$(docker run --rm -v "$volume:/v:ro" --entrypoint /bin/sh "$sdk_image" -c "
	cd '$ext_dir' 2>/dev/null || exit 0
	for d in */; do
		d=\${d%/}
		rel=\$(ls \"\$d/usr/lib/extension-release.d\" \"\$d/etc/extension-release.d\" 2>/dev/null \
			| grep -m1 \"^extension-release\\.\$d-\" || true)
		[ -n \"\$rel\" ] || continue
		raw=\"\${rel#extension-release.}.raw\"
		[ -f \"\$raw\" ] && echo \"\$d \$raw\"
	done
")
[ -n "$pairs" ] || { echo "no extension images under $ext_dir" >&2; exit 2; }

echo "volume $volume, target $target, runtime $runtime"
printf '%-45s %8s %8s  %s\n' EXTENSION SYSROOT IMAGE RESULT
failed=0
while read -r name raw; do
	# One container per image: a privileged container only sees the loop
	# devices that existed when it started, so reusing one runs out.
	result=$(docker run --rm --privileged -v "$volume:/v:ro" --entrypoint /bin/bash "$sdk_image" -c "
		set -e
		sys='$ext_dir/$name'
		# Same exclusions as the CLI's image step: package-manager state is never shipped.
		s=\$(cd \"\$sys\" 2>/dev/null && find usr etc opt -mindepth 1 \\( -type f -o -type l \\) 2>/dev/null \
			| grep -v -E '^etc/(dnf|rpm)/' | wc -l)
		mkdir -p /m
		if mount -t erofs -o loop,ro '$ext_dir/$raw' /m 2>/dev/null; then
			i=\$(cd /m && find . -mindepth 1 \\( -type f -o -type l \\) | wc -l)
		elif mount -t squashfs -o loop,ro '$ext_dir/$raw' /m 2>/dev/null; then
			i=\$(cd /m && find . -mindepth 1 \\( -type f -o -type l \\) | wc -l)
		else
			i=unmountable
		fi
		echo \"\$s \$i\"
	" </dev/null)
	sys_count=${result% *}
	img_count=${result#* }
	status=ok
	if [ "$img_count" = unmountable ]; then
		status="WARN could not mount image"
	elif [ "$img_count" -lt "$sys_count" ]; then
		status="FAIL image has fewer files than its sysroot"
		failed=1
	fi
	printf '%-45s %8s %8s  %s\n' "$name" "$sys_count" "$img_count" "$status"
done <<<"$pairs"

if [ "$failed" -ne 0 ]; then
	cat >&2 <<-EOF

	One or more images are missing files that their sysroot has. Do not flash.
	Clean the affected extensions and rebuild:
	  avocado ext clean -r $runtime <extension>
	  avocado install && avocado build
	EOF
	exit 1
fi
