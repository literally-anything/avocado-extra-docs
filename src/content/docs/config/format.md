---
title: How avocado.yaml is read
description: The load pipeline for avocado.yaml, including composition, templating and typing, plus the parsing rules the official docs don't state.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/utils/config.rs`: `merge_external_config`, the named-or-single deserializers; `src/utils/interpolation/`; `src/utils/version.rs`; `ext/install.rs`; `ext/build.rs`).
:::

## The load pipeline

Every command that reads `avocado.yaml` (or whatever `-C/--config` points at) runs the same steps, in this order:

1. **Parse** the YAML. The CLI uses `serde_yaml` 0.9, which follows YAML 1.2. See [YAML 1.2 rules](#yaml-12-rules) below.
2. **Compose.** The `avocado.yaml` of every fetched extension (`source: { type: package | git | path }`) is merged into your config:
   - The extension's own `extensions.<name>` block is always merged. It's found by exact name, then by the name with a target suffix stripped, then, if the fetched file defines exactly one extension, that one. It's deep-merged into yours, and **your keys win** on conflicts: the fetched file only fills in keys you didn't set.
   - An `sdk.compile.<section>` comes in when one of the extension's packages refers to it (`compile: <section>`), or when `source.include` matches it.
   - Everything else comes in **only if `source.include` matches it**: `sdk.packages.<pkg>`, `provision_profiles.<profile>`, `rootfs`, `initramfs`. For example, a fetched extension's own `sdk.packages` never reach your SDK unless you include `sdk.packages.*`. Where both files define the same entry, yours wins.
   - `distro`, `default_target`, `supported_targets` and the base SDK settings (`sdk.image`, `sdk.container_args`) always come from **your** file. An extension can never override them.
3. **Template.** Every `{{ ... }}` in every string, **including mapping keys**, is resolved. See [Templating](../templating/).
4. **Type-check** the sections that have a fixed shape: `distro`, `sdk`, `kernel`, `rootfs`, `initramfs`, `permissions`, `runtimes.<name>`, `signing_keys`, `connect`, `repos`.
5. The `extensions` section, and some runtime keys, are **not** type-checked. Each command reads the keys it cares about straight from the YAML when it needs them.

## Unknown keys are silently ignored

Nothing in the CLI rejects, or even warns about, a key it doesn't recognize. This applies at every level. A typo quietly does nothing:

```yaml
runtimes:
  dev-local:
    board: qemuarm64        # ignored: the key is `target_board`
extensions:
  app:
    enable_service:         # ignored: the key is `enable_services`
      - app.service
```

In the first case, `{{ avocado.target.board }}` then falls back to the target name, so a Jetson build of `dev-local` would pull `avocado-bsp-jetson-orin-nano-devkit` rather than `avocado-bsp-qemuarm64`.

The only places that do reject unknown keys:
- The `version: { file, key, format }` block on extensions.
- Mixing the two forms of a named-or-single section (below).

To catch typos, validate with the [JSON Schema](../json-schema/) published by this site. It's stricter than the CLI on purpose.

## Named-or-single sections

`kernel`, `rootfs`, `initramfs` and `permissions` each accept two shapes. The CLI tells them apart by looking at the keys:

```yaml
# Single form: the keys are config fields. The CLI stores it under the name "default".
kernel:
  package: kernel-image
  version: '*'

# Named form: no key is a config field, so every key is an entry name.
kernel:
  yocto-6-6: { package: kernel-image, version: '6.6.*' }
  lts:       { package: kernel-image, version: '>= 6.12' }
```

The rules:
- If **any** top-level key matches a field name, the whole block is treated as the single form.
- A mix of field names and other keys is a **hard error**. This is one of the few typo checks the CLI has.
- `target-<name>:` and `kernel-<spec>:` keys are ignored when counting. They're [overrides](../overrides/), not entry names.
- Runtimes refer to entries by name (`kernel: yocto-6-6`), or define one inline (`kernel: { cmdline_extra: ... }`). A runtime with no reference uses the entry named `default`. If there is no `default` and the map has exactly one entry, that entry is used.

The field names the CLI counts are: `package`, `version`, `compile`, `install`, `image`, `cmdline`, `cmdline_extra` for `kernel`. For `rootfs` and `initramfs`, they're `packages`, `dependencies`, `filesystem`, `overlay`, `image`, `post_install`, `permissions`. For `permissions`, they're `users`, `groups`.

## Aliases

These spellings are accepted and mean the same thing:

| You can write | Means |
|---|---|
| `runtime:` | `runtimes:` |
| `provision:` | `provision_profiles:` |
| `distro.version` | `distro.release` |
| `dependencies:` (in `sdk`, `sdk.compile.<s>`, `rootfs`, `initramfs`) | `packages:` |
| `source: { type: repo }` | `source: { type: package }` |

## Package entries

Every `packages:` map uses the package name as the key. The value can be:

| Value | Meaning |
|---|---|
| `'*'` | Any version. The lock pins whatever was installed first. |
| `'1.2.3'` | That version |
| `{ version: '1.2.3' }` | Same as above |
| `{ compile: <section>, install: <script> }` | Not from the feed. It's built by `sdk.compile.<section>`, then `install` copies it into the extension. Extensions only. **Both keys are required**: in `1.0.0-rc.5`, `ext build` never runs an `install` script that has no `compile`. (At least one official reference uses the `install`-only form.) |
| `{ extensions: <name> }` (optionally with `vsn:` or `config:`) | Legacy extension-to-extension dependency. It's logged and **not installed**. Use `depends_on` instead. |

Any other object, for example `{ ver: '1.0' }`, is **silently skipped**. The package isn't installed, and no error is raised.

Package **keys** are also where `{{ avocado.kernel.version }}` is substituted. See [Kernel modules in extensions](../../build/kernel-modules/).

## YAML 1.2 rules

`serde_yaml` 0.9 follows YAML 1.2. YAML 1.1 habits from Ansible or older tools will bite you:

- **`yes`, `no`, `on`, `off` are strings, not booleans.** `image: { verity: yes }` is rejected: that key requires a real boolean and says so. Most other boolean keys (for example `reload_service_manager`, or `enabled` in a runtime's extension list) just ignore a non-boolean and use their default.
- **Quote your versions.** An extension `version: 1.10` is a float. The CLI converts it through a float to an integer, so it becomes `"1"`. `version: 1.0.0` happens to work because it isn't a valid number. Always write `version: '1.10'`.
- `release: 2024` is fine. That field accepts an integer or a string.

## Paths

- Every script, overlay and file path is relative to the **source directory**. That's `src_dir` if you set it (itself relative to the config file), otherwise the directory containing the config file.
- Inside the SDK container, the source directory is `/opt/src`. Scripts are run as `bash '<relative path>'`, so write paths inside them relative to the source directory, as the generated `compile.sh` examples do. For a fetched extension, the CLI first changes into that extension's tree.
- For fetched extensions, paths in the extension's own `avocado.yaml` are relative to **that extension's** tree, not yours.
- `avocado.yaml` is the default config name, and `-C/--config` changes it. Most commands also look for `avocado.lock` next to the config.

## `cli_requirement`

`cli_requirement: ">=0.41.0"` is a semver requirement, checked on every load. A running CLI that doesn't satisfy it refuses to run.

Pre-releases get special treatment. The CLI first tries its exact version (so `=1.0.0-rc.1` can pin a release candidate), then tries again with the pre-release tag stripped. So `1.0.0-rc.5` **satisfies** `>=1.0.0`, even though strict semver says it shouldn't.
