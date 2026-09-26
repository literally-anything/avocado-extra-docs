---
title: The Jetson boot image ignores cmdline and initramfs
description: kernel.cmdline, kernel.cmdline_extra and the project's initramfs are accepted by avocado.yaml but never reach the boot image on Jetson Orin Nano or Orin NX, on either deploy or provision.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`2b46152`), meta-avocado `scarthgap` at `16e6328`, edk2-nvidia `r36.5`, 2024/edge on `jetson-orin-nano-devkit` snapshot 16 and `jetson-orin-nx` snapshot 17. Checked in `meta-avocado-nvidia/stone/tegra/stone-provision-tegraflash.sh` and the two targets' stone manifests, and against `/proc/cmdline` and the flashed `A_kernel`/`B_kernel` partitions on a devkit on 2026-09-25.
:::

Set `kernel.cmdline_extra` on a Jetson runtime and the build succeeds, `avocado deploy` and `avocado provision` both succeed, and the setting is nowhere on the device. The same is true for every top-level `initramfs:` setting. Nothing warns you.

## What's silently dropped

**The kernel command line is always empty.** Orin boots the Android-format `boot.img` staged in the `A_kernel`/`B_kernel` partitions. `stone-provision-tegraflash.sh` either repacks it with:

```sh
mkbootimg \
    --kernel "$AVOCADO_PROVISION_KERNEL_IMAGE" \
    --ramdisk "$initramfs_in_build" \
    --output "$build_dir/boot.img"
```

which has no `--cmdline`, or copies the BSP's prebuilt `boot.img`, whose header command line is also empty. Nothing in the script reads the runtime's `kernel.cmdline` or `kernel.cmdline_extra`. avocado-cli `1.0.0-rc.5` accepts both keys — [`config-schema`](../../reference/config-schema/#kernel) type-checks them, and the CLI resolves `{{ avocado.kernel.version }}` alongside them — but the value appears nowhere in the build volume for these targets.

Putting your own line in the kernel DTB's `/chosen/bootargs` doesn't help either. NVIDIA's UEFI (edk2-nvidia `r36.5`) builds the final command line from the `boot.img` header, then appends the `KernelCommandLine` UEFI variable and platform arguments, overwriting `/chosen/bootargs`. `TegraPlatformBootManagerDxe.c` only reads the DTB's own `bootargs` when `PcdBootAndroidImage` is set, and that PCD is `FALSE` by default for `jetson-orin-nano-devkit` and `jetson-orin-nx` (it's only `TRUE` for `TegraVirt`). So `boot.img`'s header is the only place a command line can come from, and nothing writes one there.

**The project's initramfs isn't used at all.** The stone manifest for both targets names a prebuilt, `avocado-image-initramfs-jetson-<board>.cpio.gz`, that ships with the BSP's runtime files. `avocado build` separately builds the project's own initramfs (`…cpio.zst` by default), and nothing ever references it for these targets. Every top-level `initramfs:` setting — `packages`, `overlay`, `permissions`, `post_install` — is accepted by the schema and ignored at flash time.

The prebuilt ramdisk also isn't a drop-in replacement for the CLI's own initramfs build, so don't assume you could swap it by hand:

- It enables the real-root units (`avocado-extension.service`, `avocado-ensure-extensions.service`, `avocadoctl.service`, the four `var-volatile-*` services) but not `avocado-extension-initrd.service`.
- It lacks `etc/ld.so.cache` and `usr/lib/udev/hwdb.bin`.
- It carries the SDK's own rpmdb under `opt/_avocado/<target>/sdk/aarch64/var/lib/rpm/`.

## Neither deploy nor provision fixes it

- **`avocado deploy`** never touches `A_kernel`/`B_kernel` on these targets at all, regardless of `kernel.cmdline_extra` or `initramfs:` — see [Orin OS updates carry only the rootfs](../../reference/known-issues/#meta-avocado). A "kernel changed" deploy just reboots into the unchanged boot image.
- **`avocado provision`** (a reflash) is the only command that writes `A_kernel`/`B_kernel`, but it writes the same cmdline-less, prebuilt-initramfs `boot.img` every time. There is currently no `avocado.yaml` setting that changes what lands in that partition on Jetson.

## What we saw on a devkit

```text
$ cat /proc/cmdline
 bl_prof_dataptr=2031616@0x271E10000 bl_prof_ro_ptr=65536@0x271E00000 
```

That's only UEFI's own platform arguments; the trailing space is the empty `KernelCommandLine` variable, which isn't set on the device. The runtime had:

```yaml
kernel:
  cmdline_extra: "sysctl.kernel.sysrq=0 vt.global_cursor_default=0 console=ttyTCU0,115200"
```

None of it reached the command line. The flashed ramdisk was byte-for-byte the size of the prebuilt `cpio.gz` (40,155,725 bytes), not the project's own initramfs build.

## Impact

Every kernel-level hardening option that has to be a boot argument is unavailable: `lockdown=`, `module.sig_enforce=1`, `init_on_alloc=1`, `slab_nomerge`, `debugfs=off`, and so on. Anything that must run before PID 1 can't go in the initramfs either, because the project's initramfs is never flashed. Since the CLI accepts these keys without complaint, a project can believe it shipped these settings when it didn't — check `/proc/cmdline` on the actual device, not just the build config.

:::caution
[Boot and extension merge](../../device/boot-and-merge/) documents `kernel.cmdline_extra` as a way to add a debug shell or `systemd.wants=`. That advice hasn't been tested on Jetson and, per this page, won't reach the device there. It's only confirmed for targets whose stone or bootloader actually reads `cmdline`/`cmdline_extra`, such as `qemuarm64`.
:::

## Possible workaround (untested)

NVIDIA's UEFI appends the non-volatile `KernelCommandLine` variable (`gNVIDIAPublicVariableGuid`, `CHAR16[255]`, so at most 254 characters) to every boot. It could potentially be seeded at flash time through the same `BOOTCONTROL_OVERLAYS` UEFI-defaults mechanism carriers already use for boot order and quick boot — see [UEFI boot settings](../jetson-orin/#uefi-boot-settings-l4tconfigurationdtbo). This hasn't been tried.

There's no equivalent workaround for the initramfs: nothing on the device reads a project-supplied ramdisk for these targets.

## Filing status

Not filed upstream as this specific gap (an ignored `kernel.cmdline_extra`/`initramfs:`). There is related, in-progress upstream work: [meta-avocado#391](https://github.com/avocado-linux/meta-avocado/pull/391) (open) starts repacking the Orin boot.img's command line at provision time, but only to append two `avocado.root_partuuid`/`_b` values for rootfs-slot discovery — it explicitly does not carry forward arbitrary arguments, after an earlier revision that tried to hung a board on hardware. [meta-avocado#398](https://github.com/avocado-linux/meta-avocado/issues/398) is the hardware debugging behind that decision: carrying the machine's own `KERNEL_ARGS` forward moved `/dev/console` to a disabled framebuffer console (`console=tty0` after `console=ttyTCU0,...`), which looked like a silent hang but wasn't. Neither PR touches `avocado.yaml`'s `kernel.cmdline`/`cmdline_extra` or the project's `initramfs:`, so this page's gap stands even once #391 merges. See [Known upstream issues](../../reference/known-issues/) for the related, already-tracked gap that `avocado deploy` never carries the kernel or kernel DTB at all.
