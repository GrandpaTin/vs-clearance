// Offline end-to-end check of the userscript: loads it into a stub vitaminshoppe.com page whose
// API calls are answered from captured real responses (no request reaches the real site), then
// drives the main flows and writes screenshots to web/build/shots/.
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> node tests/userscript-harness.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.resolve(root, '..', 'app', 'src', 'test', 'resources');
const out = path.join(root, 'build', 'shots');
fs.mkdirSync(out, { recursive: true });
const core = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = await import(core.includes(':') ? pathToFileURL(core).href : core);

const script = fs.readFileSync(path.join(root, 'public', 'vs-clearance.user.js'), 'utf8');
// Enlarge the captured 6-item page into a realistic list by cloning with new SKUs.
const page1 = JSON.parse(fs.readFileSync(path.join(fixtures, 'clearance_page.json'), 'utf8'));
const real = page1.response.products.filter((p) => p.type === 'Product' && p.price && p.jdaSkuId && !p.skuId.startsWith('VS-5249') || p.skuId === 'VS-5249');
const products = [];
for (let i = 0; i < 4; i++) for (const p of real) {
  if (!p.price || !p.jdaSkuId) continue;
  products.push({ ...p, skuId: i ? `${p.skuId}-${i}` : p.skuId, jdaSkuId: i ? `${p.jdaSkuId}${i}` : p.jdaSkuId });
}
const clearance = JSON.stringify({ response: { numProducts: products.length, products, pagination: { totalPages: 1 } } });
const stores = fs.readFileSync(path.join(fixtures, 'stores_33701.json'), 'utf8');
const imgs = path.resolve(root, '..', 'app', 'src', 'test', 'resources', 'images');

let blocked = false;
const browser = await chromium.launch({ channel: 'msedge' });
const results = [];
async function run(name, { dark = false, fn }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: dark ? 'dark' : 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.route('https://www.vitaminshoppe.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vitamin Shoppe</title><h1 style="font-family:sans-serif;padding:40px">Vitamin Shoppe (stub page)</h1>' }));
  await ctx.route('https://browse.vitaminshoppe.com/**', (r) => {
    const u = new URL(r.request().url());
    if (blocked) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"url":"https://geo.captcha-delivery.com/captcha/"}' });
    if (u.pathname.includes('/search/product/search')) return r.fulfill({ contentType: 'application/json', body: clearance });
    if (u.pathname.includes('get-stores-with-inv')) return r.fulfill({ contentType: 'application/json', body: stores });
    if (u.pathname.includes('pdpinventory')) {
      const skus = u.searchParams.get('skuIds').split(',');
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ skuInventory: skus.map((s, i) => ({ skuId: s, quantity: i % 3 === 2 ? 'na' : String((i % 5) + 1), service: 'available' })) }) });
    }
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://s7media.vitaminshoppe.com/**', (r) => {
    const id = /VitaminShoppe\/(\d+)_/.exec(r.request().url())?.[1];
    const file = id && path.join(imgs, `img_${id}.png`);
    return file && fs.existsSync(file) ? r.fulfill({ contentType: 'image/png', body: fs.readFileSync(file) }) : r.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript({ content: script });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('https://www.vitaminshoppe.com/cl/clearance/0#vsdeals');
  const app = page.locator('#vs-clearance-host');
  try {
    await fn(page, app);
    results.push(`${errors.length ? 'WARN' : 'ok  '} ${name}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  } catch (e) {
    results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: path.join(out, `FAIL-${name}.png`) });
  }
  await ctx.close();
}
const shot = (page, n) => page.screenshot({ path: path.join(out, `${n}.png`) });

await run('01-list', { fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  const count = await app.locator('.count').textContent();
  if (!/^\d+( deals| of \d+)$/.test(count.trim())) throw new Error('count missing: ' + count);
  await page.waitForTimeout(400);
  await shot(page, '01-list');
} });

await run('02-dark', { dark: true, fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  await page.waitForTimeout(400);
  await shot(page, '02-dark');
} });

await run('03-store-and-pickup', { fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  await app.locator('[data-act="stores"]').click();
  const input = app.locator('.store-form input');
  await input.fill('33701');
  await app.locator('.store-form button').click();
  await app.locator('.store').first().waitFor();
  await shot(page, '03a-store-sheet');
  await app.locator('.store').first().click();
  await app.locator('.stock', { hasText: 'on the shelf' }).first().waitFor();
  const segChecked = await app.locator('.segmented [aria-checked="true"]').textContent();
  if (!/Pick up/.test(segChecked)) throw new Error('did not switch to pickup');
  await page.waitForTimeout(300);
  await shot(page, '03b-pickup');
} });

await run('04-ai-prompt', { fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  await app.locator('[data-act="ai"]').click();
  await app.locator('.scope').waitFor();
  await shot(page, '04-ai-prompt');
} });

await run('05-search-empty', { fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  await app.locator('[data-ref="q"]').fill('zzzz');
  await app.locator('.status h2', { hasText: 'No matching deals' }).waitFor();
  await shot(page, '05-search-empty');
} });

blocked = true;
await run('06-blocked', { fn: async (page, app) => {
  await app.locator('.status h2', { hasText: 'Quick check needed' }).waitFor();
  await shot(page, '06-blocked');
} });
blocked = false;

await run('07-launcher', { fn: async (page, app) => {
  await app.locator('.card').first().waitFor();
  await app.locator('[data-act="close"]').click();
  await app.locator('.launcher').waitFor();
  await shot(page, '07-launcher');
} });

// Sharing: pair via #vsdeals-share, load, pick a store -> the real server receives list + stock.
{
  const { spawn } = await import('node:child_process');
  const os = await import('node:os');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsshare-'));
  const port = 5600 + Math.floor(Math.random() * 300);
  const srv = spawn(process.execPath, [path.join(root, 'server.mjs')], { env: { ...process.env, PORT: String(port), VS_DATA: dataDir, QUIET: '1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const token = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).token;
  const pair = Buffer.from(JSON.stringify({ url: 'https://share.test', token })).toString('base64url');
  try {
    await run('08-share', { fn: async (page, app) => {
      await page.context().route('https://share.test/**', async (r) => {
        const req = r.request();
        const res = await fetch(`http://127.0.0.1:${port}` + new URL(req.url()).pathname, {
          method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined
        });
        await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      });
      await page.goto('https://www.vitaminshoppe.com/cl/clearance/0#vsdeals-share=' + pair);
      await app.locator('.card').first().waitFor();
      await app.locator('[data-act="stores"]').click();
      await app.locator('.store-form input').fill('33701');
      await app.locator('.store-form button').click();
      await app.locator('.store').first().click();
      await app.locator('.share-line', { hasText: 'Shared to your link' }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(300);
      await shot(page, '08-share');
      const snap = await (await fetch(`http://127.0.0.1:${port}/api/snapshot`)).json();
      if (!snap.items?.length) throw new Error('server got no items');
      if (snap.stockStoreId !== '743' || !Object.keys(snap.stock).length) throw new Error('server got no shelf stock');
      if ((await page.evaluate(() => location.hash)).includes('vsdeals-share')) throw new Error('pairing token left in the URL');
    } });
  } finally { srv.kill(); }
}

await browser.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
