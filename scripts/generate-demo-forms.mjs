import {readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const template = (await readFile(new URL('scripts/templates/demo-form.html', root), 'utf8')).replace(/\r\n/g, '\n').trim();
const marker = /<!-- Shared demo form -->[\s\S]*?<!-- End shared demo form -->/;
for (const file of ['index.html', 'demo/index.html']) {
  const path = new URL(file, root);
  const source = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  if (!marker.test(source)) throw new Error(`Missing demo form marker: ${file}`);
  const result = source.replace(marker, `<!-- Shared demo form -->\n${template}\n<!-- End shared demo form -->`);
  if (process.argv.includes('--check')) {
    if (source !== result) throw new Error(`Run node scripts/generate-demo-forms.mjs: ${file}`);
  } else if (source !== result) await writeFile(path, result);
}
console.log('Shared demo forms are up to date.');
