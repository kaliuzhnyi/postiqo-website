import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../src/card-client.js', import.meta.url), 'utf8');

test('an open card removes vehicle details and closes its gallery when Cards is disabled', async () => {
  const calls = [], handlers = {}, note = { hidden: true };
  let onReload;
  const reloaded = new Promise(resolve => { onReload = resolve; });
  const elements = {
    '.lightbox': { close: () => calls.push('close') },
    '[data-vehicle-card]': { dataset: { endpoint: '/api/100/WBA8E1C5XJA756297' }, remove: () => calls.push('remove') },
    '[data-refresh-note]': note,
  };
  let requests = 0;
  runInNewContext(script, {
    document: { hidden: false, querySelector: key => elements[key] || null,
      querySelectorAll: () => [], addEventListener: (name, handler) => { handlers[name] = handler; } },
    window: { location: { reload: () => { calls.push('reload'); onReload(); } },
      addEventListener: (name, handler) => { handlers[name] = handler; } },
    setInterval: () => {}, AbortSignal,
    fetch: async () => { requests++; return new Response(JSON.stringify({ error: 'cards_disabled' }), { status: 403 }); },
  });
  handlers.pageshow({ persisted: true });
  await reloaded;
  assert.deepEqual(calls, ['close', 'remove', 'reload']);
  assert.equal(note.hidden, true, 'disabled access must not look like a transient price refresh error');
  await handlers.pageshow({ persisted: true });
  assert.equal(requests, 1, 'stop polling after access is disabled');
});
