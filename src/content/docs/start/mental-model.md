---
title: Mental model
description: Where each part of an Avocado build runs, where its state lives, and what ends up on the device.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5`, avocadoctl `0.12.0`, 2024/edge on `jetson-orin-nano-devkit`.
:::

Most Avocado gotchas make sense once you know **which of three places** a piece of work happens in. Each one sees different files and different environment variables, and keeps different state.

## Three places code runs

| Where | What runs there | What it sees |
|---|---|---|
| **Your host** | The `avocado` CLI: parses `avocado.yaml`, runs templating, resolves the kernel version, writes `avocado.lock`, decides what's up to date | Your project directory and your shell's environment |
| **The SDK container** (`docker.io/avocadolinux/sdk:<tag>`) | dnf installs, your `compile`/`install`/`post_build` scripts, overlay copies, `mkfs.erofs`, the Tegra flash tooling | Your project mounted at `/opt/src`, and the build volume mounted at `/opt/_avocado` |
| **The device** | `avocadoctl` merging extensions, `on_merge` commands, systemd, your services | Only what's in the images you shipped |

Some consequences:

- `{{ env.X }}` in `avocado.yaml` reads **your host's** environment when the CLI loads the config. Your scripts, which run in the container, see a different set of variables. See [Templating](../../config/templating/) and [Environment variables](../../reference/environment-variables/).
- Overlay files are copied inside the container. Only overlays that opt in with `preprocess:` get template substitution, and that happens on the host first. See [Templating](../../config/templating/#overlay-files).
- On the device, nothing from `avocado.yaml` exists any more. `on_merge`, `enable_services` and `modprobe` survive only as lines in each extension's release file. See [on_merge and the release file](../../device/on-merge/).

## Where state lives

| State | Location | Survives `avocado clean`? |
|---|---|---|
| `avocado.yaml`, overlays, scripts | Your project directory | Yes |
| `avocado.lock` (resolved package versions, feed snapshot, kernel pin) | Your project directory. The official docs still say `.avocado/lock.json`, which is out of date. | Yes. Clear it with `avocado unlock` or `avocado clean --unlock`. |
| `.avocado/` (overlay staging, provision state) | Your project directory | Cleared |
| Sysroots, stamps, built images | The Docker volume `avo-<uuid>`, mounted at `/opt/_avocado` in the SDK container | Removed |
| `.avocado-state` | Your project directory. It records which volume belongs to this project. | Rewritten |

The build volume is laid out per target:

```text
/opt/_avocado/<target>/
├── .stamps/                      # "is this step up to date" records
├── sdk/<host-arch>/              # SDK toolchain and host tools
├── sdk/target-sysroot/           # headers/libs for cross-compiling
├── rootfs/                       # rootfs sysroot (packages + overlay)
├── initramfs/                    # initramfs sysroot
├── includes/<ext>/               # avocado.yaml + stone files of fetched extensions
├── extensions -> runtimes/<r>/extensions   # legacy compatibility symlink
├── runtimes/<runtime>/
│   ├── extensions/<ext>/         # one sysroot per extension, per runtime
│   ├── extensions/<ext>-<ver>.raw
│   └── ...kernel, initramfs, rootfs image, flash inputs
└── output/
    ├── extensions/<ext>-<ver>.raw
    └── runtimes/<runtime>/{os-bundle.aos, stone/}
```

On macOS and Windows, Docker runs inside the `avocado-vm` helper VM, not Docker Desktop. See [Inspecting the build volume](../../build/inspecting-the-volume/) for how to look inside it.

## What ends up on the device

A **runtime** is what you deploy. It's made of:

- **Kernel** plus **initramfs** (a cpio archive).
- **Rootfs**: a read-only EROFS image. Its `/etc` is read-only too, which matters for `machine-id`. See [Hostname patterns and machine-id](../../device/hostname-and-machine-id/).
- **Extensions**: EROFS images merged over the rootfs at boot. A `sysext` overlays `/usr` and `/opt`. A `confext` overlays `/etc`. An extension can be both, and the CLI builds both by default.
- **The var partition**: btrfs and writable. It persists across updates, and it's where extension images and runtime manifests live (`/var/lib/avocado`).

Extensions are merged by `avocadoctl`, **not** by stock `systemd-sysext`, which Avocado disables. That merge happens after early boot services like `systemd-modules-load` and `systemd-sysctl` have already run. See [Boot and extension merge](../../device/boot-and-merge/).

## Three kinds of "up to date"

The CLI keeps three separate kinds of state. None of them checks the others:

1. **The lock** pins *which package versions* to install.
2. **Stamps** record *which inputs* each build step last succeeded with.
3. **Sysroots** hold *the actual files*. Updates are applied on top of what's already there.

A step is skipped when its inputs hash the same as last time. Nothing verifies that a sysroot or image actually contains what those inputs describe. That's the root of most "my change didn't take effect" problems; see [Build state and stale sysroots](../../build/stale-state/).
