// VS Clearance web server: serves the web app and the latest snapshot that the
// Android app publishes. Zero dependencies.
//
// Vitamin Shoppe's bot protection blocks servers and automated browsers, so this
// server never contacts vitaminshoppe.com. The phone app (a real, user-facing
// browser session) does the fetching and POSTs its results here.
//
//   GET  /api/snapshot      latest snapshot (ETag / 304 aware)
//   POST /api/snapshot      replace snapshot; needs "Authorization: Bearer <token>"
//   GET  /api/health        {"ok":true,...}
//   GET  /setup             pairing links for the Android app / userscript (only from this PC)
//   /                       live deals (whatever was last published); /get/ = install page
//   everything else         static files from ./public
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.VS_DATA || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 5050);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const MAX_BODY = 8 * 1024 * 1024;
const QUIET = process.env.QUIET === '1';

fs.mkdirSync(DATA, { recursive: true });
const SNAPSHOT_FILE = path.join(DATA, 'snapshot.json');
const CONFIG_FILE = path.join(DATA, 'config.json');

/** The publish token is created on first run and kept in data/config.json. */
function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (typeof cfg.token === 'string' && cfg.token.length >= 24) return cfg;
  } catch { /* first run or unreadable: make a new one */ }
  const cfg = { token: crypto.randomBytes(24).toString('base64url'), created: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}
const config = loadConfig();

let snapshot = null; // { body: Buffer, etag, publishedAt }
try {
  const body = fs.readFileSync(SNAPSHOT_FILE);
  snapshot = { body, etag: etagOf(body), publishedAt: JSON.parse(body).publishedAt };
} catch { /* nothing published yet */ }

function etagOf(buf) {
  return '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
}

function log(...args) { if (!QUIET) console.log(new Date().toISOString(), ...args); }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' https://s7media.vitaminshoppe.com https://*.scene7.com data:; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store', ...headers });

function isLocal(req) {
  // Tailscale Funnel/serve proxy from 127.0.0.1 too, but always adds a forwarding header.
  const a = req.socket.remoteAddress || '';
  const local = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  return local && !req.headers['x-forwarded-for'] && !req.headers['tailscale-user-login'] && !req.headers['tailscale-funnel-request'];
}

function tokenMatches(header) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(config.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Very small per-IP limiter for publish attempts (bad tokens can't be brute forced quickly).
const attempts = new Map();
function allowAttempt(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { n: 0, since: now };
  if (now - rec.since > 60_000) { rec.n = 0; rec.since = now; }
  rec.n += 1;
  attempts.set(ip, rec);
  return rec.n <= 30;
}

/** Shape check: rejects anything that isn't a plausible snapshot from the app. */
export function validateSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return 'Body must be a JSON object.';
  if (!Array.isArray(obj.items)) return '"items" must be an array.';
  if (obj.items.length > 10000) return 'Too many items.';
  for (const it of obj.items) {
    if (!it || typeof it.id !== 'string' || typeof it.url !== 'string') return 'Each item needs "id" and "url".';
    if (!/^https:\/\/www\.vitaminshoppe\.com\//.test(it.url)) return 'Item links must point to www.vitaminshoppe.com.';
    if (!(Number(it.list) > 0) || !(Number(it.site) > 0)) return 'Each item needs positive "list" and "site" prices.';
  }
  if (obj.store != null && (typeof obj.store !== 'object' || typeof obj.store.id !== 'string')) return '"store" is malformed.';
  if (obj.stock != null && typeof obj.stock !== 'object') return '"stock" must be an object.';
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handlePublish(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  if (!allowAttempt(ip)) return json(res, 429, { error: 'Too many attempts; wait a minute.' });
  if (!tokenMatches(req.headers.authorization)) return json(res, 401, { error: 'Missing or wrong publish token.' });
  let parsed;
  try {
    const raw = await readBody(req);
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return json(res, e.status || 400, { error: e.status === 413 ? 'Snapshot too large.' : 'Body is not valid JSON.' });
  }
  const problem = validateSnapshot(parsed);
  if (problem) return json(res, 400, { error: problem });
  parsed.publishedAt = Date.now();
  const body = Buffer.from(JSON.stringify(parsed));
  const tmp = SNAPSHOT_FILE + '.tmp';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, SNAPSHOT_FILE);
  snapshot = { body, etag: etagOf(body), publishedAt: parsed.publishedAt };
  log(`snapshot published: ${parsed.items.length} items${parsed.store ? ' @ ' + parsed.store.name : ''}`);
  return json(res, 200, { ok: true, items: parsed.items.length, publishedAt: parsed.publishedAt });
}

function handleSnapshot(req, res) {
  if (!snapshot) return json(res, 404, { error: 'Nothing has been published yet.' });
  const headers = { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache', ETag: snapshot.etag };
  if (req.headers['if-none-match'] === snapshot.etag) return send(res, 304, '', headers);
  return send(res, 200, snapshot.body, headers);
}

// The userscript runs on vitaminshoppe.com and may publish from there (token still required).
const PUBLISH_ORIGINS = new Set(['https://www.vitaminshoppe.com']);
function corsHeaders(req) {
  const origin = req.headers.origin;
  return origin && PUBLISH_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : {};
}

function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

function setupPage(res) {
  const base = PUBLIC_URL || `http://${HOST}:${PORT}`;
  const link = `vsdeals://publish?url=${encodeURIComponent(base)}&token=${encodeURIComponent(config.token)}`;
  const share = Buffer.from(JSON.stringify({ url: base, token: config.token })).toString('base64url');
  const browserLink = `https://www.vitaminshoppe.com/cl/clearance/0#vsdeals-share=${share}`;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VS Clearance setup</title><style>body{font:16px system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}
code{background:#f1f5f9;padding:2px 6px;border-radius:6px;word-break:break-all}</style>
<h1>Connect your phone</h1>
<p>Open this link on the Android phone (paste it into Chrome's address bar, or send it to yourself and tap it) to turn on publishing:</p>
<p><code>${esc(link)}</code></p>
<p>Or enter these in the app under <b>Share to web</b>:</p>
<p>Server: <code>${esc(base)}</code><br>Token: <code>${esc(config.token)}</code></p>
<h2>Share from a browser (iPhone / PC)</h2>
<p>On a device that has the VS Clearance userscript installed, open this link once. From then on, every time you open Deals there, the list is shared to your link:</p>
<p><code>${esc(browserLink)}</code></p>
<p>This page only works from this PC. Anyone with the token can replace your shared list, so don't post these links publicly.</p>`, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // Single-page app: unknown paths get the app (but never for API-looking paths).
      if (!rel.includes('/api/') && !path.extname(rel)) return serveStatic(req, res, rel.startsWith('/get') ? '/get/' : '/');
      return send(res, 404, 'Not found', { 'Content-Type': TYPES['.txt'] });
    }
    const ext = path.extname(file);
    // Code and styles revalidate so a fix reaches people on their next visit; images can sit.
    const cache = ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=300';
    if (ext === '.html') {
      // Link previews (iMessage, WhatsApp...) need absolute URLs.
      const html = fs.readFileSync(file, 'utf8').replaceAll('{{BASE}}', baseUrl(req).replace(/"/g, ''));
      return send(res, 200, html, { 'Content-Type': TYPES[ext], 'Cache-Control': cache });
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

export const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/health') return json(res, 200, { ok: true, hasSnapshot: !!snapshot, publishedAt: snapshot?.publishedAt ?? null });
    if (pathname === '/live' || pathname.startsWith('/live/')) {
      return send(res, 301, '', { Location: '/' + (pathname.endsWith('/api/snapshot') ? 'api/snapshot' : '') });
    }
    if (pathname === '/get') return send(res, 301, '', { Location: '/get/' });
    if (pathname === '/api/snapshot') {
      if (req.method === 'OPTIONS') return send(res, 204, '', corsHeaders(req));
      if (req.method === 'GET' || req.method === 'HEAD') return handleSnapshot(req, res);
      if (req.method === 'POST') {
        for (const [k, v] of Object.entries(corsHeaders(req))) res.setHeader(k, v);
        return await handlePublish(req, res);
      }
      return json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
    }
    if (pathname === '/setup') return isLocal(req) ? setupPage(res) : send(res, 404, 'Not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  } catch (e) {
    log('error', e);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  server.listen(PORT, HOST, () => {
    log(`VS Clearance web on http://${HOST}:${PORT}  (pairing info: http://${HOST}:${PORT}/setup)`);
  });
}
