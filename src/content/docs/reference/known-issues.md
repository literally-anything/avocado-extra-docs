---
title: Known upstream issues
description: Bugs in avocado-cli, avocadoctl and meta-avocado that affect real projects, each with its symptom, workaround and upstream status.
---

:::note[Verified against]
avocado-cli `1.0.0` (`343c137`, 2026-10-28) for the avocado-cli tables: every entry, open or fixed, was rechecked in that release's source. The avocadoctl and meta-avocado entries were verified against avocadoctl `0.12.0` (`fa81278`), meta-avocado `scarthgap` at `16e6328`, and 2024/edge on `jetson-orin-nano-devkit` (snapshot 16) and `jetson-orin-nx` (snapshot 17); only their **Status** column was updated since. Upstream trackers checked on 2026-11-01. Each entry says whether it was seen on a device or build, or only read in source.
:::

"Not filed" means no matching issue existed in `avocado-linux/*` when this page was last checked. Update the status when one is filed or fixed. When a fix ships in a release, move the entry to [Fixed in avocado-cli 1.0.0](#fixed-in-avocado-cli-100) (or a section like it), with what to do after upgrading.

## avocado-cli

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| Extension images built empty from a full sysroot | A 4 KB BSP image; on the device, the merge fails and no extension service starts | Upgrade to 1.0.0, which turns the reported case into a build error. Still run `scripts/check-avocado-build.sh` before flashing. [Details](../../build/stale-state/#up-to-date-checks-trust-inputs-not-outputs) | Open: [#283](https://github.com/avocado-linux/avocado-cli/issues/283). 1.0.0 doesn't close it but adds two guards: `ext install` checks for an rpm database, not just a directory, before reporting "up to date", and `ext build` refuses an extension that declares `packages:` when its sysroot has no package database ([#302](https://github.com/avocado-linux/avocado-cli/pull/302)). [#280](https://github.com/avocado-linux/avocado-cli/issues/280) is closed. |
| Packages named with `{{ avocado.kernel.version }}` are never recorded in the lock | The lock lists old packages, or none, for that extension | Don't rely on the lock for those packages. [Details](../../build/stale-state/#the-lock-can-disagree-with-the-build) | Not filed. Still present in 1.0.0: the lock query still uses the unsubstituted name. |
| Runtimes on one target share extension state | `{{ avocado.runtime }}` ignores `-r`; a multi-runtime `build` runs extension steps without a runtime; runtimes overwrite each other's extension images | One target per runtime, always pass `-r`, and set `AVOCADO_RUNTIME` when a template depends on the runtime. [Details](../../config/templating/#avocado-computed-values), [sysroots](../../build/stale-state/#two-extension-sysroot-locations) | [#288](https://github.com/avocado-linux/avocado-cli/issues/288) was closed on 2026-10-30, but in 1.0.0 only part of it is fixed. Rootfs and initramfs image stamps are now per runtime ([#336](https://github.com/avocado-linux/avocado-cli/pull/336)), and a plain `install` seeds every runtime's extension sysroots ([#341](https://github.com/avocado-linux/avocado-cli/pull/341)). The templating, multi-runtime build, extension image and legacy-symlink parts are unchanged in source. |
| `modprobe:` isn't in the build hash, and loads after `daemon-reload` | Changing only `modprobe:` ships the old list; units can't rely on the module at reload | Clean the extension after changing `modprobe:`; load modules from the unit that needs them. [Details](../../device/on-merge/#how-on_merge-commands-run) | Not filed. Still present in 1.0.0: the hash still lists `kernel_modules`, not `modprobe`. |
| `avocado clean` leaves `.avocado/overlay-staging/` | Templated secrets stay on disk after a clean | Delete `.avocado/` by hand. [Details](../../build/stale-state/#avocado-clean-leaves-avocado-behind) | Open: [#289](https://github.com/avocado-linux/avocado-cli/issues/289). Unchanged in 1.0.0. |
| Unresolvable `{{ avocado.* }}` templates are left in place | A template the CLI can't resolve stays as literal `{{ … }}` text, with no warning | Check the values with `avocado config show`. [Details](../../config/templating/) | Reported. 1.0.0 now warns about unknown keys ([below](#fixed-in-avocado-cli-100)), but an unresolved `avocado.*` template is still left as is (`utils/interpolation/avocado.rs`). |

## avocadoctl

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| An `on_merge` program that can't be started fails the whole merge | `[FAILED] Failed to start Avocado merge extensions`, then no SSH, gadget or getty | Wrap commands whose program might be missing in a script that checks first. [Details](../../device/on-merge/#failures) | Open: [avocadoctl#38](https://github.com/avocado-linux/avocadoctl/issues/38). [avocadoctl#45](https://github.com/avocado-linux/avocadoctl/pull/45) (open) reports a failed merge hook more visibly; it doesn't stop the failure. |

## meta-avocado

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| The merge isn't ordered before `systemd-modules-load`, `systemd-sysctl`, `systemd-networkd` or `systemd-resolved` | Extension `modules-load.d`, `sysctl.d`, `.network` and `.dnssd` files are ignored at boot | Rootfs drop-ins, `modprobe:`, or `systemctl` reload hooks. [Details](../../device/boot-and-merge/#which-extension-files-take-effect-at-boot) | Open: [meta-avocado#420](https://github.com/avocado-linux/meta-avocado/issues/420) |
| The empty `/etc/machine-id` is never persisted | Hostname, USB serial and DHCP client ID change every boot | Derive identity from hardware. [Details](../../device/hostname-and-machine-id/) | Reported |
| `carrier.env` without `CARRIER_LABEL` stops provisioning silently | Provisioning exits 1 right after `Carrier-BSP overlay: … (N file(s))` | Always set `CARRIER_LABEL`. [Details](../../hardware/jetson-carrier-boards/#how-a-carrier-is-layered) | Not filed |
| Orin OS updates carry only the rootfs | Kernel, kernel DTB, bootloader and UEFI defaults only change with a reflash | Get the DTB and flash settings right before shipping | Open: [meta-avocado#422](https://github.com/avocado-linux/meta-avocado/issues/422) |
| The Tegra device-tree overlay hook (#292) isn't in any feed | `avocado sdk install` fails when an extension declares `device_tree_overlays` | Rebuild the DTB yourself. [Details](../../hardware/jetson-carrier-boards/#extension-device_tree_overlays-on-jetson-not-usable-yet) | Open: [meta-avocado#421](https://github.com/avocado-linux/meta-avocado/issues/421) |
| One module SKU per target, and a fixed `nvpmodel.conf` | Another module needs hand-copied flash values; an 8GB NX gets the 16GB power table | One carrier extension per module. [Details](../../hardware/jetson-carrier-boards/#one-flash-configuration-per-module-sku) | Not filed |
| Only the first `carrier-bsp/` is used | A project's flash settings are dropped when a carrier ships its own | Merge into one directory. [Details](../../hardware/jetson-carrier-boards/#only-one-carrier-bsp-is-used) | Not filed |
| `kernel.cmdline`/`cmdline_extra` and the project's `initramfs:` are accepted but never reach the Jetson boot image, on deploy or provision | `/proc/cmdline` is empty of anything you set; kernel-level hardening options can't be applied | None known; a `KernelCommandLine` UEFI variable seeded via `BOOTCONTROL_OVERLAYS` is an untested possibility. [Details](../../hardware/jetson-boot-image/) | `cmdline`/`cmdline_extra` at provision time: fixed on `wrynose` ([meta-avocado#443](https://github.com/avocado-linux/meta-avocado/pull/443)), fix open for `scarthgap` ([#574](https://github.com/avocado-linux/meta-avocado/pull/574)); neither tested here. `initramfs:`: nothing upstream. [Details](../../hardware/jetson-boot-image/#filing-status) |
| The Orin NX BSP extension lacks CAN, Wi-Fi/BT stack, camera and netfilter modules | `can0` never appears on an NX | Add the packages in a carrier extension. [Details](../../hardware/jetson-carrier-boards/#the-orin-nx-bsp-extension-has-fewer-drivers-than-the-nanos) | Not filed |
| The RTC driver loads after the merge and steps the clock back | The clock jumps to 1970 a few seconds into boot | A real time source. [Details](../../hardware/jetson-orin/#clock) | Not filed |
| Realtek Bluetooth firmware is in the BSP extension, which merges after the device probes | `Direct firmware load for rtl8822cu_fw failed with error -2` | Not yet known. [Details](../../hardware/jetson-orin/#firmware) | Not filed; needs a device check |
| `jetson-orin-nx` builds split stone include paths on spaces | The first bundle pass searches a path that doesn't exist; the CLI's own pass hides it | None needed today | Fix merged: [meta-avocado#397](https://github.com/avocado-linux/meta-avocado/pull/397) (2026-10-06); not yet checked in a published SDK |

## Fixed in avocado-cli 1.0.0

These were open against `1.0.0-rc.5` and are fixed in `1.0.0`, confirmed in its source. Some need one clean step after you upgrade.

| Issue | Fix | After upgrading |
|---|---|---|
| Removing or renaming an overlay file, or an `enable_services` entry, never reached the image | `ext build` (extension overlays and `enable_services` links) and `avocado install` (rootfs and initramfs overlays) record what they placed and remove what's gone, printing `Removed /<path>`. A path a package owns is kept, with a notice. [#287](https://github.com/avocado-linux/avocado-cli/issues/287), PRs [#308](https://github.com/avocado-linux/avocado-cli/pull/308) and [#311](https://github.com/avocado-linux/avocado-cli/pull/311). | The first run only **records**, so files dropped before the upgrade stay. Clean each component once. After a rootfs or initramfs overlay edit, run `avocado install` before `avocado build`. |
| The offline `systemctl` linked bare template units such as `getty@.service` | It enables the preset's instances, or the unit's `DefaultInstance=`, never the bare template ([#338](https://github.com/avocado-linux/avocado-cli/pull/338)) | Sysroots reinstall once. A rootfs-overlay mask of `getty@.service` is no longer needed for this. |
| A git `ref` that wasn't a branch or tag silently built the default branch | Every git extension is now fetched with `git fetch --depth 1 origin <ref>` under `set -e`, so a commit SHA works and a missing ref fails the fetch ([#291](https://github.com/avocado-linux/avocado-cli/pull/291)) | None. The lock still doesn't record the commit a branch resolved to. |
| Unknown keys in `avocado.yaml` weren't reported | Every load warns, on stderr, about keys the CLI ignores, with a "did you mean". `avocado config validate` reports them along with schema errors ([#286](https://github.com/avocado-linux/avocado-cli/pull/286)) | None. Warnings never fail a load. |
| `ext install` reported "up to date" for an empty extension sysroot | It checks the rpm database instead of the directory, and `ext build` refuses a package extension with no package database ([#302](https://github.com/avocado-linux/avocado-cli/pull/302)) | None. #283 is still open; see above. |
