# Avocado Extra Docs

Unofficial, source-verified documentation for [Avocado OS](https://docs.peridio.com/avocado-os/about) and the `avocado` CLI. It covers the parts the [official docs](https://docs.peridio.com) leave out, cover only partly, or get wrong: the full config schema, templating, environment variables, build state, the device boot flow, and the gotchas we hit building a Jetson Orin product.

Not affiliated with Peridio.

- **Site:** https://literally-anything.github.io/avocado-extra-docs/
- **JSON Schema for `avocado.yaml`:** https://literally-anything.github.io/avocado-extra-docs/schema/avocado.schema.json
- **For LLMs:** `/llms.txt`, `/llms-full.txt` and `/llms-small.txt` on the site. Every page is also plain Markdown under [`src/content/docs/`](src/content/docs/).

Everything here is checked against a specific version (currently **avocado-cli `1.0.0-rc.5`** and **avocadoctl `0.12.0`**), and every page says which one.

## Working on it

Needs Node 22.12 or newer.

```bash
npm ci
npm run dev          # http://localhost:4321/avocado-extra-docs/
npm run check        # schema tests, build, then internal link and anchor check
```

| Path | What |
|---|---|
| `src/content/docs/` | The pages, as Markdown. The sidebar order is set in `astro.config.mjs`. |
| `public/schema/avocado.schema.json` | The JSON Schema, served as-is |
| `tests/schema/{valid,invalid}/` | Fixtures for the schema. An invalid fixture names the error it expects on its first line (`# expect: <text>`). |
| `scripts/check-schema.mjs` | Runs the schema over the fixtures |
| `scripts/check-links.mjs` | Checks every internal link and `#anchor` in the built site |
| `scripts/check-avocado-build.sh` | A tool for Avocado users, documented on the site: finds extension images that are missing files their sysroot has |

Pages link to each other with **relative** links (`../../config/templating/`), so the site works under any base path. `npm run check:links` catches mistakes.

## Publishing on GitHub Pages

1. Push to a GitHub repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` builds, checks and deploys.

The workflow reads the real URL and base path from GitHub. A fork, a renamed repo, a `<user>.github.io` repo or a custom domain works without editing anything. The defaults in `astro.config.mjs` only affect local builds. Pull requests run every check but don't deploy.

If you publish somewhere other than `literally-anything/avocado-extra-docs`, also update the hard-coded schema URL in `public/schema/avocado.schema.json` (`$id`) and in `src/content/docs/config/json-schema.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), including the list of pages we still want written.
