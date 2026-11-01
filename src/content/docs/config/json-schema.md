---
title: Editor validation
description: Use this site's JSON Schema to get completion, hover docs and typo detection for avocado.yaml in your editor or CI.
---

:::note[Verified against]
Schema derived from avocado-cli `1.0.0-rc.5`, then updated for the keys `1.0.0` (`343c137`) adds (`boot_config`, and `device_tree_overlays` entries without `src`). Checked against every `avocado.yaml` in [avocado-linux/references](https://github.com/avocado-linux/references) (35 files) as of 2026-09-24. The `avocado config` commands below were read in `1.0.0`'s `src/commands/config_validate.rs`, `src/utils/config_lint.rs` and `configs/default.yaml`.
:::

The CLI ignores keys it doesn't recognize, so a typo does nothing. Before `1.0.0` it did nothing **silently**.

## Start with the CLI's own checks (1.0.0 and later)

avocado-cli `1.0.0` ships its own JSON Schema for `avocado.yaml` and two commands that use it:

```bash
avocado config validate            # ./avocado.yaml; -c <path>, or -c - for stdin
avocado config validate --output json
avocado config schema > avocado-config.json
```

`config validate` doesn't build anything. It reports YAML parse errors, every schema violation and the loader's own checks as **errors**, and keys the CLI ignores as **warnings**. It exits 1 when there are errors, so it fits in CI. `--output json` prints `{ ok, errors, warnings }`, each error with a JSON-pointer `path`. Where a value came from a template, messages show the template instead of what it expanded to, so a `{{ env.TOKEN }}` isn't printed.

Every other command now prints the ignored-key warnings too, on stderr, once per config file, with a "did you mean" where there's a close match. They never fail a command.

`avocado init` (from `configs/default.yaml`) starts new files with a `yaml-language-server` comment pointing at `https://docs.peridio.com/schemas/avocado-config.json`.

## This site's schema

This site also publishes a JSON Schema. It was written to be **deliberately stricter** than the CLI, so your editor can catch more. It hasn't been compared rule by rule with the CLI's own `1.0.0` schema; when the two disagree about what's valid, `avocado config validate` is what the CLI actually checks.

```text
https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json
```

### VS Code, and other editors using yaml-language-server

Add this as the first line of `avocado.yaml`:

```yaml
# yaml-language-server: $schema=https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json
```

Or map it once in `.vscode/settings.json` (needs the Red Hat YAML extension):

```json
{
  "yaml.schemas": {
    "https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json": ["avocado.yaml", "**/avocado.yaml"]
  }
}
```

You get completion, hover descriptions (including warnings like "`on_merge` has no shell"), and red squiggles on unknown keys.

### In CI

```bash
pip install check-jsonschema
check-jsonschema --schemafile https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json avocado.yaml
```

### What it reports that the CLI accepts

| Reported | Why |
|---|---|
| Any unknown key, such as `board:` in a runtime | The CLI ignores it (with a warning since `1.0.0`) |
| Legacy bare target-name overrides (`qemuarm64:` in a runtime) | Deprecated; the CLI warns. Rename to `target-qemuarm64:`. |
| A package entry that's `{ install: x }` without `compile` | The build never runs that script |
| `yes`/`no` where a boolean is expected | YAML 1.2, which the CLI uses, reads them as strings. This is only reported by tools that also parse YAML 1.2, such as yaml-language-server; PyYAML-based tools read them as booleans. |
| `fit_key` together with `fit_unsigned`, `package` together with `compile`, `cmdline` together with `cmdline_extra` | Mutually exclusive in the CLI too |

Across the 35 reference configs, it reported only two kinds of issue: legacy bare target-name keys (in three references) and one `install`-only package.

### Limitations

- Templates aren't expanded. `{{ ... }}` values are checked as strings, and templated keys (like `avocado-bsp-{{ avocado.target.board }}`) as names.
- The contents of `target-`/`kernel-` override blocks aren't checked.
- It's written against one CLI version. A newer CLI may accept keys this schema doesn't know about. When that happens, check the [config schema reference](../../reference/config-schema/) and open an issue.
