// Check every internal link and #anchor in the built site (dist/).
//
// Pages link to each other with relative URLs so the site works under any
// GitHub Pages base path. Astro does not validate those, so this walks the
// built HTML, resolves each href the way a browser would, and fails if the
// target page or the id it points at does not exist.
//
// Usage: node scripts/check-links.mjs [distDir] [basePath]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const base = (process.argv[3] ?? process.env.BASE_PATH ?? '/avocado-extra-docs').replace(/\/$/, '');
const origin = 'https://site.invalid';

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

// Map a URL path under the base to a file in dist/.
function fileFor(pathname) {
	if (!pathname.startsWith(base + '/') && pathname !== base) return null;
	let rel = decodeURIComponent(pathname.slice(base.length)) || '/';
	if (rel.endsWith('/')) rel += 'index.html';
	return join(dist, rel);
}

const idsCache = new Map();
function idsIn(file) {
	if (!idsCache.has(file)) {
		const html = readFileSync(file, 'utf8');
		idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
	}
	return idsCache.get(file);
}

const pages = walk(dist).filter((f) => f.endsWith('.html'));
const problems = [];
for (const page of pages) {
	// Skip Starlight's 404 page, whose links are site chrome.
	if (relative(dist, page) === '404.html') continue;
	const pageUrl = new URL(base + '/' + relative(dist, page).split(sep).join('/').replace(/index\.html$/, ''), origin);
	const html = readFileSync(page, 'utf8');
	// Only check links inside the page content, not the sidebar or header.
	const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
	for (const [, href] of main.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
		if (/^(https?:|mailto:|tel:)/.test(href) && !href.startsWith(origin)) continue;
		const url = new URL(href.replaceAll('&amp;', '&'), pageUrl);
		if (url.origin !== origin) continue;
		const target = fileFor(url.pathname);
		const where = `${relative(dist, page)} -> ${href}`;
		if (!target || !existsSync(target)) {
			problems.push(`missing page: ${where}`);
			continue;
		}
		if (url.hash && target.endsWith('.html')) {
			const id = decodeURIComponent(url.hash.slice(1));
			if (!idsIn(target).has(id)) problems.push(`missing anchor #${id}: ${where}`);
		}
	}
}

if (problems.length) {
	console.error(problems.join('\n'));
	console.error(`\n${problems.length} broken internal link(s).`);
	process.exit(1);
}
console.log(`Checked ${pages.length} pages: all internal links and anchors resolve.`);
