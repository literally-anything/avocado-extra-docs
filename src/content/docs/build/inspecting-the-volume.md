---
title: Inspecting the build volume
description: How to look inside Avocado's build volume on macOS and Linux, read-only, without creating stray volumes.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` with `avocado-vm` on macOS (Apple Silicon).
:::

Everything the build produces lives in one Docker volume per project. Reading it directly is the fastest way to answer "what is actually in my image?"

## Find the volume

`.avocado-state` in your project names it:

```json
{ "volume_name": "avo-52af1990-a831-4d65-9162-659bc4e7993a", "source_path": "...", "container_tool": "docker" }
```

**`avocado clean` deletes the volume.** The next build creates a new one under a new name and rewrites `.avocado-state`. Always read the name fresh; don't reuse one from your shell history.

## Point Docker at the right daemon

On **macOS and Windows**, the CLI runs its containers inside the `avocado-vm` helper VM, not in Docker Desktop. The VM exposes its own socket:

```bash
export DOCKER_HOST=unix://$HOME/.avocado/vm/docker.sock
```

`avocado vm status` shows whether the VM is running. On **Linux**, the CLI uses your normal Docker daemon.

## Never mount a volume that might not exist

`docker run -v <name>:/v` **creates** an empty volume called `<name>` if it doesn't exist. After an `avocado clean`, an old name from your history quietly makes an empty volume and shows you nothing. Check first:

```bash
docker volume inspect "$VOL" >/dev/null && echo exists
```

`avocado prune` removes volumes that no project refers to any more.

## Browse read-only

Use the SDK image you already have, and always mount the volume `:ro`:

```bash
VOL=$(sed -n 's/.*"volume_name": *"\([^"]*\)".*/\1/p' .avocado-state)
docker volume inspect "$VOL" >/dev/null &&
docker run --rm -it -v "$VOL:/v:ro" --entrypoint /bin/bash avocadolinux/sdk:2024
```

Useful paths inside it (see [Mental model](../../start/mental-model/#where-state-lives) for the full layout):

| Path | What |
|---|---|
| `/v/<target>/rootfs/` | Rootfs sysroot. The image adds a few files at build time, such as an empty `/etc/machine-id`. |
| `/v/<target>/runtimes/<rt>/extensions/<ext>/` | An extension's sysroot |
| `/v/<target>/runtimes/<rt>/extensions/*.raw` | Built extension images, hard links to `output/extensions/` |
| `/v/<target>/output/runtimes/<rt>/stone/` | Everything the flash tooling uses |
| `/v/<target>/output/runtimes/<rt>/os-bundle.aos` | The OS bundle used for deploys |
| `/v/<target>/.stamps/` | The up-to-date records |
| `/v/<target>/includes/<ext>/avocado.yaml` | The config of each fetched extension, as merged |

## Look inside an image

Extension images are EROFS (the default) or squashfs. To read the files the device will get, loop-mount the image read-only. That needs a privileged container, and **one container per image**, because a privileged container only sees the loop devices that existed when it started. The SDK image has no `umount` or `losetup`, but the mount goes away when the container exits.

```bash
docker run --rm --privileged -v "$VOL:/v:ro" --entrypoint /bin/bash avocadolinux/sdk:2024 -c '
  mkdir -p /m
  mount -t erofs -o loop,ro /v/<target>/runtimes/<rt>/extensions/<ext>-<ver>.raw /m
  find /m | head -50
  cat /m/usr/lib/extension-release.d/*'
```

Quick checks:

- **Sizes.** `ls -la /v/<target>/output/extensions/`. A 4096-byte image contains nothing but its release file. On Jetson, the BSP extension should be tens of MB.
- **Release files.** `cat <sysroot>/usr/lib/extension-release.d/*` shows the `AVOCADO_ON_MERGE`, `SYSEXT_SCOPE` and other lines the device will act on.
- **Enabled services.** `ls <sysroot>/etc/systemd/system/*.wants/`.

`scripts/check-avocado-build.sh` in this repository does the image-versus-sysroot comparison for every extension of a runtime. See [Build state](../stale-state/#verify-before-you-flash).

## Tools in the SDK image

`dtc`, `fdtget` and the other SDK host tools live under `/opt/_avocado/<target>/sdk/<arch>/usr/bin`. They only run with the SDK's loader and libraries. If you mount the volume somewhere other than `/opt/_avocado`, they fail with `cannot execute: required file not found`. Mount it at the real path when you need them:

```bash
docker run --rm -v "$VOL:/opt/_avocado:ro" --entrypoint /bin/bash avocadolinux/sdk:2024 -c '
  /opt/_avocado/<target>/sdk/aarch64/usr/bin/dtc -I dtb -O dts <file.dtbo>'
```
