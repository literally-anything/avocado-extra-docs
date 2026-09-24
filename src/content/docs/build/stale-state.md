---
title: Build state and stale sysroots
description: Why a change to avocado.yaml or an overlay can silently fail to reach the image, and how to clean and verify builds.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/commands/rootfs/install.rs`, `src/commands/ext/build.rs`, `src/commands/ext/install.rs`, `src/commands/ext/image.rs`, `src/utils/container.rs`). The incidents described come from a real Jetson Orin project built with this CLI on 2026-09-24.
:::

:::danger[Short version]
Removing or renaming something in an overlay, in `enable_services` or in a package list **does not remove it from the image**. After any removal or rename, clean that component. Before anything you flash or ship, build from `avocado clean`.
:::

## Three kinds of state, none of which check the others

| Layer | What it records | How it goes stale |
|---|---|---|
| `avocado.lock` | Which package versions to install | Can keep entries for packages you've removed, and miss ones you've added ([seen in practice](#the-lock-can-disagree-with-the-build)) |
| Stamps (`/opt/_avocado/<target>/.stamps/`) | A hash of each step's **inputs** from its last success | Never checks the **output**. A bad artifact is reused for as long as the inputs don't change. |
| Sysroots | The actual files | Updates are **added on top**. Nothing is ever removed, except when the kernel pin changes. |

## Overlays add and overwrite; they never delete

Rootfs, initramfs and extension overlays are all applied like this, inside the SDK container:

```sh
cp -a "/opt/src/<overlay>/." "$SYSROOT/"     # mode: merge (the default)
cp -r "/opt/src/<overlay>/." "$SYSROOT/"     # mode: opaque
```

Neither command removes files from the destination. **"Opaque" mode doesn't replace anything either.** The official docs and the CLI's own code comments say it "fully replaces directory contents", and the code doesn't do that.

The stamps *do* notice that the overlay changed; they've hashed overlay contents since August 2026 ([avocado-cli#210](https://github.com/avocado-linux/avocado-cli/pull/210)). So the step re-runs. But it re-runs as another additive copy.

**Real example.** A project masked `getty.target` with `rootfs/etc/systemd/system/getty.target -> /dev/null`, then renamed that file to `getty-off.target` to unmask it. After rebuilding, the rootfs held **both** files. The mask was still active, and the serial login never came up.

## `enable_services` symlinks are never removed

`enable_services: [foo.service]` makes the build create `etc/systemd/system/<target>.wants/foo.service` in the extension. If you remove the service from the list, the symlink stays in the sysroot, so the service stays enabled in every image rebuilt from it.

## Removed packages stay installed

dnf installs are additive. Dropping a package from `packages:` stops it being *requested*, but doesn't uninstall it from a sysroot that already has it. The CLI's own source says so ("dnf is additive"). The one case the CLI handles is a **kernel pin change**: then it wipes the extension, rootfs or initramfs sysroot before reinstalling, so modules for the old kernel don't linger.

## Up-to-date checks trust inputs, not outputs

Before each step, the CLI hashes that step's inputs (config section, overlay contents, package list, kernel pin, and the dependency chain) and compares them with the stamp. Nothing checks that the image it produced contains what the inputs describe.

**Real example ([avocado-cli#283](https://github.com/avocado-linux/avocado-cli/issues/283)).** On `1.0.0-rc.5`, three extension images were built from sysroots with none of their packages in them:

| Extension | Files in sysroot | Files in image |
|---|---|---|
| `avocado-bsp-jetson-orin-nano-devkit` | 515 | 2 |
| `avocado-ext-dev` | 533 | 5 |
| `display-tester` | 7 | 4 |

Two later builds reused those images, because their inputs hadn't changed, and one of them was flashed. The empty BSP image had no `nvbootctrl`, which made the device's extension merge fail, so no extension services started. See [Boot and extension merge](../../device/boot-and-merge/#when-the-merge-fails).

## Two extension sysroot locations

Extension sysroots live per runtime at `/opt/_avocado/<target>/runtimes/<runtime>/extensions/<ext>`. There's also a legacy path, `/opt/_avocado/<target>/extensions`, used by any step that runs without `AVOCADO_RUNTIME` set.

The CLI turns the legacy path into a symlink to the runtime tree, but only if it's missing, already a symlink, or holds no installed packages. It won't replace a real directory that has packages in it. A step that reads the legacy path while it's still a real directory sees different sysroots from the runtime tree. That's a plausible cause of the empty images above, though not a confirmed one.

## The lock can disagree with the build

After an extension's packages were changed from `usb-f-ecm` and `usb-f-rndis` to `usb-f-ncm` (written with `{{ avocado.kernel.version }}`), `avocado install` rewrote `avocado.lock` but kept the old ECM and RNDIS entries, with no NCM entry. The sysroot contained only NCM. Don't treat the lock as a record of what's in the image.

## What to do

| Situation | Do this |
|---|---|
| Removed or renamed a file in an extension overlay, removed an `enable_services` entry, or removed a package | `avocado ext clean -r <runtime> <ext>`, then `avocado install` and `avocado build` |
| Same, in the rootfs or initramfs | `avocado rootfs clean` or `avocado initramfs clean`, then install and build |
| About to flash, or producing anything you'll ship | `avocado clean`, then `avocado install` and `avocado build`. Nothing carries over. |
| A step keeps getting skipped | `avocado --no-stamps <cmd>` re-runs it. **This doesn't fix stale files**, because the re-run is still additive. |
| Want newer package versions | `avocado unlock --<scope>`, then `avocado install` |

`avocado clean` deletes the whole build volume. The next build creates a **new** volume with a new name, recorded in `.avocado-state`. Old volume names stop working.

## Verify before you flash

The `scripts/check-avocado-build.sh` script in this repository compares each built extension image with its sysroot, and flags an image that holds fewer files than the sysroot it came from. That's exactly the failure described above. It runs read-only against the build volume.

```bash
scripts/check-avocado-build.sh ~/path/to/project dev
```

:::caution
The script needs Docker access to the build volume. On macOS it uses the `avocado-vm` Docker socket. It mounts each image read-only in a throwaway `--privileged` container. It's new and has only been tried against one project, so read it before you rely on it.
:::

A few manual checks catch the rest:

- **Stale masks:** `ls -la <rootfs sysroot>/etc/systemd/system/ | grep /dev/null` lists every masked unit. Compare the list against your overlay.
- **Stale enables:** list `etc/systemd/system/*.wants/` inside each extension sysroot, and compare with `enable_services`.
- **Image sizes:** a BSP extension of a few KB is empty. See [Inspecting the build volume](../inspecting-the-volume/).
