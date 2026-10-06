import {cp, mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, relative, sep} from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const project = fileURLToPath(new URL('../', import.meta.url));
if (relative(project, output) !== 'dist') throw new Error('Unexpected output path');

// Explicit public allowlist. Blog snapshots and sitemap are served by the
// content Worker; sources, drafts, credentials and legacy PHP never get uploaded.
export const directories = ['assets', 'public', 'products', 'try', 'download'];
export const files = [
  'index.html', '404.html', 'robots.txt', 'site.webmanifest',
  'service-details.html', 'starter-page.html', 'apple-touch-icon.png',
  'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png',
  'favicon-48x48.png', 'favicon-96x96.png', 'postiqo-favicon-96.png',
  'postiqo-icon-192.png', 'postiqo-icon-512.png'
];

async function check(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in public files: ${path}`);
    if (entry.name.startsWith('.')) throw new Error(`Hidden public file: ${path}`);
    if (entry.isDirectory()) await check(path);
    else if ((await stat(path)).size > 25 * 1024 * 1024) throw new Error(`Asset too large: ${path}`);
  }
}
for (const directory of directories) await check(resolve(root, directory));
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const path of [...directories, ...files]) await cp(resolve(root, path), resolve(output, path), {recursive: true});
await writeFile(resolve(output, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
/404.html
  X-Robots-Tag: noindex
`);
// Explicit permanent redirects for directory indexes; query strings survive.
const indexes = [];
async function findIndexes(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await findIndexes(path);
    else if (entry.name === 'index.html') indexes.push('/' + relative(output, path).split(sep).join('/'));
  }
}
await findIndexes(output);
await writeFile(resolve(output, '_redirects'), indexes.sort().flatMap(path => {
  const canonical = path.slice(0, -'index.html'.length);
  return [path + ' ' + canonical + ' 301', ...(canonical === '/' ? [] : [canonical.slice(0, -1) + ' ' + canonical + ' 301'])];
}).join('\n') + '\n');
console.log(`Built public website in ${output}. Blog and sitemap stay on the content Worker.`);
