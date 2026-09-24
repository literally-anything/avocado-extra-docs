---
title: Boot and extension merge
description: When Avocado merges extensions during boot, what has already run by then, which extension files take effect, and what a failed merge looks like.
---

:::note[Verified against]
avocadoctl `0.12.0` (`fa81278`) and its systemd units in meta-avocado `scarthgap` (`recipes-avocado/avocadoctl/`), the 2024/edge rootfs (systemd 258) on `jetson-orin-nano-devkit`.
:::

## The sequence

Avocado turns off stock `systemd-sysext` and `systemd-confext` (a preset file disables them) and merges extensions with `avocadoctl` instead:

1. **In the initramfs**, `avocado-extension-initrd.service` merges extensions whose scope includes `initrd`. **Extensions default to `system` scope only**, so yours aren't merged here unless you set `scopes: [initrd, system]`.
2. **In the real root**, `systemd` starts. Its generators have already run, and several early services have **no ordering against the merge**, so in practice they usually run before it. These include `systemd-modules-load`, `systemd-sysctl`, udev coldplug (`systemd-udev-trigger`) and, unless you order it otherwise, `systemd-networkd`. None of them is re-run afterwards.
3. `avocado-extension.service` (`After=local-fs.target`, `Before=sysinit.target`) runs `avocadoctl refresh`. That unmerges and re-merges every enabled extension, then runs post-merge tasks in this order:
   1. `depmod` and `ldconfig`, if any extension asked for them
   2. Every `modprobe:` module (a failure only warns)
   3. `systemctl daemon-reload`
   4. Every other `AVOCADO_ON_MERGE` command
4. `avocado-ensure-extensions.service` (`BindsTo=avocado-extension.service`) runs `daemon-reload` again, then `systemctl restart --no-block sockets.target timers.target paths.target multi-user.target`. **This is what starts the services your extensions ship.** systemd worked out its startup plan before the merge, so without this step those units would never be started.
5. Boot continues to `multi-user.target`.

The merge has a 90-second timeout (`TimeoutStartSec=90`), and it's skipped when `/var/lib/avocado` is empty.

## Which extension files take effect at boot

| You ship this in an extension | Takes effect at boot? | Why, and what to do |
|---|---|---|
| systemd units, plus `enable_services` | **Yes** | `avocado-ensure-extensions` reloads and restarts the targets. `enable_services` needs `confext` in `types`. |
| `modules-load.d/*.conf` | **No** | `systemd-modules-load` already ran and isn't re-run. Use the extension's `modprobe:` key, or `Wants=modprobe@<mod>.service` in the unit that needs it. |
| `sysctl.d/*.conf` | **No** | `systemd-sysctl` already ran. Add `on_merge: ['systemctl restart systemd-sysctl.service']`. |
| `tmpfiles.d/*.conf`, `sysusers.d/*.conf` | Yes | The build adds `systemd-tmpfiles --create` and `systemd-sysusers` to the release file automatically. |
| udev rules | Only if something reloads udev | The Jetson BSP's `on_merge` runs `udevadm control --reload` plus a trigger, and that covers your rules too while the BSP is in the runtime. Without it, add those commands yourself. |
| `systemd/network/*.network` | Only if networkd starts after the merge | networkd has no default ordering against the merge. Add a rootfs drop-in: `systemd-networkd.service.d/10-after-extensions.conf` containing `[Unit]` and `After=avocado-extension.service`. |
| `logind.conf.d`, other daemons' config | Yes, for daemons that start after `sysinit.target` | They read config when they start, which is after the merge |
| Masks and symlinks under `/etc/systemd/system` (confext) | Yes | Picked up by the `daemon-reload` |
| Firmware files | **No**, per the BSP's notes | The firmware loader fails through the sysext overlay. Put firmware in the rootfs. |

:::caution[networkd and the stock `80-wired.network`]
The 2024 rootfs ships `80-wired.network`, which matches **every** Ethernet-type interface (`Type=ether`) and makes it a DHCP client. That includes USB gadget interfaces like `usb0`. If networkd reads its config before your extension's `50-usb0.network` exists, `usb0` gets DHCP instead of your static config. The `After=avocado-extension.service` drop-in above is what prevents that.
:::

## When the merge fails

`avocadoctl` treats a merge command's failures in two different ways:

- The command **runs and exits non-zero**: a warning, and the merge carries on.
- The command **can't be started**, for example because its program doesn't exist: an error. The rest of the post-merge steps are skipped and `avocadoctl refresh` fails.

A failed refresh fails `avocado-extension.service`. `avocado-ensure-extensions` is bound to it, so it doesn't run. Your extensions are merged, but **none of their services start**. That means no SSH, no USB gadget, and no serial getty if it comes from an extension. The console shows:

```text
[FAILED] Failed to start Avocado merge extensions.
See 'systemctl status avocado-extension.service' for details.
[DEPEND] Dependency failed for Reload …vocado extensions are merged.
```

The case seen in practice: an empty BSP extension image ([avocado-cli#283](https://github.com/avocado-linux/avocado-cli/issues/283)) left out `nvbootctrl`, while the BSP's `on_merge` still ran `nvbootctrl verify`. Earlier in the log, `loop0: detected capacity change from 0 to 8` gives it away: that's an 8-sector, 4 KB extension image.

**Keep one way in that doesn't depend on extensions.** For dev builds, that's the rootfs's own serial getty. Don't mask `getty.target` in the rootfs. If you do, and then unmask it, clean the rootfs; see [Build state](../../build/stale-state/#overlays-add-and-overwrite-they-never-delete).

## Scopes

```yaml
extensions:
  early-thing:
    scopes: [initrd, system]      # both: SYSEXT_SCOPE and CONFEXT_SCOPE
    sysext_scopes: [initrd]       # or set each half separately
    confext_scopes: [system]
```

The default is `[system]`. The values are written to the release file as `SYSEXT_SCOPE=` and `CONFEXT_SCOPE=`, and `avocadoctl` only merges an extension in an environment its scope lists.
