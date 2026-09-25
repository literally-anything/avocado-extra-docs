---
title: NVIDIA Jetson Orin
description: Jetson Orin specifics on Avocado 2024, covering UEFI boot settings, A/B slots, USB device mode, display modules, input and firmware.
---

:::note[Verified against]
Target `jetson-orin-nano-devkit`, 2024/edge snapshot 16, kernel `6.6.127-yocto-standard`, L4T 36.5, meta-avocado `scarthgap` (`meta-avocado-nvidia/`), avocado-cli `1.0.0-rc.5` (`commands/sdk/install.rs`, `commands/rootfs/image.rs`). The getty, clock, Bluetooth and USB-C role notes come from a devkit's boot logs and a read-only look at its build volume on 2026-09-25.
:::

## UEFI boot settings (`L4TConfiguration.dtbo`)

Boot order, quick boot and the boot menu timeout come from UEFI variables set in `L4TConfiguration.dtbo` **when you flash**. To change them, put a modified copy in a `carrier-bsp/` directory that one of your extensions lists in `stone_include_paths`. The flash step copies every file from it over the stock BSP file of the same name.

Things that were verified in a real flash bundle:

- The flash applies overlays in this order: `BOOTCONTROL_OVERLAYS="L4TConfiguration.dtbo,L4TConfiguration-RootfsRedundancyLevelABEnable.dtbo"`. Yours is applied **first**, then the stock A/B overlay. The stock A/B overlay only sets `RootfsRedundancyLevel`, so it doesn't undo your changes. If you ever override a variable the A/B overlay also sets, the A/B overlay wins.
- The flash uses the **first** `carrier-bsp/` directory it finds. It searches runtime-level `stone_include_paths` first, then extensions' paths, then the runtime's own build directory. If your carrier-board BSP ships its own `carrier-bsp/`, an override staged in the runtime build directory is **silently dropped**. Merge your changes into the carrier's slot and list the result as a runtime-level path. See [Jetson carrier boards](../jetson-carrier-boards/#only-one-carrier-bsp-is-used).
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
- **The devkit's USB-C port can come up as a host at boot.** NVIDIA's `fusb301` Type-C driver defaults to dual-role with Try.SNK: it tries to be the device for about 600 ms, then becomes the host. A laptop that is itself dual-role (a Mac, for example) may not take the host role in time. Then the Jetson hosts the laptop: `lsusb` on the Jetson shows the Mac (`05ac:1905`) as `usb 2-2`, `/sys/class/udc/3550000.usb/state` stays at `default`, and the laptop never sees the gadget. Replugging renegotiates and usually fixes it. `echo 4 > /sys/bus/i2c/devices/1-0025/fusb301/fmode` forces device-only mode until the next boot. That's the devkit's I2C address; other carriers may not use a `fusb301` at all.

## Display (`nvidia-drm`)

The NVIDIA display modules ship in the BSP extension. `nvidia-drm`'s hardware aliases are all PCI, and the Orin display isn't on PCI, so **nothing loads it automatically**. A `modules-load.d` file in an extension doesn't work either (see [Boot and extension merge](../../device/boot-and-merge/)). Load it from the extension's `modprobe:` key, or with `Wants=modprobe@nvidia_drm.service` in the unit that needs it. `modprobe.d` options, such as `options nvidia-drm modeset=1 fbdev=0`, **do** apply from an extension, because `modprobe` reads them when it runs.

## Input and kiosk builds

`usbhid`, `hid-generic` and `atkbd` are **compiled into** the 6.6 kernel, so `install usbhid /bin/false` in `modprobe.d` does nothing, and USB keyboards work. Masking `ctrl-alt-del.target` also doesn't stop systemd's default burst action: pressing Ctrl+Alt+Del seven times within two seconds forces a reboot (`CtrlAltDelBurstAction=reboot-force`). To stop that, set `CtrlAltDelBurstAction=none` in a `system.conf.d` drop-in. To block HID devices, use a udev rule that deauthorizes them.

## Firmware

According to the BSP's own notes, the firmware loader fails with `-ELOOP` when it reads through the sysext `/usr` overlay. That's why Tegra GPU firmware ships in the rootfs. Put any firmware you add in the rootfs too.

The BSP extension itself doesn't follow that rule for the devkit's Realtek M.2 card: `rtl_bt/rtl8822cu_*.bin` and `rtw88/rtw8822c_fw.bin` are in the BSP extension, not the rootfs. The Bluetooth half enumerates on USB early in boot, before the merge, and the boot log shows:

```text
usb 1-3: Direct firmware load for rtl8822cu_config failed with error -2
usb 1-3: Direct firmware load for rtl8822cu_fw failed with error -2
```

Error -2 is "file not found", which fits a load attempted before the extension is merged. Whether the BSP's `udevadm trigger` on merge recovers it hasn't been checked; `hciconfig -a` or `btmgmt info` after boot would tell.

## Getty units from presets

The rootfs image build applies systemd presets with Avocado's offline `systemctl` stand-in (created by `avocado sdk install`), not the real one. The stand-in links template units under their bare name and ignores `DefaultInstance=`. systemd's stock `enable getty@.service` preset therefore produces `getty.target.wants/getty@.service`, where real `systemctl` makes `getty@tty1.service`. At boot, systemd fills in an instance itself and starts `getty@getty.service`, which fails on `/dev/getty` and restarts until it hits its start limit:

```text
getty.target: Wants dependency dropin /etc/systemd/system/getty.target.wants/getty@.service target /usr/lib/systemd/system/getty@.service has different name
```

The link carries the image's `SOURCE_DATE_EPOCH` timestamp (`Jan 1 00:00`) and lives in `rootfs-work`, which only exists during the image build, so it's not in the rootfs sysroot you'd normally inspect. Any template unit with a preset and `DefaultInstance=` is affected. To avoid it, mask `getty@.service` (or all of `getty.target`) in the rootfs overlay. Don't delete the link on the device: `/etc` is an overlay, and the next flash brings it back.

## Clock

The devkit's RTC driver, `nvvrs-pseq-rtc`, is a module in the BSP extension, so it loads after the merge. When it registers, the kernel sets the system clock from it. On a board whose RTC doesn't keep time across power-off, that steps the clock **back** to 1970 after systemd has already moved it forward:

```text
nvvrs-pseq-rtc nvvrs-pseq-rtc: setting system clock to 1970-01-01T00:25:31 UTC
systemd-journald[326]: Time jumped backwards, rotating.
```

Log timestamps, TLS certificate checks and anything that compares times suffer. Fix the time source (NTP on the local network, GPS, or a battery on the RTC). A device that's offline most of the time also wants `FallbackNTP=` and `FallbackDNS=` cleared, or timesyncd and resolved keep trying Google's and Cloudflare's servers.

## Recovery

When a device won't boot far enough to reach SSH or the USB gadget, put it in NVIDIA recovery mode (hold force-recovery while you power on) and run `avocado provision <runtime>`. Keep a rootfs-level serial getty in dev builds, so a failed extension merge still leaves you a console.
