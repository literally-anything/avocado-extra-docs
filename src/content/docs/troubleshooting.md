---
title: Symptoms and fixes
description: Troubleshooting index for Avocado builds and devices, organized by what you observe.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5`, avocadoctl `0.12.0`, 2024/edge on Jetson Orin. Every entry links to the page that explains it.
:::

## On the device

### Device boots, but no SSH, no USB network and no serial login

The console shows:

```text
[FAILED] Failed to start Avocado merge extensions.
[DEPEND] Dependency failed for Reload …vocado extensions are merged.
```

**Cause:** an `on_merge` command's program couldn't be started, which failed the whole merge, so no extension services started. Seen in practice when an empty BSP extension image left out `nvbootctrl`. A line like `loop0: detected capacity change from 0 to 8` (a 4 KB image) points to the empty image.

**Fix:** reflash from a clean build. Clean the affected extensions (or run `avocado clean`), rebuild, check image sizes, then provision. → [When the merge fails](../device/boot-and-merge/#when-the-merge-fails), [Build state](../build/stale-state/)

### Serial getty doesn't come up even after unmasking `getty.target`

**Cause:** renaming or deleting an overlay file doesn't remove the copy already in the rootfs sysroot, so the old mask is still there.
**Fix:** `avocado rootfs clean`, then rebuild. → [Build state](../build/stale-state/#overlays-add-and-overwrite-they-never-delete)

### A service I removed from `enable_services` still starts

**Cause:** the old `*.wants/` symlink is still in the extension sysroot.
**Fix:** `avocado ext clean -r <rt> <ext>`, then rebuild. → [Build state](../build/stale-state/#enable_services-symlinks-are-never-removed)

### A `modules-load.d` or `sysctl.d` file in an extension has no effect

**Cause:** those services run before extensions merge, and they're never re-run.
**Fix:** use `modprobe:` or `Wants=modprobe@x.service` for modules. Use `on_merge: ['systemctl restart systemd-sysctl.service']` for sysctls. → [Boot and extension merge](../device/boot-and-merge/#which-extension-files-take-effect-at-boot)

### A oneshot service silently doesn't run, and isn't marked failed

**Cause:** a `Condition*=` was false at start time. For example, `ConditionPathExistsGlob=/sys/class/udc/*` fails when the controller's driver loads late. systemd skips the unit without an error.
**Fix:** wait for the resource inside the script, and use `Restart=on-failure` with `StartLimitIntervalSec=0`. → [Jetson USB device mode](../hardware/jetson-orin/#usb-device-mode-gadget)

### The USB gadget interface gets a DHCP client instead of my static address

**Cause:** networkd read its config before your extension merged, so the stock `80-wired.network` claimed `usb0`.
**Fix:** a rootfs drop-in that orders `systemd-networkd` `After=avocado-extension.service`. → [Boot and extension merge](../device/boot-and-merge/)

### The hostname (or anything derived from machine-id) changes every boot

**Cause:** the rootfs ships an empty `/etc/machine-id` on a read-only `/etc`, so systemd generates a new ID every boot.
**Fix:** derive the identity from hardware instead. → [Hostname and machine-id](../device/hostname-and-machine-id/)

### Windows sees a "new" USB device every boot, or never loads a driver

**Cause:** the USB serial number changes every boot (see above). Windows has no built-in ECM driver. Windows 10 needs the `WINNCM` OS descriptor for NCM.
→ [Jetson USB device mode](../hardware/jetson-orin/#usb-device-mode-gadget)

### `nvidia-drm` isn't loaded at boot

**Cause:** nothing loads it automatically on Orin (its aliases are PCI-only), and `modules-load.d` in extensions doesn't apply.
→ [Jetson display](../hardware/jetson-orin/#display-nvidia-drm)

### USB keyboards still work despite `install usbhid /bin/false`

**Cause:** `usbhid` is compiled into the kernel. → [Jetson input](../hardware/jetson-orin/#input-and-kiosk-builds)

### A deploy "succeeded", but the change isn't active

**Cause:** extension-only deploys refresh live, and services that are already running keep their old configuration until a restart.
**Fix:** reboot, and test that reboot deliberately. → [What avocado deploy does](../device/deploy/#reboot-or-not)

### A deploy connects over SSH, then fails or hangs

**Cause:** the device can't reach the temporary HTTP server on your machine.
**Fix:** set `AVOCADO_DEPLOY_REPO_HOST` to an address the device can reach, and check your firewall. → [What avocado deploy does](../device/deploy/#other-things-to-know)

## In the build

### An extension image is only 4 KB, or much smaller than it should be

**Cause:** the image was built from an unpopulated sysroot, then reused, because its inputs never changed ([avocado-cli#283](https://github.com/avocado-linux/avocado-cli/issues/283)).
**Fix:** clean that extension and rebuild. Check with `scripts/check-avocado-build.sh`. → [Build state](../build/stale-state/#up-to-date-checks-trust-inputs-not-outputs)

### My change to `avocado.yaml` did nothing

Check these, most likely first:
1. **A typo in a key.** Unknown keys are ignored silently. → [Format](../config/format/#unknown-keys-are-silently-ignored)
2. **A `target-`/`kernel-` override that never matches.** Non-matching overrides are dropped silently. → [Overrides](../config/overrides/)
3. **A removal.** Removals don't reach the sysroot. → [Build state](../build/stale-state/)
4. **A runtime-dependent template, built with `-r`.** Templating ignores `-r`. → [Templating](../config/templating/#avocado-computed-values)

### A literal `{{ ... }}` shows up in a built file or a value

- A typo in an `avocado.*` path is left in place instead of raising an error.
- Overlay files are only templated with `preprocess:`.
- `{{ avocado.kernel.version }}` only works in package keys.

→ [Templating](../config/templating/)

### A package silently isn't installed

**Cause:** its `packages:` value is an object the CLI doesn't recognize, such as `{ ver: '1.0' }`. It's skipped without an error. → [Package entries](../config/format/#package-entries)

### Extension version `1.10` shows up as `1`

**Cause:** unquoted YAML floats. **Fix:** quote it: `version: '1.10'`. → [YAML 1.2 rules](../config/format/#yaml-12-rules)

### Root has no password in a build that should have one

**Cause:** `password: '{{ env.X }}'` with `X` unset becomes `''`, which means no password. → [Templating: env](../config/templating/#env-your-hosts-environment)

### After a kernel update, install fails with a missing `kernel-module-...-<old version>`

**Cause:** the kernel version is typed out in a package name.
**Fix:** use `{{ avocado.kernel.version }}`. → [Kernel modules](../build/kernel-modules/)

### I can't find my build files after `avocado clean`, or the volume is empty

**Cause:** `avocado clean` replaced the volume with a new one. And mounting an old volume name with `docker run -v` **creates** an empty volume under that name.
**Fix:** read the current name from `.avocado-state`, and check it with `docker volume inspect` first. `avocado prune` removes abandoned volumes. → [Inspecting the build volume](../build/inspecting-the-volume/)

### SDK tools fail with `cannot execute: required file not found`

**Cause:** they need the SDK's own loader, at the real `/opt/_avocado` path.
**Fix:** mount the volume at `/opt/_avocado`. → [Inspecting the build volume](../build/inspecting-the-volume/#tools-in-the-sdk-image)
