---
title: Jetson carrier boards
description: Running Avocado on a third-party Jetson carrier. Covers the carrier-bsp slot, module SKUs, rebuilding the kernel DTB, board variants, and what to report upstream.
---

:::note[Verified against]
Target `jetson-orin-nx`, 2024/edge snapshot 17 (`avocado-img-bootfiles` r0.14, kernel `6.6.127-yocto-standard`, L4T 36.5), meta-avocado `scarthgap` at `16e6328` and `wrynose` at `1bc1f99` (`meta-avocado-nvidia/`), vendor-meta-tegra `master`, avocado-cli `1.0.0-rc.5`. Checked in `stone-provision-tegraflash.sh`, `tegra-flash-helper.sh` and `initrd-flash` as shipped in the flash BSP, `avocado-build-jetson-orin-nx`, and the CLI's `utils/config.rs` (`get_stone_include_paths_for_runtime`), `commands/runtime/build.rs`, `utils/interpolation/avocado.rs` and `utils/ext_fetch.rs`. Built end to end for an ARK Just A Jetson (Orin NX 16GB): the build and the flash bundle are checked, but the board hasn't been flashed yet.
:::

Worked example: [bsp-ark-jaj](https://github.com/literally-anything/bsp-ark-jaj), board support for the ARK Electronics Just A Jetson with an Orin NX 16GB or 8GB.

## How a carrier is layered

Avocado splits Jetson support into a **module target** (for example `jetson-orin-nx`) and a **carrier extension** (Avocado's own guide: `meta-avocado-nvidia/docs/adding-a-jetson-carrier.md`):

- The target's flash BSP (`avocado-img-bootfiles`) ships every SKU's DTBs, BCT files and SDRAM files. It is built for **one** default module and carrier. `jetson-orin-nx` defaults to the Orin NX 16GB (P3767-0000) on NVIDIA's P3768 devkit carrier, in Super mode.
- A carrier extension lists a directory in `stone_include_paths` that contains `carrier-bsp/`. At provision time, `stone-provision-tegraflash.sh` copies every file in `carrier-bsp/` over the flash directory, then applies `carrier.env`:
  - `CARRIER_FV_<NAME>="value"` rewrites `<NAME>=` in `flashvars`.
  - `CARRIER_ENV_<NAME>="value"` rewrites `<NAME>=` in `.env.initrd-flash`.
  - A key that isn't already in the target file prints a `WARNING` and is **skipped**, not added.
  - `CARRIER_LABEL` is required in practice. The script reads it with `grep` under `set -euo pipefail`, so a `carrier.env` without one makes provisioning exit 1 with no message.
- `carrier.env` is read line by line with `grep`. It isn't sourced as shell, so it has no conditions, variables or includes.
- To use your own kernel DTB, ship it in `carrier-bsp/` and set `CARRIER_ENV_DTBFILE`. `tegra-flash-helper.sh` makes the `kernel_<dtb>` copy itself.

The flash does use the overlay lists in `flashvars`. `initrd-flash` runs `tegra-flash-helper.sh --sign`, which sources the patched `flashvars` and applies `BOOTCONTROL_OVERLAYS` and `OVERLAY_DTB_FILE`. So `CARRIER_FV_BOOTCONTROL_OVERLAYS="<stock list>,my-uefi.dtbo"` is a working way to layer UEFI settings. The last overlay wins.

## Only one `carrier-bsp/` is used

`stone` takes the **whole** `carrier-bsp/` directory from the first include path that has one; files are not merged across paths. The search order (`avocado-build-<target>` and `get_stone_include_paths_for_runtime`) is:

1. `/opt/_avocado/<target>/runtimes/<rt>/rekeyed`, which is recreated empty on every build
2. **Runtime-level** `stone_include_paths`, in order
3. Each extension's `stone_include_paths`, in the order the runtime lists the extensions
4. The runtime's own build directory
5. The SDK's stone directory, which has an empty `carrier-bsp/` stub

So a carrier BSP's slot shadows anything a project stages in the runtime build directory, with no warning. To add project flash settings on top of a carrier, **merge** instead:

- Copy the carrier's `carrier-bsp/` into a directory of your own.
- Add your files, and append your lines to its `carrier.env`.
- List that directory in the **runtime-level** `stone_include_paths`. An absolute path such as `/opt/_avocado/{{ avocado.target }}/runtimes/<rt>/stone-overrides` is passed through unchanged.

A runtime-level compile/install step can do this. Its install script gets only `AVOCADO_RUNTIME`, `AVOCADO_RUNTIME_BUILD_DIR` and `AVOCADO_BUILD_DIR`. It doesn't get the board, the stone include paths or the runtime's extension list, so the script has to be told which carrier to merge. The worked example uses one symlink per board, `install-{{ avocado.target.board }}.sh`.

Check the result in `output/runtimes/<rt>/stone/carrier-bsp/`. The provision log's `Carrier:` line prints `CARRIER_LABEL`.

## The Orin NX BSP extension has fewer drivers than the Nano's

`avocado-bsp-jetson-orin-nx` (2024/edge snapshot 17) lists noticeably fewer modules than `avocado-bsp-jetson-orin-nano-devkit`, even though both boards use the same devkit carrier. Missing from the NX list, among others:

- **CAN:** `kernel-module-mttcan`, `kernel-module-can-dev`
- **Wi-Fi and Bluetooth stack:** `kernel-module-cfg80211`, `kernel-module-mac80211`, `kernel-module-rtk-btusb`, `kernel-module-bnep`
- **CSI camera capture:** `kernel-module-nvhost-vi5`, `-nvhost-nvcsi`, `-nvhost-isp5`, `-nvhost-capture`, `-capture-ivc`
- **Netfilter:** `kernel-module-ip-tables`, `-iptable-filter`, `-iptable-nat`, `-nf-nat`
- `kernel-module-nvpps`, `kernel-module-fuse`

The NX list comments that it's the "same set used by avocado-bsp-icam-540", which suggests it was cut down for that box. A carrier extension that replaces the BSP has to add these back. The worked example adds `mttcan` for the JAJ's CAN port.

## One flash configuration per module SKU

A target's flash settings fit exactly one module SKU, and nothing detects the module at flash time. Avocado's carrier guide lists "provision-time SOM-SKU detection" as future work. NVIDIA's own `l4t_initrd_flash` reads the module EEPROM and picks the SKU's files, which is why vendor images (ARK's, for example) cover every module with one package.

So a carrier needs **one extension per module**, even when its own changes are identical. For an Orin NX 8GB (P3767-0001) on `jetson-orin-nx`, set these alongside the carrier's own settings. The values are from vendor-meta-tegra's `p3768-0000-p3767-0001.conf`:

```sh
CARRIER_ENV_DTBFILE="<your DTB built from tegra234-p3768-0000+p3767-0001-nv-super.dtb>"
CARRIER_FV_BPFDTB_FILE="tegra234-bpmp-3767-0001-3768-super.dtb"
CARRIER_FV_CHIP_SKU="00:00:00:D4"
CARRIER_FV_WB0SDRAM_BCT="tegra234-p3767-0001-wb0sdram-l4t.dts"
CARRIER_ENV_EMMC_BCTS="tegra234-p3767-0001-sdram-l4t.dts"
CARRIER_FV_CHECK_BOARDID="3767"
CARRIER_FV_CHECK_BOARDSKU="0001"
```

meta-tegra doesn't change `BPF_FILE` for this SKU (it stays `bpmp_t234-TE980M-A1_prod.bin`). Avocado's `avocado-bsp-icam-540`, also an 8GB NX, uses `TE950M` and a `3509` BPMP DTB instead. Which is right for which module revision is not confirmed here.

Always set `CARRIER_FV_CHECK_BOARDSKU`. With it, flashing the wrong variant fails the tegraflash SKU check instead of flashing the wrong SDRAM settings.

### The nvpmodel table is fixed too

`tegra-nvpmodel-base` installs one plain `/etc/nvpmodel.conf`, chosen for the target's default SKU; on `jetson-orin-nx` that's `nvpmodel_p3767_0000_super.conf`. On an 8GB module its `MAXN_SUPER` mode onlines CPU cores 6 and 7, which that module doesn't have.

L4T's `nvpower.sh`, which the image ships, can pick the table from `/proc/device-tree/compatible`. It only does that when `/etc/nvpmodel.conf` is a symlink and the per-SKU tables are installed, and Avocado's packaging does neither. A carrier extension can ship the right table as a confext `/etc/nvpmodel.conf`.

NVIDIA's license forbids redistributing the file, so fetch it at build time. The tables are in `nvidia-l4t-nvpmodel_36.5.0-20260115194252_arm64.deb` from `repo.download.nvidia.com/jetson/t234`, and that package's `0000_super` table is byte-identical to Avocado's.

On an Orin Nano devkit (2024/edge snapshot 16), `nvpmodel.service` and `nvpower.service` ship **disabled**, so no power mode is applied at boot unless you enable them.

## Changing the kernel DTB

Many carrier changes can't be written as a device-tree overlay:

- An overlay can't remove a property. `/delete-property/` only works in a full DTS.
- An overlay can only reference base nodes that have a label in `__symbols__`. For example, repointing `usb@3550000`'s `phys` at the unlabelled `usb3-0` lane needs a path reference, which only a full DTS allows.

Avocado ships compiled DTBs, not NVIDIA's device-tree sources. So the practical route is to rebuild the DTB:

1. Decompile the stock DTB.
2. Add your fragment.
3. Recompile with `dtc -@`.
4. Apply any real overlays with `fdtoverlay`.

That has two catches:

- **Labels:** dtc 1.8 turns `__symbols__` back into labels when decompiling, and dtc 1.7.0 (Ubuntu 24.04) doesn't. For the same result everywhere, drop the old `__symbols__` node and re-add every label explicitly (`label: &{/path} {};`) before recompiling.
- **Macros:** fragments that use binding macros (`GIC_SPI`, `TEGRA234_CLK_*`, `TEGRA234_MAIN_GPIO`) need a C preprocessor and the Linux `include/dt-bindings` headers. Neither is in the flash BSP.

A fetched extension's `stone/` directory is copied as-is and has no build step, so a carrier repo has to commit the generated DTB. It's worth having CI regenerate it and compare.

### Extension `device_tree_overlays` on Jetson: not usable yet

avocado-cli `1.0.0-rc.5` compiles `extensions.<ext>.device_tree_overlays` and runs a per-BSP delivery hook, `/usr/libexec/avocado/device-tree-overlay-deliver`. meta-avocado `scarthgap` has a Tegra hook (`avocado-dtc-overlay-deliver`) that merges the overlays into the base DTB.

As of 2026-09-25 that package isn't in any published Jetson feed (2024/edge, 2024/next or 2026/next), and the `wrynose` layer has no such recipe.

From reading the hook (not tested): it picks the base DTB from the flash BSP's own `.env.initrd-flash` `DTBFILE`. A carrier that sets `CARRIER_ENV_DTBFILE` at provision time would flash a different DTB from the one the overlays were merged into.

## Board variants

To support several boards from one runtime, name each board's BSP extension `avocado-bsp-<board>` and list `avocado-bsp-{{ avocado.target.board }}` in the runtime. Then build with the target and board variant:

```sh
avocado build -r dev --target jetson-orin-nx --target-board ark-jaj-nx16
```

- `install`, `build` and `provision` take `--target-board`, and `AVOCADO_TARGET_BOARD` works everywhere.
- A runtime can cover several module targets with `targets: [...]`.
- Declare each board's extension under its own key. `source` is read from the raw extension block, so a `target-` override can't switch one templated key between a package and a git source.
- `sdk install` only fetches the remote extensions that the runtimes in scope use.
- A runtime's `target_board` is read without resolving `target-<name>:` overrides, and `default_target_board` is global. So you can't make a board the default for only one target; pass `--target-board`.
- Pin git-sourced BSPs to a **tag**. With a commit hash, `git clone --branch` fails, the clone falls back to the default branch, and the later `git checkout <hash>` failure is ignored (`ext_fetch.rs`), so you silently build the branch tip. A **mistyped tag** takes the same path. The lock doesn't record the commit either, so nothing shows it afterwards. (`sparse_checkout` uses `git fetch origin <ref>` instead, which can fetch a commit.)

## 2026 (wrynose)

As of 2026-09-25, `jetson-orin-nx` is only published on `2026/next`, and `jetson-orin-nano-devkit` isn't published for 2026 at all.

The 2026 NX uses kernel 6.18 by default, or L4T R39.2 with kernel 6.8. The carrier mechanism (`carrier-bsp/`, `carrier.env` and the carrier guide) is unchanged. Carrier sources written for L4T R36 may need porting.

## Worth reporting upstream

Full write-ups for these, and for the non-Jetson bugs, are collected on [Known upstream issues](../../reference/known-issues/). None of these had a matching issue in `avocado-linux/*` on 2026-09-25:

- **meta-avocado: pick the module SKU at flash time.** Read the EEPROM and select that SKU's files (or let `carrier.env` key values by SKU). Then one carrier extension covers every module. Failing that, publish the per-SKU values as includable fragments.
- **meta-avocado: `nvpmodel.conf` is fixed to one SKU.** Ship all the per-SKU tables and keep `/etc/nvpmodel.conf` a symlink, so `nvpower.sh` picks the right one at boot.
- **meta-avocado: publish the Tegra overlay hook.** Have it merge into the carrier's DTB when a carrier sets one. Also allow full DTS fragments for changes overlays can't express.
- **meta-avocado / stone: layer `carrier-bsp/` directories** in search order, with appendable `carrier.env` fragments, instead of taking the first.
- **avocado-cli:** export `AVOCADO_TARGET_BOARD` and the stone include paths to runtime install scripts. Resolve `target-` overrides for a runtime's `target_board`. Fetch git sources by commit and record the commit in the lock.
