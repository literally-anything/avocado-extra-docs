---
title: Config schema
description: Every avocado.yaml key the CLI actually reads, with its type, default and behaviour, based on the CLI source rather than the published schema.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/utils/config.rs` typed structs, plus every `.get("<key>")` read of the untyped `extensions` and `runtimes` sections). Compared against the official JSON schema published on docs.peridio.com as of 2026-09-24.
:::

**◆** marks a key that is **missing from the official schema**. The machine-readable version of this page is [`/schema/avocado.schema.json`](../../config/json-schema/).

Keep in mind:
- **Unknown keys are ignored silently at every level** ([details](../../config/format/#unknown-keys-are-silently-ignored)).
- Every string can use [templates](../../config/templating/).
- Mappings accept [`target-<name>:` and `kernel-<spec>:` overrides](../../config/overrides/) where noted.

## Top level

| Key | Type | Default | Description |
|---|---|---|---|
| `cli_requirement` | string (semver range) | none | The CLI refuses to run if its version doesn't satisfy this. Pre-release tags are stripped before comparing ([details](../../config/format/#cli_requirement)). |
| `source_date_epoch` | integer | none | Fixed timestamp for reproducible images. Separately, `avocado sbom` reads the `SOURCE_DATE_EPOCH` environment variable. |
| `default_target` | string | none | Target used when there's no `--target` and no `AVOCADO_TARGET`. |
| `default_target_board` | string | none | Lowest-priority source for `{{ avocado.target.board }}`. |
| `supported_targets` | `'*'` or list of strings | none | Targets this project builds for. Also decides which bare target-name keys count as legacy overrides. |
| `default_runtime` ◆ | string | none | Runtime used when there's no `-r` and no `AVOCADO_RUNTIME`. It must name a defined runtime, which is checked at load time. |
| `src_dir` | string | the config file's directory | Root for every relative script, overlay and file path. It's mounted at `/opt/src` in the SDK container. |
| `distro` | [mapping](#distro) | | Feed release and channel |
| `repos` ◆ | map of name → [repo](#repos) | none | Extra named package feeds. They're only enabled when listed in `distro.feeds`. |
| `sdk` | [mapping](#sdk) | | SDK container and cross-compile setup |
| `kernel` | [kernel](#kernel), or map of name → kernel | none | Kernel source and command line |
| `rootfs` ◆ | [image](#rootfs-and-initramfs), or map of name → image | `{ packages: { avocado-pkg-rootfs: '*' } }` | Rootfs contents and build |
| `initramfs` ◆ | [image](#rootfs-and-initramfs), or map of name → image | `{ packages: { avocado-pkg-initramfs: '*' } }` | Initramfs contents and build |
| `permissions` ◆ | [permissions](#permissions), or map of name → permissions | none | Users and groups, referenced from `rootfs` and `initramfs` |
| `runtimes` (alias `runtime`) | map of name → [runtime](#runtimes) | | Deployable runtimes |
| `extensions` | map of name → [extension](#extensions) | | Extensions. Names can contain templates. |
| `provision_profiles` (alias `provision`) | map of name → [profile](#provision_profiles) | | Settings for each `avocado provision` profile |
| `signing_keys` | list of single-key maps (`- name: key-id`) | none | Maps friendly key names to entries in the machine's signing-key registry |
| `connect` ◆ | [mapping](#connect) | none | Defaults for `avocado connect` commands |

## `distro`

| Key | Type | Default | Description |
|---|---|---|---|
| `release` (alias `version`) | string or integer | none | Feed year, `2024` or `2026`. Overridden by `AVOCADO_DISTRO_RELEASE`. |
| `channel` | string | none | `next`, `edge` or `stable` ([details](../../build/releases-and-channels/)). Overridden by `AVOCADO_DISTRO_CHANNEL`. |
| `repo` | name of a `repos` entry, or [inline repo](#distrorepo) | `https://repo.avocadolinux.org` | The distro feed |
| `feeds` ◆ | list of `repos` names | only the distro feed | Enabled feeds, highest priority first. The distro feed comes first unless you list it explicitly. |

### `distro.repo`

| Key | Type | Default | Description |
|---|---|---|---|
| `url` | string | `https://repo.avocadolinux.org` | Base URL. Don't include `$releasever` or `$target`: the path is added for you. Overridden by `AVOCADO_REPO_URL`. |
| `releasever` | string | `<release>/<channel>` | Explicit releasever. Overridden by `AVOCADO_RELEASEVER`. |
| `ca` ◆ | string (path) | none | PEM CA certificate to trust for the feed. Overridden by `AVOCADO_REPO_CA`. |
| `tls_verify` ◆ | boolean | `true` | `false` skips TLS verification (testing only). `AVOCADO_REPO_INSECURE=1` does the same. |

## `repos`

Each entry needs **exactly one** of `url`, `org` or `path`.

| Key | Type | Description |
|---|---|---|
| `url` | string | Remote feed. `$releasever` and `$target` are expanded by the CLI. |
| `org` | string | Private feed hosted on Avocado Connect, accessed through your logged-in profile. It can't carry its own credentials. |
| `path` | string | Local directory of RPMs with `repodata/`, relative to the config file. It's bind-mounted into the container. |
| `release`, `channel`, `releasever` | string | Makes this a distro-shaped feed. A `url` feed that sets these must contain `$releasever`. |
| `gpgkey` | string | GPG key for package signatures |
| `gpgcheck` | boolean | Default `true` when `gpgkey` is set |
| `targets` | list | Only enable this feed for these targets |
| `stages` | list | Only enable it during these build stages |
| `username`, `password` | string | Credentials. Supply them as `{{ env.X }}`; an unset variable becomes an empty string. |
| `ca`, `tls_verify` | | As in `distro.repo` |

## `sdk`

| Key | Type | Default | Description |
|---|---|---|---|
| `image` | string | none, and required | SDK container image. `sdk:2024` is a moving tag; pin one ([details](../../build/releases-and-channels/#switching-release-or-channel)). |
| `packages` (alias `dependencies`) | [package map](../../config/format/#package-entries) | none | Packages installed into the SDK |
| `compile` | map of name → [compile section](#sdkcompilename) | none | Cross-compile steps |
| `container_args` | list of strings, or one string | none | Extra `docker run` arguments. A string is split on spaces; `\ ` and quotes are respected. |
| `repo_url`, `repo_release` | string | none | **Legacy.** Use `distro.repo.url` and `distro.repo.releasever`. |
| `disable_weak_dependencies` | boolean | none | Don't install packages that are only recommended |
| `host_uid`, `host_gid` | integer | your UID/GID | For translating file ownership back to your host. Overridden by `AVOCADO_HOST_UID` and `AVOCADO_HOST_GID`. |

### `sdk.compile.<name>`

| Key | Type | Description |
|---|---|---|
| `compile` | string (script path) | Runs in the SDK with `$AVOCADO_BUILD_DIR` and `$AVOCADO_SDK_PREFIX` set, and the cross toolchain in the environment (`$CC`, `$CFLAGS`, ...) |
| `clean` | string (script path) | Run by `avocado ext clean` |
| `packages` (alias `dependencies`) | package map | Target-side build dependencies, such as `libdrm-dev` |
| `package` | mapping | Package the output as an RPM. Keys: `install` (required), `version` (required), `name`, `release`, `license`, `summary`, `description`, `vendor`, `url`, `arch`, `requires`, `files`, `split.<sub>.{summary,description,requires,files}` |

An extension uses a compile section through a package entry: `mytool: { compile: <name>, install: <script> }`.

## `kernel`

It takes one block (stored as `default`) or a map of named blocks ([details](../../config/format/#named-or-single-sections)). `package` and `compile` are mutually exclusive, as are `cmdline` and `cmdline_extra`.

| Key | Type | Description |
|---|---|---|
| `package` | string | Kernel package installed at `runtime install` |
| `version` | string | Kernel version constraint: `6.6.*`, `>= 6.6`, or exact. On a block by itself, it constrains every runtime. |
| `compile` | string | `sdk.compile` section that builds the kernel. Requires `install`. |
| `install` | string | Script that copies kernel artifacts to `$AVOCADO_RUNTIME_BUILD_DIR` |
| `image` | mapping | Wrapper format for the kernel image, same shape as [`extensions.<n>.image`](#extensions) |
| `cmdline` | string | **Replaces** the board's kernel command line |
| `cmdline_extra` | string | **Appended** to the board's command line |

A block with only `cmdline` or `cmdline_extra` is valid. The kernel itself still comes from the resolver or the board. Honors `target-` overrides only.

## `rootfs` and `initramfs`

One block (stored as `default`) or a map of named blocks. Runtimes can reference them by name.

| Key | Type | Default | Description |
|---|---|---|---|
| `packages` (alias `dependencies`) | package map | the `avocado-pkg-*` meta-package | Packages. `{{ avocado.kernel.version }}` works in keys. |
| `filesystem` | string | rootfs `erofs-lz4`, initramfs `cpio.zst` | rootfs: `erofs-lz4` or `erofs-zst`. initramfs: `cpio`, `cpio.zst`, `cpio.lz4` or `cpio.gz`. Extensions without their own `filesystem` inherit the rootfs value. |
| `overlay` | string, or `{ dir, mode, preprocess ◆ }` | none | Copied over the sysroot after install. **It never deletes files, in either mode** ([details](../../build/stale-state/)). `preprocess`: `true` or a list of globs ([details](../../config/templating/#overlay-files)). |
| `post_install` ◆ | string (script path) | built-in defaults | Runs on the image's working copy before `mkfs`. **Replaces the built-in defaults entirely**: the usrmerge symlinks, the empty `/etc/machine-id`, `systemctl preset-all` and `ldconfig`. If you set it, redo those yourself. It receives `$ROOTFS_WORK` or `$INITRAMFS_WORK`, plus `$ROOTFS_SYSROOT`, `$AVOCADO_PREFIX`, `$AVOCADO_SDK_PREFIX`, `$RUNTIME_NAME`, `$RUNTIME_VERSION` and `$TARGET_ARCH`, and runs under `set -euo pipefail`. |
| `permissions` ◆ | name of a `permissions` entry, or inline | none | Users and groups written into this image's `/etc/passwd`, `/etc/shadow` and `/etc/group` |
| `image` ◆ | mapping | raw | Wrapper format, same shape as `extensions.<n>.image` |

## `permissions`

```yaml
permissions:
  prod: { users: { root: { password: '*' } } }
  dev:  { users: { root: { password: '' } } }
rootfs:
  permissions: prod
runtimes:
  dev:
    rootfs: { permissions: dev }
```

**User fields:** `password`, `uid`, `gid`, `gecos`, `home`, `shell`, `groups`, `system`, and the shadow ageing fields `last_change`, `min_days`, `max_days`, `warn_days`, `inactive_days`, `expire_date`.

**Group fields:** `gid`, `members`, `password`, `system`.

`password` values:
- `'*'` (the default) locks the account.
- `''` means **no password**. The build warns.
- Anything else is written into `/etc/shadow` **as-is**, so it must be a crypt(3) hash, never plaintext.
- `password: '{{ env.X }}'` with `X` unset becomes `''`, which is **no password**.

## `runtimes`

| Key | Type | Description |
|---|---|---|
| `extensions` | list | Extension names, or single-key maps like `- name: { enabled: false }`. A disabled extension ships but isn't activated. Order is merge priority: **earlier wins** a file conflict. |
| `packages` (alias `dependencies`) | package map | Runtime packages, usually `avocado-runtime: '*'` |
| `target` | string | Pin the runtime to one target |
| `targets` ◆ | list | Scope the runtime to several targets (for per-target opt-ins like `var.encrypt`) |
| `target_board` | string | Board for `{{ avocado.target.board }}`, **only when this runtime is resolved through `AVOCADO_RUNTIME`, `default_runtime` or the single-runtime rule**. `-r` doesn't count ([details](../../config/templating/#avocado-computed-values)). There's no `board:` key. |
| `version` ◆ | string | Runtime version label. Defaults to the first 8 characters of a random UUID, **new on every build**, so set it if you want stable version strings. |
| `kernel` | kernel name, or inline [kernel](#kernel) | Overrides the top-level kernel. `cmdline_extra` here applies only to this runtime. |
| `rootfs`, `initramfs` ◆ | name, or inline [image](#rootfs-and-initramfs) | Overrides the top-level image, for example `{ permissions: dev }` |
| `signing` | [mapping](#runtimesrsigning) | Signing for images and updates |
| `var` ◆ | [mapping](#runtimesrvar) | Var partition layout and encryption |
| `var_files` | list of `{ source, dest }` | Files copied onto the var partition at build time |
| `docker_images` ◆ | list of `{ image, tag }` | Container images pre-loaded onto the var partition |
| `post_build` ◆ | string (script path) | Runs after the runtime build, with `$AVOCADO_RUNTIME_NAME`, `$AVOCADO_TARGET` and `$AVOCADO_RUNTIME_BUILD_DIR` set |
| `stone_include_paths` | list | Extra directories for the flash tooling |
| `stone_manifest` | string | Custom flash manifest |
| `container_dev` ◆ | mapping | Enables Container Dev Mode for this runtime |

Honors `target-` overrides. Lists are **replaced**, not appended ([details](../../config/overrides/#merge-rules)).

### `runtimes.<r>.signing`

| Key | Description |
|---|---|
| `key` | Signing-key name (from `signing_keys` or the registry). Required when you control the root of trust. |
| `checksum_algorithm` | `sha256` (the default) or `blake3` |
| `content_key` ◆ | Separate key used only for delegated-targets metadata |
| `server_key` ◆ | Connect server's TUF public key (hex). Overrides `connect.server_key`. |
| `fit_key` ◆ | RSA key that signs the boot FIT, on FIT-booting machines. Required by `rootfs.image.verity`. |
| `fit_unsigned` ◆ | Build an unsigned FIT on purpose. Can't be combined with `fit_key`. |
| `fit_key_in_bootloader` ◆ | Also rebuild U-Boot so it enforces `fit_key`. Defaults to on when `fit_key` is set. |

### `runtimes.<r>.var`

| Key | Description |
|---|---|
| `compression` | Default btrfs compression: `no`, `zstd`, `zstd:3`, `lzo`, `zlib:6` and so on |
| `subvolumes` | Map of path → `true`, `false`, `"ro"`, or `{ writable, compression, nodatacow, quota, enabled }`. `lib/avocado` is always added. Runtime entries override extension entries. |
| `encrypt` | LUKS2-encrypt `/var` on first boot, with the key sealed to the hardware key store |
| `recovery` | Name of an HMAC secret used as the master for an operator recovery keyslot |
| `hardware` | `auto` (the default), `caam`, `tpm2` or `none` (needs `recovery`) |

## `extensions`

This section isn't type-checked; each command reads the keys it needs. Honors `target-` and `kernel-` overrides.

| Key | Type | Default | Description |
|---|---|---|---|
| `source` | `{ type: package, version, package?, repo_name?, include? }`, `{ type: git, url, ref?, sparse_checkout?, include? }` or `{ type: path, path, include? }` | local | Fetch this extension's definition from elsewhere. `include` pulls in extra sections, for example `provision_profiles.*`. For `git`, set `ref` to a **tag or branch**: any other value (a commit hash, or a mistyped tag) silently builds the default branch's tip, and the lock doesn't record the commit ([details](../../hardware/jetson-carrier-boards/#board-variants)). |
| `version` | string, or `{ file, key?, format? }` ◆ | none, and required | Quote it (`'1.10'`, not `1.10`). The mapping form reads the version from a file in the extension's own tree; `format` is `toml`, `json` or `yaml`. |
| `types` | list | `[sysext, confext]` | `sysext` overlays `/usr` and `/opt`. `confext` overlays `/etc`. `enable_services` needs `confext`. |
| `scopes` | list | `[system]` | `initrd` and/or `system` ([details](../../device/boot-and-merge/#scopes)) |
| `sysext_scopes` ◆, `confext_scopes` ◆ | list | `scopes` | Set each half separately |
| `packages` | [package map](../../config/format/#package-entries) | none | Feed packages, and compile outputs via `{ compile, install }` |
| `sdk` | `{ packages }` | none | SDK packages this extension needs at build time, for example `nativesdk-uv: '*'`. They're merged into the SDK install. Accepts `target-` overrides. |
| `overlay` | string, or `{ dir, mode, preprocess ◆ }` | none | Files copied into the extension. Never deletes anything ([details](../../build/stale-state/)). |
| `enable_services` | list | none | Units to enable, as `*.wants/` symlinks in the confext. **Removing one doesn't remove its symlink.** |
| `modprobe` | list | none | Modules loaded on every merge, after `daemon-reload` with the other `on_merge` commands. A failure only warns. Changing only this list doesn't trigger a rebuild ([details](../../build/stale-state/#inputs-the-up-to-date-check-misses)). |
| `on_merge` ◆ | list | none | Commands run on every merge. No shell ([details](../../device/on-merge/)). |
| `on_unmerge` ◆ | list | none | Commands run on unmerge |
| `reload_service_manager` ◆ | boolean | `false` | Writes `EXTENSION_RELOAD_MANAGER=1` |
| `post_build` ◆ | string (script path) | none | Runs after the extension is built, with `$AVOCADO_EXT_NAME`, `$AVOCADO_TARGET` and `$AVOCADO_BUILD_EXT_SYSROOT` set |
| `package_files` ◆ | list | the config file, all overlay directories (including `target-` ones), compile and install scripts | Files included when you package the extension with `avocado ext package`. An explicit list **replaces** the defaults, except that a `version: { file }` provider's file is always added. It's also hashed for up-to-date checks when the extension compiles something. |
| `stone_include_paths` ◆ | list | none | Directories handed to the flash tooling, for example a `carrier-bsp/` override ([details](../../hardware/jetson-orin/#uefi-boot-settings-l4tconfigurationdtbo)) |
| `filesystem` | string | the rootfs `filesystem` | `erofs`, `erofs-lz4`, `erofs-zst` or `squashfs` |
| `image` ◆ | `{ type: raw \| kab, args?, verity? }` | raw | `kab` wraps the image with kabtool. `verity` **must be a real boolean**. |
| `var_files` | list of globs | none | Files that go on the var partition instead of into the image |
| `subvolumes` ◆ | map | none | Var subvolumes this extension needs. The first extension listed wins a conflict. |
| `docker_images` | list of `{ image, tag }` | none | Container images pre-loaded onto the var partition |
| `depends_on` ◆ | list of `name`, `{ name, version }` or `{ name: version }` | none | Other extensions this one needs. Resolved at build time. |
| `class` ◆ | `application` or `platform` | `application` | Drives the dependency lints. An unknown value is an error. |
| `device_tree_overlays` ◆ | list of `{ name, src, params? }` | none | Device-tree overlays to compile and install on the boot medium. `name` must be a safe basename. |
| `summary`, `description`, `license`, `vendor`, `url`, `release`, `arch` ◆ | string | | RPM metadata for `avocado ext package` |
| `users`, `groups` | mapping | none | **Deprecated.** The build warns. Use top-level `permissions`. |

## `provision_profiles`

| Key | Type | Description |
|---|---|---|
| `container_args` | list or string | Extra `docker run` arguments for this profile, for example USB passthrough |
| `state_file` | string | Saved between provision runs. Defaults to `.avocado/provision-<profile>.state`. |

## `connect`

| Key | Description |
|---|---|
| `org`, `project` | Defaults for `avocado connect` commands. `avocado connect init` writes them. |
| `server_key` | Connect server's TUF public key (hex), for every runtime |
