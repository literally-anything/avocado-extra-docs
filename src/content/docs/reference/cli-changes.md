---
title: CLI changes
description: avocado-cli releases that change behaviour this site documents, newest first, with what to do after upgrading.
---

:::note[Verified against]
avocado-cli `1.0.0` (`343c137`, tagged 2026-10-28), compared with `1.0.0-rc.5` (`2b46152`). Each item was checked in the `1.0.0` source; the file or function is named with it. The upstream `CHANGELOG.md` was used only to find what to check. Nothing here has been run on a device with `1.0.0` yet.
:::

This is a running log of CLI changes that affect what these docs say, not a full changelog. For that, read [`CHANGELOG.md`](https://github.com/avocado-linux/avocado-cli/blob/main/CHANGELOG.md) upstream. Add a section for each release you re-verify against.

## 1.0.0 (2026-10-28)

### Do this after upgrading

1. **Run `avocado clean`, then `avocado install` and `avocado build`,** or at least clean every component whose overlay or `enable_services` list lost entries on rc.5. The new overlay pruning only removes what a `1.0.0` run recorded, and its first run only records ([details](../../build/stale-state/#overlays-and-enable_services-now-remove-what-you-drop)).
2. **Rebuild any multi-runtime OS bundle made with rc.4 or rc.5.** Rootfs and initramfs image stamps were per target, so a second runtime reused the first's image ([#336](https://github.com/avocado-linux/avocado-cli/pull/336); `Stamp::rootfs_image(runtime, …)` in `utils/stamps.rs` now takes the runtime).
3. **On macOS, restart the VM once:** `avocado vm stop && avocado vm start`. A running VM keeps its old share and idle settings.
4. **Run `avocado config validate`** and fix what it warns about. Keys the CLI has always ignored now show up as warnings on every command.
5. If you masked `getty@.service` in the rootfs overlay only to work around the bare-template link, you can drop the mask ([details](../../hardware/jetson-orin/#getty-units-from-presets)).

### Build state

| Change | Where | Details |
|---|---|---|
| Files dropped from an extension, rootfs or initramfs overlay, and dropped `enable_services` links, are removed from the sysroot | `build_overlay_script` (`commands/rootfs/install.rs`), the overlay section of `commands/ext/build.rs` | [Build state](../../build/stale-state/#overlays-and-enable_services-now-remove-what-you-drop) |
| Overlays set owner and mode only on paths they create, so package files keep setuid and setgid | `overlay_copy_command` (`utils/overlay_preprocess.rs`) | [Build state](../../build/stale-state/#overlays-and-enable_services-now-remove-what-you-drop) |
| `ext install` probes the rpm database before skipping; `ext build` refuses an extension that declares `packages:` but has no package database | `declares_packages` (`commands/ext/build.rs`) | [Build state](../../build/stale-state/#up-to-date-checks-trust-inputs-not-outputs) |
| A multi-runtime `avocado install` seeds each runtime's extension sysroots, so `build -r` works right after it | `ext_seed_runtime_map` (`commands/install.rs`) | [Build state](../../build/stale-state/#two-extension-sysroot-locations) |
| An exact pin in `avocado.yaml` wins over a stale lock entry, and parallel installs merge the lock three ways | `utils/lockfile.rs` | [Build state](../../build/stale-state/#the-lock-can-disagree-with-the-build) |
| `avocado clean -f` succeeds when the recorded volume is already gone | `utils/volume.rs` | [Build state](../../build/stale-state/#what-to-do) |
| Build hooks get `AVOCADO_KERNEL_IMAGE` for the kernel the lock pins, not the first one staged, plus `AVOCADO_KERNEL_VERSION` | `render_kernel_image_section` (`commands/runtime/build.rs`) | [Environment variables](../environment-variables/#exported-to-your-scripts) |

### Configuration

| Change | Where | Details |
|---|---|---|
| Keys the CLI ignores draw a warning on stderr, with a "did you mean" | `utils/config_lint.rs` | [Format](../../config/format/#unknown-keys-are-warned-about-not-rejected) |
| New `avocado config validate` and `avocado config schema` | `commands/config_validate.rs` | [Editor validation](../../config/json-schema/#start-with-the-clis-own-checks-100-and-later) |
| `cli_requirement: "=1.0.0"` no longer accepts `1.0.0-rc` builds | `requirement_matches` (`utils/version.rs`) | [Format](../../config/format/#cli_requirement) |
| New extension key `boot_config`; a `device_tree_overlays` entry may omit `src` to name a stock overlay; both honor `target-` overrides | `utils/device_tree_overlay.rs` | [Config schema](../config-schema/#extensions), [Jetson carrier boards](../../hardware/jetson-carrier-boards/#extension-device_tree_overlays-on-jetson-not-usable-yet) |
| A board can list what its delivery hook supports in `usr/libexec/avocado/boot-settings.json`; a runtime build that declares something else fails early | `utils/device_tree_overlay.rs` | [Jetson carrier boards](../../hardware/jetson-carrier-boards/#extension-device_tree_overlays-on-jetson-not-usable-yet) |
| `kernel.cmdline_extra` is written into the boot FIT as `avocado,cmdline-extra` on machines whose feed ships `fit-image.its`. It then needs `signing.fit_key` or `signing.fit_unsigned`, and an initramfs. It still doesn't reach Jetson. | `generate_fit_assembly_script` (`commands/runtime/build.rs`) | [Jetson boot image](../../hardware/jetson-boot-image/) |
| `rootfs.image.verity` with no initramfs fails the build instead of booting the feed's FIT unverified | `generate_fit_assembly_script` | |
| A `distro.feeds` entry that `repos:` doesn't define names a distro add-on feed, such as `ros2-jazzy`: `target/<target>-<name>` for target installs and `sdk/<target>-<name>` for the SDK | `utils/feeds.rs` | Not yet documented elsewhere on this site |
| `avocado init` writes `release: 2026` and an SDK image of `docker.io/avocadolinux/sdk:{{ config.distro.release }}` | `configs/default.yaml` | [Releases and channels](../../build/releases-and-channels/) |

### Device

| Change | Where | Details |
|---|---|---|
| The offline `systemctl` enables a template's preset instances or `DefaultInstance=`, never the bare template | `commands/sdk/install.rs` | [Jetson](../../hardware/jetson-orin/#getty-units-from-presets) |
| `modprobe:` lines are written even when the extension ships no `.ko` | `create_sysext_build_script` (`commands/ext/build.rs`) | [Kernel modules](../../build/kernel-modules/#on-the-device) |

### Sources and hosts

| Change | Where | Details |
|---|---|---|
| A git extension's `ref` is fetched directly, so commit SHAs work and a missing ref fails | `fetch_from_git` (`utils/ext_fetch.rs`) | [Jetson carrier boards](../../hardware/jetson-carrier-boards/#board-variants) |
| `save`, `load`, `update` and `fetch` route through the avocado-vm on macOS | `needs_vm_routing` (`main.rs`) | rc.5's routing list didn't include them, so on macOS they reached the local Docker daemon instead of the VM that holds the build volume |
| Under the avocado-vm, containers mount the project without bindfs unless `AVOCADO_HOST_UID` is set | `src_mount_uid_gid` (`utils/container.rs`) | [Environment variables](../environment-variables/#build-behaviour) |
| `AVOCADO_UPLOAD_NO_SBOM` is gone; use `avocado connect upload --no-sbom` | `env::var` reads | [Environment variables](../environment-variables/#build-behaviour) |

### Still open in 1.0.0

These were reported against rc.5, and `1.0.0`'s source still behaves the same way. Each is on [Known upstream issues](../known-issues/).

- `{{ avocado.runtime }}` ignores `-r`, and a multi-runtime `build` runs extension steps without `AVOCADO_RUNTIME`.
- Every runtime on one target gets the same extension images, keyed by extension name only.
- Packages named with `{{ avocado.kernel.version }}` aren't recorded in the lock.
- `modprobe:` isn't in the extension build hash.
- `avocado clean` leaves `.avocado/overlay-staging/`.
- Opaque overlay mode doesn't replace a directory's contents.
