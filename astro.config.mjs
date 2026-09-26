// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

// GitHub Pages serves a project site from https://<owner>.github.io/<repo>/.
// The deploy workflow passes the real values, so forks and renames need no edit.
// The defaults here only matter for local builds.
const site = process.env.SITE_URL ?? 'https://literally-anything.github.io';
const base = process.env.BASE_PATH ?? '/avocado-extra-docs';
const repoUrl = process.env.REPO_URL ?? 'https://github.com/literally-anything/avocado-extra-docs';

// https://astro.build/config
export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'Avocado Extra Docs',
			description:
				'Unofficial, source-verified notes on Avocado OS and the avocado CLI: the config schema, templating, environment variables, build state, and the gotchas the official docs leave out.',
			social: [{ icon: 'github', label: 'GitHub', href: repoUrl }],
			editLink: { baseUrl: `${repoUrl}/edit/main/` },
			lastUpdated: true,
			plugins: [
				starlightLlmsTxt({
					projectName: 'Avocado Extra Docs',
					description:
						'Unofficial, source-verified reference for the avocado CLI (Avocado OS by Peridio). Every claim is checked against a pinned CLI release; each page states the version it was verified against.',
					details:
						'Where this site and docs.peridio.com disagree, the "Official docs errata" page explains which one matches the code. The machine-readable config schema is published at /schema/avocado.schema.json.',
					promote: ['index*', 'reference/**', 'config/**'],
					// Starlight's "Section titled ..." heading anchors are noise in plain text.
					customSelectors: { all: ['.sl-anchor-link'] },
				}),
			],
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ label: 'About these docs', slug: 'index' },
						{ label: 'Mental model', slug: 'start/mental-model' },
						{ label: 'Gotchas at a glance', slug: 'start/gotchas' },
					],
				},
				{
					label: 'Configuration',
					items: [
						{ label: 'How avocado.yaml is read', slug: 'config/format' },
						{ label: 'Templating', slug: 'config/templating' },
						{ label: 'Per-target and per-kernel overrides', slug: 'config/overrides' },
						{ label: 'Editor validation', slug: 'config/json-schema' },
					],
				},
				{
					label: 'Build',
					items: [
						{ label: 'Build state and stale sysroots', slug: 'build/stale-state' },
						{ label: 'Kernel modules in extensions', slug: 'build/kernel-modules' },
						{ label: 'Inspecting the build volume', slug: 'build/inspecting-the-volume' },
						{ label: 'Distro releases and channels', slug: 'build/releases-and-channels' },
					],
				},
				{
					label: 'On the device',
					items: [
						{ label: 'Boot and extension merge', slug: 'device/boot-and-merge' },
						{ label: 'on_merge and the release file', slug: 'device/on-merge' },
						{ label: 'Hostname patterns and machine-id', slug: 'device/hostname-and-machine-id' },
						{ label: 'What avocado deploy does', slug: 'device/deploy' },
					],
				},
				{
					label: 'Hardware notes',
					items: [
						{ label: 'NVIDIA Jetson Orin', slug: 'hardware/jetson-orin' },
						{ label: 'Jetson carrier boards', slug: 'hardware/jetson-carrier-boards' },
						{ label: 'Jetson boot image (cmdline/initramfs)', slug: 'hardware/jetson-boot-image' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Config schema', slug: 'reference/config-schema' },
						{ label: 'Environment variables', slug: 'reference/environment-variables' },
						{ label: 'Official docs errata', slug: 'reference/official-docs-errata' },
						{ label: 'Known upstream issues', slug: 'reference/known-issues' },
					],
				},
				{
					label: 'Troubleshooting',
					items: [{ label: 'Symptoms and fixes', slug: 'troubleshooting' }],
				},
			],
		}),
	],
});
