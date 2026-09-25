# Contributing

## The one rule: verify, and say what you verified against

This site is only useful if it's right about what the code does. So:

1. **Check claims against source or real output.** Use the pinned versions: [avocado-cli](https://github.com/avocado-linux/avocado-cli), [avocadoctl](https://github.com/avocado-linux/avocadoctl) and [meta-avocado](https://github.com/avocado-linux/meta-avocado), or a real build volume or device. Doc comments and the official docs don't count as evidence; they're often out of date.
2. **Record it** in the page's `:::note[Verified against]` block: the version, and the files or functions checked.
3. **Mark what you couldn't verify,** for example "not yet confirmed on a device".
4. **If code and docs disagree,** document the code and add an entry to [the errata page](src/content/docs/reference/official-docs-errata.md).

When the CLI moves to a new version, re-verify the pages that depend on it, and update their notes (and the table on the home page).

## Style

- Plain Markdown and Starlight asides; no MDX.
- Relative links between pages, ending in `/`.
- Lead with what the reader needs to do. Put the explanation second.
- One topic per page. Add the page to the sidebar in `astro.config.mjs`.
- Run `npm run check` before opening a PR.

## Pages we want

Roughly in order of how much they'd help.

**Operating a project**
- [ ] **Command-by-command state matrix:** what each of `install`, `build`, `clean`, `unlock`, `update`, `prune`, `fetch`, `save` and `load` reads, writes and deletes (lock, stamps, sysroots, volume)
- [ ] **Production runtime checklist:** what the dev extensions quietly provide (root SSH, `/var` growth, empty root password) and what a production runtime must replace, including a recovery path
- [ ] **Reproducible builds:** pinning the SDK by digest, the lock and snapshot pins, `source_date_epoch`, and what still varies (squashfs ownership, generated UUIDs)
- [ ] **Debugging a device:** `avocadoctl` status commands, the varlink API, where logs go, and `systemd-analyze` against the merge timing
- [ ] **CLI release notes that change behaviour:** a running log (kernel auto-suffix removal, overlay hashing in #210, the stamp fixes in #272 and #279, ...)

**Extensions**
- [ ] **Extension authoring, end to end:** local, then `path`, then `git`, then a packaged extension (`avocado ext package`), plus `version: { file }` and `package_files`
- [ ] **How fetched extensions are composed:** exactly which sections merge, `include:` patterns, precedence, and overriding a fetched extension's keys locally
- [ ] **`depends_on` and `class`:** what's wired up in which version, and merge-priority order

**Platform and boot**
- [ ] **Stone and provisioning internals:** profiles, `state_file`, the stone manifest, how `carrier-bsp/` and `stone_include_paths` are searched
- [x] **Custom carrier boards:** a practical guide to `meta-avocado-nvidia/docs/adding-a-jetson-carrier.md` for Orin NX and Nano carriers (device tree, pinmux, USB device port, boot media)
- [ ] **Kernel customization:** compile mode, and how `cmdline`/`cmdline_extra` reach each platform's boot hook
- [ ] **Device tree overlays** in practice, per platform

**Storage, security and updates**
- [ ] **The var partition:** subvolumes, `var_files`, `docker_images` pre-loading, dev-only `/var` growth, encryption and recovery keys
- [ ] **Signing and trust levels:** Level 1 vs Level 2, the key registry, PKCS#11 and YubiKey, FIT signing, and verity
- [ ] **How updates work:** `os-bundle.aos`, the TUF repo, runtime manifests, A/B and rollback per platform
- [ ] **Permissions recipes:** generating password hashes (`openssl passwd -6`), system users, `sysusers.d` in extensions vs top-level `permissions`

**Feeds and hosts**
- [ ] **Package feeds:** private (`org`), local (`path`) and third-party feeds, priorities, `$releasever`/`$target`, GPG
- [ ] **avocado-vm on macOS and Windows:** config, workspace sharing, hibernation, reset, USB passthrough for provisioning
- [ ] **Remote builds with `--runs-on`** and NFS

**Reference**
- [ ] **Known upstream issues,** each with its workaround (avocado-cli #280, #283, and the overlay, lock and on_merge reports)
- [ ] **Glossary:** runtime, extension, sysext, confext, stone, BSP, snapshot, releasever, ...
- [ ] **More hardware notes:** Raspberry Pi, i.MX 8M/93, QEMU
