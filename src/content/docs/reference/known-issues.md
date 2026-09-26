---
title: Known upstream issues
description: Bugs in avocado-cli, avocadoctl and meta-avocado that affect real projects, each with its symptom, workaround and upstream status.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`2b46152`), avocadoctl `0.12.0` (`fa81278`), meta-avocado `scarthgap` at `16e6328`, 2024/edge on `jetson-orin-nano-devkit` (snapshot 16) and `jetson-orin-nx` (snapshot 17). Upstream trackers checked for duplicates on 2026-09-25. Each entry says whether it was seen on a device or build, or only read in source.
:::

"Not filed" means no matching issue existed in `avocado-linux/*` when this page was written. Update the status when one is filed or fixed, and remove the entry once a fixed release is out.

## avocado-cli

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| Extension images built empty from a full sysroot | A 4 KB BSP image; on the device, the merge fails and no extension service starts | Clean the extension, rebuild, run `scripts/check-avocado-build.sh` before flashing. [Details](../../build/stale-state/#up-to-date-checks-trust-inputs-not-outputs) | Open: [#283](https://github.com/avocado-linux/avocado-cli/issues/283), [#280](https://github.com/avocado-linux/avocado-cli/issues/280) |
| Removing or renaming an overlay file, or an `enable_services` entry, never reaches the image | A deleted mask or a disabled service stays active | Clean the component after any removal. [Details](../../build/stale-state/#overlays-add-and-overwrite-they-never-delete) | Not filed |
| Packages named with `{{ avocado.kernel.version }}` are never recorded in the lock | The lock lists old packages, or none, for that extension | Don't rely on the lock for those packages. [Details](../../build/stale-state/#the-lock-can-disagree-with-the-build) | Not filed |
| Runtimes on one target share extension state | `{{ avocado.runtime }}` ignores `-r`; runtimes overwrite each other's images; a plain `install` repoints the shared extension sysroots | One target per runtime, always pass `-r`. [Details](../../config/templating/#avocado-computed-values), [sysroots](../../build/stale-state/#two-extension-sysroot-locations) | Not filed |
| The offline `systemctl` used for presets ignores `DefaultInstance=` | `getty@getty.service` fails in a loop at every boot | Mask `getty@.service` in the rootfs overlay. [Details](../../hardware/jetson-orin/#getty-units-from-presets) | Not filed |
| `modprobe:` isn't in the build hash, and loads after `daemon-reload` | Changing only `modprobe:` ships the old list; units can't rely on the module at reload | Clean the extension after changing `modprobe:`; load modules from the unit that needs them. [Details](../../device/on-merge/#how-on_merge-commands-run) | Not filed |
| A git `ref` that isn't a branch or tag builds the default branch | A pinned commit, or a mistyped tag, silently builds the tip | Pin tags only. [Details](../../hardware/jetson-carrier-boards/#board-variants) | Not filed |
| `avocado clean` leaves `.avocado/overlay-staging/` | Templated secrets stay on disk after a clean | Delete `.avocado/` by hand. [Details](../../build/stale-state/#avocado-clean-leaves-avocado-behind) | Not filed |
| Unknown keys and unresolved templates in `avocado.yaml` aren't reported | A typo such as `board:` does nothing, silently | Validate with the [JSON Schema](../../config/json-schema/). [Details](../../config/format/#unknown-keys-are-silently-ignored) | Reported |

## avocadoctl

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| An `on_merge` program that can't be started fails the whole merge | `[FAILED] Failed to start Avocado merge extensions`, then no SSH, gadget or getty | Wrap commands whose program might be missing in a script that checks first. [Details](../../device/on-merge/#failures) | Not filed |

## meta-avocado

| Issue | Symptom | Workaround | Status |
|---|---|---|---|
| The merge isn't ordered before `systemd-modules-load`, `systemd-sysctl`, `systemd-networkd` or `systemd-resolved` | Extension `modules-load.d`, `sysctl.d`, `.network` and `.dnssd` files are ignored at boot | Rootfs drop-ins, `modprobe:`, or `systemctl` reload hooks. [Details](../../device/boot-and-merge/#which-extension-files-take-effect-at-boot) | Not filed |
| The empty `/etc/machine-id` is never persisted | Hostname, USB serial and DHCP client ID change every boot | Derive identity from hardware. [Details](../../device/hostname-and-machine-id/) | Reported |
| `carrier.env` without `CARRIER_LABEL` stops provisioning silently | Provisioning exits 1 right after `Carrier-BSP overlay: … (N file(s))` | Always set `CARRIER_LABEL`. [Details](../../hardware/jetson-carrier-boards/#how-a-carrier-is-layered) | Not filed |
| Orin OS updates carry only the rootfs | Kernel, kernel DTB, bootloader and UEFI defaults only change with a reflash | Get the DTB and flash settings right before shipping | Not filed |
| The Tegra device-tree overlay hook (#292) isn't in any feed | `avocado sdk install` fails when an extension declares `device_tree_overlays` | Rebuild the DTB yourself. [Details](../../hardware/jetson-carrier-boards/#extension-device_tree_overlays-on-jetson-not-usable-yet) | Not filed |
| One module SKU per target, and a fixed `nvpmodel.conf` | Another module needs hand-copied flash values; an 8GB NX gets the 16GB power table | One carrier extension per module. [Details](../../hardware/jetson-carrier-boards/#one-flash-configuration-per-module-sku) | Not filed |
| Only the first `carrier-bsp/` is used | A project's flash settings are dropped when a carrier ships its own | Merge into one directory. [Details](../../hardware/jetson-carrier-boards/#only-one-carrier-bsp-is-used) | Not filed |
| `kernel.cmdline`/`cmdline_extra` and the project's `initramfs:` are accepted but never reach the Jetson boot image, on deploy or provision | `/proc/cmdline` is empty of anything you set; kernel-level hardening options can't be applied | None known; a `KernelCommandLine` UEFI variable seeded via `BOOTCONTROL_OVERLAYS` is an untested possibility. [Details](../../hardware/jetson-boot-image/) | Not filed |
| The Orin NX BSP extension lacks CAN, Wi-Fi/BT stack, camera and netfilter modules | `can0` never appears on an NX | Add the packages in a carrier extension. [Details](../../hardware/jetson-carrier-boards/#the-orin-nx-bsp-extension-has-fewer-drivers-than-the-nanos) | Not filed |
| The RTC driver loads after the merge and steps the clock back | The clock jumps to 1970 a few seconds into boot | A real time source. [Details](../../hardware/jetson-orin/#clock) | Not filed |
| Realtek Bluetooth firmware is in the BSP extension, which merges after the device probes | `Direct firmware load for rtl8822cu_fw failed with error -2` | Not yet known. [Details](../../hardware/jetson-orin/#firmware) | Not filed; needs a device check |
| `jetson-orin-nx` builds split stone include paths on spaces | The first bundle pass searches a path that doesn't exist; the CLI's own pass hides it | None needed today | Fix open: [#397](https://github.com/avocado-linux/meta-avocado/pull/397) |
