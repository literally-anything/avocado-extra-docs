---
title: Hostname patterns and machine-id
description: How ? placeholders in /etc/hostname work, why Avocado's machine-id is likely regenerated every boot, and what that does to anything derived from it.
---

:::note[Verified against]
systemd 258 (`NEWS`, `hostname(5)`), avocado-cli `1.0.0-rc.5` (`src/commands/rootfs/image.rs`), the 2024/edge rootfs. The claim that machine-id changes every boot comes from the code and systemd's documented behaviour; it hasn't been confirmed on a device yet. [Check it yourself](#check-your-device).
:::

## `?` placeholders in `/etc/hostname`

Put this in the rootfs overlay's `etc/hostname`:

```text
garbanzo-????????
```

When systemd applies the hostname, it replaces each `?` with a hex digit **derived from the machine ID by cryptographic hashing**. The same machine ID always gives the same hostname, but you can't work backwards from the hostname to the machine ID. The result looks like `garbanzo-7aaf846c`.

- This arrived in **systemd 258**, which is what Avocado's 2024 rootfs ships. Older systemd treats `?` as an invalid character and filters it out.
- Newer systemd, not yet in any Avocado release as of this writing, adds `$` placeholders that pick words from word lists (`$-$-????` → `sunny-red-92a9`). **Don't use `$` on a 258 system.**
- This is a systemd feature, not an Avocado one. Avocado just copies your `/etc/hostname`.

## Avocado's machine-id is stateless

Unless you set your own `post_install`, the rootfs image step does this:

```sh
# "Empty /etc/machine-id for stateless systemd on read-only rootfs."
touch "$ROOTFS_WORK/etc/machine-id"
```

The rootfs, including `/etc`, is read-only EROFS. When systemd finds an **empty** `/etc/machine-id` that it can't write to, it makes up a new random ID for that boot and mounts it over the file. Nothing in Avocado saves it. `systemd-machine-id-commit` needs a writable `/etc` to do that, and there isn't one.

**So the machine ID is most likely different on every boot**, and so is everything derived from it:

| Derived from machine-id | Effect |
|---|---|
| `?` characters in `/etc/hostname` | **The hostname changes every boot.** mDNS names, DHCP hostnames and log labels all move. |
| Your own uses, such as a USB gadget serial number taken from `cut -c1-16 /etc/machine-id` | Changes every boot. Windows treats each boot as a new USB device. |
| systemd-networkd DHCP client identifier, for `.network` files that don't set `ClientIdentifier=` | Defaults to a DUID derived from machine-id, so **you get a different lease and IP each boot**. The stock `80-wired.network` sets `ClientIdentifier=mac`, which is stable. |
| Persistent journal directory (`/var/log/journal/<machine-id>/`), if the journal is persistent | Each boot writes to a new directory, and plain `journalctl` reads only the current one. Use `journalctl --merge` to see earlier boots. |

Also: `machine-id` is meant to be **confidential** (see `machine-id(5)`). Don't put the raw value anywhere a host or network can read it, such as USB descriptors or mDNS TXT records.

## Check your device

Run this, reboot, and run it again:

```bash
cat /etc/machine-id; findmnt /etc/machine-id; hostnamectl --static; hostname
```

If the ID differs between boots, everything above applies. If `findmnt` shows a mount on `/etc/machine-id`, systemd generated a temporary ID.

## Getting a stable per-device identity

A few options, depending on what you need:

- **Hostname and serial numbers:** derive them from a stable **hardware** ID at runtime instead of from machine-id, and hash it rather than exposing it raw. On Jetson, the module serial is usually in `/proc/device-tree/serial-number`. Check that it exists on your carrier board. A small oneshot service can set a transient hostname (`hostnamectl set-hostname --transient ...`) or feed the value to your gadget setup script.
- **A fixed machine-id:** systemd accepts `systemd.machine_id=<32 hex chars>` on the kernel command line. That needs a per-device command line, which Avocado has no mechanism for.
- **DHCP:** set `ClientIdentifier=mac` in your own `.network` files, as the stock `80-wired.network` does.

If you replace the rootfs `post_install`, you take over these defaults, including the empty machine-id. See the [config schema](../../reference/config-schema/#rootfs-and-initramfs).
