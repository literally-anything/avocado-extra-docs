---
title: Kernel modules in extensions
description: How to name kernel module packages so they always match the shipped kernel, and how kernel resolution, built-in modules and depmod interact.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/utils/kernel_resolver.rs`, `src/utils/kernel_version.rs`, `src/commands/ext/install.rs`), meta-avocado `scarthgap` (`avocado-kernel-builtin-provides.bbclass`), avocadoctl `0.12.0`.
:::

## Use the kernel-version template

Write kernel module packages like this:

```yaml
extensions:
  usb-gadget:
    types: [sysext, confext]
    version: '1.1.0'
    packages:
      kernel-module-libcomposite-{{ avocado.kernel.version }}: '*'
      kernel-module-u-ether-{{ avocado.kernel.version }}: '*'
      kernel-module-usb-f-ncm-{{ avocado.kernel.version }}: '*'
```

**Don't** write the version out by hand, as in `kernel-module-libcomposite-6.6.127-yocto-standard`. That works until the next kernel bump, then the install fails with a package name nobody remembers choosing.

How the template gets its value:

1. At install time, the CLI resolves **one** kernel version per sysroot. It uses the version pinned in `avocado.lock` if there is one. Otherwise it applies any `kernel.version` constraint, or takes the highest version in the feed.
2. It substitutes that version into package **keys**. See [Templating](../../config/templating/#avocadokernelversion) for exactly where.
3. If a module no longer exists for that kernel, `avocado install` fails and names the missing package. That's a build-time failure, not a boot-time one.

The template has been in the CLI since `0.41.0`.

## Built-in modules still resolve

Some kernels build a module in (`CONFIG_X=y`) rather than as a separate package. Avocado's kernel recipes use `avocado-kernel-builtin-provides.bbclass`, which makes the kernel package itself advertise every built-in module as both `kernel-module-X` and `kernel-module-X-<kver>`. So the templated name resolves whether the module is built in or not, and you don't need to know which.

Real example: on the Jetson 6.6 kernel, `libcomposite` was built in according to `meta-avocado`'s current kernel config, but still shipped as a separate package in the 2024/edge snapshot 16 feed. The templated name worked in both cases.

## Unversioned names

A bare `kernel-module-foo: '*'` also works in practice. Kernel module packages advertise an unversioned `kernel-module-foo` name, and the CLI hides every package that belongs to a kernel other than the pinned one (`off_kernel_dnf_excludes`). The published Jetson BSP extension relies on this, with entries like `kernel-module-nvgpu: '*'`. Prefer the template in your own extensions anyway. It's explicit, it fails at install time instead of resolving to something unexpected, and it matches what Avocado's own Tegra recipes do (their packagegroups spell out `kernel-module-*-${KERNEL_VERSION}`).

:::caution[Stale docs]
Comments in the CLI source (`kernel_version.rs`) and in the published Jetson BSP `avocado.yaml` say the CLI **automatically adds the kernel-version suffix** to `kernel-module-*` names. It did, until May 2026 (commit `1255b08`, "drop kernel-family auto-suffix"). It no longer does.
:::

## When the kernel changes

When the kernel pin changes (after `avocado unlock` or `avocado update`, for example), the CLI **wipes** the affected extension, rootfs and initramfs sysroots and reinstalls them. That's the only automatic cleanup the CLI does (see [Build state](../stale-state/)), and it's what keeps modules for the old kernel out of the image.

## On the device

- When an extension contains any `*.ko`, `*.ko.xz` or `*.ko.gz` file, the build automatically adds `AVOCADO_ON_MERGE="depmod"` to its release file. `avocadoctl` runs `depmod` after every merge, so modules shipped in extensions can be found by `modprobe`.
- `modprobe: [foo]` in an extension becomes `AVOCADO_ON_MERGE="modprobe foo"`. It runs after `depmod`, on every merge. **If it fails, you only get a warning.** A service that needs the module should load it too, and fail clearly if it can't.
- Kernel code that asks for a module at runtime (for example configfs creating `functions/ncm.usb0`, which loads `usb_f_ncm`) finds extension modules too, because `depmod` has already run.
- **`modules-load.d` files inside extensions don't work at boot.** `systemd-modules-load` runs before extensions merge, and nothing re-runs it. Use `modprobe:` instead. See [Boot and extension merge](../../device/boot-and-merge/).
- Firmware is different. According to the Jetson BSP's own notes, the kernel's firmware loader fails with `-ELOOP` (error 40) when it reads firmware through the sysext `/usr` overlay. That's why Avocado ships Tegra GPU firmware in the rootfs, not the BSP extension. Plan on putting firmware you add in the rootfs too.
