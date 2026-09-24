---
title: NVIDIA Jetson Orin
description: Jetson Orin specifics on Avocado 2024, covering UEFI boot settings, A/B slots, USB device mode, display modules, input and firmware.
---

:::note[Verified against]
Target `jetson-orin-nano-devkit`, 2024/edge snapshot 16, kernel `6.6.127-yocto-standard`, L4T 36.5, meta-avocado `scarthgap` (`meta-avocado-nvidia/`), avocado-cli `1.0.0-rc.5`.
:::

## UEFI boot settings (`L4TConfiguration.dtbo`)

Boot order, quick boot and the boot menu timeout come from UEFI variables set in `L4TConfiguration.dtbo` **when you flash**. To change them, put a modified copy in a `carrier-bsp/` directory that one of your extensions lists in `stone_include_paths`. The flash step copies every file from it over the stock BSP file of the same name.

Things that were verified in a real flash bundle:

- The flash applies overlays in this order: `BOOTCONTROL_OVERLAYS="L4TConfiguration.dtbo,L4TConfiguration-RootfsRedundancyLevelABEnable.dtbo"`. Yours is applied **first**, then the stock A/B overlay. The stock A/B overlay only sets `RootfsRedundancyLevel`, so it doesn't undo your changes. If you ever override a variable the A/B overlay also sets, the A/B overlay wins.
- The flash uses the **first** `carrier-bsp/` directory it finds, and it searches BSP extensions first. If your carrier-board BSP ships its own `carrier-bsp/`, your override is **silently dropped**. Merge your changes into that one.
- The copy in the build output is at `output/runtimes/<rt>/stone/carrier-bsp/`. Compare its hash with your generated file to confirm it was used.

Useful variables (under `/fragment@0/__overlay__/firmware/uefi/variables`):

| Node | Variable | Example |
|---|---|---|
| `gNVIDIAPublicVariableGuid/QuickBootEnabled` | Skip full device enumeration when nothing changed | `01` |
| `gNVIDIATokenSpaceGuid/DefaultBootPriority` | Boot order | `"nvme,usb,emmc,sd,ufs"` |
| `gEfiGlobalVariableGuid/Timeout` | Boot menu countdown, in seconds, UINT16 little-endian | `00 00` |

If you generate the file with a `post_build` hook, make the hook **fail** when the stock file is missing on a Tegra target. A hook that exits 0 flashes stock UEFI settings without telling you. And use the SDK's `fdtput` and `dtc`; see [Inspecting the build volume](../../build/inspecting-the-volume/#tools-in-the-sdk-image).

`usb` second in the boot order means a bootable USB stick boots if NVMe fails. That's fine on a bench, and worth reconsidering for a product.

## A/B slots and `nvbootctrl verify`

The flash turns on A/B rootfs redundancy. The Jetson BSP extension runs `nvbootctrl verify` on every merge. That's what marks the current boot as good. `nvbootctrl` ships **in the BSP extension**, not the rootfs.

If the BSP extension is missing or empty, that `on_merge` command can't start, and the whole merge fails. See [When the merge fails](../../device/boot-and-merge/#when-the-merge-fails). Under L4T's A/B scheme, boots that are never verified also count against the slot's retry count, so the bootloader eventually switches slots.

## USB device mode (gadget)

- **The device-mode driver `tegra-xudc` is a loadable module.** It can finish loading after your gadget service starts. **Don't** use `ConditionPathExistsGlob=/sys/class/udc/*`: a failed condition skips the unit silently. Wait for the controller in your setup script, and use `Restart=on-failure` with `StartLimitIntervalSec=0`.
- **`libcomposite` shipped as a separate module** in snapshot 16, even though `meta-avocado`'s current kernel config builds it in. `/sys/kernel/config/usb_gadget/` only exists once it's loaded, so run `modprobe libcomposite` in your setup script and fail clearly if it can't load. The extension's `modprobe:` key only warns on failure.
- Name the module packages with `{{ avocado.kernel.version }}`. See [Kernel modules](../../build/kernel-modules/).
- **ECM vs NCM:** Windows has no built-in ECM driver. For NCM, Windows 11 loads its built-in `UsbNcm` driver by class code. Windows 10 only loads it if the device sends a Microsoft OS descriptor with compatible ID `WINNCM`. Linux 6.6's `f_ncm` supports that descriptor:

  ```sh
  echo 1       > os_desc/use
  echo 0xcd    > os_desc/b_vendor_code
  echo MSFT100 > os_desc/qw_sign
  echo WINNCM  > functions/ncm.usb0/os_desc/interface.ncm/compatible_id
  ln -s configs/c.1 os_desc/          # before binding the UDC
  ```

  Windows remembers descriptors per vendor ID, product ID and `bcdDevice`. Change `bcdDevice` when you change the descriptor, and tear down `os_desc/c.1` **before** you remove `configs/c.1`.
- `192.168.55.1/24`, with a DHCP server on `usb0`, follows NVIDIA's L4T convention. Every unit then has the same address and MAC, so connect one at a time.
- See [Boot and extension merge](../../device/boot-and-merge/) for the networkd ordering drop-in that `usb0` needs.

## Display (`nvidia-drm`)

The NVIDIA display modules ship in the BSP extension. `nvidia-drm`'s hardware aliases are all PCI, and the Orin display isn't on PCI, so **nothing loads it automatically**. A `modules-load.d` file in an extension doesn't work either (see [Boot and extension merge](../../device/boot-and-merge/)). Load it from the extension's `modprobe:` key, or with `Wants=modprobe@nvidia_drm.service` in the unit that needs it. `modprobe.d` options, such as `options nvidia-drm modeset=1 fbdev=0`, **do** apply from an extension, because `modprobe` reads them when it runs.

## Input and kiosk builds

`usbhid`, `hid-generic` and `atkbd` are **compiled into** the 6.6 kernel, so `install usbhid /bin/false` in `modprobe.d` does nothing, and USB keyboards work. Masking `ctrl-alt-del.target` also doesn't stop systemd's default burst action: pressing Ctrl+Alt+Del seven times within two seconds forces a reboot (`CtrlAltDelBurstAction=reboot-force`). To stop that, set `CtrlAltDelBurstAction=none` in a `system.conf.d` drop-in. To block HID devices, use a udev rule that deauthorizes them.

## Firmware

According to the BSP's own notes, the firmware loader fails with `-ELOOP` when it reads through the sysext `/usr` overlay. That's why Tegra GPU firmware ships in the rootfs. Put any firmware you add in the rootfs too.

## Recovery

When a device won't boot far enough to reach SSH or the USB gadget, put it in NVIDIA recovery mode (hold force-recovery while you power on) and run `avocado provision <runtime>`. Keep a rootfs-level serial getty in dev builds, so a failed extension merge still leaves you a console.
