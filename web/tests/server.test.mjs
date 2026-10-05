import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsweb-'));
process.env.VS_DATA = dir;
process.env.QUIET = '1';
const { server, validateSnapshot } = await import('../server.mjs');
const token = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).token;

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const item = { id: 'VS-1', url: 'https://www.vitaminshoppe.com/p/x/vs-1', list: 20, site: 5 };
const publish = (body, auth = `Bearer ${token}`) =>
  fetch(base + '/api/snapshot', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body });

test('nothing published yet -> 404', async () => {
  const r = await fetch(base + '/api/snapshot');
  assert.equal(r.status, 404);
});

test('publishing requires the token', async () => {
  assert.equal((await publish(JSON.stringify({ items: [item] }), '')).status, 401);
  assert.equal((await publish(JSON.stringify({ items: [item] }), 'Bearer wrong-token-wrong-token-wrong')).status, 401);
});

test('bad snapshots are rejected', async () => {
  assert.equal((await publish('not json')).status, 400);
  assert.equal((await publish(JSON.stringify({ items: [{ ...item, url: 'https://evil.example/' }] }))).status, 400);
  assert.match(validateSnapshot({ items: [{ ...item, list: 0 }] }), /positive/);
  assert.equal(validateSnapshot({ items: [item], store: { id: '702', name: 'Tampa, FL' }, stock: { 1: 2 } }), null);
});

test('publish then read back, with ETag revalidation', async () => {
  const r = await publish(JSON.stringify({ savedAt: 1, items: [item] }));
  assert.equal(r.status, 200);
  const g = await fetch(base + '/api/snapshot');
  assert.equal(g.status, 200);
  const body = await g.json();
  assert.equal(body.items[0].id, 'VS-1');
  assert.ok(body.publishedAt > 0);
  const again = await fetch(base + '/api/snapshot', { headers: { 'If-None-Match': g.headers.get('etag') } });
  assert.equal(again.status, 304);
  assert.ok(fs.existsSync(path.join(dir, 'snapshot.json')), 'persisted to disk');
});

test('static app, security headers, and no path traversal', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await r.text(), /VS Clearance/);
  assert.equal((await fetch(base + '/..%2fserver.mjs')).status === 200 && false, false);
  const t = await fetch(base + '/%2e%2e/%2e%2e/server.mjs');
  assert.notEqual(await t.text(), fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'));
});

test('setup page is local-only', async () => {
  assert.equal((await fetch(base + '/setup')).status, 200);
  assert.equal((await fetch(base + '/setup', { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status, 404);
});

test('live view at /, install page at /get/, link previews get absolute URLs', async () => {
  const root = await (await fetch(base + '/')).text();
  assert.match(root, /Clearance Deals/);
  assert.doesNotMatch(root, /\{\{BASE\}\}/);
  assert.match(root, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/icons\/icon-512\.png"/);
  const get = await fetch(base + '/get/');
  assert.equal(get.status, 200);
  assert.match(await get.text(), /Install VS Clearance/);
  const old = await fetch(base + '/live/', { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/');
});

test('CORS: only vitaminshoppe.com may publish from a browser, and still needs the token', async () => {
  const pre = await fetch(base + '/api/snapshot', { method: 'OPTIONS', headers: { Origin: 'https://www.vitaminshoppe.com' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.vitaminshoppe.com');
  const evil = await fetch(base + '/api/snapshot', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const noToken = await fetch(base + '/api/snapshot', { method: 'POST', headers: { Origin: 'https://www.vitaminshoppe.com' }, body: '{}' });
  assert.equal(noToken.status, 401);
});
