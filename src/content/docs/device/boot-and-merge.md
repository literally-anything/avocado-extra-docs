---
title: Boot and extension merge
description: When Avocado merges extensions during boot, what has already run by then, which extension files take effect, and what a failed merge looks like.
---

:::note[Verified against]
avocadoctl `0.12.0` (`fa81278`, `process_post_merge_tasks_for_extensions`) and its systemd units in meta-avocado `scarthgap` at `16e6328` (`recipes-avocado/avocadoctl/`), avocado-cli `1.0.0-rc.5` (`ext/build.rs`), the 2024/edge rootfs (systemd 258) on `jetson-orin-nano-devkit`. The networkd, getty and D-Bus behaviour below was seen on that device.
:::

## The sequence

Avocado turns off stock `systemd-sysext` and `systemd-confext` (a preset file disables them) and merges extensions with `avocadoctl` instead:

1. **In the initramfs**, `avocado-extension-initrd.service` merges extensions whose scope includes `initrd`. **Extensions default to `system` scope only**, so yours aren't merged here unless you set `scopes: [initrd, system]`.
2. **In the real root**, `systemd` starts. Its generators have already run, and several early services have **no ordering against the merge**, so in practice they usually run before it. These include `systemd-modules-load`, `systemd-sysctl`, udev coldplug (`systemd-udev-trigger`) and, unless you order it otherwise, `systemd-networkd`. None of them is re-run afterwards. The merge unit *is* ordered before `systemd-tmpfiles-setup` and `systemd-userdb-load-credentials`, so those two see extension files.
3. `avocado-extension.service` (`After=local-fs.target`, `Before=sysinit.target`) runs `avocadoctl refresh`. That unmerges and re-merges every enabled extension, then runs post-merge tasks in this order:
   1. `depmod` and `ldconfig`, if any extension asked for them
   2. Modules listed in `AVOCADO_MODPROBE=` release-file lines. **avocado-cli `1.0.0-rc.5` never writes these**, so this step does nothing for extensions it builds.
   3. `systemctl daemon-reload`
   4. Every other `AVOCADO_ON_MERGE` command. The extension `modprobe:` key lands here, because the CLI writes it as `AVOCADO_ON_MERGE="modprobe <m>"`. So your modules load **after** the reload, not before it.

   This all happens before `sysinit.target`, so **D-Bus isn't running yet**. See [on_merge: D-Bus isn't up at boot](../on-merge/#d-bus-isnt-up-at-boot).
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
| `systemd/network/*.network` | Only if networkd starts after the merge | networkd has no default ordering against the merge. If it starts first, it never sees your file and the interface stays `unmanaged`. Add a rootfs drop-in: `systemd-networkd.service.d/10-after-extensions.conf` containing `[Unit]` and `After=avocado-extension.service`. |
| `resolved.conf.d`, `dnssd/*.dnssd` | **No** | resolved starts before the merge. Add `on_merge: ['systemctl --no-block try-reload-or-restart systemd-resolved.service']`; a reload re-reads both. |
| `logind.conf.d`, other daemons' config | Yes, for daemons that start after `sysinit.target` | They read config when they start, which is after the merge |
| Units **enabled** by a confext (`*.wants/` symlinks) | Yes | `avocado-ensure-extensions` reloads and restarts the targets, which starts newly wanted units |
| Units **masked** by a confext (`/dev/null` symlinks) | **Not on the boot it arrives** | systemd planned the boot before the mask existed. Jobs already queued still run, and a queued start of the masked unit fails. See [Masks in extensions](#masks-in-extensions). |
| Firmware files | **No**, per the BSP's notes | The firmware loader fails through the sysext overlay. Put firmware in the rootfs. |

:::note[`80-wired.network` doesn't match USB gadgets]
The 2024 rootfs ships `80-wired.network` (`Type=ether`, `Name=!veth*`), which makes every wired port a DHCP client. It does **not** match a USB gadget interface: `u_ether` sets `DEVTYPE=gadget`, so networkd sees `usb0` as type `gadget`. Check with `networkctl list`. An earlier version of this page said otherwise. The ordering drop-in is still needed, but for the reason in the table: without it networkd never reads `50-usb0.network`.
:::

## Masks in extensions

A mask shipped in a confext (for example `etc/systemd/system/getty.target -> /dev/null`) arrives after systemd has planned the boot:

- Units that the plan already queued still start. On the Jetson, with `getty.target` masked from a confext, the serial login on `ttyTCU0` kept working and the broken `getty@getty.service` still started. Moving the same mask into the rootfs overlay stopped both.
- The queued start of the masked unit itself fails, on every boot:

  ```text
  [FAILED] Failed to start getty.target.
  ```

  `systemctl status getty.target` then shows `Loaded: masked`.

A mask that exists when systemd starts, in the rootfs overlay or as `systemd.mask=` on the kernel command line, is skipped silently and takes everything it wants with it. So put boot-time masks in the rootfs. A dev-only extension can still start a masked target's units by linking them into `multi-user.target.wants/`, which isn't masked.

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

**Keep one way in that doesn't depend on extensions.** For dev builds, that's the rootfs's own serial getty. The rootfs is shared by every runtime, though, so a product that masks `getty.target` in the rootfs (see [Masks in extensions](#masks-in-extensions)) loses it in dev too. In that case, add `systemd.wants=serial-getty@<port>.service` or `systemd.debug_shell=<port>` (a root shell, no login) to the **dev** runtime's `kernel.cmdline_extra`. The command line is per runtime and doesn't depend on the merge. Both options come from systemd's debug generator; neither has been tested on an Avocado device yet. If you unmask something in the rootfs overlay later, clean the rootfs; see [Build state](../../build/stale-state/#overlays-add-and-overwrite-they-never-delete).

On Jetson Orin the login console is `ttyTCU0` (the BSP enables `serial-getty@ttyTCU0`), even when kernel messages also go to `ttyAMA0`. A getty on the wrong port fails silently.

## Scopes

```yaml
extensions:
  early-thing:
    scopes: [initrd, system]      # both: SYSEXT_SCOPE and CONFEXT_SCOPE
    sysext_scopes: [initrd]       # or set each half separately
    confext_scopes: [system]
```

The default is `[system]`. The values are written to the release file as `SYSEXT_SCOPE=` and `CONFEXT_SCOPE=`, and `avocadoctl` only merges an extension in an environment its scope lists.
