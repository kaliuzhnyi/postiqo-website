import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const assets = {}, urls = {};
for (const [name, path, type] of [
  ['font', '../../assets/fonts/Nunito-VariableFont_wght.ttf', 'font/ttf'],
  ['css', 'src/card.css', 'text/css; charset=utf-8'],
  ['js', 'src/card-client.js', 'text/javascript; charset=utf-8'],
]) {
  let bytes = await readFile(new URL(path, rootUrl));
  if (name === 'css') bytes = Buffer.from(bytes.toString().replaceAll('__FONT_URL__', urls.font));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const url = `/assets/${name}-${hash}.${name === 'font' ? 'ttf' : name}`;
  urls[name] = url;
  assets[url] = { type, body: bytes.toString('base64') };
}
await mkdir(`${root}generated`, { recursive: true });
await writeFile(`${root}generated/assets.js`, `export const assets = ${JSON.stringify(assets)};\nexport const urls = ${JSON.stringify(urls)};\n`);
await build({ absWorkingDir: root, entryPoints: ['src/index.js'], outfile: 'dist/index.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: false });
console.log('Built cards Worker with versioned CSS, JavaScript and the website Nunito font.');
