---
title: Distro releases and channels
description: What distro.release and distro.channel mean, which combinations exist, and how to check what's published for your board.
---

:::note[Verified against]
`repo.avocadolinux.org` as of 2026-09-24, avocado-cli `1.0.0-rc.5` (`src/utils/snapshot.rs`, `src/utils/feeds.rs`), meta-avocado branches `scarthgap` and `wrynose`.
:::

```yaml
distro:
  release: 2024
  channel: edge
```

## Release = the Yocto LTS base

| `release` | Yocto base | Notes |
|---|---|---|
| `2024` | scarthgap (5.0 LTS, supported until about April 2028) | The mature one. systemd 258 on the device. |
| `2026` | wrynose (6.0 LTS) | Newer, and hardware support is still landing |

There is no `2025`.

## Channel = how settled the builds are

The official docs don't define the channels. Going by how often each one publishes new snapshots:

| Channel | What it looks like |
|---|---|
| `next` | Rebuilt constantly; hundreds of snapshots. The newest code, and the least tested. |
| `edge` | New snapshots every now and then. Every config in [avocado-linux/references](https://github.com/avocado-linux/references) uses it. |
| `stable` | The most conservative. As of this writing it only exists for `2026` on `qemuarm64`. |

That reading comes from snapshot cadence, not from any official definition.

## What's published per board (2026-09-24)

| | Orin Nano devkit | Orin NX | qemuarm64 |
|---|---|---|---|
| 2024 / next | yes | yes | yes |
| 2024 / edge | yes | yes | yes |
| 2024 / stable | no | no | no |
| 2026 / next | no | yes | yes |
| 2026 / edge | no | no | yes |
| 2026 / stable | no | no | yes |

This changes over time. Check it yourself (below) rather than trusting the table.

## How feeds and snapshots work

- The feed URL is `<repo_url>/<release>/<channel>/...`, and the default `repo_url` is `https://repo.avocadolinux.org`. The CLI calls `<release>/<channel>` the **releasever**.
- Each target publishes numbered **snapshots**. The CLI pins one in `avocado.lock` (under `repo-snapshot`), so builds are repeatable.
- `avocado update` moves the pin to the newest snapshot and re-resolves every package. If it's already at the newest, it does nothing.
- Environment variables override the config: `AVOCADO_DISTRO_RELEASE`, `AVOCADO_DISTRO_CHANNEL`, `AVOCADO_RELEASEVER` and `AVOCADO_REPO_URL`. See [Environment variables](../../reference/environment-variables/).

## Check what's published

Each release, channel and target has a pointer to its latest snapshot:

```bash
for r in 2024 2026; do for c in next edge stable; do
  t=jetson-orin-nano-devkit
  u=https://repo.avocadolinux.org/$r/$c/target/$t/snapshots-latest.json
  printf '%s/%s: ' "$r" "$c"; curl -fsS "$u" 2>/dev/null || echo "not published"
  echo
done; done
```

A published combination returns something like `{"id": "16", "created": "2026-07-08T02:58:32Z"}`.

Peridio's [hardware support matrix](https://docs.peridio.com/hardware/support-matrix) is the official view. It lists support per Yocto base, not per channel.

## Switching release or channel

What changes when you switch:

1. `distro.release` and/or `distro.channel` in `avocado.yaml`.
2. `sdk.image`. If it's written as `docker.io/avocadolinux/sdk:{{ config.distro.release }}`, it follows the release automatically. Published tags include `2024`, `2024-edge`, `2026` and `2026-edge`, and **`2024` currently points at the same image as `2024-edge`**. Pin a tag, or a digest, if you want builds that are repeatable.
3. Re-resolve with `avocado update` (or `avocado unlock` plus `avocado install`).

What usually breaks:

- **Package names with the kernel version typed out.** Use `{{ avocado.kernel.version }}` instead; see [Kernel modules](../kernel-modules/).
- Scripts that depend on BSP file layouts or device-tree node paths.
- Package names that differ between Yocto bases.

Try a switch in a copy of the project, and build it from `avocado clean`.
