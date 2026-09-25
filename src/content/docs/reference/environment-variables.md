---
title: Environment variables
description: Every environment variable the avocado CLI reads, every variable it exports to your scripts, and the release-file keys avocadoctl reads on the device.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (every `env::var(...)` read, `src/utils/container.rs`, and the script launchers in `src/commands/`), avocadoctl `0.12.0`.
:::

There are three different sets of variables, read in three different places. Mixing them up is a common source of "it's set, but nothing happened":

1. [Variables the CLI reads](#read-by-the-cli) on **your host**
2. [Variables exported to your scripts](#exported-to-your-scripts) inside the **SDK container**
3. [Release-file keys](#release-file-keys-on-the-device) that `avocadoctl` reads on the **device**

`{{ env.X }}` in `avocado.yaml` is none of these. It reads your host environment once, when the config is loaded ([details](../../config/templating/#env-your-hosts-environment)).

## Read by the CLI

Flags beat environment variables, and environment variables beat `avocado.yaml`.

### Project selection and feeds

| Variable | Overrides | Notes |
|---|---|---|
| `AVOCADO_TARGET` | `default_target` | Also feeds `{{ avocado.target }}` |
| `AVOCADO_TARGET_BOARD` | runtime `target_board`, `default_target_board` | Feeds `{{ avocado.target.board }}` |
| `AVOCADO_RUNTIME` | `default_runtime` | **The only way to make templating follow a runtime other than the default.** `-r` doesn't affect templating ([details](../../config/templating/#avocado-computed-values)). Empty means unset. |
| `AVOCADO_DISTRO_RELEASE` | `distro.release` | |
| `AVOCADO_DISTRO_CHANNEL` | `distro.channel` | |
| `AVOCADO_RELEASEVER` | `distro.repo.releasever` | Legacy fallback: `AVOCADO_SDK_REPO_RELEASE` |
| `AVOCADO_REPO_URL` | `distro.repo.url` | Legacy fallback: `AVOCADO_SDK_REPO_URL` |
| `AVOCADO_REPO_CA` | `distro.repo.ca` | Path to a PEM CA certificate |
| `AVOCADO_REPO_INSECURE` | `distro.repo.tls_verify: false` | Any truthy value skips TLS verification |
| `AVOCADO_CONNECT_TOKEN` | | Token for Connect-hosted (`org:`) feeds |
| `AVOCADO_CONNECT_URL` | | Default `https://connect.peridio.com` |

### Build behaviour

| Variable | Effect |
|---|---|
| `AVOCADO_PARALLEL_TASKS` | Number of concurrent tasks. Default `min(cpus, 4)`, and 1 under `--runs-on`. |
| `AVOCADO_CONTAINER_TOOL` | Container runtime. Default `docker`. |
| `AVOCADO_NO_SESSION_CONTAINER` | Run every step in its own `docker run` instead of reusing one session container. An escape hatch for debugging. |
| `AVOCADO_HOST_UID`, `AVOCADO_HOST_GID` | Override `sdk.host_uid` and `sdk.host_gid` |
| `SOURCE_DATE_EPOCH` | Timestamp used by `avocado sbom` |
| `KAB_KEYSET_FILE` | kabtool keyset used when wrapping images. **An empty value is an error**, not "unset". |
| `AVOCADO_UPLOAD_NO_SBOM=1` | `avocado connect upload` skips generating the SBOM |

### Output and interaction

| Variable | Effect |
|---|---|
| `AVOCADO_VERBOSE`, `AVOCADO_DEBUG` | Verbose output |
| `AVOCADO_NO_TUI` | Plain line output instead of the TUI |
| `CI` | Also turns off the TUI. It does **not** turn off prompts. |
| `AVOCADO_NONINTERACTIVE` | Never prompt |

### Deploy

| Variable | Effect |
|---|---|
| `AVOCADO_DEPLOY_REPO_HOST` | The IP address the device uses to reach your machine's temporary update server. Set it when auto-detection picks the wrong interface, and for QEMU user networking (`10.0.2.2`). |
| `AVOCADO_DEPLOY_REPO_PORT` | Port for that server |

### Signing

| Variable | Effect |
|---|---|
| `AVOCADO_SIGNING_KEYS_DIR` | Location of the signing-key registry |
| `AVOCADO_PKCS11_PIN` | PIN for a PKCS#11 token, instead of a prompt |
| `PKCS11_MODULE_PATH` | PKCS#11 module to load. Takes priority over the built-in paths. |

### The helper VM (macOS and Windows)

| Variable | Effect |
|---|---|
| `AVOCADO_VM_AUTO_START=0` | Don't start the VM; talk to the local Docker daemon. Same as `--no-vm-auto-start`. |
| `AVOCADO_NO_UPDATE_CHECK` | Skip the VM image update check |
| `AVOCADO_VM_DIR` | VM state directory. Default `~/.avocado/vm`. |
| `AVOCADO_VM_WORKSPACE` | Directory shared into the VM |
| `AVOCADO_VM_IDLE_HIBERNATE_SECS` | Idle time before the VM hibernates. `0` turns hibernation off. |
| `AVOCADO_VM_DTB` | Device tree override for the VM |
| `AVOCADO_VM_CHANNEL_URL_BASE` | Where VM image updates come from (for testing) |

## Exported to your scripts

These are set inside the SDK container. The same values are available in every script the container runs:

| Variable | Value |
|---|---|
| `AVOCADO_TARGET` | Current target |
| `AVOCADO_SDK_TARGET` | Current target |
| `AVOCADO_PREFIX` | `/opt/_avocado/<target>` |
| `AVOCADO_SDK_ARCH` | Container architecture (`uname -m`) |
| `AVOCADO_SDK_PREFIX` | `$AVOCADO_PREFIX/sdk/<arch>` |
| `AVOCADO_SRC_DIR` | `/opt/src`, your project |
| `AVOCADO_EXT_SYSROOTS` | `$AVOCADO_PREFIX/runtimes/$AVOCADO_RUNTIME/extensions` when a runtime is passed, otherwise the legacy `$AVOCADO_PREFIX/extensions` |
| `AVOCADO_RUNTIME` | **Only when the CLI passes it.** `avocado build` passes it to extension steps only when it builds exactly one runtime (`-r`, or a project with one runtime for the target). A multi-runtime build runs extension steps, including `post_build`, without it. |
| `SSL_CERT_FILE`, `DNF_*` | Set up for the SDK's own dnf |

Each kind of script also gets these:

| Script | Extra variables |
|---|---|
| `sdk.compile.<s>.compile` | `AVOCADO_BUILD_DIR=$AVOCADO_SDK_PREFIX/build/<s>`, plus the cross toolchain in the environment (`CC`, `CFLAGS`, `LDFLAGS`, and `pkg-config` pointed at the target sysroot) |
| `sdk.compile.<s>.clean` | `AVOCADO_BUILD_DIR` |
| Package `install:` script, `{ compile, install }` | `AVOCADO_BUILD_EXT_SYSROOT` (install into here), `AVOCADO_BUILD_DIR` |
| `extensions.<e>.post_build` | `AVOCADO_EXT_NAME`, `AVOCADO_TARGET`, `AVOCADO_BUILD_EXT_SYSROOT` |
| `runtimes.<r>.post_build` | `AVOCADO_RUNTIME_NAME`, `AVOCADO_TARGET`, `AVOCADO_RUNTIME_BUILD_DIR` |
| `kernel.install` | `AVOCADO_RUNTIME_BUILD_DIR`, `AVOCADO_BUILD_DIR` |
| `rootfs.post_install` / `initramfs.post_install` | `ROOTFS_WORK` / `INITRAMFS_WORK`, `ROOTFS_SYSROOT`, `AVOCADO_PREFIX`, `AVOCADO_SDK_PREFIX`, `RUNTIME_NAME`, `RUNTIME_VERSION`, `TARGET_ARCH` |

:::tip
Without `AVOCADO_RUNTIME`, `AVOCADO_BUILD_EXT_SYSROOT` is the legacy `$AVOCADO_PREFIX/extensions/<ext>`, a symlink to whichever runtime last ran with a runtime set ([details](../../build/stale-state/#two-extension-sysroot-locations)). So a `post_build` can't reliably tell which runtime it's building for. If it needs to know, build with `-r`, and fail when `AVOCADO_RUNTIME` is empty rather than guessing.
:::

## Release-file keys on the device

These look like shell variables, but they're lines in each extension's release file, read by `avocadoctl` ([details](../../device/on-merge/)):

| Key | Written from | Meaning |
|---|---|---|
| `ID=_any` | always | Matches any OS |
| `SYSEXT_SCOPE` / `CONFEXT_SCOPE` | `scopes` and friends | `initrd` and/or `system` |
| `EXTENSION_RELOAD_MANAGER` | `reload_service_manager` | `0` or `1` |
| `AVOCADO_ON_MERGE` | `on_merge`, `modprobe`, automatic `depmod`/`systemd-sysusers`/`systemd-tmpfiles` | One line per command |
| `AVOCADO_ON_UNMERGE` | `on_unmerge` | One line per command |
| `AVOCADO_ENABLE_SERVICES` | `enable_services` | Units this extension enables |
| `AVOCADO_MODPROBE` | (legacy) | No longer written. `modprobe:` becomes `AVOCADO_ON_MERGE="modprobe ..."`. |
