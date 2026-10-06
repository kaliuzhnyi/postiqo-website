import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = new URL('../../../', import.meta.url);

test('Cloudflare serves public routes and assets without exposing sources or stale articles', async () => {
  let log = '';
  const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), 'dev', '--local', '--port', '8894', '--ip', '127.0.0.1', '--show-interactive-dev-session=false'], {
    cwd: project, env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false'}, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => {log += chunk;});
  child.stderr.on('data', chunk => {log += chunk;});
  const origin = 'http://127.0.0.1:8894';
  const get = path => fetch(origin + path, {redirect: 'manual'});
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(log);
      try { if ((await get('/')).status === 200) {ready = true; break;} } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, log);
    for (const path of ['/', '/products/', '/products/postiqo-publisher/', '/products/postiqo-cards/', '/products/postiqo-website/', '/products/postiqo-pages/', '/products/postiqo-cards/demo/', '/try/', '/download/']) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), /text\/html/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      const source = await readFile(new URL(path.slice(1) + 'index.html', root), 'utf8');
      assert.equal(await r.text(), source, path);
    }
    for (const path of ['/products', '/products/index.html', '/try', '/download/index.html']) {
      const r = await get(path + '?utm_source=check');
      assert.equal(r.status, 301, path);
      assert.match(r.headers.get('location'), /\/?\?utm_source=check$/);
    }
    for (const path of ['/README.md', '/docs/blog/article-template.html', '/cloudflare-workers/content/seed/articles.json', '/.git/config', '/.env', '/forms/contact.php', '/blog/', '/sitemap.xml', '/missing-migration-check']) {
      const r = await get(path);
      assert.equal(r.status, 404, path);
      assert.match(await r.text(), /name="robots" content="noindex"/);
    }
    for (const path of ['/robots.txt', '/site.webmanifest', '/assets/js/site.js', '/assets/css/blog.css', '/public/og-home.png']) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), await readFile(new URL(path.slice(1), root)), path);
    }
    assert.equal((await fetch(origin + '/', {method: 'HEAD'})).status, 200);
    assert.equal((await fetch(origin + '/', {method: 'POST'})).status, 405);
    assert.ok(!(await readdir(new URL('../dist/', import.meta.url))).includes('blog'));
  } finally {
    child.kill();
    await new Promise(resolve => {if (child.exitCode !== null) resolve(); else child.once('exit', resolve);});
  }
});
