---
title: About these docs
description: Unofficial, source-verified documentation for the avocado CLI and Avocado OS, covering what the official docs leave out.
---

This site documents the parts of [Avocado OS](https://docs.peridio.com/avocado-os/about) and the `avocado` CLI that the [official documentation](https://docs.peridio.com) doesn't cover, covers only partly, or gets wrong. It grew out of building a real Jetson Orin product on Avocado and hitting the gaps one at a time.

It is **not** affiliated with Peridio. Read it alongside the official docs, not instead of them.

## How the claims here were checked

Everything on this site comes from reading the source of the exact versions below, or from inspecting real build output and booted devices. Where a page says "the CLI does X", it's describing what the code does, not what a doc or comment says it does. Those often differ, and the [errata page](reference/official-docs-errata/) lists the cases we found.

| Component | Version checked | Where |
|---|---|---|
| avocado-cli | `1.0.0-rc.5` (`2b46152`, 2026-09-17) | [avocado-linux/avocado-cli](https://github.com/avocado-linux/avocado-cli) |
| avocadoctl (on device) | `0.12.0` (`fa81278`) | [avocado-linux/avocadoctl](https://github.com/avocado-linux/avocadoctl) |
| meta-avocado | `scarthgap` branch at `16e6328` | [avocado-linux/meta-avocado](https://github.com/avocado-linux/meta-avocado) |
| Distro feed | `2024/edge`, snapshot 16 | `repo.avocadolinux.org` |
| systemd on the device | 258 | shipped in the 2024 rootfs |

Every page repeats this in a **Verified against** note. The CLI is still at a release candidate and changes quickly, so treat anything version-sensitive as a snapshot, and re-check it against the source when you upgrade.

## Where to start

- **New to Avocado internals?** Read the [mental model](start/mental-model/) first. It explains where each piece runs (your host, the SDK container, the device) and why that matters for almost every gotcha.
- **Something is broken?** Go to [Symptoms and fixes](troubleshooting/).
- **Writing `avocado.yaml`?** Use the [config schema reference](reference/config-schema/) and point your editor at the [JSON Schema](config/json-schema/). It catches typos that the CLI silently ignores.
- **Short on time?** [Gotchas at a glance](start/gotchas/) lists every trap on one page.

## For LLMs and tools

- [`llms.txt`](llms.txt), [`llms-full.txt`](llms-full.txt) and [`llms-small.txt`](llms-small.txt) contain the whole site as plain text.
- [`schema/avocado.schema.json`](schema/avocado.schema.json) is a JSON Schema (draft 2020-12) for `avocado.yaml`.
- Every page is a plain Markdown file under `src/content/docs/` in the repository.
