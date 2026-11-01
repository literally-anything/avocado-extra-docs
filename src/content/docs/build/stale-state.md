---
title: Build state and stale sysroots
description: Why a change to avocado.yaml or an overlay can silently fail to reach the image, and how to clean and verify builds.
---

:::note[Verified against]
avocado-cli `1.0.0` (`343c137`): `src/commands/rootfs/install.rs` (`build_overlay_script`), `src/commands/ext/build.rs` (`declares_packages`, the overlay and `enable_services` sections), `src/commands/ext/install.rs`, `src/commands/install.rs` (`ext_seed_runtime_map`), `src/commands/ext/image.rs`, `src/commands/clean.rs`, `src/utils/stamps.rs`, `src/utils/container.rs`, `src/utils/overlay_preprocess.rs`. The incidents described come from a real Jetson Orin project built with `1.0.0-rc.5` on 2026-09-24 and 2026-09-25; each one says whether 1.0.0 changes it.
:::

:::danger[Short version]
Removing a **package** from a package list doesn't remove it from the image, and some inputs aren't hashed at all. Before anything you flash or ship, build from `avocado clean`. On `1.0.0-rc.5` and earlier, removing or renaming anything in an overlay or in `enable_services` didn't reach the image either; [1.0.0 fixes that](#overlays-and-enable_services-now-remove-what-you-drop).
:::

## Three kinds of state, none of which check the others

| Layer | What it records | How it goes stale |
|---|---|---|
| `avocado.lock` | Which package versions to install | Can keep entries for packages you've removed, and miss ones you've added ([seen in practice](#the-lock-can-disagree-with-the-build)) |
| Stamps (`/opt/_avocado/<target>/.stamps/`) | A hash of each step's **inputs** from its last success | Never checks the **output**. A bad artifact is reused for as long as the inputs don't change. |
| Sysroots | The actual files | Package installs are **added on top**. Nothing a package installed is removed, except when the kernel pin changes. Since 1.0.0, files an overlay placed are tracked and removed when the overlay drops them. |

## Overlays and `enable_services` now remove what you drop

In 1.0.0, each overlay copy records every file and symlink it placed, NUL-delimited, in a list under the stamps directory:

| Overlay | Recorded in | Pruned by |
|---|---|---|
| Rootfs, initramfs | `$AVOCADO_PREFIX/.stamps/<rootfs\|initramfs>/overlay.files` | `avocado install` |
| Extension (plus its `enable_services` links) | `$AVOCADO_PREFIX/.stamps/ext/<ext>/overlay.files` | `avocado ext build` |

Before the next copy, each recorded path the overlay no longer provides is deleted and printed as `Removed /<path> (no longer in overlay '<dir>')`. Removing the `overlay:` key altogether removes everything it placed. A path that a package owns (`rpm -qf` answers) is kept, with a `Kept /<path>: owned by package …` notice that tells you to clean and reinstall. Directories are never recorded or removed.

Three things to know:

- **The first run after upgrading only records.** Files that were dropped from an overlay while you were on rc.5 are still in the sysroot. Clean each component once ([what to do](#what-to-do)).
- **Rootfs and initramfs overlays are applied by `install`, not `build`.** After editing one, run `avocado install` before `avocado build`.
- **"Opaque" mode still doesn't replace a directory.** Both modes now copy with `tar` (`overlay_copy_command` in `utils/overlay_preprocess.rs`). Opaque differs from merge only in permissions: merge keeps the working tree's mode, opaque applies the umask and a fresh mtime. Neither empties a directory that a package filled. The official docs and some source comments say opaque "fully replaces directory contents"; the code doesn't. See the [errata](../../reference/official-docs-errata/).

The copy also changed in 1.0.0: it sets owner and mode only on paths the overlay **creates**, instead of running `chown -R` over the sysroot, so it no longer strips setuid and setgid bits from package files. An overlay directory that would land on an existing symlink or file is refused.

**Real example, on rc.5.** A project masked `getty.target` with `rootfs/etc/systemd/system/getty.target -> /dev/null`, then renamed that file to `getty-off.target` to unmask it. After rebuilding, the rootfs held **both** files. The mask was still active, and the serial login never came up. With 1.0.0, the next `avocado install` removes the old link, as long as it was recorded by a 1.0.0 run first.

## Removed packages stay installed

dnf installs are additive. Dropping a package from `packages:` stops it being *requested*, but doesn't uninstall it from a sysroot that already has it. The CLI's own source says so ("dnf is additive", `ext/install.rs`). The one case the CLI handles is a **kernel pin change**: then it wipes the extension, rootfs or initramfs sysroot before reinstalling, so modules for the old kernel don't linger.

## Up-to-date checks trust inputs, not outputs

Before each step, the CLI hashes that step's inputs (config section, overlay contents, package list, kernel pin, and the dependency chain) and compares them with the stamp. Nothing checks that the image it produced contains what the inputs describe.

**Real example ([avocado-cli#283](https://github.com/avocado-linux/avocado-cli/issues/283)).** On `1.0.0-rc.5`, three extension images were built from sysroots with none of their packages in them:

| Extension | Files in sysroot | Files in image |
|---|---|---|
| `avocado-bsp-jetson-orin-nano-devkit` | 515 | 2 |
| `avocado-ext-dev` | 533 | 5 |
| `display-tester` | 7 | 4 |

Two later builds reused those images, because their inputs hadn't changed, and one of them was flashed. The empty BSP image had no `nvbootctrl`, which made the device's extension merge fail, so no extension services started. See [Boot and extension merge](../../device/boot-and-merge/#when-the-merge-fails).

A [later comment on #283](https://github.com/avocado-linux/avocado-cli/issues/283#issuecomment-5734534010) from another reporter narrows this: a fetched, manifest-only BSP extension (`source: { type: package, version: '*' }`) was retested on `1.0.0-rc.4` and populated correctly, `nvbootctrl` included. The reproduction that reliably drops packages is an extension with an **inline `packages:` map written directly in the project's `avocado.yaml`**. The `avocado-bsp-jetson-orin-nano-devkit`/`avocado-ext-dev` case above used the fetched form, so either the defect isn't fully scoped yet or it isn't limited to the inline case either.

**What 1.0.0 changes.** #283 is still open, but two guards now catch the reported shape ([#302](https://github.com/avocado-linux/avocado-cli/pull/302)):

- `ext install` decides "up to date" by probing the sysroot's rpm database, not by checking that the directory exists. An empty or half-seeded sysroot is installed again, and a failed first transaction removes the database it seeded.
- `ext build` refuses an extension that declares `packages:` (at the top level or in any `target-`/`kernel-` override) when its sysroot has no package database: `Extension '<ext>' declares packages, but its sysroot for runtime '<rt>' has no package database. Run 'avocado install -r <rt>' first.`

The guard only checks that a database exists. It doesn't compare the image with the sysroot, so keep [verifying before you flash](#verify-before-you-flash).

## Two extension sysroot locations

Extension sysroots live per runtime at `/opt/_avocado/<target>/runtimes/<runtime>/extensions/<ext>`. There's also a legacy path, `/opt/_avocado/<target>/extensions`, used by any step that runs without `AVOCADO_RUNTIME` set.

The CLI turns the legacy path into a symlink to the runtime tree, but only if it's missing, already a symlink, or holds no installed packages. It won't replace a real directory that has packages in it. A step that reads the legacy path while it's still a real directory sees different sysroots from the runtime tree.

**The symlink follows the last runtime that ran a command with `AVOCADO_RUNTIME` set** (`utils/container.rs`, `ln -sfn` on every such run). That's unchanged in 1.0.0, and the CLI's own comment still lists the commands that read the legacy path: build, image, clean, runtime build, fetch and hitl.

What 1.0.0 does change is how a **multi-runtime** `avocado install` fills the per-runtime trees ([#341](https://github.com/avocado-linux/avocado-cli/pull/341)):

- With **one** runtime for the target, extensions install straight into that runtime's tree, as before.
- With **two or more**, each extension installs once into the per-target tree, then is copied into the tree of every runtime that lists it (following `depends_on`, as `build -r` does). So `avocado build -r <rt>` right after a plain `avocado install` finds populated sysroots. On rc.5 it built empty images, and on a 1.0.0 pre-release it failed the package-database check.
- The seeding only happens when an extension is actually installed. A volume built before the upgrade keeps empty per-runtime trees until then; `avocado install -f` seeds them all in one pass.
- A targeted `avocado ext install <ext>` or `avocado install -e <ext>` refreshes only the per-target tree, so it **drops** that extension's per-runtime copies. `build -r <rt>` then asks you to run `avocado install -r <rt>` instead of shipping the stale copy.

Every runtime still gets the same copy of an extension. Runtimes on one target can't have different builds of it, and extension images are still stored and stamped by extension name only (`output/extensions/<name>-<version>.raw`, `Stamp::ext_image(name, target, …)`). Rootfs and initramfs image stamps are per runtime since 1.0.0 ([#336](https://github.com/avocado-linux/avocado-cli/pull/336)).

**Seen in practice on rc.5:** after `avocado install` without `-r`, the `dev` build failed in the SSH extension until `avocado install -r dev` was run again. If runtimes need different extension contents, give each its own target (`target:` on the runtime). Either way, pass `-r` to `install` and `build`.

## The lock can disagree with the build

**Packages written with `{{ avocado.kernel.version }}` are never recorded in `avocado.lock`.** `ext install` substitutes the kernel version into the name it installs, but it queries the installed versions using the **unsubstituted** key (`ext/install.rs`, the `package_names.push(package_name.to_string())` lines, unchanged in 1.0.0). No package is called `kernel-module-foo-{{ avocado.kernel.version }}`, so nothing is found and nothing is written. Those packages are never pinned: every clean install takes whatever the feed has for the pinned kernel.

Seen in practice, twice, on rc.5:

- After an extension's packages were changed from `usb-f-ecm` and `usb-f-rndis` to templated names ending in `usb-f-ncm`, `avocado install` rewrote `avocado.lock` but kept the old hand-written ECM and RNDIS entries, with no NCM entry. The sysroot contained only NCM.
- After `avocado unlock` and a fully clean install, the lock had no packages at all for that extension, although its image had all three `.ko` files.

Don't treat the lock as a record of what's in the image.

Two lock fixes in 1.0.0 make the rest of it more trustworthy:

- **An exact version pin in `avocado.yaml` wins over a stale lock entry.** When the locked version doesn't match an exact pin, the install uses the pin and re-locks, even for an extension that would otherwise be skipped as up to date. `*`, globs and matching pins keep the lock. `avocado unlock -e <ext>` also clears that extension's runtime-scoped entries.
- **Parallel installs no longer revert each other's entries.** A save merges three ways against the lock it loaded, so each install writes only what it changed.

## Inputs the up-to-date check misses

`ext build`'s input hash (`compute_ext_build_input_hash` in `utils/stamps.rs`) folds a fixed list of extension keys plus some file contents. Changing something outside it doesn't rebuild the extension:

- **Compile sources.** For an extension built from an `sdk.compile` section, the hash covers the compile and install **scripts**, plus any `package_files`. It doesn't cover the source files those scripts read. Edit only `main.c` and the build reports "up to date" and ships the old binary. List the source directory in the extension's `package_files` (for example `package_files: [ext/my-tool]`); note that this also replaces the default file list `avocado ext package` bundles.
- **`modprobe:`.** The hash lists a key called `kernel_modules`, which the build no longer reads. It doesn't list `modprobe`, which the build turns into release-file lines. So changing only an extension's `modprobe:` list leaves the old list in the image. (From reading the source, still true in 1.0.0; not reproduced.) Clean the extension after changing it.
- **Runtime-level compile steps.** Runtime `packages:` entries with `compile`/`install` have no `package_files`, so the compile-source trap has no fix there. Keep inputs inside the scripts, or have the script check its inputs' checksums.

## `avocado clean` leaves `.avocado/` behind

`avocado clean` removes the build volume and `.avocado-state`, and nothing in your project folder. In particular it leaves `.avocado/overlay-staging/`, where preprocessed overlays are written with their templates filled in. (A comment in `utils/overlay_preprocess.rs` says `avocado clean` clears it. `commands/clean.rs` doesn't, in 1.0.0 either: [avocado-cli#289](https://github.com/avocado-linux/avocado-cli/issues/289).) Each overlay's staging copy is replaced the next time that overlay is built. Delete `.avocado/` by hand if it may hold secrets.

## What to do

| Situation | Do this |
|---|---|
| Removed a package | `avocado ext clean -r <runtime> <ext>` (or `avocado rootfs clean`, `avocado initramfs clean`), then `avocado install` and `avocado build` |
| Removed or renamed a file in an overlay, or an `enable_services` entry | On 1.0.0, nothing: the next `ext build` (extension) or `install` (rootfs, initramfs) removes it. Check for the `Removed /<path>` line. On rc.5 or earlier, clean the component as above. |
| Just upgraded to 1.0.0 | Clean each component whose overlay or `enable_services` lost entries while you were on rc.5, or run `avocado clean`. The first 1.0.0 run only records. |
| Changed only `modprobe:`, or only a compile source not listed in `package_files` | `avocado ext clean -r <runtime> <ext>`, then install and build |
| About to flash, or producing anything you'll ship | `avocado clean`, then `avocado install` and `avocado build`. Nothing carries over. |
| A step keeps getting skipped | `avocado --no-stamps <cmd>` re-runs it. **This doesn't remove stale packages**, because dnf is still additive. |
| Want newer package versions | `avocado unlock --<scope>`, then `avocado install` |

`avocado clean` deletes the whole build volume. The next build creates a **new** volume with a new name, recorded in `.avocado-state`. Old volume names stop working. Since 1.0.0, `avocado clean -f` succeeds when the recorded volume is already gone, and waits for removed containers to release the volume.

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
