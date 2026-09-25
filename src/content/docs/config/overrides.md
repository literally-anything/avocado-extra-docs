---
title: Per-target and per-kernel overrides
description: How target-<name> and kernel-<spec> sub-keys are applied, merged and silently dropped.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`Config::resolve_overrides_in_value`, `resolve_image_section`, `merge_values`, `commands/ext/mod.rs` `resolve_remote_ext_config`, `src/utils/kernel_version.rs`).
:::

Any mapping that the CLI resolves overrides on can carry sub-keys that apply only for one target or one kernel:

```yaml
extensions:
  avocado-bsp-jetson-orin-nano-devkit:
    packages:
      kernel-module-nvgpu: '*'
    kernel-6.6.*:                  # only when the resolved kernel matches 6.6.*
      packages:
        kernel-module-rtw88-8822ce: '*'
    target-jetson-orin-nx:         # only when building for jetson-orin-nx
      packages:
        nvidia-some-nx-tool: '*'
```

## The three forms

| Key | Applied when |
|---|---|
| `target-<name>:` | `<name>` equals the current target, exactly |
| `kernel-<spec>:` | The resolved kernel version matches `<spec>` |
| `<name>:` (a bare target name, legacy) | `<name>` equals the current target. Deprecated, with a warning. |

**Keys that don't match are removed silently.** A typo like `target-jetson-orin-nx2:` never applies and never warns. Neither does a `kernel-` spec that never matches. (A `kernel-` spec that can't be parsed at all does warn.) A bare key naming *another* supported target is removed too.

`<spec>` accepts three forms:
- A dot-prefix glob: `6.6.*`
- Comparison clauses joined by commas, all of which must hold: `>= 6.6`, `>= 5.15, < 5.16`
- An exact version: `5.15.185-l4t-r36.5-1033.33`

Versions compare the way RPM compares them.

## Merge rules

Matching blocks are merged over the base in this order, with later ones winning:

1. The base keys
2. A matching legacy bare-target block
3. A matching `target-<name>:` block
4. Every matching `kernel-<spec>:` block, in the order they appear in the file

The merge is **deep for mappings** and **replaces everything else**:

```yaml
runtimes:
  dev:
    extensions: [base, app]
    target-qemuarm64:
      extensions: [base]          # REPLACES the list, it doesn't append.
                                  # On qemuarm64, dev has only [base].
```

Matched blocks are processed recursively, so you can nest a `kernel-6.6.*:` inside a `target-foo:`, or the other way round.

## Where overrides are honored

| Section | `target-` | `kernel-` |
|---|---|---|
| `extensions.<name>` at install time (what gets installed) | Yes | Yes |
| `extensions.<name>` at `ext build` / `ext image` (overlay, `on_merge`, `enable_services`, image settings, ...) | Yes | **No, and silently.** `kernel-` blocks are stripped because the kernel isn't resolved at that step (`commands/ext/mod.rs`, `get_merged_ext_config`). Only put `packages` inside a `kernel-` block. |
| `runtimes.<name>` | Yes | No |
| `rootfs`, `initramfs`, `kernel` (at image build time) | Yes | **No.** The CLI warns and ignores them, because the kernel version isn't known yet at that step. |

## Gotchas

- **Never start a key with `kernel-` or `target-` in a mapping that gets override resolution,** unless you mean it as an override. The keys *inside* a `packages:` map are safe: that map isn't scanned itself, only the mapping that contains it.
- Stale docs and comments (including the Jetson BSP's own `avocado.yaml`) say the CLI **automatically adds the kernel-version suffix** to `kernel-module-*` package names. That was removed in May 2026. See [Kernel modules in extensions](../../build/kernel-modules/).
