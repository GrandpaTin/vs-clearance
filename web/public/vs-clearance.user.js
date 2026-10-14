// ==UserScript==
// @name         VS Clearance — Vitamin Shoppe deal finder
// @namespace    vs-clearance
// @version      3.1.1.56
// @description  Every Vitamin Shoppe clearance deal with real cart prices, your store's shelf stock, filters, and an AI review prompt.
// @match        https://www.vitaminshoppe.com/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// @downloadURL  https://grandpatin.github.io/vs-clearance/vs-clearance.user.js
// @updateURL    https://grandpatin.github.io/vs-clearance/vs-clearance.user.js
// @homepageURL  https://grandpatin.github.io/vs-clearance/
// ==/UserScript==

(() => {
'use strict';
const __VSX_CSS__ = ":host {\n  --navy: #012169; --navy-dark: #001540; --sky: #15BEF0;\n  --bg: #F8FAFC; --surface: #FFFFFF; --surface-2: #F1F5F9; --text: #0F172A; --muted: #64748B;\n  --outline: #CBD5E1; --hairline: #E2E8F0; --price: #047857; --em-bg: #D1FAE5; --em-fg: #065F46;\n  --sky-bg: #E0F2FE; --sky-fg: #0369A1; --amber-bg: #FEF3C7; --amber-fg: #92400E; --red-bg: #FEE2E2; --red-fg: #991B1B;\n  --header: var(--navy); --search: var(--navy-dark); --link: var(--navy);\n  color-scheme: light dark;\n}\n@media (prefers-color-scheme: dark) {\n  :host {\n    --bg: #0B1120; --surface: #111827; --surface-2: #1E293B; --text: #F8FAFC; --muted: #94A3B8;\n    --outline: #334155; --hairline: #1F2A3C; --price: #34D399; --em-bg: #064E3B; --em-fg: #A7F3D0;\n    --sky-bg: #0C4A6E; --sky-fg: #BAE6FD; --amber-bg: #451A03; --amber-fg: #FCD34D; --red-bg: #7F1D1D; --red-fg: #FECACA;\n    --header: var(--navy-dark); --search: #1E293B; --link: var(--sky);\n  }\n}\n* { box-sizing: border-box; }\n[hidden] { display: none !important; }\nbutton { font: inherit; color: inherit; cursor: pointer; }\n:focus-visible { outline: 3px solid var(--sky); outline-offset: 2px; }\n.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }\n.muted { color: var(--muted); margin: 0; }\n.err { color: var(--red-fg); margin: 0; }\n\n.launcher {\n  position: fixed; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483646;\n  display: flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 0 20px; min-height: 52px;\n  background: linear-gradient(135deg, #34D399, #047857); color: #fff; font: 700 17px/1 system-ui, -apple-system, sans-serif;\n  box-shadow: 0 8px 24px rgba(0,0,0,.3);\n}\n\n.app {\n  position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;\n  background: var(--bg); color: var(--text); font: 16px/1.4 system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif;\n  -webkit-text-size-adjust: 100%;\n}\n.top { background: var(--header); color: #fff; padding: calc(env(safe-area-inset-top) + 10px) 16px 12px; flex: none; }\n.top-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 900px; margin: 0 auto; }\n.top-actions { display: flex; }\nh1 { font-size: 1.35rem; margin: 0; }\n.subtitle { margin: 2px 0 0; font-size: .85rem; opacity: .85; }\n.icon-btn { background: transparent; border: 0; border-radius: 50%; width: 44px; height: 44px; display: grid; place-items: center; font-size: 20px; }\n.icon-btn.on-dark { color: #fff; }\n.icon-btn.spin { animation: spin 1s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n.search { display: flex; align-items: center; gap: 8px; background: var(--search); border-radius: 12px; padding: 0 12px; margin: 10px auto 0; max-width: 900px; min-height: 50px; }\n.search input { flex: 1; min-width: 0; background: transparent; border: 0; color: #fff; font-size: 16px; padding: 12px 0; }\n.search input::placeholder { color: rgba(255,255,255,.7); }\n.search input:focus { outline: none; }\n\n.scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding-bottom: calc(32px + env(safe-area-inset-bottom)); }\n.scroll > * { max-width: 900px; margin-left: auto; margin-right: auto; }\n.banner { display: flex; align-items: center; gap: 10px; margin: 12px; border-radius: 12px; padding: 8px 8px 8px 14px; }\n.banner span { flex: 1; }\n.banner.warn { background: var(--amber-bg); color: var(--amber-fg); }\n.banner.bad { background: var(--red-bg); color: var(--red-fg); }\n.banner.info { background: var(--sky-bg); color: var(--sky-fg); }\n.text-btn { background: none; border: 0; font-weight: 700; padding: 10px 12px; min-height: 44px; border-radius: 8px; }\n\n.controls { padding: 12px 12px 4px; }\n.segmented { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--outline); border-radius: 999px; overflow: hidden; }\n.segmented button { background: transparent; border: 0; min-height: 44px; font-weight: 600; }\n.segmented button + button { border-left: 1px solid var(--outline); }\n.segmented button[aria-checked=\"true\"] { background: var(--sky-bg); color: var(--sky-fg); }\n.segmented button[aria-checked=\"true\"]::before { content: \"✓ \"; content: \"✓ \" / \"\"; }\n.store-row { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 8px; padding: 8px 12px; min-height: 52px;\n  background: var(--surface-2); border: 0; border-radius: 12px; text-align: left; }\n.store-text { flex: 1; display: flex; flex-direction: column; }\n.store-text small { color: var(--muted); }\n.chips { display: flex; gap: 8px; overflow-x: auto; padding: 8px 2px 0; scrollbar-width: none; }\n.chips::-webkit-scrollbar { display: none; }\n.chip { flex: none; border: 1px solid var(--outline); background: transparent; border-radius: 8px; min-height: 36px; padding: 6px 14px; font-weight: 600; color: var(--muted); white-space: nowrap; }\n.chip[aria-pressed=\"true\"] { background: var(--sky-bg); color: var(--sky-fg); border-color: transparent; }\n.chip[aria-pressed=\"true\"]::before { content: \"✓ \"; content: \"✓ \" / \"\"; }\n.chip.clear::after { content: \" ✕\"; content: \" ✕\" / \"\"; }\n\n.summary { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; background: var(--bg); padding: 10px 12px 8px 16px; border-bottom: 1px solid var(--hairline); }\n.count { flex: 1 0 auto; font-weight: 700; white-space: nowrap; }\n.tonal-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--sky-bg); color: var(--sky-fg); border: 0; border-radius: 999px; min-height: 40px; padding: 0 12px; font-weight: 700; white-space: nowrap; }\n.tonal-btn.wide { justify-content: center; }\n.sort { display: inline-flex; align-items: center; gap: 2px; color: var(--link); }\n.sort option { color: var(--text); background: var(--surface); }\n.sort select { background: transparent; color: var(--link); border: 0; font: inherit; font-weight: 700; min-height: 40px; max-width: 36vw; text-overflow: ellipsis; }\n\n.list { list-style: none; margin: 0 auto; padding: 8px 12px; display: grid; gap: 8px; }\n@media (min-width: 760px) { .list { grid-template-columns: 1fr 1fr; } }\n.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; display: grid; grid-template-columns: 88px 1fr; gap: 12px; padding: 12px 6px 6px 12px; }\n.thumb { width: 88px; height: 88px; border-radius: 12px; border: 1px solid var(--hairline); background: #fff; display: grid; place-items: center; overflow: hidden; text-decoration: none; font-size: 32px; }\n.thumb.none { background: var(--surface-2); }\n.thumb img { width: 82px; height: 82px; object-fit: contain; padding: 4px; }\n.body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }\n.brandline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }\n.brand { font-size: .75rem; letter-spacing: .06em; font-weight: 800; color: var(--link); text-transform: uppercase; }\n.title { font-weight: 600; color: var(--text); text-decoration: none; padding-right: 8px;\n  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }\n.prices { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }\n.price { font-size: 1.35rem; font-weight: 800; color: var(--price); }\n.was { color: var(--muted); text-decoration: line-through; }\n.tag { font-size: .75rem; font-weight: 800; border-radius: 6px; padding: 2px 6px; }\n.tag.off, .tag.drop { background: var(--em-bg); color: var(--em-fg); }\n.tag.new { background: var(--sky-bg); color: var(--sky-fg); }\n.note { font-size: .85rem; color: var(--muted); }\n.pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }\n.pill { background: var(--surface-2); color: var(--muted); font-size: .8rem; border-radius: 6px; padding: 2px 6px; }\n.rating { font-size: .85rem; color: var(--muted); }\n.foot { display: flex; align-items: center; min-height: 44px; }\n.stock { flex: 1; display: flex; align-items: center; gap: 6px; font-size: .9rem; font-weight: 500; }\n.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--outline); flex: none; }\n.dot.good { background: var(--em-fg); }\n.dot.bad { background: var(--red-fg); }\n.foot .icon-btn { color: var(--muted); }\n\n.status { text-align: center; padding: 40px 28px; display: grid; justify-items: center; gap: 8px; }\n.badge { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; background: var(--sky-bg); font-size: 40px; }\n.status h2 { margin: 8px 0 0; font-size: 1.15rem; }\n.status p { margin: 0; color: var(--muted); max-width: 460px; }\n.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }\n.primary-btn { background: var(--navy); color: #fff; border: 0; border-radius: 999px; min-height: 44px; padding: 0 20px; font-weight: 700; }\n@media (prefers-color-scheme: dark) { .primary-btn { background: var(--sky); color: var(--navy-dark); } }\na.primary-btn { display: inline-flex; align-items: center; text-decoration: none; }\n.outline-btn { background: transparent; border: 1px solid var(--outline); border-radius: 999px; min-height: 44px; padding: 0 18px; font-weight: 700; }\n.skeleton { height: 140px; border-radius: 16px; background: linear-gradient(90deg, var(--surface-2), var(--surface), var(--surface-2)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }\n@keyframes shimmer { to { background-position: -200% 0; } }\n@media (prefers-reduced-motion: reduce) { .skeleton, .icon-btn.spin { animation: none; } }\n\n.sheet-wrap { position: absolute; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; z-index: 5; }\n.sheet { background: var(--surface); color: var(--text); width: 100%; max-width: 720px; max-height: 88%; overflow-y: auto; overscroll-behavior: contain;\n  border-radius: 20px 20px 0 0; padding: 20px 16px calc(16px + env(safe-area-inset-bottom)); display: grid; gap: 12px; }\n@media (min-width: 760px) { .sheet-wrap { align-items: center; } .sheet { border-radius: 20px; } }\n.sheet h2 { margin: 0; font-size: 1.25rem; }\n.store-form { display: flex; gap: 8px; }\n.store-form input { flex: 1; min-width: 0; font-size: 16px; padding: 12px; border: 1px solid var(--outline); border-radius: 12px; background: var(--surface); color: var(--text); }\n.stores { display: grid; gap: 8px; }\n.store { display: flex; gap: 8px; text-align: left; background: var(--surface-2); border: 2px solid transparent; border-radius: 12px; padding: 12px; }\n.store.selected { background: var(--sky-bg); border-color: var(--sky-fg); }\n.store[aria-disabled=\"true\"] { opacity: .7; }\n.store-main { flex: 1; display: flex; flex-direction: column; }\n.store-main span, .store-main small { color: var(--muted); }\n.store-main small.err { color: var(--red-fg); }\n.dist { color: var(--link); font-weight: 700; white-space: nowrap; }\n.scope { background: var(--sky-bg); color: var(--sky-fg); border-radius: 12px; padding: 12px; }\n.scope b { display: block; }\n.sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n.sheet-actions button { min-height: 48px; }\ndetails summary { cursor: pointer; font-weight: 700; min-height: 44px; display: flex; align-items: center; }\npre { white-space: pre-wrap; background: var(--surface-2); border-radius: 12px; padding: 12px; max-height: 300px; overflow: auto; font-size: 12px; margin: 0; }\n.close { justify-self: end; }\n.toast { position: absolute; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); background: #1E293B; color: #fff; padding: 12px 18px; border-radius: 12px; max-width: calc(100% - 32px); z-index: 6; }\n\n.share-line { display: flex; align-items: center; gap: 4px; margin: 0 12px 12px; padding: 4px 4px 4px 14px; border-radius: 12px; background: var(--surface-2); color: var(--muted); font-size: .9rem; }\n.share-line span { flex: 1; }\n.share-line a { color: var(--link); text-decoration: none; }\n\n.foot-note { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; column-gap: 14px; color: var(--muted); font-size: .8rem; padding: 4px 16px 24px; }\n.link-btn { background: none; border: 0; color: inherit; text-decoration: underline; font: inherit; padding: 8px 4px; min-height: 40px; cursor: pointer; }\n.app:focus { outline: none; }\n";
const __VSX_VERSION__ = "3.1.1.56";
const __VSX_HOME__ = "https://grandpatin.github.io/vs-clearance/";
// Pure deal logic shared by the web app and its tests. Mirrors the Android app's
// DealItem / DealFilters / AiPrompt so both show identical prices and orderings.

const SORTS = [
  { id: 'discount', label: 'Biggest discount', short: 'Discount' },
  { id: 'priceAsc', label: 'Lowest price', short: 'Cheapest' },
  { id: 'priceDesc', label: 'Highest price', short: 'Priciest' },
  { id: 'value', label: 'Best value (lowest cost per serving)', short: 'Value' },
  { id: 'savings', label: 'Most dollars saved', short: 'Savings' },
  { id: 'brand', label: 'Brand A–Z', short: 'Brand' }
];
const FLOORS = [0, 25, 50, 65, 75];
const AI_MAX_ITEMS = 35;

const cents = (p) => Math.round(p * 100);
const pos = (v) => (typeof v === 'number' && v > 0 ? v : null);

/** Snapshot item (Android LocalStore format, -1 = absent) -> normalized deal. */
/** A shared row the page can show: an id, a link and a real price. */
function isUsableItem(o) {
  return !!o && typeof o === 'object' && (typeof o.id === 'string' || typeof o.id === 'number') && String(o.id) !== '' &&
    typeof o.url === 'string' && /^https?:\/\//i.test(o.url) && Number.isFinite(Number(o.site)) && Number(o.site) > 0;
}

// Text fields from shared JSON: a string (or number) or nothing — never an object or array.
const txt = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() || null : null;
const posNum = (v) => (Number(v) > 0 ? Number(v) : null);

function normalizeItem(o, stock) {
  const jda = o.jda || null;
  const qty = stock && jda != null ? (jda in stock ? stock[jda] : null) : null;
  return {
    id: String(o.id),
    jda,
    brand: txt(o.brand) || '',
    title: txt(o.title) || String(o.id),
    url: o.url.replace(/^http:\/\//i, 'https://'),
    img: typeof o.img === 'string' && /^https?:\/\//i.test(o.img) ? o.img.replace(/^http:\/\//i, 'https://') : null,
    list: Math.max(Number.isFinite(Number(o.list)) ? Number(o.list) : 0, Number(o.site)),
    site: Number(o.site),
    adp: pos(o.adp),
    cart: posNum(o.cart),
    servings: posNum(o.servings),
    servingSize: txt(o.servingSize),
    form: txt(o.form),
    category: txt(o.category),
    variants: txt(o.variants),
    rating: pos(o.rating) != null && o.rating <= 5 ? o.rating : null,
    reviews: posNum(o.reviews) || 0,
    oos: !!o.oos,
    pickup: o.pickup !== false,
    qty
  };
}

function cartEstimate(d) {
  if (!d.cart || d.cart < 1 || d.cart > 95) return null;
  const est = cents(d.list * (1 - d.cart / 100)) / 100;
  return est < d.site - 0.005 ? est : null;
}
const bestPrice = (d) => cartEstimate(d) ?? d.site;
function percentOff(list, price) {
  if (!(list > 0) || !(price < list)) return 0;
  const pct = Math.round(((list - price) / list) * 100);
  return Number.isFinite(pct) ? Math.min(99, Math.max(0, pct)) : 0;
}
const discount = (d) => percentOff(d.list, bestPrice(d));
const savings = (d) => Math.max(0, d.list - bestPrice(d));
const perServing = (d) => (d.servings ? bestPrice(d) / d.servings : null);
// Only a deal when it beats what you'd pay anyway, the in-cart price included.
const autoDeliveryDeal = (d) => (d.adp && d.adp < bestPrice(d) - 0.005 ? d.adp : null);

const money = (v) => '$' + v.toFixed(2);
function perServingLabel(d) {
  const p = perServing(d);
  if (p == null) return null;
  return p < 1 ? `${Math.round(p * 100)}¢/serving` : `${money(p)}/serving`;
}

function sizeLabel(title) {
  const m = /\(([^()]*\d[^()]*)\)\s*$/.exec(title || '');
  const s = m && m[1].trim();
  return s && s.length <= 40 ? s : null;
}
const SHORT = [
  ['Fluid Ounces', 'fl oz'], ['Fluid Ounce', 'fl oz'],
  ['Vegetarian Capsules', 'veg caps'], ['Veggie Capsules', 'veg caps'], ['Veggie Caps', 'veg caps'],
  ['Vegan Capsules', 'vegan caps'], ['Liquid Capsules', 'liquid caps'], ['Capsules', 'caps'],
  ['Tablet(s)', 'tabs'], ['Tablets', 'tabs'], ['Softgels', 'softgels'], ['Servings', 'servings'],
  ['Gummies', 'gummies'], ['Lozenges', 'lozenges'], ['Single Serving Packets', 'packets'], ['Single Serving Packet', 'packet'],
  ['Single Serve Packets', 'packets'], ['Stick Packs', 'stick packs'], ['Packets', 'packets'], ['Bars', 'bars']
];
const SHORT_RE = SHORT.map(([a, b]) => [new RegExp(a.replace(/[()]/g, '\\$&'), 'gi'), b]);
function shortSize(size) {
  let out = size;
  for (const [re, b] of SHORT_RE) out = out.replace(re, b);
  return out;
}

/** Fact pills: pack size first (survives title truncation), servings only when they add information. */
const factsMemo = new WeakMap();
function facts(d) {
  let f = factsMemo.get(d);
  if (!f) { f = factsOf(d); factsMemo.set(d, f); }
  return f;
}
function factsOf(d) {
  const size = sizeLabel(d.title);
  const out = [];
  out.push(size ? shortSize(size) : d.form);
  if (d.servings) {
    const lead = size ? parseInt(size, 10) : NaN;
    const repeats = size && (/serving/i.test(size) || lead === d.servings);
    if (!repeats) out.push(`${d.servings} servings`);
  }
  out.push(perServingLabel(d), d.variants);
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------- search

function normalize(text) {
  return (text || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// "probiotics" and "probiotic" are the same search; "glass" keeps its s.
const stem = (w) => (w.length >= 5 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);

/**
 * Search units: a short word ("d", "3", "k2") belongs to the word before it, so "vitamin d" means
 * the phrase, not "vitamin" plus any word containing a d.
 */
function searchUnits(query) {
  const units = [];
  for (const t of normalize(query).split(' ').filter(Boolean)) {
    if (t.length <= 2 && units.length) units[units.length - 1] += ' ' + t;
    else units.push(stem(t));
  }
  return units;
}

/** Text prepared once per item: words, "D-3" joined as "d3", and the spaceless form with word starts. */
function prepare(text) {
  const hay = normalize(text);
  const joined = hay.replace(/\b([a-z]{1,2}) (?=\d)/g, '$1');
  const words = hay.split(' ');
  const starts = [];
  let at = 0;
  for (const w of words) { starts.push(at); at += w.length; }
  return { hay, joined, words, starts, flat: words.join('') };
}

// A unit matches at the start of a word ("d3" finds "D3", not "drink 24g"). Written-together forms
// ("omega3", "fishoil") may run across words but must still start at a word; inside a single word
// a long enough unit may sit anywhere ("berry" in "strawberry"), never straddling two words.
function unitMatches(unit, t) {
  const parts = unit.split(' ');
  if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
    // A trailing letter or number must end there (or run into digits): "vitamin c" isn't "Vitamin Code".
    const at = new RegExp('(^| )' + unit + '(?=$| |\\d)');
    return at.test(t.hay) || at.test(t.joined);
  }
  if ((' ' + t.hay).includes(' ' + unit) || (' ' + t.joined).includes(' ' + unit)) return true;
  const squashed = unit.replace(/ /g, '');
  if (squashed.length < 4) return false;
  if (t.starts.some((i) => t.flat.startsWith(squashed, i))) return true;
  return squashed.length >= 5 && t.words.some((w) => w.includes(squashed));
}

// Each item's searchable text is prepared once, not on every keystroke for every filter count.
const prepared = new WeakMap();
function preparedFor(d) {
  let t = prepared.get(d);
  if (!t) { t = prepare([d.brand, d.title, d.category, d.form].filter(Boolean).join(' ')); prepared.set(d, t); }
  return t;
}

function matcher(query) {
  const units = searchUnits(query);
  const whole = units.join(' ');
  return (d) => {
    if (!units.length) return true;
    const t = preparedFor(d);
    return unitMatches(whole, t) || units.every((u) => unitMatches(u, t));
  };
}

const FORMATS = /\b(creamer|shake|drink|drinks|bar|bars|coffee|soda|tea|cookie|cookies|chips|snack|bites|roll|brownie|cereal|pancake|candy|candies|chews|popcorn|jerky|pretzels|wafers|puffs|stix|crisps)\b/;
const sameWords = (a, b) => !!a && normalize(a).split(' ').map(stem).join(' ') === b;

/**
 * How directly an item is the thing searched for, so "magnesium" puts Magnesium Citrate above a
 * creamer "with Magnesium": 3 = it's the category or the title starts with it, 2 = it's in the
 * product name before "with", 1 = elsewhere in the title, 0 = only brand/category/form.
 */
function relevance(query) {
  const whole = searchUnits(query).join(' ');
  return (d) => {
    if (!whole) return 0;
    const title = prepare(d.title);
    // Only the store's category says it: above "...with X", below products named for it.
    if (!unitMatches(whole, title)) return unitMatches(whole, prepare(cleanCategory(d.category) || '')) ? 1.5 : 0;
    const head = d.title.split(/\s+with\s+|,\s/i)[0];
    const headText = normalize(head);
    const startsWith = (' ' + headText).startsWith(' ' + whole) ||
      (' ' + headText.replace(/\b([a-z]{1,2}) (?=\d)/g, '$1')).startsWith(' ' + whole);
    // "Collagen Creamer" or "Protein Bar" is a different product unless that's what was searched.
    const otherKind = FORMATS.test(headText) && !FORMATS.test(whole);
    if (otherKind) return 1;
    if (startsWith || sameWords(cleanCategory(d.category), whole)) return 3;
    return unitMatches(whole, prepare(head)) ? 2 : 1;
  };
}

// ---------------------------------------------------------------------------- filter & sort

const tiebreak = (a, b) =>
  a.brand.toLowerCase().localeCompare(b.brand.toLowerCase()) ||
  a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
  a.id.localeCompare(b.id);

function sortDeals(items, sort) {
  const by = {
    discount: (a, b) => discount(b) - discount(a) || bestPrice(a) - bestPrice(b),
    priceAsc: (a, b) => bestPrice(a) - bestPrice(b),
    priceDesc: (a, b) => bestPrice(b) - bestPrice(a),
    value: (a, b) => {
      const pa = perServing(a), pb = perServing(b);
      if ((pa == null) !== (pb == null)) return pa == null ? 1 : -1;
      return (pa ?? 0) - (pb ?? 0);
    },
    savings: (a, b) => savings(b) - savings(a),
    brand: () => 0
  }[sort] || (() => 0);
  return [...items].sort((a, b) => by(a, b) || tiebreak(a, b));
}

function applyFilters(items, c) {
  const match = matcher(c.query);
  const out = items.filter((d) =>
    discount(d) >= (c.minDiscount || 0) &&
    (!c.category || inCategory(d.category, c.category)) &&
    (!c.onlyIds || c.onlyIds.has(d.id)) &&
    (c.mode === 'pickup' ? (d.qty || 0) > 0 : !c.inStockOnly || !d.oos) &&
    match(d)
  );
  // Counts (chips, "anything at all?") don't need the order.
  if (c.unsorted) return out;
  const sorted = sortDeals(out, c.sort);
  if (!normalize(c.query)) return sorted;
  // Stable: within each group the chosen sort still applies.
  const rank = relevance(c.query);
  return sorted.map((d) => [rank(d), d]).sort((a, b) => b[0] - a[0]).map((e) => e[1]);
}

/** "Women's Probiotics" and "Refrigerated Probiotics" belong to "Probiotics". */
function inCategory(category, family) {
  const c = (cleanCategory(category) || '').toLowerCase();
  const f = family.toLowerCase();
  return c === f || c.endsWith(' ' + f);
}

/** [family, count] for every category, folding sub-categories into a family that also exists. */
/** "Herbs A-E" -> "Herbs", "Other Protein" -> "Protein", "Herbs & Natural Remedies" -> "Herbs". */
const cleanMemo = new Map();
function cleanCategory(c) {
  if (!c) return c;
  let hit = cleanMemo.get(c);
  if (hit === undefined) { hit = cleanCategoryOf(c); cleanMemo.set(c, hit); }
  return hit;
}
function cleanCategoryOf(c) {
  let t = c.trim().replace(/\s+[A-Z]\s*-\s*[A-Z]$/, '').replace(/^Other\s+/i, '');
  if (/^herbs?\b/i.test(t)) t = 'Herbs';
  return t || c;
}

function categoryCounts(items) {
  const names = [...new Set(items.map((d) => cleanCategory(d.category)).filter(Boolean))];
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const familyOf = new Map(names.map((n) => {
    const words = n.split(' ');
    for (let i = 1; i < words.length; i++) {
      const tail = words.slice(i).join(' ');
      if (lower.has(tail.toLowerCase())) return [n, names.find((x) => x.toLowerCase() === tail.toLowerCase())];
    }
    return [n, n];
  }));
  const counts = new Map();
  for (const d of items) if (d.category) { const f = familyOf.get(cleanCategory(d.category)); counts.set(f, (counts.get(f) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topCategories(items, limit = 10) {
  return categoryCounts(items).slice(0, limit).map((e) => e[0]);
}

// ---------------------------------------------------------------------------- changes since last visit

/** New SKUs and real price drops vs the list this viewer saw last time ({id: bestPrice}). */
function changes(previous, current) {
  const prevIds = Object.keys(previous || {});
  if (!prevIds.length) return { newIds: new Set(), drops: new Map() };
  const newIds = new Set(current.filter((d) => !(d.id in previous)).map((d) => d.id));
  if (prevIds.length >= 20 && newIds.size > current.length / 2) return { newIds: new Set(), drops: new Map() };
  const drops = new Map();
  for (const d of current) {
    const old = previous[d.id];
    if (old != null && cents(old) > cents(bestPrice(d))) drops.set(d.id, old);
  }
  return { newIds, drops };
}
function prune(ch, current) {
  const now = new Map(current.map((d) => [d.id, d]));
  return {
    newIds: new Set([...ch.newIds].filter((id) => now.has(id))),
    drops: new Map([...ch.drops].filter(([id, old]) => now.has(id) && cents(old) > cents(bestPrice(now.get(id)))))
  };
}

// ---------------------------------------------------------------------------- AI prompt

function aiPrompt(deals, total, store, mode) {
  const shown = deals.slice(0, AI_MAX_ITEMS);
  // A store without online pickup: everything there is walk-in only.
  const walkInStore = !!store && store.pickup === false;
  const where = mode === 'pickup' && store
    ? `on the shelf at ${/vitamin shoppe/i.test(store.name) ? store.name : 'The Vitamin Shoppe, ' + store.name} ${storeAddress(store) ? ` (${storeAddress(store)})` : ''}${walkInStore ? ' — walk-in only (this store has no online pickup)' : shown.some((d) => !d.pickup) ? ' — some walk-in only (no online pickup)' : ', all available for store pickup'}`
    : store ? `from The Vitamin Shoppe online (stock also checked at ${store.name})` : 'from The Vitamin Shoppe online';
  const scope = total > shown.length
    ? `These are the top ${shown.length} of ${total} deals matching my filters.`
    : `These are all ${shown.length} deals matching my filters.`;
  const cartNote = shown.some((d) => cartEstimate(d) != null)
    ? '\nNote: prices marked "≈ in cart" are estimates — the site applies that clearance discount only at checkout.\n' : '';
  const lines = shown.map((d, i) => {
    const est = cartEstimate(d);
    const off = discount(d);
    const price = est != null
      ? `≈${money(est)} in cart (list ${money(d.list)}; ${d.cart}% off applied at checkout` +
        (cents(d.site) !== cents(d.list) ? `, page shows ${money(d.site)})` : ')')
      : money(d.site) + (off ? ` (was ${money(d.list)}, ${off}% off)` : '');
    const details = [d.form, d.servings && `${d.servings} servings`, d.servingSize && `serving = ${d.servingSize}`, perServingLabel(d)]
      .filter(Boolean).join(' · ') || 'n/a';
    const avail = [d.oos ? 'out of stock online' : 'available online'];
    if (store && d.qty != null) avail.push(d.qty > 0 ? `${d.qty} at ${store.name}${d.pickup && !walkInStore ? '' : ' (walk-in only)'}` : `none at ${store.name}`);
    const adp = autoDeliveryDeal(d);
    return `${i + 1}. **${d.brand}** — ${d.title}\n   - Price: ${price}\n` +
      (adp ? `   - Auto Delivery price: ${money(adp)}\n` : '') +
      `   - Format: ${details}\n   - Availability: ${avail.join('; ')}\n   - Link: ${d.url}`;
  }).join('\n\n');
  return `You are an expert clinical pharmacologist, biochemist, and evidence-based longevity physician.

I'm considering ${shown.length} clearance supplement deals ${where}. ${scope}
Critically evaluate them for scientific efficacy, bioavailability of the chemical form, formulation safety, and true value per effective dose.

### Evaluation criteria
1. **Evidence score (/10)** — quality of human clinical evidence for the main ingredient's intended use.
2. **Bioavailability & chemical form** — e.g. magnesium glycinate vs oxide, methylcobalamin vs cyanocobalamin, triglyceride vs ethyl-ester omega-3. Penalize poorly absorbed or irritating forms.
3. **Value per effective dose** — use the price, servings and cost per serving given; account for under-dosing.
4. **Verdict** — \`BUY\` (strong evidence, good form, great value), \`CONSIDER\` (useful for specific goals or acceptable if budget-limited), \`PASS\` (weak evidence, poor form, under-dosed, or proprietary blend).

### What I want back
1. A Markdown table: | # | Brand & product | Price (was, % off) | Key active & dose | Evidence /10 | Form rating | Verdict |
2. **Top 3 value picks** with the pharmacology behind each, why the discount matters, and a typical dosing protocol.
3. **Red flags** — items to skip despite the discount (fillers, under-dosing, poor forms, safety concerns).
If you don't know a product's exact dose, say so rather than guessing.
${cartNote}
---

### Deals (${shown.length})

${lines}`;
}

function storeAddress(s) {
  const part = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const street = [part(s.a1 ?? s.address1), part(s.a2 ?? s.address2)].filter(Boolean).join(', ');
  const place = [part(s.city), [part(s.state), part(s.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, place].filter(Boolean).join(', ');
}

/**
 * Since October 2026 the search API answers its clearance path with HTTP 404 while still returning
 * the full listing. A 404 that carries products is a real answer; one without them is an error.
 */
function isListingDespiteStatus(status, data) {
  return status === 404 && Array.isArray(data?.response?.products) && data.response.products.length > 0;
}

function relativeTime(ms, now = Date.now()) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return 'recently';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------------------------------------------------------------------------- site API (used by the userscript)
// Endpoints the site's own pages call; same as the Android app's VsApi.kt.

const SITE = 'https://www.vitaminshoppe.com';
const BROWSE = 'https://browse.vitaminshoppe.com';
const PAGE_SIZE = 200; // the search API rejects larger pages
const clearanceUrl = (page) =>
  `${BROWSE}/search/product/search?path=/cl/clearance/0&format=json&rpp=${PAGE_SIZE}&pageno=${page}&sessionId=&desktopView=false`;
const storeSearchUrl = (q) => `${BROWSE}/inventory/api/inventory/get-stores-with-inv?address=${encodeURIComponent(q.trim()).replace(/%20/g, '+')}`;
const inventoryUrl = (storeId, skus) =>
  `${BROWSE}/inventory/api/inventory/pdpinventory?storeId=${encodeURIComponent(storeId)}&skuIds=${skus.join(',')}&source=WEB`;

const str = (v) => (v == null ? null : String(v).trim() || null);
const decode = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&reg;/g, '®').replace(/&trade;/g, '™');
const absoluteUrl = (p) => p.startsWith('https://') ? p : p.startsWith('http://') ? 'https://' + p.slice(7)
  : p.startsWith('//') ? 'https:' + p : `${SITE}/${p.replace(/^\/+/, '')}`;
function parseCartDiscount(descriptor) {
  const m = /(\d{1,2})\s*%\s*off\b.*\bin\s+cart/i.exec(descriptor || '');
  return m ? Number(m[1]) : null;
}

/** One product from the listing API -> raw item (same shape the Android app stores). null = unusable row. */
function parseProduct(p) {
  if (!p || (p.type || 'Product') !== 'Product' || !str(p.skuId) || !p.price || !str(p.pdpUrl)) return null;
  const list = Number(p.price.listPrice);
  const active = Number(p.price.activePrice) > 0 ? Number(p.price.activePrice) : Number(p.price.salePrice);
  if (!(list > 0) || !(active > 0)) return null;
  return {
    id: str(p.skuId), jda: str(p.jdaSkuId), brand: decode(str(p.brand) || ''),
    title: decode(str(p.displayName) || str(p.longDisplayName) || str(p.skuId)),
    url: absoluteUrl(str(p.pdpUrl)), img: str(p.imageUrl) ? absoluteUrl(str(p.imageUrl)) : '',
    list: Math.max(list, active), site: active,
    adp: Number(p.price.adpPrice) > 0 ? Number(p.price.adpPrice) : -1,
    cart: parseCartDiscount(p.descriptorMessage) ?? -1,
    servings: Number(p.numberOfServings) > 0 ? Number(p.numberOfServings) : -1,
    servingSize: str(p.servingSize) || '', form: str(p.form) || '', category: str(p.category) || '',
    variants: str(p.variantCountMessage) || '', rating: Number(p.starRating) > 0 ? Number(p.starRating) : -1,
    reviews: Math.max(0, Number(p.totalReviewCount) || 0),
    oos: !!p.temporaryOutOfStock || p.purchasable === false,
    pickup: p.deliveryMethods ? p.deliveryMethods.bopusEligible !== false : true
  };
}

function parseClearancePage(json) {
  const r = json && json.response;
  if (!r) throw new Error('Unexpected response from vitaminshoppe.com');
  const items = (r.products || []).map(parseProduct).filter(Boolean);
  return { items, totalPages: Math.max(1, Number(r.pagination?.totalPages) || 1), total: Number(r.numProducts) || items.length };
}

const tidyTime = (t) => String(t).trim().replace(/^0(\d)/, '$1');
function parseStores(json) {
  const stores = (json?.stores || []).map((s) => {
    const a = s.address || {};
    const hours = (s.store_hours_fmtd_12 || []).filter((h) => h.day && h.start_time && h.end_time)
      .map((h) => `${h.day}: ${tidyTime(h.start_time)} – ${tidyTime(h.end_time)}`);
    return {
      id: String(s.storeId), name: str(s.name) || [a.city, a.state].filter(Boolean).join(', '),
      a1: str(a.address1) || '', a2: str(a.address2) || '', city: str(a.city) || '', state: str(a.state) || '',
      zip: str(s.postal_code) || '', phone: str(s.phone_number) || '',
      dist: Number(s.dist_from_cur_loc) >= 0 ? Number(s.dist_from_cur_loc) : -1, hours,
      pickup: s.bopus !== false, closed: !!s.temporarilyClosed
    };
  }).filter((s) => s.id && s.id !== 'undefined').sort((x, y) => (x.dist < 0 ? 1e9 : x.dist) - (y.dist < 0 ? 1e9 : y.dist));
  const status = stores.length ? 'found' : json?.RESPONSE_CODE === 'SERVICE_NOT_AVAILABLE' ? 'unrecognized' : 'none';
  return { stores, status };
}

function parseInventory(json) {
  const out = {};
  for (const o of json?.skuInventory || []) {
    if (o.skuId == null) continue;
    const qty = parseInt(String(o.quantity ?? '').trim(), 10);
    out[String(o.skuId)] = (o.service || 'available').toLowerCase() === 'available' && qty > 0 ? qty : 0;
  }
  return out;
}

/** Picks today's line from "Monday - Friday: 9 AM – 9 PM" style hours. */
function todaysHours(lines, date = new Date()) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = date.getDay();
  for (const line of lines || []) {
    const [label, ...rest] = line.split(':');
    const hours = rest.join(':').trim();
    const parts = label.split(/\s*[-–]\s*/).map((p) => days.indexOf(p.trim().toLowerCase()));
    const hit = parts.length === 1 ? parts[0] === today : parts.length === 2 && parts[0] >= 0 && today >= parts[0] && today <= parts[1];
    if (hit && hours) return `Today: ${hours}`;
  }
  return null;
}

// VS Clearance overlay. Runs inside the user's own browser on vitaminshoppe.com and calls the
// same JSON endpoints the site's pages call, with the user's own session. Built into a single
// userscript by scripts/build-userscript.mjs (core.js functions are in scope there).


(function vsClearance() {
  if (window.__vsClearance) return;
  window.__vsClearance = true;

  const KEY = 'vsx.';
  const get = (k, d) => { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class Blocked extends Error {}
  /** The site answered in a way this version doesn't understand: an update may fix it. */
  class SiteChanged extends Error {}

  async function getJson(url) {
    let res;
    try {
      res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    } catch {
      throw new Error(navigator.onLine === false ? "You're offline." : "Couldn't reach vitaminshoppe.com.");
    }
    if (res.status === 403) throw new Blocked('Vitamin Shoppe wants to confirm a person is browsing.');
    if (!res.ok && res.status !== 404) throw new Error(httpTrouble(res.status));
    let data;
    const text = await res.text().catch(() => '');
    try { data = JSON.parse(text); } catch {
      if (res.status === 404) {
        if (url.includes('/search/product/search')) throw new Error("Vitamin Shoppe didn't send the deals list.");
        if (url.includes('get-stores-with-inv')) throw new Error('Store search is unavailable right now. Try again in a minute.');
        throw new Error('Vitamin Shoppe didn\'t answer as expected.');
      }
      // A page instead of data: DataDome's check is a person-check; anything else (Wi-Fi login,
      // maintenance page) isn't, and "Reload page" wouldn't help.
      if (res.headers.get('x-datadome') || /captcha-delivery|datadome/i.test(text)) throw new Blocked('Vitamin Shoppe wants to confirm a person is browsing.');
      throw new Error('Vitamin Shoppe sent an unexpected page.');
    }
    if (!res.ok && !isListingDespiteStatus(res.status, data)) {
      if (res.status === 404 && url.includes('/search/product/search')) {
        // This endpoint answers 404 normally; an empty one is a hiccup, a different shape is a real change.
        if (Array.isArray(data?.response?.products)) throw new Error('Vitamin Shoppe sent an empty clearance list.');
        throw new SiteChanged("Vitamin Shoppe's clearance search changed.");
      }
      throw new Error(httpTrouble(res.status));
    }
    return data;
  }

  // ------------------------------------------------------------------- state

  const cache = get('cache', null); // { savedAt, items: raw[] }
  const state = {
    open: false,
    raw: cache?.items || [],
    savedAt: cache?.savedAt || null,
    items: [],
    store: get('store', null),
    stock: get('stock', null), // { storeId, at, map }
    query: '',
    category: get('category', null),
    floor: get('floor', 0),
    sort: get('sort', 'discount'),
    inStockOnly: get('inStockOnly', true),
    mode: get('mode', 'ship'),
    onlyChanges: false,
    changes: { newIds: new Set(), drops: new Map() },
    loading: false,
    stockLoading: false,
    error: null,
    blocked: false,
    stockError: null,
    sheet: null, // 'stores' | 'prompt'
    share: get('share', null), // { url, token } when this browser shares its list to the owner's page
    shareStatus: get('shareStatus', null) // { at, error }
  };
  const prefs = () => { put('category', state.category); put('floor', state.floor); put('sort', state.sort); put('inStockOnly', state.inStockOnly); put('mode', state.mode); put('store', state.store); };

  function rebuild() {
    const map = state.store && state.stock?.storeId === state.store.id ? state.stock.map : null;
    state.items = state.raw.map((o) => normalizeItem(o, map));
    if (state.mode === 'pickup' && !map) state.mode = state.store ? state.mode : 'ship';
  }
  function restoreMarks() {
    const m = get('marks', null);
    if (m) state.changes = prune({ newIds: new Set(m.newIds), drops: new Map(Object.entries(m.drops)) }, state.items);
  }
  rebuild();
  restoreMarks();

  // ------------------------------------------------------------------- loading

  async function loadDeals() {
    if (state.loading) return;
    state.loading = true; state.error = null; state.blocked = false; state.partialNote = null; render();
    try {
      const first = parseClearancePage(await getJson(clearanceUrl(1)));
      let raw = first.items;
      let partial = false;
      for (let p = 2; p <= Math.min(first.totalPages, 25); p++) {
        try {
          const items = parseClearancePage(await getJson(clearanceUrl(p))).items;
          if (!items.length) { partial = true; break; }
          raw = raw.concat(items);
        } catch (e) {
          if (e instanceof Blocked) throw e;
          partial = true; break;
        }
      }
      // A cut-short list replaces the saved one only if it's nearly as complete.
      if (partial && raw.length < 0.8 * state.raw.length) throw new Error('Vitamin Shoppe only sent part of the clearance list.');
      const seen = new Set();
      raw = raw.filter((o) => !seen.has(o.id) && seen.add(o.id));
      state.partialNote = partial ? `Vitamin Shoppe only sent part of the list (${raw.length} of about ${first.total}).` : null;
      // Clearance is never really empty; an empty answer is a hiccup, so keep the saved list.
      if (!raw.length) throw new Error('Vitamin Shoppe sent an empty clearance list.');
      const previous = state.items;
      state.raw = raw; state.savedAt = Date.now();
      put('cache', { savedAt: state.savedAt, items: raw });
      rebuild();
      // New & price drops vs the last COMPLETE list this browser loaded (a partial one would make
      // everything it missed look new next time).
      const before = get('baseline', null) || Object.fromEntries(previous.map((d) => [d.id, bestPrice(d)]));
      if (partial) {
        state.changes = prune(state.changes, state.items);
      } else {
        const diff = changes(before, state.items);
        state.changes = diff.newIds.size || diff.drops.size ? diff : prune(state.changes, state.items);
        put('baseline', Object.fromEntries(state.items.map((d) => [d.id, bestPrice(d)])));
      }
      if (!state.changes.newIds.size && !state.changes.drops.size) state.onlyChanges = false;
      put('marks', { newIds: [...state.changes.newIds], drops: Object.fromEntries(state.changes.drops) });
      errorRetries = 0;
      const stockWaiting = state.stockError && !state.stockBlocked && Date.now() < nextStockRetry;
      if (state.store && !stockWaiting) loadStock({ onlyMissing: gapsOnly() || !stockIsDue() }); else publish();
    } catch (e) {
      state.error = e.message; state.blocked = e instanceof Blocked; state.siteChanged = e instanceof SiteChanged;
      if (!state.blocked && !state.siteChanged) nextErrorRetry = Date.now() + Math.min(15 * 2 ** errorRetries++, 120) * 60_000;
    } finally {
      state.loading = false; render();
    }
  }

  // Gentle automatic retries while the overlay sits open on an error: 15 min, 30, 60, then every 2 h.
  let errorRetries = 0, nextErrorRetry = 0, stockRetries = 0, nextStockRetry = 0;

  function httpTrouble(status) {
    return status >= 500 ? 'Vitamin Shoppe had a server hiccup.' : `Vitamin Shoppe turned the request down (error ${status}).`;
  }

  let stockRun = 0;
  /** Shelf stock for the chosen store. With onlyMissing, fresh stock is kept and only new items are asked about. */
  async function loadStock({ onlyMissing = false } = {}) {
    const store = state.store;
    if (!store || !state.raw.length) return;
    const run = ++stockRun;
    let keep = onlyMissing && hasStock() ? state.stock : null;
    // Marked partial but every SKU has a value (a full re-check kept old counts, then failed): check all.
    if (keep && keep.partial && state.raw.every((o) => !o.jda || o.jda in keep.map)) keep = null;
    // A full re-check starts from the old counts so batches it never reaches keep their last value.
    const prev = !keep && hasStock() ? state.stock : null;
    let skus = [...new Set(state.raw.map((o) => o.jda).filter(Boolean))];
    const total = skus.length;
    if (keep) skus = skus.filter((s) => !(s in keep.map));
    if (keep && !skus.length) {
      // Every item already has a count: an old shelf error no longer applies.
      if (state.stockError) { state.stockError = null; state.stockBlocked = false; stockRetries = 0; render(); }
      publish(); return;
    }
    // (An earlier error stays up while this runs, so the banner doesn't vanish and get re-announced.)
    state.stockLoading = true; render();
    const map = keep ? { ...keep.map } : prev ? { ...prev.map } : {};
    let reached = 0;
    try {
      for (let i = 0; i < skus.length; i += 100) {
        const batch = skus.slice(i, i + 100);
        Object.assign(map, Object.fromEntries(batch.map((s) => [s, 0])), parseInventory(await getJson(inventoryUrl(store.id, batch))));
        reached += batch.length;
      }
      if (run !== stockRun || state.store?.id !== store.id) return;
      state.stock = { storeId: store.id, at: keep ? keep.at : Date.now(), map };
      put('stock', state.stock);
      stockRetries = 0;
      state.stockError = null; state.stockBlocked = false; state.stockAdvice = null;
      rebuild();
      publish();
    } catch (e) {
      if (run === stockRun) {
        // Batches that did answer still count; items never reached stay "unknown".
        // (partial: stays "due", so the rest is asked for again)
        if (reached && state.store?.id === store.id) {
          state.stock = { storeId: store.id, at: keep ? keep.at : prev ? prev.at : Date.now(), map, partial: true };
          put('stock', state.stock);
          rebuild();
        }
        state.stockBlocked = e instanceof Blocked;
        if (!state.stockBlocked) nextStockRetry = Date.now() + Math.min(15 * 2 ** stockRetries++, 120) * 60_000;
        const missing = skus.length - reached;
        const connection = /offline|couldn't reach/i.test(e.message);
        // the title already says "Quick check needed"; the body says what for and what to do
        state.stockError = state.stockBlocked
          ? `Vitamin Shoppe wants to confirm a person is browsing before showing stock at ${store.name}. Reload the page, complete any check, and Deals reopens.`
          : (keep ? `Couldn't check the ${missing} new item${missing === 1 ? '' : 's'} at ${store.name}. `
            : reached ? `Couldn't check ${missing} of ${total} items at ${store.name}. ` : `Couldn't ${prev ? 're-check' : 'check'} shelf stock at ${store.name}. `) +
            `${e.message.replace(/\.?$/, '.')}`;
        state.stockAdvice = connection ? 'Check your connection and try again.' : 'Retry, or it will try again later.';
      }
    } finally {
      if (run === stockRun) { state.stockLoading = false; render(); }
    }
  }

  /** Shares the current list to the owner's VS Clearance page (only when paired via #vsdeals-share). */
  async function publish() {
    const share = state.share;
    if (!share || !state.raw.length) return;
    const stockOk = state.store && state.stock?.storeId === state.store.id;
    const body = JSON.stringify({
      v: 1, savedAt: state.savedAt, items: state.raw, store: state.store || null,
      stockStoreId: stockOk ? state.store.id : null, stock: stockOk ? state.stock.map : {}
    });
    let error = null;
    try {
      const res = await fetch(share.url.replace(/\/$/, '') + '/api/snapshot', {
        method: 'POST', mode: 'cors', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + share.token }, body
      });
      if (res.status === 401) error = 'Your share link rejected the token — re-open the pairing link.';
      else if (!res.ok) error = `Your share page answered ${res.status}.`;
    } catch {
      error = "Couldn't reach your share page (is the PC on?).";
    }
    state.shareStatus = { at: error ? state.shareStatus?.at || null : Date.now(), error };
    put('shareStatus', state.shareStatus);
    keepFocus(renderShareLine);
  }

  function renderShareLine() {
    const el = ref('shareLine');
    if (!el) return;
    const s = state.share;
    if (!s) { el.hidden = true; return; }
    const st = state.shareStatus;
    el.hidden = false;
    setHtml(el, `<span><span aria-hidden="true">📤</span> ${st?.error ? esc(st.error) : st?.at ? `Shared to your link ${relativeTime(st.at)}` : 'Sharing to your link'}</span>
      <a class="text-btn" data-key="open-share" href="${esc(s.url)}" target="_blank" rel="noopener">Open</a>
      <button class="text-btn" data-act="stop-share">Stop</button>`);
  }

  const storeSearch = { query: get('storeQuery', ''), results: [], message: null, searching: false };
  async function searchStores() {
    const q = storeSearch.query.trim();
    const invalid = !q ? 'Enter a ZIP code or city to find stores.' : /^\d+$/.test(q) && q.length !== 5 ? 'ZIP codes have 5 digits.' : null;
    if (invalid) {
      storeSearch.message = invalid; storeSearch.blocked = false; renderSheet();
      const input = ref('sheet').querySelector('form input');
      if (input) input.focus({ preventScroll: true });
      return;
    }
    storeSearch.searching = true; storeSearch.message = null; storeSearch.blocked = false; renderSheet();
    ref('sheetLive').textContent = '';
    put('storeQuery', q);
    try {
      const { stores, status } = parseStores(await getJson(storeSearchUrl(q)));
      storeSearch.results = stores; storeSearch.resultsFor = q;
      storeSearch.message = status === 'none' ? `No Vitamin Shoppe stores near “${q}”.`
        : status === 'unrecognized' ? `Couldn't find “${q}”. Try a 5-digit ZIP or “City, ST”.` : null;
      put('storeQuery', q);
    } catch (e) {
      storeSearch.blocked = e instanceof Blocked;
      storeSearch.message = storeSearch.blocked || /try again/i.test(e.message) ? e.message : `${e.message.replace(/\.?$/, '.')} Try again in a minute.`;
    } finally {
      storeSearch.searching = false; renderSheet();
    }
    // Say how many were found and put focus on the first, for keyboard and screen-reader users.
    if (state.sheet === 'stores') {
      if (!storeSearch.message && storeSearch.results.length) {
        const found = `${storeSearch.results.length} store${storeSearch.results.length === 1 ? '' : 's'} found`;
        ref('sheetLive').textContent = found; // inside the dialog, where VoiceOver listens
        const first = ref('sheet').querySelector('.store');
        if (first) first.focus({ preventScroll: true });
      } else {
        const input = ref('sheet').querySelector('form input');
        if (input) input.focus({ preventScroll: true });
      }
    }
  }

  // ------------------------------------------------------------------- UI shell

  const host = document.createElement('div');
  host.id = 'vs-clearance-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${__VSX_CSS__}</style>
    <button class="launcher" part="launcher" aria-label="Open VS Clearance deals">🏷️ <span>Deals</span></button>
    <div class="app" hidden role="dialog" aria-modal="true" aria-label="VS Clearance" tabindex="-1">
      <header class="top">
        <div class="top-row">
          <div><h1>Clearance Deals</h1><p class="subtitle" data-ref="subtitle"></p></div>
          <div class="top-actions">
            <button class="icon-btn on-dark" data-act="refresh" aria-label="Refresh deals">⟳</button>
            <button class="icon-btn on-dark" data-act="close" aria-label="Close">✕</button>
          </div>
        </div>
        <label class="search"><span aria-hidden="true">🔍</span>
          <input data-ref="q" type="search" placeholder="Search brand or product" autocomplete="off" aria-label="Search deals">
        </label>
      </header>
      <div class="scroll" data-ref="scroll">
        <div data-ref="banner" role="status" aria-live="polite"></div>
        <section class="controls" data-ref="controls"></section>
        <div class="summary" data-ref="summary"></div>
        <span class="vh" data-ref="live" role="status" aria-live="polite"></span>
        <ul class="list" data-ref="list"></ul>
        <div class="status" data-ref="status" role="status" hidden></div>
        <div class="share-line" data-ref="shareLine" hidden></div>
        <p class="foot-note" data-ref="footNote"></p>
      </div>
      <div class="sheet-wrap" data-ref="sheetWrap" hidden><div class="sheet" data-ref="sheet" role="dialog" aria-modal="true" aria-labelledby="vsx-sheet-title"><div data-ref="sheetBody"></div><span class="vh" data-ref="sheetLive" role="status" aria-live="polite"></span></div></div>
      <div class="toast" data-ref="toast" role="status" aria-live="polite" hidden></div>
    </div>`;
  const ref = (n) => root.querySelector(`[data-ref="${n}"]`);
  const app = root.querySelector('.app');
  const launcher = root.querySelector('.launcher');

  let reopenAfterCheck = false;
  function openApp() {
    // Stepped aside for the site's check: open once it's done instead of locking the page underneath.
    if (!host.isConnected) { reopenAfterCheck = true; return; }
    state.open = true; app.hidden = false; launcher.hidden = true;
    // So Back from a product page lands in Deals again (the site's own history state is kept).
    if (location.hash !== '#vsdeals') history.replaceState(history.state, '', location.pathname + location.search + '#vsdeals');
    document.documentElement.style.overflow = 'hidden';
    render();
    // A refusal from before (the user may just have completed the site's check) is retried on open.
    if (state.blocked || listIsOld()) loadDeals();
    else if (state.stockBlocked || stockIsDue()) loadStock({ onlyMissing: !state.stockBlocked && gapsOnly() });
    if (storeSearch.blocked && state.sheet === 'stores') searchStores();
    // Esc works straight away (focus starts on the page underneath).
    app.focus({ preventScroll: true });
  }
  /** Saved stock is partial or lacks some current items (so "only missing" has something to ask for). */
  function stockHasGaps() { return !!state.stock.partial || state.raw.some((o) => o.jda && !(o.jda in state.stock.map)); }
  function stockIsDue() { return !!state.store && (!hasStock() || stockHasGaps() || Date.now() - (state.stock.at || 0) > 6 * 3600e3); }
  /** Fresh stock with gaps: ask only for what's missing. */
  function gapsOnly() { return hasStock() && stockHasGaps() && Date.now() - (state.stock.at || 0) < 6 * 3600e3; }
  // One rule everywhere: a list older than 10 minutes refreshes on open, on reconnect and on return.
  function listIsOld() { return !state.savedAt || Date.now() - state.savedAt > 10 * 60_000; }
  window.addEventListener('online', () => {
    if (!state.open) return;
    if (state.error || listIsOld()) loadDeals(); else if (state.stockError || stockIsDue()) loadStock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.open) return;
    if (listIsOld()) loadDeals(); else if (stockIsDue()) loadStock();
  });
  // Left open on screen (no tab switch to trigger the above): keep "Updated …" honest and refresh
  // on the same rule. Errors wait for Retry / reconnect so a failing site isn't hammered.
  setInterval(() => {
    if (!state.open || document.visibilityState !== 'visible' || state.loading || state.stockLoading) return;
    const now = Date.now();
    if (state.error) { if (!state.blocked && !state.siteChanged && now >= nextErrorRetry) return loadDeals(); }
    else if (!state.blocked && listIsOld()) return loadDeals();
    if (state.stockError) {
      if (!state.stockBlocked && now >= nextStockRetry) return loadStock({ onlyMissing: gapsOnly() });
    } else if (stockIsDue()) return loadStock({ onlyMissing: gapsOnly() });
    // Only the time-based text: rebuilding the list would knock keyboard focus and scroll about.
    if (state.savedAt) {
      const n = changeIds().size;
      ref('subtitle').textContent = `Updated ${relativeTime(state.savedAt)}` + (n ? ` · ${n} new or cheaper` : '');
    }
    keepFocus(renderBanner);
    refreshAges();
    keepFocus(renderShareLine);
  }, 60_000);

  function closeApp() {
    state.open = false; app.hidden = true; launcher.hidden = !get('launcher', true);
    document.documentElement.style.overflow = '';
    if (!launcher.hidden) launcher.focus({ preventScroll: true });
    if (location.hash === '#vsdeals') history.replaceState(history.state, '', location.pathname + location.search);
  }

  function toast(text) {
    const t = ref('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------------- render

  const hasStock = () => !!(state.store && state.stock?.storeId === state.store.id);
  const changeIds = () => new Set([...state.changes.newIds, ...state.changes.drops.keys()]);
  const visible = () => applyFilters(state.items, {
    query: state.query, category: state.category, minDiscount: state.floor, inStockOnly: state.inStockOnly,
    mode: state.mode, sort: state.sort, onlyIds: state.onlyChanges ? changeIds() : null
  });

  function renderFootNote() {
    const hidden = !get('launcher', true);
    setHtml(ref('footNote'), `<span class="fn">VS Clearance ${esc(__VSX_VERSION__)}</span><span class="fn"><a class="link-btn" data-key="update" href="${esc(__VSX_HOME__)}vs-clearance.user.js" target="_blank" rel="noopener">Update VS Clearance</a></span><span class="fn">` +
      (hidden ? '<button class="link-btn" data-act="show-launcher">Show the <span aria-hidden="true">🏷️</span> Deals button</button>'
        : '<button class="link-btn" data-act="hide-launcher">Hide the <span aria-hidden="true">🏷️</span> Deals button</button>') + '</span>');
  }

  /** An age inside a live region: shown, but not re-read every minute as it ticks ("earlier" is spoken). */
  const quietAge = (ms) => `<span class="age" aria-hidden="true" data-ms="${ms}">${relativeTime(ms)}</span><span class="vh">earlier</span>`;
  /** Updates every ticking age in place (aria-hidden, so nothing is re-announced). */
  function refreshAges() {
    for (const el of root.querySelectorAll('.age[data-ms]')) {
      const t = relativeTime(Number(el.dataset.ms));
      if (el.textContent !== t) el.textContent = t;
    }
  }
  const ageless = (html) => html.replace(/(<span class="age"[^>]*>)[^<]*/g, '$1').replace(/data-ms="\d+"/g, '');
  const savedPhrase = () => {
    const ago = relativeTime(state.savedAt);
    return ago === 'just now' ? 'keeping the list on screen' : `showing the list saved ${quietAge(state.savedAt)}`;
  };

  /** Only touches a region when its content changed, so a no-change render keeps focus and scroll. */
  function setHtml(el, html) {
    if (el._html === html) return;
    el.innerHTML = html;
    el._html = html;
  }
  const setList = setHtml;
  // What identifies a control across re-renders, most specific first.
  const FOCUS_KEYS = ['act', 'card', 'ref', 'key'];
  /**
   * Runs a re-render and, if it replaced the focused control, puts focus back on the same one
   * (preferring the same region: the status panel's Retry, not the header's) or on the app, so Tab
   * doesn't start over or wander onto the page underneath.
   */
  function keepFocus(fn) {
    const a = root.activeElement;
    const ds = a && a.dataset ? a.dataset : {};
    const kind = FOCUS_KEYS.find((k) => ds[k] != null);
    const id = kind && ds[kind], v = ds.v;
    const regionEl = a && a.parentElement ? a.parentElement.closest('[data-ref]') : null;
    const region = regionEl ? regionEl.dataset.ref : null;
    fn();
    const now = root.activeElement;
    if (kind && state.open && !(now && now.isConnected && now.offsetParent)) {
      const all = [...root.querySelectorAll(`[data-${kind}]`)].filter((el) => el.dataset[kind] === id && el.offsetParent);
      const pick = (list) => (v == null ? null : list.find((el) => el.dataset.v === v)) || list[0];
      const inRegion = region ? all.filter((el) => { const r = el.parentElement && el.parentElement.closest('[data-ref]'); return r && r.dataset.ref === region; }) : [];
      // A Retry that worked is gone: continue at the store (shelf stock) or the list, not the dialog
      // or another region's button with the same action.
      const next = id === 'retry-stock' ? root.querySelector('.store-row')
        : id === 'refresh' ? root.querySelector('[data-card]') || ref('q') : null;
      const same = pick(inRegion) || (region && next && next.offsetParent ? next : null) || pick(all) || (next && next.offsetParent ? next : null);
      const list = root.querySelector('[data-card]');
      (same || (list && list.offsetParent ? list : null) || (ref('q').offsetParent ? ref('q') : null) || app).focus({ preventScroll: true });
      if (same && same.classList.contains('chip')) same.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }
  function render() { keepFocus(renderNow); }
  // The status panel through setHtml: identical content isn't rewritten, so it isn't announced twice.
  const statusPanel = {
    set innerHTML(html) { setHtml(ref('status'), html); },
    set hidden(v) { ref('status').hidden = v; }
  };
  function renderNow() {
    if (!state.open) return;
    renderFootNote();
    renderShareLine();
    const n = changeIds().size;
    ref('subtitle').textContent = state.loading ? (state.items.length ? 'Refreshing…' : 'Loading live prices…')
      : state.savedAt ? `Updated ${relativeTime(state.savedAt)}` + (n ? ` · ${n} new or cheaper` : '') : 'Live from vitaminshoppe.com';
    root.querySelector('[data-act="refresh"]').classList.toggle('spin', state.loading || state.stockLoading);

    renderBanner();

    const list = ref('list'); const status = statusPanel;
    const have = state.items.length > 0;
    ref('controls').hidden = !have; ref('summary').hidden = !have;
    if (!have) {
      setList(list, state.loading ? '<li class="skeleton"></li>'.repeat(4) : '');
      status.hidden = state.loading;
      status.innerHTML = state.loading ? '' : statusHtml(state.blocked ? '🛡️' : '⚠️',
        state.blocked ? 'Quick check needed' : "Couldn't load deals", state.blocked ? 'Vitamin Shoppe wants to confirm a person is browsing. Reload the page, complete any check, and Deals reopens.' : esc(state.error || "Vitamin Shoppe didn't send any deals.") + (state.siteChanged ? '' : ' It will try again automatically, or try again now.'),
        state.siteChanged ? [['Try again', 'refresh', false]] : [[state.blocked ? 'Reload page' : 'Try again', state.blocked ? 'reload-page' : 'refresh', true]]) +
        (state.siteChanged ? `<div class="actions"><a class="primary-btn" href="${esc(__VSX_HOME__)}vs-clearance.user.js" target="_blank" rel="noopener">Update VS Clearance</a></div>` : '');
      return;
    }
    renderControls();
    const deals = visible();
    const total = state.items.length;
    const said = `Showing ${deals.length} of ${total} deals`;
    clearTimeout(render.say);
    render.say = setTimeout(() => { if (render.lastSaid !== said) { render.lastSaid = said; ref('live').textContent = said; } }, 700);
    setHtml(ref('summary'), `<span class="count" aria-hidden="true">${deals.length === total ? `${total} deals` : `${deals.length} of ${total}`}</span>
      ${deals.length ? `<button class="tonal-btn" data-act="ai"><span aria-hidden="true">🧠</span> Ask AI (${Math.min(deals.length, AI_MAX_ITEMS)})</button>` : ''}
      <label class="sort"><span class="vh">Sort by</span><span aria-hidden="true">⇅</span><select data-ref="sort">${SORTS.map((o) => `<option value="${o.id}"${o.id === state.sort ? ' selected' : ''}>${esc(o.short)}</option>`).join('')}</select></label>`);
    if (state.mode === 'pickup' && state.stockLoading && !deals.length) {
      setList(list, ''); status.hidden = false;
      status.innerHTML = statusHtml('🏬', 'Checking shelves…', `Looking up stock at ${esc(state.store.name)}.`);
      return;
    }
    if (state.mode === 'pickup' && state.store && !hasStock() && !state.stockLoading) {
      setList(list, ''); status.hidden = false; ref('summary').hidden = true;
      status.innerHTML = statusHtml('🏬', state.stockBlocked ? 'Quick check needed' : "Couldn't check shelves",
        esc(state.stockError || `We couldn't get stock for ${state.store.name}.`),
        [[state.stockBlocked ? 'Reload page' : 'Try again', state.stockBlocked ? 'reload-page' : 'retry-stock', true], ['Show ship-to-home', 'ship']]);
      return;
    }
    if (!deals.length && state.mode === 'pickup' && state.stockError && hasStock()) {
      setList(list, ''); status.hidden = false;
      status.innerHTML = statusHtml('🏬', "Couldn't re-check shelves",
        `Nothing matched in the stock checked ${relativeTime(state.stock.at)} — it may have changed since.`,
        [[state.stockBlocked ? 'Reload page' : 'Try again', state.stockBlocked ? 'reload-page' : 'retry-stock', true], ['Show ship-to-home', 'ship']]);
      return;
    }
    if (!deals.length) { setList(list, ''); status.hidden = false; status.innerHTML = noMatchesHtml(); return; }
    status.hidden = true;
    setList(list, deals.map(cardHtml).join(''));
  }

  let lastBannerHtml = null;
  function renderBanner() {
    let html = '';
    if (state.blocked && state.items.length) {
      html = `<div class="banner warn"><span><b>Quick check needed</b> to refresh · ${savedPhrase()}. Reload, complete Vitamin Shoppe's check, and Deals reopens.</span>
        <button class="text-btn" data-act="reload-page">Reload page</button></div>`;
    } else if (state.error && state.items.length) {
      html = `<div class="banner warn"><span><b>Couldn't refresh.</b> ${esc(state.error.replace(/\.$/, ''))} · ${savedPhrase()}.</span>` +
        (state.siteChanged ? `<a class="text-btn" href="${esc(__VSX_HOME__)}vs-clearance.user.js" target="_blank" rel="noopener">Update</a>` : '') +
        '<button class="text-btn" data-act="refresh">Retry</button></div>';
    } else if (state.partialNote) {
      html = `<div class="banner warn"><span>${esc(state.partialNote)}</span><button class="text-btn" data-act="refresh">Retry</button></div>`;
    } else if (state.stockError && state.mode === 'ship') {
      const shipAge = hasStock() && Date.now() - state.stock.at > 10 * 60_000 ? ` · showing stock checked ${quietAge(state.stock.at)}` : '';
      html = `<div class="banner info"><span>Shelf stock at ${esc(state.store?.name || 'your store')} ${state.stockBlocked ? 'needs a quick check' : "couldn't be checked"}${shipAge}.</span><button class="text-btn" data-act="${state.stockBlocked ? 'reload-page' : 'retry-stock'}">${state.stockBlocked ? 'Reload page' : 'Retry'}</button></div>`;
    } else if (state.stockError && !(state.mode === 'pickup' && (!hasStock() || !visible().length))) {
      // (In pickup with nothing to show, the full-page panel below says it instead.)
      // The age only matters when the counts on screen are from an earlier check.
      const age = hasStock() && Date.now() - state.stock.at > 10 * 60_000 ? ` · showing stock checked ${quietAge(state.stock.at)}` : '';
      html = `<div class="banner bad"><span>${esc(state.stockError.replace(/\.$/, ''))}${age}.${state.stockAdvice ? ' ' + esc(state.stockAdvice) : ''}</span><button class="text-btn" data-act="${state.stockBlocked ? 'reload-page' : 'retry-stock'}">${state.stockBlocked ? 'Reload page' : 'Retry'}</button></div>`;
    } else if (hasStock() && !state.stockLoading && Date.now() - (state.stock.at || 0) > 6 * 3600e3) {
      // 7. shelf stock's age said once, not on every card
      html = `<div class="banner info"><span>Shelf stock at ${esc(state.store.name)} was checked ${quietAge(state.stock.at)}.</span><button class="text-btn" data-act="retry-stock">Check now</button></div>`;
    } else html = '';
    if (ageless(html) === ageless(lastBannerHtml || '')) { refreshAges(); return; }
    lastBannerHtml = html;
    ref('banner').innerHTML = html;
  }

  function renderControls() {
    const s = state.store;
    const chips = [];
    if (state.query || state.category || state.floor || state.onlyChanges) chips.push('<button class="chip clear" data-act="clear">Clear</button>');
    if (state.mode === 'ship') chips.push(`<button class="chip" data-act="instock" aria-pressed="${state.inStockOnly}">In stock</button>`);
    for (const f of FLOORS) chips.push(`<button class="chip" data-act="floor" data-v="${f}" aria-pressed="${state.floor === f}">${f ? f + '%+ off' : 'Any discount'}</button>`);
    const cats = topCategories(state.items);
    if (state.category && !cats.includes(state.category)) cats.unshift(state.category);
    const n = changeIds().size;
    const rows = [...ref('controls').querySelectorAll('.chips')].map((r) => r.scrollLeft);
    const before = ref('controls')._html;
    setHtml(ref('controls'), `
      <div class="segmented" role="radiogroup" aria-label="Fulfillment">
        <button role="radio" data-act="mode" data-v="ship" aria-checked="${state.mode === 'ship'}" tabindex="${state.mode === 'ship' ? 0 : -1}">Ship</button>
        <button role="radio" data-act="mode" data-v="pickup" aria-checked="${state.mode === 'pickup'}" tabindex="${state.mode === 'pickup' ? 0 : -1}">${state.store?.pickup === false ? 'In store' : 'Pick up'}</button>
      </div>
      <button class="store-row" data-act="stores">
        <span aria-hidden="true">📍</span>
        <span class="store-text">${s ? `<small>Your store</small><b>${esc(s.name)}</b>` : `<b>Choose a store</b><small>See its shelf stock · switches to pickup</small>`}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <div class="chips">${chips.join('')}</div>
      <div class="chips">${n ? `<button class="chip" data-act="changes" aria-pressed="${state.onlyChanges}"><span aria-hidden="true">✨</span> New & price drops (${n})</button>` : ''}${cats.map((c) => `<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${state.category === c}">${esc(c)}</button>`).join('')}</div>`);
    if (ref('controls')._html !== before) ref('controls').querySelectorAll('.chips').forEach((r, i) => { r.scrollLeft = rows[i] || 0; });
  }

  function cardHtml(d) {
    const est = cartEstimate(d); const off = discount(d); const adp = autoDeliveryDeal(d);
    const isNew = state.changes.newIds.has(d.id); const was = state.changes.drops.get(d.id);
    let stock, dot = '';
    if (state.store && state.stockLoading && d.qty == null) stock = 'Checking shelf…';
    else if (hasStock() && d.qty > 0) {
      stock = `${d.qty} on the shelf` + (d.pickup === false || state.store?.pickup === false ? ' · walk-in only' : '') +
        '';
      dot = 'good';
    }
    else if (hasStock() && d.qty != null) stock = d.oos ? 'Not in store · sold out online' : 'Not in store · ships';
    else if (d.oos) { stock = 'Out of stock online'; dot = 'bad'; }
    else { stock = 'In stock online'; dot = 'good'; }
    const pills = facts(d).map((f) => `<span class="pill">${esc(f)}</span>`).join('') +
      (d.rating && d.reviews >= 3 ? `<span class="rating"><span aria-hidden="true">★ ${d.rating.toFixed(1)} (${d.reviews})</span><span class="vh">rated ${d.rating.toFixed(1)} out of 5, ${d.reviews} reviews</span></span>` : '');
    return `<li class="card">
      <a class="thumb${d.img ? '' : ' none'}" href="${esc(d.url)}" tabindex="-1" aria-hidden="true">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy">` : '📦'}</a>
      <div class="body">
        <div class="brandline"><span class="brand">${esc(d.brand || 'Vitamin Shoppe')}</span>${isNew ? '<span class="tag new">NEW</span>' : ''}${was != null ? '<span class="tag drop">PRICE DROP</span>' : ''}</div>
        <a class="title" data-card="${esc(d.id)}" href="${esc(d.url)}">${esc(d.title)}</a>
        <div class="prices"><span class="price"><span class="vh">${est != null ? 'about ' : 'now '}</span><span aria-hidden="true">${est != null ? '≈' : ''}</span>${money(bestPrice(d))}</span>${off ? `<span class="vh">, was </span><span class="was">${money(d.list)}</span><span class="tag off"><span aria-hidden="true">−${off}%</span><span class="vh">, ${off}% off</span></span>` : ''}</div>
        ${was != null ? `<span class="note">Down from <s>${money(was)}</s> since your last check</span>` : ''}
        ${est != null ? `<span class="note"><span aria-hidden="true">🛒</span> Extra ${d.cart}% off in cart (lists ${money(d.site)})</span>` : ''}
        ${adp ? `<span class="note">${money(adp)} with Auto Delivery</span>` : ''}
        ${pills ? `<div class="pills">${pills}</div>` : ''}
        <div class="foot"><span class="stock"><span class="dot ${dot}"></span>${esc(stock)}</span>
          <button class="icon-btn" data-act="share" data-id="${esc(d.id)}" aria-label="Share ${esc(d.title)}">↗︎</button></div>
      </div></li>`;
  }

  function statusHtml(icon, title, body, actions = []) {
    return `<div class="badge" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${body}</p>` + (actions.length
      ? `<div class="actions">${actions.map(([l, a, p]) => `<button class="${p ? 'primary-btn' : 'outline-btn'}" data-act="${a}">${l}</button>`).join('')}</div>` : '');
  }

  function noMatchesHtml() {
    const at = state.mode === 'pickup' && state.store ? ` at ${esc(state.store.name)}` : '';
    const reasons = [state.query && `matching “${esc(state.query.trim())}”`, state.category && `in ${esc(state.category)}`,
      state.floor && `at ${state.floor}%+ off`, state.mode === 'ship' && state.inStockOnly && 'in stock online'].filter(Boolean);
    const fixes = [];
    if (state.query) fixes.push(['Clear search', 'clear-search']);
    if (state.category) fixes.push(['All categories', 'clear-cat']);
    if (state.floor) fixes.push(['Any discount', 'any-floor']);
    if (state.onlyChanges) fixes.push(['Show everything', 'clear']);
    if (state.mode === 'pickup') fixes.push(['Show ship-to-home', 'ship']);
    if (!fixes.length && state.mode === 'ship' && state.inStockOnly) fixes.push(['Include out of stock', 'instock']);
    return statusHtml('🔍', 'No matching deals', reasons.length ? `Nothing on clearance${at} ${reasons.join(', ')}.` : `Nothing on clearance${at}.`,
      fixes.map((f, i) => [f[0], f[1], i === 0]));
  }

  // ------------------------------------------------------------------- sheets

  let focusBeforeSheet = null;
  function openSheet(kind) {
    focusBeforeSheet = root.activeElement;
    state.sheet = kind; ref('sheetWrap').hidden = false; renderSheet();
    for (const el of root.querySelectorAll('.top, .scroll')) el.inert = true;
    if (kind !== 'stores') {
      const first = ref('sheet').querySelector('button, a[href]');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
    }
    if (kind === 'stores') {
      const input = ref('sheet').querySelector('input');
      if (storeSearch.query && !storeSearch.results.length) searchStores();
      // A saved search shows its results: start at the heading rather than on a store hidden behind it.
      setTimeout(() => {
        if (input && !storeSearch.query) input.focus();
        else { const h = ref('sheet').querySelector('h2'); if (h) h.focus({ preventScroll: true }); }
      }, 50);
    }
  }
  function closeSheet() {
    state.sheet = null; ref('sheetWrap').hidden = true;
    for (const el of root.querySelectorAll('.top, .scroll')) el.inert = false;
    const back = focusBeforeSheet && root.contains(focusBeforeSheet) && focusBeforeSheet.offsetParent ? focusBeforeSheet : app;
    back.focus({ preventScroll: true });
  }

  let promptText = '';
  // The sheet's content through setHtml (no rebuild, so no lost focus, when nothing changed).
  const sheetBody = {
    set innerHTML(html) { setHtml(ref('sheetBody'), html); },
    querySelector: (sel) => ref('sheetBody').querySelector(sel)
  };
  function renderSheet() {
    const sheet = sheetBody;
    const oldInput = sheet.querySelector('form input');
    const typed = oldInput ? oldInput.value : null, typing = oldInput && root.activeElement === oldInput;
    if (state.sheet === 'stores') {
      const rows = storeSearch.results.map((s) => {
        const why = s.closed ? 'Temporarily closed' : null;
        const today = why || (!s.pickup ? 'Walk-in only — no online pickup' : todaysHours(s.hours));
        return `<button class="store${state.store?.id === s.id ? ' selected' : ''}" data-act="pick-store" data-id="${esc(s.id)}"${why ? ' aria-disabled="true"' : ''}>
          <span class="store-main"><b>${esc(s.name)}${state.store?.id === s.id ? '<span aria-hidden="true"> ✓</span><span class="vh">, selected</span>' : ''}</b>
            <span>${esc([s.a1, s.a2].filter(Boolean).join(', '))}</span><span>${esc(`${s.city}, ${s.state} ${s.zip}`)}</span>
            ${today ? `<small class="${why ? 'err' : ''}">${esc(today)}</small>` : ''}</span>
          <span class="dist">${s.dist >= 0 ? (s.dist < 10 ? s.dist.toFixed(1) : Math.round(s.dist)) + ' mi' : ''}</span></button>`;
      }).join('');
      sheet.innerHTML = `<h2 id="vsx-sheet-title" tabindex="-1">Choose your store</h2><p class="muted">We'll check which clearance items are on the shelf there.</p>
        <form data-ref="storeForm" class="store-form"><input type="search" inputmode="search" placeholder="ZIP code or City, ST" value="${esc(storeSearch.query)}" aria-label="ZIP code or city">
          <button class="primary-btn" type="submit"${storeSearch.searching ? ' disabled aria-busy="true"' : ''}>${storeSearch.searching ? 'Searching…' : 'Search'}</button></form>
        ${storeSearch.message ? `<p class="err" role="alert">${esc(storeSearch.message)}${storeSearch.blocked ? ' Reload the page, complete any check, then search again.' : ''}</p>${storeSearch.blocked ? '<button class="outline-btn" data-act="reload-page">Reload page</button>' : ''}` : ''}
        ${storeSearch.results.length && storeSearch.resultsFor && storeSearch.resultsFor !== storeSearch.query.trim()
          ? `<p class="muted">Stores near “${esc(storeSearch.resultsFor)}”</p>` : ''}
        <div class="stores">${rows}</div>
        ${state.store ? '<button class="outline-btn" data-act="clear-store">Clear store · ship to home only</button>' : ''}
        <button class="text-btn close" data-act="close-sheet">Close</button>`;
      const input = sheet.querySelector('form input');
      if (input && typed != null) { input.value = typed; if (typing) input.focus({ preventScroll: true }); }
    } else if (state.sheet === 'prompt') {
      const deals = visible(); const shown = Math.min(deals.length, AI_MAX_ITEMS);
      promptText = aiPrompt(deals, deals.length, state.store, state.mode);
      const scope = [state.mode === 'pickup' && state.store ? `On the shelf at ${state.store.name}` : 'Ship to home',
        state.floor && `${state.floor}%+ off`, state.category, state.query && `“${state.query.trim()}”`].filter(Boolean).join(' · ');
      sheet.innerHTML = `<h2 id="vsx-sheet-title">Ask an AI which deals are worth it</h2>
        <p class="muted">Paste into ChatGPT, Claude, Gemini or similar for an evidence score, absorption rating, value per dose and a BUY / CONSIDER / PASS verdict.</p>
        <div class="scope"><b>${deals.length > shown ? `Top ${shown} of ${deals.length} deals` : `${shown} deals`}</b>${esc(scope)}</div>
        <div class="sheet-actions"><button class="primary-btn" data-act="copy-prompt">Copy prompt</button>${navigator.share ? '<button class="tonal-btn wide" data-act="share-prompt">Share</button>' : ''}</div>
        <details><summary>Show prompt</summary><pre>${esc(promptText)}</pre></details>
        <button class="text-btn close" data-act="close-sheet">Close</button>`;
    }
  }

  // ------------------------------------------------------------------- events

  function update(fn) { fn(); prefs(); render(); }

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (e.target === ref('sheetWrap')) closeSheet();
      return;
    }
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'close': return closeApp();
      case 'refresh': {
        const fromPanel = !!el.closest('[data-ref="status"]');
        const fromBanner = !!el.closest('[data-ref="banner"]');
        await loadDeals();
        if (!state.error && state.items.length) toast('Deals updated');
        // Still nothing: stay on Try again so another Enter tries again.
        else if (state.error) {
          // With a list on screen the banner says it; with none, say it here.
          if (!state.items.length) ref('live').textContent = `Still couldn't load deals. ${state.error}`.trim();
          const again = (fromPanel && ref('status').querySelector('[data-act="refresh"]')) || (fromBanner && ref('banner').querySelector('[data-act="refresh"]'));
          if (again) again.focus({ preventScroll: true });
        }
        return;
      }
      case 'retry-stock':
        await loadStock({ onlyMissing: gapsOnly() });
        if (!state.stockError && state.store) toast(`Shelf stock updated for ${state.store.name}`);
        return;
      case 'reload-page':
        // Back where they were after the check: the store sheet reopens (and searches) if it was open.
        try { if (state.sheet === 'stores') sessionStorage.setItem('vsx.reopen', 'stores'); } catch { /* private mode */ }
        location.hash = 'vsdeals'; return location.reload();
      case 'hide-launcher':
      case 'show-launcher': {
        const show = el.dataset.act === 'show-launcher';
        put('launcher', show); renderFootNote();
        const swapped = root.querySelector(`[data-act="${show ? 'hide-launcher' : 'show-launcher'}"]`);
        if (swapped) swapped.focus({ preventScroll: true });
        return toast(show ? 'Deals button is back' : 'Deals button hidden — open again from vitaminshoppe.com/#vsdeals');
      }
      case 'mode':
        if (v === 'pickup' && !state.store) return openSheet('stores');
        return update(() => { state.mode = v; });
      case 'stores': return openSheet('stores');
      case 'floor': return update(() => { state.floor = Number(v); });
      case 'instock': return update(() => { state.inStockOnly = !state.inStockOnly; });
      case 'cat': return update(() => { state.category = state.category === v ? null : v; });
      case 'changes': return update(() => { state.onlyChanges = !state.onlyChanges; });
      case 'clear': {
        update(() => { state.query = ''; ref('q').value = ''; state.category = null; state.floor = 0; state.onlyChanges = false; });
        // The Clear chip itself is gone: continue from the first chip in its row.
        const first = ref('controls').querySelector('.chips .chip');
        if (first && root.activeElement === app) first.focus({ preventScroll: true });
        return;
      }
      case 'clear-search': return update(() => { state.query = ''; ref('q').value = ''; });
      case 'clear-cat': return update(() => { state.category = null; });
      case 'any-floor': return update(() => { state.floor = 0; });
      case 'ship': return update(() => { state.mode = 'ship'; });
      case 'ai': return openSheet('prompt');
      case 'close-sheet': return closeSheet();
      case 'stop-share':
        state.share = null; state.shareStatus = null; put('share', null); put('shareStatus', null);
        keepFocus(renderShareLine); toast('Stopped sharing from this browser');
        return;
      case 'pick-store': {
        const s = storeSearch.results.find((x) => x.id === el.dataset.id);
        if (!s) return;
        if (s.closed) return toast(`${s.name} is temporarily closed.`);
        closeSheet();
        stockRetries = 0; nextStockRetry = 0;
        update(() => { state.store = s; state.mode = 'pickup'; state.stock = null; state.stockError = null; state.stockBlocked = false; state.stockAdvice = null; rebuild(); });
        const row = root.querySelector('.store-row');
        if (row) row.focus({ preventScroll: true });
        await loadStock();
        // 5. say "none" plainly rather than "0 items"
        if (hasStock() && !state.stockError) {
          const onShelf = state.items.filter((d) => d.qty > 0).length;
          toast(onShelf ? `${onShelf} clearance item${onShelf === 1 ? '' : 's'} on the shelf at ${s.name}` : `None of the clearance items are on the shelf at ${s.name}`);
        }
        return;
      }
      case 'clear-store':
        closeSheet();
        stockRun++; // a check still running for the old store must not report back
        stockRetries = 0; nextStockRetry = 0;
        return update(() => { state.store = null; state.stock = null; state.mode = 'ship'; state.stockError = null; state.stockBlocked = false; state.stockLoading = false; put('stock', null); rebuild(); });
      case 'copy-prompt':
        try { await navigator.clipboard.writeText(promptText); toast('Prompt copied — paste it into your AI chat'); }
        catch { toast('Copy failed — open “Show prompt” and copy it manually.'); }
        return;
      case 'share-prompt':
        try { await navigator.share({ title: 'Vitamin Shoppe clearance deals', text: promptText }); } catch { /* cancelled */ }
        return;
      case 'share': {
        const d = state.items.find((x) => x.id === el.dataset.id);
        if (!d) return;
        const est = cartEstimate(d);
        const text = `${d.brand} — ${d.title}\n${est != null ? '≈' + money(est) + ' in cart' : money(d.site)} (was ${money(d.list)}, ${discount(d)}% off)`;
        try {
          if (navigator.share) await navigator.share({ title: d.title, text, url: d.url });
          else { await navigator.clipboard.writeText(`${text}\n${d.url}`); toast('Deal copied'); }
        } catch { /* cancelled */ }
      }
    }
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-ref="sort"]')) update(() => { state.sort = e.target.value; }); });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    storeSearch.query = e.target.querySelector('input').value;
    searchStores();
  });
  let typing;
  ref('q').addEventListener('input', (e) => {
    // Read now: inside a shadow root the browser clears event.target once dispatch ends.
    const value = e.target.value;
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = value; render(); ref('scroll').scrollTop = 0; }, 120);
  });
  ref('list').addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    img.parentNode.classList.add('none');
    img.replaceWith('📦');
  }, true);

  function onEscape(e) {
    if (e.key !== 'Escape' || !state.open) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && t.matches && t.matches('[data-ref="q"]') && t.value) {
      clearTimeout(typing); // a search still waiting to apply mustn't come back
      t.value = ''; state.query = ''; render(); return;
    }
    if (state.sheet) closeSheet(); else closeApp();
  }
  root.addEventListener('keydown', onEscape);
  root.addEventListener('keydown', (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (!t || !t.dataset || t.dataset.act !== 'mode' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const other = t.dataset.v === 'ship' ? 'pickup' : 'ship';
    const btn = root.querySelector(`[data-act="mode"][data-v="${other}"]`);
    if (!btn) return;
    btn.click();
    setTimeout(() => { const now = root.querySelector(`[data-act="mode"][data-v="${other}"]`); if (now && !state.sheet) now.focus(); }, 0);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !state.open) return;
    const box = state.sheet ? ref('sheet') : app;
    const items = [...box.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = root.activeElement;
    if (e.shiftKey && (active === first || !box.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
  });
  // After a click re-renders the clicked button (or a sheet closes), focus drops to the page,
  // outside the overlay: catch Esc there too.
  document.addEventListener('keydown', (e) => {
    if (root.activeElement || !state.open) return;
    if (e.key === 'Tab') { e.preventDefault(); app.focus({ preventScroll: true }); return; } // back inside, not onto the page
    onEscape(e);
  }, true);
  launcher.addEventListener('click', openApp);

  /** #vsdeals-share=<base64url {"url","token"}> from the owner's /setup page pairs this browser. */
  function takePairing() {
    const m = /^#vsdeals-share=(.*)$/.exec(location.hash);
    if (!m) return false;
    try {
      // Chat apps sometimes add a trailing "." or ")" to a link: keep only the base64url part.
      const code = (/^[A-Za-z0-9_-]+/.exec(decodeURIComponent(m[1])) || [''])[0];
      const json = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
      if (!/^https:\/\//.test(json.url) || typeof json.token !== 'string' || json.token.length < 16) throw new Error('bad');
      state.share = { url: json.url, token: json.token };
      put('share', state.share);
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => toast('Sharing turned on — your list will appear on your link'), 400);
      return 'ok';
    } catch {
      history.replaceState(null, '', location.pathname + location.search); // never leave a token in the address bar
      setTimeout(() => toast('That sharing link is invalid.'), 400);
    }
    return 'invalid';
  }

  /** The site's human check (DataDome) is showing instead of the store's page. */
  function onCheckPage() {
    // The check's own iframe, or DataDome's page object (only check pages define dd.host: captcha 'c',
    // block 'b', automatic device check 'i'). Not a text search: this script's own source would match.
    const dd = window.dd;
    return !!document.querySelector('iframe[src*="captcha-delivery.com"]') || !!(dd && dd.host);
  }

  /**
   * The site's check can appear at any time (at load, or over the page after a refused request).
   * Step aside while it's up — never touching it — and come back, reopened if Deals was open, once
   * the user has finished it. Checked at most every 300 ms (the store's page mutates constantly),
   * plus a slow poll for checks that change only page variables.
   */
  function checkWatch() {
    const check = onCheckPage();
    if (check && host.isConnected) {
      reopenAfterCheck = reopenAfterCheck || state.open;
      state.open = false; // stops the reconnect / tab-return refreshes too
      host.remove();
      document.documentElement.style.overflow = '';
    } else if (!check && !host.isConnected) {
      attach(pendingPaired);
    }
  }
  let restored = false, pendingPaired = null;
  /** Puts Deals on the page; the first time, also restores where the user was (search, scroll, sheet). */
  function attach(paired) {
    document.body.appendChild(host);
    const wantOpen = reopenAfterCheck || !!paired || location.hash === '#vsdeals';
    reopenAfterCheck = false; pendingPaired = null;
    if (restored) { if (wantOpen) openApp(); return; }
    restored = true;
    // Back from a product page: the same search and scroll position (only read on the Deals page,
    // so a product page that also runs this script doesn't use it up).
    let view = null;
    if (location.hash === '#vsdeals') {
      try { view = JSON.parse(sessionStorage.getItem('vsx.view') || 'null'); sessionStorage.removeItem('vsx.view'); } catch { /* private mode */ }
      if (view && Date.now() - view.at < 30 * 60_000) { state.query = view.q || ''; ref('q').value = state.query; } else view = null;
    }
    if (wantOpen) openApp();
    if (view && state.open) requestAnimationFrame(() => {
      if (view.top) ref('scroll').scrollTop = view.top;
      const card = view.card != null && [...root.querySelectorAll('[data-card]')].find((el) => el.dataset.card === view.card);
      if (card) card.focus({ preventScroll: true });
    });
    let reopen = null;
    try { reopen = sessionStorage.getItem('vsx.reopen'); sessionStorage.removeItem('vsx.reopen'); } catch { /* private mode */ }
    if (reopen === 'stores' && state.open) openSheet('stores');
    if (paired === 'ok' && state.raw.length && state.savedAt && Date.now() - state.savedAt <= 10 * 60_000) publish();
  }
  function mount() {
    if (!document.body) return setTimeout(mount, 50);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; checkWatch(); }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(checkWatch, 2000);
    const paired = takePairing();
    // Coming in through #vsdeals brings a hidden Deals button back.
    if (location.hash === '#vsdeals') put('launcher', true);
    launcher.hidden = !get('launcher', true);
    // Leave a check alone; Deals mounts (and opens, if asked) once it's done.
    if (onCheckPage()) { reopenAfterCheck = !!paired || location.hash === '#vsdeals'; pendingPaired = paired; return; }
    attach(paired);
  }
  mount();
  window.addEventListener('hashchange', () => {
    if (/^#vsdeals-share=/.test(location.hash)) {
      // Same tab, already on the site: the script doesn't re-run, so pair here.
      const paired = takePairing() === 'ok';
      openApp();
      if (paired && state.raw.length && !listIsOld()) publish();
      return;
    }
    if (location.hash === '#vsdeals' && !state.open) openApp();
  });
  let lastOpenedCard = null;
  ref('list').addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    const a = card && card.querySelector('[data-card]');
    if (a) lastOpenedCard = a.dataset.card;
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) try { sessionStorage.removeItem('vsx.view'); } catch { /* private mode */ }
  });
  window.addEventListener('pagehide', () => {
    if (!state.open) return;
    const card = lastOpenedCard || (root.activeElement && root.activeElement.dataset ? root.activeElement.dataset.card : null);
    try { sessionStorage.setItem('vsx.view', JSON.stringify({ q: state.query, top: ref('scroll').scrollTop, card, at: Date.now() })); } catch { /* private mode */ }
  });
})();

})();
