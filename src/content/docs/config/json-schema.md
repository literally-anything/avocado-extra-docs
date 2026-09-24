---
title: Editor validation
description: Use this site's JSON Schema to get completion, hover docs and typo detection for avocado.yaml in your editor or CI.
---

:::note[Verified against]
Schema derived from avocado-cli `1.0.0-rc.5`. Checked against every `avocado.yaml` in [avocado-linux/references](https://github.com/avocado-linux/references) (35 files) as of 2026-09-24.
:::

The CLI ignores keys it doesn't recognize, so typos do nothing, silently. This site publishes a JSON Schema that is **deliberately stricter**, so your editor can catch them:

```text
https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json
```

## VS Code, and other editors using yaml-language-server

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

## In CI

```bash
pip install check-jsonschema
check-jsonschema --schemafile https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json avocado.yaml
```

## What it reports that the CLI accepts

| Reported | Why |
|---|---|
| Any unknown key, such as `board:` in a runtime | The CLI ignores it silently |
| Legacy bare target-name overrides (`qemuarm64:` in a runtime) | Deprecated; the CLI warns. Rename to `target-qemuarm64:`. |
| A package entry that's `{ install: x }` without `compile` | The build never runs that script |
| `yes`/`no` where a boolean is expected | YAML 1.2, which the CLI uses, reads them as strings. This is only reported by tools that also parse YAML 1.2, such as yaml-language-server; PyYAML-based tools read them as booleans. |
| `fit_key` together with `fit_unsigned`, `package` together with `compile`, `cmdline` together with `cmdline_extra` | Mutually exclusive in the CLI too |

Across the 35 reference configs, it reported only two kinds of issue: legacy bare target-name keys (in three references) and one `install`-only package.

## Limitations

- Templates aren't expanded. `{{ ... }}` values are checked as strings, and templated keys (like `avocado-bsp-{{ avocado.target.board }}`) as names.
- The contents of `target-`/`kernel-` override blocks aren't checked.
- It's written against one CLI version. A newer CLI may accept keys this schema doesn't know about. When that happens, check the [config schema reference](../../reference/config-schema/) and open an issue.
