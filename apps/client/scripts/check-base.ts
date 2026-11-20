/**
 * Fails if a production build references root-absolute URLs that ignore the Vite base
 * (e.g. "/assets/x.js" when the site lives at /OdenseMonsterLeague/). GitHub Pages serves
 * project sites from a sub-path, so such URLs would 404 for testers.
 *
 * Usage (after `vite build`): VITE_BASE=/OdenseMonsterLeague/ tsx scripts/check-base.ts [distDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuiltFile {
  path: string;
  text: string;
}

/** A URL is fine if it is relative, external, a data/blob URL, or starts with the base. */
export function urlOk(url: string, base: string): boolean {
  if (!url.startsWith('/')) return true; // relative, http(s):, data:, blob:, #hash
  if (url.startsWith('//')) return false; // protocol-relative: never expected here
  return url.startsWith(base);
}

export function findBaseViolations(files: readonly BuiltFile[], base: string): string[] {
  const problems: string[] = [];
  const report = (file: string, what: string, url: string) => {
    if (!urlOk(url, base))
      problems.push(`${file}: ${what} "${url}" does not start with base "${base}"`);
  };
  for (const { path, text } of files) {
    if (path.endsWith('.html')) {
      for (const m of text.matchAll(/\b(?:src|href|content)="([^"]*)"/g)) {
        if (m[1]!.startsWith('/')) report(path, 'attribute', m[1]!);
      }
      if (!/registerSW\.js|serviceWorker/.test(text) && path === 'index.html')
        problems.push(`${path}: no service-worker registration found`);
    }
    if (path.endsWith('.css')) {
      for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g))
        report(path, 'css url', m[1]!);
    }
    if (path.endsWith('.webmanifest')) {
      const manifest = JSON.parse(text) as {
        start_url?: string;
        scope?: string;
        icons?: { src: string }[];
      };
      for (const key of ['start_url', 'scope'] as const) {
        const value = manifest[key];
        if (value === undefined) problems.push(`${path}: missing ${key}`);
        else report(path, key, value);
      }
      for (const icon of manifest.icons ?? []) report(path, 'icon', icon.src);
    }
    if (path === 'registerSW.js') {
      for (const m of text.matchAll(/register\(\s*['"]([^'"]+)['"]/g))
        report(path, 'sw url', m[1]!);
      for (const m of text.matchAll(/scope:\s*['"]([^'"]+)['"]/g)) report(path, 'sw scope', m[1]!);
    }
  }
  return problems;
}

function listFiles(dir: string, root = dir): BuiltFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full, root);
    if (!/\.(html|css|webmanifest)$/.test(name) && name !== 'registerSW.js') return [];
    return [{ path: relative(root, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const base = process.env.VITE_BASE ?? '/';
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`No build found in ${dist}; run vite build first.`);
    process.exit(2);
  }
  const files = listFiles(dist);
  const problems = findBaseViolations(files, base);
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`✓ ${files.length} built files reference only base "${base}" or relative URLs`);
}
