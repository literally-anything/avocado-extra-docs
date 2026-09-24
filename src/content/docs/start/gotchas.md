---
title: Gotchas at a glance
description: Every Avocado trap documented on this site, one line each, with links to the details.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5`, avocadoctl `0.12.0`, 2024/edge.
:::

## Configuration

- **Unknown keys are ignored silently,** at every level. `board:` instead of `target_board:` does nothing. → [Format](../../config/format/#unknown-keys-are-silently-ignored)
- **`-r/--runtime` doesn't affect templating.** `{{ avocado.runtime }}`, and a runtime's `target_board`, come from `AVOCADO_RUNTIME`, then `default_runtime`. → [Templating](../../config/templating/#avocado-computed-values)
- **`{{ env.X }}` with `X` unset becomes an empty string,** not an error. That's dangerous in `password:`. → [Templating](../../config/templating/#env-your-hosts-environment)
- **A typo in an `avocado.*` template is left in place,** braces and all, with no error. → [Templating](../../config/templating/#avocado-computed-values)
- **Overlay files aren't templated** unless the overlay sets `preprocess:`. → [Templating](../../config/templating/#overlay-files)
- **`{{ avocado.kernel.version }}` only works in package keys.** → [Templating](../../config/templating/#avocadokernelversion)
- **Quote versions:** `version: 1.10` becomes `"1"`. **YAML 1.2:** `yes`/`no` are strings. → [Format](../../config/format/#yaml-12-rules)
- **An unrecognized object in `packages:` is skipped without an error.** → [Format](../../config/format/#package-entries)
- **Overrides replace lists; they don't append,** and a non-matching `target-`/`kernel-` key is dropped silently. → [Overrides](../../config/overrides/)
- **`rootfs.post_install` replaces all the defaults,** including the usrmerge symlinks and the empty machine-id. → [Schema](../../reference/config-schema/#rootfs-and-initramfs)

## Build

- **Removing or renaming overlay files doesn't remove them from the image,** in merge *or* opaque mode. → [Build state](../../build/stale-state/)
- **Removing an `enable_services` entry leaves the service enabled.** → [Build state](../../build/stale-state/#enable_services-symlinks-are-never-removed)
- **Up-to-date checks only look at inputs.** A bad image is reused until its inputs change. `--no-stamps` re-runs steps but doesn't remove stale files. → [Build state](../../build/stale-state/#up-to-date-checks-trust-inputs-not-outputs)
- **Don't type out the kernel version in package names.** Use `{{ avocado.kernel.version }}`. → [Kernel modules](../../build/kernel-modules/)
- **`avocado clean` replaces the build volume,** and `docker run -v <old-name>` creates an empty one. → [Inspecting the volume](../../build/inspecting-the-volume/)
- **`sdk:2024` is a moving tag.** → [Releases and channels](../../build/releases-and-channels/#switching-release-or-channel)

## Device

- **`modules-load.d` and `sysctl.d` in extensions don't apply at boot.** → [Boot and merge](../../device/boot-and-merge/#which-extension-files-take-effect-at-boot)
- **`on_merge` has no shell,** and **a missing program fails the whole merge**, so no extension services start. → [on_merge](../../device/on-merge/)
- **A failed `modprobe:` only warns.** → [Kernel modules](../../build/kernel-modules/#on-the-device)
- **The stock `80-wired.network` claims every Ethernet-type interface,** including USB gadgets, unless networkd starts after the merge. → [Boot and merge](../../device/boot-and-merge/)
- **machine-id is regenerated every boot,** so `?` hostnames and anything else derived from it change too. → [Hostname and machine-id](../../device/hostname-and-machine-id/)
- **Extension-only deploys don't restart running services.** The first reboot is the real test. → [Deploy](../../device/deploy/#reboot-or-not)
- **Keep a login path that doesn't depend on extensions.** → [Boot and merge](../../device/boot-and-merge/#when-the-merge-fails)

## Jetson

- **`tegra-xudc` loads late,** so don't gate a gadget on `ConditionPathExistsGlob`. → [Jetson](../../hardware/jetson-orin/#usb-device-mode-gadget)
- **`usbhid` is built in,** and Ctrl+Alt+Del ×7 forces a reboot even when masked. → [Jetson](../../hardware/jetson-orin/#input-and-kiosk-builds)
- **`nvidia-drm` never loads by itself.** → [Jetson](../../hardware/jetson-orin/#display-nvidia-drm)
- **`nvbootctrl` lives in the BSP extension.** An empty BSP breaks the merge. → [Jetson](../../hardware/jetson-orin/#ab-slots-and-nvbootctrl-verify)
