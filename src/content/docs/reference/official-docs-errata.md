---
title: Official docs errata
description: Places where docs.peridio.com, the official config schema, or comments in Avocado's own source disagree with what the code actually does.
---

:::note[Verified against]
docs.peridio.com as retrieved on 2026-09-24, compared with avocado-cli `1.0.0-rc.5`, avocadoctl `0.12.0` and meta-avocado `scarthgap` at `16e6328`. Source-comment entries rechecked on 2026-09-25.
:::

Each entry quotes or summarizes the documented claim, then says what the code does. These are meant to be reported upstream, and removed from here once they're fixed.

## Configuration page (`/developer-reference/avocado-cli/configuration`)

**Overlay modes.** The docs say merge mode uses `rsync -a`, and opaque mode "fully replaces directory contents".
**Actually:** merge mode runs `cp -a` and opaque mode runs `cp -r`. **Neither removes anything** from the sysroot. Files you delete or rename in an overlay stay in the image. The CLI's own doc comment on `ImageConfig.overlay` repeats the same wrong claims. See [Build state](../../build/stale-state/#overlays-add-and-overwrite-they-never-delete).

**"Overlay config participates in the sysroot stamp, so changes trigger a reinstall."**
**True, but incomplete:** the reinstall is additive, so a changed overlay can still leave old files behind.

**Environment variable table.** It lists 8 variables. The CLI reads about 40; see [Environment variables](../environment-variables/).

## Lockfiles and build stamps page (`/developer-reference/lockfiles-and-build-stamps`)

**Lock location.** The docs say `.avocado/lock.json`.
**Actually:** it's `avocado.lock` in the project root, and it's meant to be committed.

**Stamp layout.** The docs show `.stamps/extension/<name>/{install,build,image}.stamp` and so on.
**Actually:** in a real volume the top-level stamp directories are `ext`, `rootfs`, `initramfs`, `runtime` and `sdk`.

**What a stamp records.** The docs say it's the config section and the package list.
**Actually:** it also records overlay contents (since [#210](https://github.com/avocado-linux/avocado-cli/pull/210)), the kernel pin, script contents, `package_files`, and the digests of dependency steps. More importantly, **it never checks the output**. A wrong image is reused for as long as its inputs are unchanged ([#283](https://github.com/avocado-linux/avocado-cli/issues/283)).

**"Picking the right tool."** The page suggests `--no-stamps` for a build that seems stale. That re-runs steps, but it **doesn't remove stale files**. Only cleaning the sysroot does.

## Config schema (`/developer-reference/avocado-cli/config-schema`)

The published JSON schema is missing keys the CLI reads. Among them:

- **Top level:** `default_runtime`, `repos`, `rootfs`, `initramfs`, `permissions`, `connect`.
- **distro:** `feeds`, `repo.ca`, `repo.tls_verify`.
- **runtimes:** `targets`, `version`, `rootfs`, `initramfs`, `var`, `docker_images`, `post_build`, `container_dev`.
- **runtimes.signing:** `content_key`, `server_key`, `fit_key`, `fit_unsigned`, `fit_key_in_bootloader`.
- **extensions:** `on_merge`, `on_unmerge`, `reload_service_manager`, `sysext_scopes`, `confext_scopes`, `post_build`, `package_files`, `stone_include_paths`, `image`, `subvolumes`, `depends_on`, `class`, `device_tree_overlays`, the RPM metadata keys, `version: { file, key, format }`, and `target-`/`kernel-` overrides.
- **overlay:** `preprocess`.

See the [complete schema](../config-schema/) on this site.

## Comments in Avocado's own source

**Automatic kernel-version suffix.** The module docs in `avocado-cli/src/utils/kernel_version.rs`, and the comments in the published `avocado-bsp-jetson-orin-nano-devkit` `avocado.yaml`, say the CLI automatically adds `-${KERNEL_VERSION}` to `kernel-module-*` package names.
**Actually:** that was removed in May 2026 (commit `1255b08`). Unversioned names now resolve through the packages' own unversioned names plus off-kernel excludes. Explicit `{{ avocado.kernel.version }}` is the supported spelling ([details](../../build/kernel-modules/)).

**`ext_deps.rs` says "no command calls them yet".**
**Actually:** `depends_on` is read by config composition and by the stamp code in `1.0.0-rc.5`. That comment is stale; the feature is only partly wired up.

**The Tegra `device-tree-overlay-deliver` hook** (meta-avocado `scarthgap`, `recipes-avocado/avocado-dtc-overlay-deliver/`) says `initrd-flash.sh` never reads the overlay lists in `flashvars` (`OVERLAY_DTB_FILE`, `BOOTCONTROL_OVERLAYS`, `PLUGIN_MANAGER_OVERLAYS`).
**Actually:** in the `jetson-orin-nx` flash BSP of 2024/edge snapshot 17, `initrd-flash` runs `tegra-flash-helper.sh --sign`, which sources `flashvars` and applies `BOOTCONTROL_OVERLAYS` and `OVERLAY_DTB_FILE` ([details](../../hardware/jetson-carrier-boards/#how-a-carrier-is-layered)).

**avocadoctl: modules load before `daemon-reload`.** `process_post_merge_tasks_for_extensions` in avocadoctl `0.12.0` says it loads modules before the reload "so units like proc-fs-nfsd.mount can start".
**Actually:** that step only reads `AVOCADO_MODPROBE=` lines, and avocado-cli `1.0.0-rc.5` writes `modprobe:` as `AVOCADO_ON_MERGE` instead. The modules load after the reload ([details](../../device/on-merge/#how-on_merge-commands-run)).

**`.avocado/` is "cleared by `avocado clean`".** So says the doc comment on `materialize_preprocessed_overlay` (`utils/overlay_preprocess.rs`).
**Actually:** `commands/clean.rs` removes only the volume and `.avocado-state` ([details](../../build/stale-state/#avocado-clean-leaves-avocado-behind)).

**The legacy extensions symlink.** The comment in `utils/container.rs` says commands not yet passing `AVOCADO_RUNTIME` "transparently resolve to the same content" through it.
**Actually:** it's repointed with `ln -sfn` on every run that sets `AVOCADO_RUNTIME`. With two runtimes on one target, those commands see whichever runtime ran last ([details](../../build/stale-state/#two-extension-sysroot-locations)).

**The Jetson carrier guide's ICAM-540 label.** `meta-avocado-nvidia/docs/adding-a-jetson-carrier.md` shows `CARRIER_LABEL="Advantech ICAM-540 (P3768-0000 + P3767-0001 Orin NX 16GB)"`.
**Actually:** P3767-0001 is the Orin NX **8GB** module; the 16GB is P3767-0000 ([details](../../hardware/jetson-carrier-boards/#one-flash-configuration-per-module-sku)).

## Not documented anywhere official

These aren't errors, just gaps, and each has a page here:

- What the channels mean, and which release, channel and board combinations exist ([Releases and channels](../../build/releases-and-channels/))
- That unknown keys are silently ignored ([How avocado.yaml is read](../../config/format/#unknown-keys-are-silently-ignored))
- That `-r` doesn't feed templating ([Templating](../../config/templating/#avocado-computed-values))
- That `modules-load.d` and `sysctl.d` in extensions don't apply at boot ([Boot and extension merge](../../device/boot-and-merge/))
- That `on_merge` has no shell, and a missing program fails the whole merge ([on_merge](../../device/on-merge/))
- That the empty `/etc/machine-id` makes `?` hostnames change every boot ([Hostname and machine-id](../../device/hostname-and-machine-id/))
- That `rootfs.post_install` replaces all the default steps ([Config schema](../config-schema/#rootfs-and-initramfs))
- That `on_merge` runs before D-Bus at boot, so D-Bus clients such as `networkctl` fail there ([on_merge](../../device/on-merge/#d-bus-isnt-up-at-boot))
- That a mask shipped in a confext doesn't stop units already queued for that boot ([Boot and extension merge](../../device/boot-and-merge/#masks-in-extensions))
- Open bugs and their workarounds ([Known upstream issues](../known-issues/))
