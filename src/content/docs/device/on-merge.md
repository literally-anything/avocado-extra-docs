---
title: on_merge and the release file
description: How extension settings become lines in an extension-release file, and exactly how avocadoctl parses and runs on_merge commands.
---

:::note[Verified against]
avocado-cli `1.0.0-rc.5` (`src/commands/ext/build.rs`), avocadoctl `0.12.0` (`src/commands/ext.rs`: `run_avocado_on_merge_commands`, `execute_single_command`, `process_post_merge_tasks_for_extensions`), and the 2024/edge rootfs units (systemd 258). The D-Bus behaviour was seen on a `jetson-orin-nano-devkit`.
:::

## Config becomes release-file lines

The device never sees `avocado.yaml`. The build writes each extension's device-side settings into its release files:

- sysext half: `usr/lib/extension-release.d/extension-release.<name>-<version>`
- confext half: `etc/extension-release.d/extension-release.<name>-<version>`

Real example, a `usb-gadget` extension:

```ini
# usr/lib/extension-release.d/extension-release.usb-gadget-1.0.0
ID=_any
EXTENSION_RELOAD_MANAGER=0
SYSEXT_SCOPE=system
AVOCADO_ON_MERGE="depmod"
AVOCADO_ON_MERGE="modprobe libcomposite"

# etc/extension-release.d/extension-release.usb-gadget-1.0.0
ID=_any
EXTENSION_RELOAD_MANAGER=0
CONFEXT_SCOPE=system
AVOCADO_ENABLE_SERVICES="usb-gadget.service"
```

| Config key | Release file line |
|---|---|
| `scopes`, `sysext_scopes`, `confext_scopes` | `SYSEXT_SCOPE=...`, `CONFEXT_SCOPE=...` (default `system`) |
| `reload_service_manager: true` | `EXTENSION_RELOAD_MANAGER=1` (default `0`) |
| `modprobe: [m]` | `AVOCADO_ON_MERGE="modprobe m"` |
| `on_merge: [cmd]` | `AVOCADO_ON_MERGE="cmd"` |
| `on_unmerge: [cmd]` | `AVOCADO_ON_UNMERGE="cmd"` |
| `enable_services: [u]` | `AVOCADO_ENABLE_SERVICES="u"`, plus a `*.wants/u` symlink in the confext |
| *(automatic)* the extension contains `*.ko*` | `AVOCADO_ON_MERGE="depmod"` |
| *(automatic)* the extension contains `sysusers.d/*.conf` | `AVOCADO_ON_MERGE="systemd-sysusers"` |
| *(automatic)* the extension contains `tmpfiles.d/*.conf` | `AVOCADO_ON_MERGE="systemd-tmpfiles --create"` |

Nothing is added automatically for `sysctl.d` or `modules-load.d`. See [Boot and extension merge](../boot-and-merge/#which-extension-files-take-effect-at-boot).

## How `on_merge` commands run

`avocadoctl` collects the `AVOCADO_ON_MERGE` lines from every enabled extension and **removes exact duplicates**, keeping the first occurrence. Then:

1. Commands whose program is `depmod` or `ldconfig` run first.
2. Modules from `AVOCADO_MODPROBE=` lines are loaded. The CLI doesn't write those any more (its own test asserts `AVOCADO_MODPROBE` is gone), so this step is empty for extensions it builds.
3. `systemctl daemon-reload` runs.
4. Every remaining command runs, in collection order. **This includes your `modprobe:` modules**, which the CLI writes as ordinary `AVOCADO_ON_MERGE="modprobe <m>"` lines.

avocadoctl's own comment says modules are loaded before the reload so that units needing them (its example is `proc-fs-nfsd.mount`) can start. With the current CLI that ordering doesn't happen. If a unit in your extension needs a module at reload time, have the unit load it (`Wants=`/`After=modprobe@<m>.service`).

Because duplicates are dropped, several extensions can use the **identical** reload line and it runs once per merge.

**There's no shell.** Each command string is:

1. split on `;` into separate commands,
2. stripped of surrounding `"` characters,
3. split on whitespace into a program and its arguments,
4. run directly.

So none of these work the way they look:

```yaml
on_merge:
  - echo 1 > /proc/sys/foo          # '>' and the path are passed to echo as arguments
  - systemctl restart a && start b  # '&&' is an argument
  - sh -c "echo hi > /tmp/x"        # split on spaces: sh gets -c, "echo, hi, >, ...
  - FOO=bar my-tool                 # tries to run a program called "FOO=bar"
```

`;` is the one operator that works, and the pieces run one after another:

```yaml
on_merge:
  - udevadm control --reload; udevadm trigger --action=add --subsystem-match=udc
```

Anything more complex should be a script that your extension ships:

```yaml
extensions:
  thing:
    overlay: overlays/thing          # contains usr/libexec/thing/on-merge.sh (mode 755)
    on_merge:
      - /usr/libexec/thing/on-merge.sh
```

## Failures

| What happens | Effect |
|---|---|
| The command runs and exits non-zero | A warning, and processing continues |
| The program can't be found or started | **An error.** The remaining post-merge steps are skipped, and at boot `avocado-extension.service` fails. That stops every extension's services from starting. See [When the merge fails](../boot-and-merge/#when-the-merge-fails). |
| A `modprobe:` module fails to load | A warning only |

Any `on_merge` command whose program might be missing (it lives in another extension, or depends on the board) takes the whole device down with it. Wrap it in a script that checks for the program first.

## When it runs

- **Every boot**, as part of `avocado-extension.service`.
- **Every live refresh**: `avocadoctl refresh`, a runtime activated by `avocado deploy`, and any other `avocadoctl` operation that re-merges extensions.

Commands must be safe to run repeatedly.

## D-Bus isn't up at boot

At boot the merge runs before `sysinit.target`, and D-Bus starts after it. So any command that talks to a daemon over D-Bus fails during the boot-time merge and works during a live deploy. `networkctl reload`, `resolvectl`, `hostnamectl`, `timedatectl` and `busctl` are all in this group. The program exists, so avocadoctl only logs a warning, and nothing is reloaded.

This was seen on a Jetson: `on_merge: ['networkctl reload']` was in the built release file, yet `usb0` stayed `unmanaged` after every boot, while the same command typed after boot fixed it.

`systemctl` talks to PID 1 directly, so it works at boot. The pattern that works both at boot and on a live deploy:

```yaml
on_merge:
  - systemctl --no-block try-reload-or-restart systemd-networkd.service
on_unmerge:
  - systemctl --no-block try-reload-or-restart systemd-networkd.service
```

- `try-` does nothing if the daemon isn't running yet, which is the usual case at boot. It then reads the merged files when it starts, provided it's ordered after the merge (see [Boot and extension merge](../boot-and-merge/#which-extension-files-take-effect-at-boot)).
- `--no-block` avoids waiting on a job from inside a boot-time unit.
- On the 2024 rootfs, `systemd-networkd` and `systemd-resolved` are `Type=notify-reload`, so this is a reload, not a restart.
- **Recovery links:** a networkd reload during a live deploy applies a changed `.network` file straight away, including to the link you're deploying over. If that link is your only way in, leave this hook out of its extension and let the change apply at the next reboot.

## Templates are resolved at build time

`on_merge` strings are templated on the build host when the CLI loads `avocado.yaml`. `{{ env.X }}` bakes in the build machine's value. `{{ avocado.kernel.version }}` isn't substituted here at all: it stays as literal text. See [Templating](../../config/templating/).
