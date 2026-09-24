# Working on this repository

This is an Astro Starlight site: unofficial, source-verified docs for the `avocado` CLI and Avocado OS. Read `CONTRIBUTING.md` first; the rules below are the part that matters most for agents.

## Rules for content

- **Every claim must come from source or observation, never memory.** Check it in the pinned versions (avocado-cli, avocadoctl, meta-avocado, systemd), or in real build output or device output. If you can't verify something, say so on the page ("not yet confirmed on a device") or leave it out.
- **Every page starts with a `:::note[Verified against]` block** naming the versions and source files checked. Update it when you re-verify.
- **Distinguish what the code does from what docs and comments say.** When they disagree, document the code, and add an entry to `src/content/docs/reference/official-docs-errata.md`.
- **Link between pages with relative links** that end in `/` (for example `../../config/templating/#overlay-files`). Absolute `/…` links break under the GitHub Pages base path.
- Keep pages as plain Markdown (`.md`) so they stay readable as raw files and in `llms-full.txt`. Use Starlight's `:::note` / `:::caution` / `:::danger` / `:::tip` asides, not MDX components.
- A new page must also be added to the `sidebar` in `astro.config.mjs`.
- Changing what the CLI accepts means updating both `reference/config-schema.md` and `public/schema/avocado.schema.json`, and adding a fixture under `tests/schema/`.

## Checks

```bash
npm run check    # schema fixture tests, build, internal link and anchor check
```

All three must pass before a change is done.

## Development server

Start it in the background with `npx astro dev --background`. Manage it with `astro dev stop`, `astro dev status` and `astro dev logs`.

## Astro and Starlight documentation

- Astro: https://docs.astro.build
- Starlight: https://starlight.astro.build
- llms.txt plugin: https://delucis.github.io/starlight-llms-txt/
