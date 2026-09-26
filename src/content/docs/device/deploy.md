---
title: What avocado deploy does
description: How avocado deploy pushes a runtime to a device, when it reboots and when it doesn't, and the traps in deploying over the link you're changing.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/commands/runtime/deploy.rs`), avocadoctl `0.12.0` (`src/commands/runtime.rs`, `src/commands/staging.rs`, `src/commands/ext.rs`) and its `avocado-ensure-extensions.service` in meta-avocado `scarthgap` at `16e6328`. A live refresh (`runtime.rs`) calls `ext::refresh_extensions` directly, which unmerges, re-merges and runs post-merge tasks including `daemon-reload`; it never runs `avocado-ensure-extensions.service`, which is boot-only (`Before=sysinit.target`, `WantedBy=sysinit.target`) and is what restarts `sockets.target timers.target paths.target multi-user.target` at boot.
:::

```bash
avocado deploy --device root@192.168.55.1 dev
```

## The mechanics

1. The CLI builds a signed TUF repository for the runtime inside the SDK container.
2. It serves that repository over **plain HTTP** from the container, on all interfaces, using a small Python server. The port comes from `AVOCADO_DEPLOY_REPO_PORT`, or a default.
3. It works out an IP address **the device can use to reach your machine**. `AVOCADO_DEPLOY_REPO_HOST` overrides this. When the device address is loopback (a QEMU VM with a forwarded SSH port), it picks the machine's first global IPv4 address instead.
4. It connects over SSH (`StrictHostKeyChecking=no`) and runs `avocadoctl runtime add --url http://<host-ip>:<port>` on the device.
5. The device downloads what it's missing, checks the hashes, stages the runtime and activates it.

Extension images are stored on the device by a **content-derived image ID**, not by name and version. Rebuilding an extension without bumping `version:` is still deployed correctly; you just can't tell builds apart by version. Bump it anyway.

## Reboot or not

| What changed | What the device does |
|---|---|
| Only extensions | Activates the runtime and **refreshes extensions live, with no reboot** |
| The OS: kernel, initramfs or rootfs | Applies the OS update and **reboots** |
| Nothing | Nothing; extensions aren't refreshed either |

:::caution[Jetson: "the OS" here means rootfs only]
On `jetson-orin-nano-devkit` and `jetson-orin-nx`, the stone manifest's `update.os_artifacts` lists only `rootfs`. A deploy can never write the kernel or kernel DTB partitions on these targets, no matter what changed in `kernel:` or `initramfs:`. Only `avocado provision` (a reflash) touches them — and even then, the runtime's `kernel.cmdline`/`cmdline_extra` and the project's own initramfs are dropped, not just left for the next deploy. See [Known upstream issues](../../reference/known-issues/#meta-avocado) and [The Jetson boot image ignores cmdline and initramfs](../../hardware/jetson-boot-image/).
:::

A live refresh doesn't restart services that are already running. After the merge, systemd reloads its config, but an active service keeps running the old version until something restarts it or you reboot. So:

- A oneshot with `RemainAfterExit=yes` (like a USB gadget setup) **keeps its old configuration** until you reboot.
- The first reboot after deploying is when the new setup actually runs for the first time. Test that reboot deliberately.

## Deploying over the link you're changing

If you deploy over a link that one of your extensions provides (a USB gadget, a Wi-Fi config), the refresh generally keeps it up, because a live refresh doesn't restart `multi-user.target` or anything else the way boot does (see [Boot and extension merge](../boot-and-merge/)). The one thing that can restart it anyway is the extension's own `on_merge`, if it names that service or reloads something the link depends on (for example `systemctl --no-block try-reload-or-restart systemd-networkd.service`). Check your `on_merge` list before relying on this. **The next reboot** applies the change either way. If the new version doesn't work, you've lost the link. Before that reboot, make sure you have another way in: a serial console, a working network path that doesn't depend on the change, or be ready to reflash.

## Other things to know

- **The device has to reach your machine.** The device connects back to download the repo, so a firewall on your machine, or a route the device doesn't have, makes the deploy fail after SSH has already succeeded. Set `AVOCADO_DEPLOY_REPO_HOST` when auto-detection picks the wrong address. It's also needed for QEMU user-mode networking, where the host is `10.0.2.2`.
- **A dev runtime needs SSH.** `avocado deploy` needs root SSH on the device. That's usually `avocado-ext-sshd-dev`, which allows root with an empty password. If the extension merge failed, sshd isn't running, and you can't deploy a fix: you have to reflash. See [When the merge fails](../boot-and-merge/#when-the-merge-fails).
- **`--connect-sign`** is for a device that has already accepted a Connect OTA. It needs a local signing key for the runtime.
