---
title: Templating
description: Exactly how {{ }} templates work in avocado.yaml, which files are templated, every available value, and the failure modes of each.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/utils/interpolation/`, `src/utils/overlay_preprocess.rs`, `src/utils/kernel_version.rs`).
:::

## Syntax

```yaml
sdk:
  image: "docker.io/avocadolinux/sdk:{{ config.distro.release }}"
extensions:
  avocado-bsp-{{ avocado.target.board }}:
    source: { type: package, version: '*' }
```

- A template is `{{ <context>.<path> }}`. Spaces inside the braces are optional.
- The CLI matches templates with the regex `\{\{\s*([^}]+)\s*\}\}`, so a template **can't contain `}`**, and there's no escape syntax for a literal `{{`.
- The path is split on `.`, so **a key that itself contains a dot can't be referenced**.
- There are three contexts: `env`, `config` and `avocado`. Any other context, such as `{{ foo.bar }}`, is a hard error in `avocado.yaml`. In overlay files it's left untouched (see [below](#overlay-files)).
- Templates can produce templates. The CLI makes repeated passes until nothing changes, up to 100. A cycle like `a: '{{ config.b }}'` / `b: '{{ config.a }}'` is detected and is a hard error.
- Only **strings** are templated. Numbers, booleans and nulls are left alone. Mapping **keys** are templated too, which is how `avocado-bsp-{{ avocado.target.board }}:` works.

## Where templates are expanded

| Place | Templated? | Notes |
|---|---|---|
| Any string value or mapping key in `avocado.yaml` | **Yes**, when the CLI loads the config on your host | Includes `extensions`, `runtimes`, `sdk`, `on_merge` strings and so on |
| The `avocado.yaml` of a fetched extension | **Yes**, after composition, with **your** `avocado` context | `avocado.distro.*` always comes from your file, never from the extension's |
| Package **keys** (`packages:` maps) | Yes, plus `{{ avocado.kernel.version }}` | That one value is only substituted in package keys, after kernel resolution. See [below](#avocadokernelversion). |
| Overlay files | **Only if you opt in** with `preprocess:` | [See below](#overlay-files) |
| Your scripts (`compile`, `install`, `post_build`, `post_install`, `clean`) | **No** | Use [environment variables](../../reference/environment-variables/#exported-to-your-scripts) instead |
| Files under a `stone_include_paths` directory | No | They're copied as-is |
| Anything on the device | No | Templates were resolved at build time. The device only sees the results. |

:::caution
Templates in `on_merge`, `enable_services` and other extension strings are resolved **on your build host**, and the result is baked into the image. `on_merge: ['my-tool --env {{ env.STAGE }}']` bakes in whatever `STAGE` was on the machine that ran the build.
:::

## `env.*`: your host's environment

```yaml
repos:
  private:
    url: https://feed.example.com/$releasever/target/$target
    username: '{{ env.FEED_USER }}'
    password: '{{ env.FEED_TOKEN }}'
```

- It reads the environment of the process running `avocado`, **on your host**. Your scripts, which run in the SDK container, see a different environment.
- **A variable that isn't set becomes an empty string, with only a warning.** It isn't an error. This is dangerous for anything security-related. `password: '{{ env.ROOT_PW_HASH }}'` under `permissions` gives root **no password at all** if the variable isn't set in CI.
- Everything after `env.` is the variable name, dots included (`{{ env.A.B }}` looks up `A.B`).

## `config.*`: other values in the config

```yaml
distro:
  release: 2024
sdk:
  image: "docker.io/avocadolinux/sdk:{{ config.distro.release }}"
```

- It looks up a dot path in the **composed** config, meaning your file with fetched extensions merged in.
- **A path that doesn't exist is a hard error**, and the message names the template and where it appeared.
- `null` becomes an empty string. Numbers and booleans become their text. A mapping or list becomes its YAML text, which is rarely what you want.

## `avocado.*`: computed values

**An unknown `avocado.*` path is not an error. The template is left in place, braces and all.** A typo like `{{ avocado.distro.relase }}` survives into the final string, and you'll usually find out much later, for example as an invalid Docker image tag.

| Template | Value | Resolution order (first match wins) |
|---|---|---|
| `avocado.target` | The target | `--target` flag → `AVOCADO_TARGET` → `default_target` |
| `avocado.target.board` | The board variant | `--target-board` flag → `AVOCADO_TARGET_BOARD` → the resolved runtime's `target_board` → `default_target_board` → falls back to `avocado.target` |
| `avocado.runtime` | The runtime name | `AVOCADO_RUNTIME` → `default_runtime` → the only runtime, if exactly one is defined |
| `avocado.distro.release` | Feed year, e.g. `2024` | Your file's `distro.release` (or `distro.version`) |
| `avocado.distro.version` | Same as above | Kept for backward compatibility |
| `avocado.distro.channel` | e.g. `edge` | Your file's `distro.channel` |
| `avocado.kernel.version` | e.g. `6.6.127-yocto-standard` | The resolved kernel pin, and **only in package keys**. See below. |
| `avocado.extensions.<name>.<field>` | A scalar field from the merged `extensions` section | Left in place if the field is missing, or if it's a mapping or list |

:::caution[`-r/--runtime` doesn't feed templating]
`avocado.runtime`, and the runtime-level `target_board` used for `avocado.target.board`, are resolved from `AVOCADO_RUNTIME`, then `default_runtime`, then the sole runtime. There's no path from the `-r` flag into this resolver. With `default_runtime: dev`, running `avocado build -r dev-local` still templates with `dev`'s `target_board`. If a template depends on the runtime, set `AVOCADO_RUNTIME` as well as passing `-r`.
:::

## `avocado.kernel.version`

This value isn't known when the config is loaded. The CLI first has to choose a kernel, using the lock or a `kernel.version` constraint. So:

- During normal templating, `{{ avocado.kernel.version }}` has no value and is left as literal text.
- After the kernel is resolved, the CLI substitutes it into **package keys only**, in these places: extension `packages`, `rootfs`/`initramfs` `packages`, runtime `packages`, and the kernel `package` name.
- Anywhere else, such as `on_merge`, `cmdline_extra` or an overlay file, it stays as the literal text `{{ avocado.kernel.version }}`.
- Only four spacing variants are recognized here, not arbitrary whitespace: `{{ avocado.kernel.version }}`, `{{avocado.kernel.version}}`, `{{ avocado.kernel.version}}`, `{{avocado.kernel.version }}`.

This is the right way to name kernel module packages. See [Kernel modules in extensions](../../build/kernel-modules/).

## Overlay files

Overlay files are copied **verbatim** by default. To template them, opt in per overlay:

```yaml
extensions:
  discovery:
    overlay:
      dir: overlays/discovery
      preprocess: true                 # every UTF-8 file
  app:
    overlay:
      dir: overlays/app
      preprocess:                      # or only files matching these globs
        - etc/app/*.conf
        - usr/share/app/**/*.json
```

- `preprocess: true` templates every file. A list templates only matching files. Glob syntax: `*` matches within one path segment, `**` matches across segments, `?` matches one character. Absent, `false` or an empty list means no templating.
- It works for **rootfs, initramfs and extension overlays** that live in your project. Overlays of **fetched** extensions are always copied verbatim, and the CLI prints a warning.
- Only files that are valid UTF-8 are templated. Binaries pass through untouched.
- In overlay files, a `{{ ... }}` whose context isn't `env`, `config` or `avocado` is **left alone**. That lets you ship Go, Jinja or Helm templates that use the same braces.
- The processed copy is written to `.avocado/overlay-staging/<label>/` in your project. **Any secret you template in stays on disk there** until that overlay is next built. `avocado clean` doesn't remove it ([details](../../build/stale-state/#avocado-clean-leaves-avocado-behind)). `.avocado/` must stay gitignored.
- The up-to-date check hashes the **processed** content. Changing an environment variable that an overlay template uses therefore triggers a rebuild, which is correct.

Without `preprocess:`, a file like `overlays/discovery/etc/avahi/services/device.service` containing `{{ avocado.extensions.app.version }}` ships with those braces as literal text.

## Checking what a template resolved to

- `avocado config show` prints the parsed config.
- For images, look at the built result. [Inspecting the build volume](../../build/inspecting-the-volume/) shows how to mount an extension image read-only and read the files the device will get.
