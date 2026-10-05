// ==UserScript==
// @name         VS Clearance — Vitamin Shoppe deal finder
// @namespace    vs-clearance
// @version      1.0.0
// @description  Every Vitamin Shoppe clearance deal with real cart prices, your store's shelf stock, filters, and an AI review prompt.
// @match        https://www.vitaminshoppe.com/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// @downloadURL  https://dn.tail59aab8.ts.net:10000/vs-clearance.user.js
// @updateURL    https://dn.tail59aab8.ts.net:10000/vs-clearance.user.js
// @homepageURL  https://dn.tail59aab8.ts.net:10000/
// ==/UserScript==

(() => {
'use strict';
const __VSX_CSS__ = ":host {\n  --navy: #012169; --navy-dark: #001540; --sky: #15BEF0;\n  --bg: #F8FAFC; --surface: #FFFFFF; --surface-2: #F1F5F9; --text: #0F172A; --muted: #64748B;\n  --outline: #CBD5E1; --hairline: #E2E8F0; --price: #047857; --em-bg: #D1FAE5; --em-fg: #065F46;\n  --sky-bg: #E0F2FE; --sky-fg: #0369A1; --amber-bg: #FEF3C7; --amber-fg: #92400E; --red-bg: #FEE2E2; --red-fg: #991B1B;\n  --header: var(--navy); --search: var(--navy-dark); --link: var(--navy);\n}\n@media (prefers-color-scheme: dark) {\n  :host {\n    --bg: #0B1120; --surface: #111827; --surface-2: #1E293B; --text: #F8FAFC; --muted: #94A3B8;\n    --outline: #334155; --hairline: #1F2A3C; --price: #34D399; --em-bg: #064E3B; --em-fg: #A7F3D0;\n    --sky-bg: #0C4A6E; --sky-fg: #BAE6FD; --amber-bg: #451A03; --amber-fg: #FCD34D; --red-bg: #7F1D1D; --red-fg: #FECACA;\n    --header: var(--navy-dark); --search: #1E293B; --link: var(--sky);\n  }\n}\n* { box-sizing: border-box; }\n[hidden] { display: none !important; }\nbutton { font: inherit; color: inherit; cursor: pointer; }\n:focus-visible { outline: 3px solid var(--sky); outline-offset: 2px; }\n.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }\n.muted { color: var(--muted); margin: 0; }\n.err { color: var(--red-fg); margin: 0; }\n\n.launcher {\n  position: fixed; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483646;\n  display: flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 0 20px; min-height: 52px;\n  background: linear-gradient(135deg, #34D399, #047857); color: #fff; font: 700 17px/1 system-ui, -apple-system, sans-serif;\n  box-shadow: 0 8px 24px rgba(0,0,0,.3);\n}\n\n.app {\n  position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;\n  background: var(--bg); color: var(--text); font: 16px/1.4 system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif;\n  -webkit-text-size-adjust: 100%;\n}\n.top { background: var(--header); color: #fff; padding: calc(env(safe-area-inset-top) + 10px) 16px 12px; flex: none; }\n.top-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 900px; margin: 0 auto; }\n.top-actions { display: flex; }\nh1 { font-size: 1.35rem; margin: 0; }\n.subtitle { margin: 2px 0 0; font-size: .85rem; opacity: .85; }\n.icon-btn { background: transparent; border: 0; border-radius: 50%; width: 44px; height: 44px; display: grid; place-items: center; font-size: 20px; }\n.icon-btn.on-dark { color: #fff; }\n.icon-btn.spin { animation: spin 1s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n.search { display: flex; align-items: center; gap: 8px; background: var(--search); border-radius: 12px; padding: 0 12px; margin: 10px auto 0; max-width: 900px; min-height: 50px; }\n.search input { flex: 1; min-width: 0; background: transparent; border: 0; color: #fff; font-size: 16px; padding: 12px 0; }\n.search input::placeholder { color: rgba(255,255,255,.7); }\n.search input:focus { outline: none; }\n\n.scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(32px + env(safe-area-inset-bottom)); }\n.scroll > * { max-width: 900px; margin-left: auto; margin-right: auto; }\n.banner { display: flex; align-items: center; gap: 10px; margin: 12px; border-radius: 12px; padding: 8px 8px 8px 14px; }\n.banner span { flex: 1; }\n.banner.warn { background: var(--amber-bg); color: var(--amber-fg); }\n.banner.bad { background: var(--red-bg); color: var(--red-fg); }\n.text-btn { background: none; border: 0; font-weight: 700; padding: 10px 12px; min-height: 44px; border-radius: 8px; }\n\n.controls { padding: 12px 12px 4px; }\n.segmented { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--outline); border-radius: 999px; overflow: hidden; }\n.segmented button { background: transparent; border: 0; min-height: 44px; font-weight: 600; }\n.segmented button + button { border-left: 1px solid var(--outline); }\n.segmented button[aria-checked=\"true\"] { background: var(--sky-bg); color: var(--sky-fg); }\n.segmented button[aria-checked=\"true\"]::before { content: \"✓ \"; }\n.store-row { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 8px; padding: 8px 12px; min-height: 52px;\n  background: var(--surface-2); border: 0; border-radius: 12px; text-align: left; }\n.store-text { flex: 1; display: flex; flex-direction: column; }\n.store-text small { color: var(--muted); }\n.chips { display: flex; gap: 8px; overflow-x: auto; padding: 8px 2px 0; scrollbar-width: none; }\n.chips::-webkit-scrollbar { display: none; }\n.chip { flex: none; border: 1px solid var(--outline); background: transparent; border-radius: 8px; min-height: 36px; padding: 6px 14px; font-weight: 600; color: var(--muted); white-space: nowrap; }\n.chip[aria-pressed=\"true\"] { background: var(--sky-bg); color: var(--sky-fg); border-color: transparent; }\n.chip[aria-pressed=\"true\"]::before { content: \"✓ \"; }\n.chip.clear::after { content: \" ✕\"; }\n\n.summary { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; background: var(--bg); padding: 10px 12px 8px 16px; border-bottom: 1px solid var(--hairline); }\n.count { flex: 1 0 auto; font-weight: 700; white-space: nowrap; }\n.tonal-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--sky-bg); color: var(--sky-fg); border: 0; border-radius: 999px; min-height: 40px; padding: 0 12px; font-weight: 700; white-space: nowrap; }\n.tonal-btn.wide { justify-content: center; }\n.sort select { background: transparent; color: var(--link); border: 0; font: inherit; font-weight: 700; min-height: 40px; max-width: 36vw; text-overflow: ellipsis; }\n\n.list { list-style: none; margin: 0 auto; padding: 8px 12px; display: grid; gap: 8px; }\n@media (min-width: 760px) { .list { grid-template-columns: 1fr 1fr; } }\n.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; display: grid; grid-template-columns: 88px 1fr; gap: 12px; padding: 12px 6px 6px 12px; }\n.thumb { width: 88px; height: 88px; border-radius: 12px; border: 1px solid var(--hairline); background: #fff; display: grid; place-items: center; overflow: hidden; text-decoration: none; font-size: 32px; }\n.thumb.none { background: var(--surface-2); }\n.thumb img { width: 82px; height: 82px; object-fit: contain; padding: 4px; }\n.body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }\n.brandline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }\n.brand { font-size: .75rem; letter-spacing: .06em; font-weight: 800; color: var(--link); text-transform: uppercase; }\n.title { font-weight: 600; color: var(--text); text-decoration: none; padding-right: 8px;\n  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }\n.prices { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }\n.price { font-size: 1.35rem; font-weight: 800; color: var(--price); }\n.was { color: var(--muted); text-decoration: line-through; }\n.tag { font-size: .75rem; font-weight: 800; border-radius: 6px; padding: 2px 6px; }\n.tag.off, .tag.drop { background: var(--em-bg); color: var(--em-fg); }\n.tag.new { background: var(--sky-bg); color: var(--sky-fg); }\n.note { font-size: .85rem; color: var(--muted); }\n.pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }\n.pill { background: var(--surface-2); color: var(--muted); font-size: .8rem; border-radius: 6px; padding: 2px 6px; }\n.rating { font-size: .85rem; color: var(--muted); }\n.foot { display: flex; align-items: center; min-height: 44px; }\n.stock { flex: 1; display: flex; align-items: center; gap: 6px; font-size: .9rem; font-weight: 500; }\n.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--outline); flex: none; }\n.dot.good { background: var(--em-fg); }\n.dot.bad { background: var(--red-fg); }\n.foot .icon-btn { color: var(--muted); }\n\n.status { text-align: center; padding: 40px 28px; display: grid; justify-items: center; gap: 8px; }\n.badge { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; background: var(--sky-bg); font-size: 40px; }\n.status h2 { margin: 8px 0 0; font-size: 1.15rem; }\n.status p { margin: 0; color: var(--muted); max-width: 460px; }\n.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }\n.primary-btn { background: var(--navy); color: #fff; border: 0; border-radius: 999px; min-height: 44px; padding: 0 20px; font-weight: 700; }\n@media (prefers-color-scheme: dark) { .primary-btn { background: var(--sky); color: var(--navy-dark); } }\n.outline-btn { background: transparent; border: 1px solid var(--outline); border-radius: 999px; min-height: 44px; padding: 0 18px; font-weight: 700; }\n.skeleton { height: 140px; border-radius: 16px; background: linear-gradient(90deg, var(--surface-2), var(--surface), var(--surface-2)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }\n@keyframes shimmer { to { background-position: -200% 0; } }\n@media (prefers-reduced-motion: reduce) { .skeleton, .icon-btn.spin { animation: none; } }\n\n.sheet-wrap { position: absolute; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; z-index: 5; }\n.sheet { background: var(--surface); color: var(--text); width: 100%; max-width: 720px; max-height: 88%; overflow-y: auto;\n  border-radius: 20px 20px 0 0; padding: 20px 16px calc(16px + env(safe-area-inset-bottom)); display: grid; gap: 12px; }\n@media (min-width: 760px) { .sheet-wrap { align-items: center; } .sheet { border-radius: 20px; } }\n.sheet h2 { margin: 0; font-size: 1.25rem; }\n.store-form { display: flex; gap: 8px; }\n.store-form input { flex: 1; min-width: 0; font-size: 16px; padding: 12px; border: 1px solid var(--outline); border-radius: 12px; background: var(--surface); color: var(--text); }\n.stores { display: grid; gap: 8px; }\n.store { display: flex; gap: 8px; text-align: left; background: var(--surface-2); border: 2px solid transparent; border-radius: 12px; padding: 12px; }\n.store.selected { background: var(--sky-bg); border-color: var(--sky-fg); }\n.store[aria-disabled=\"true\"] { opacity: .7; }\n.store-main { flex: 1; display: flex; flex-direction: column; }\n.store-main span, .store-main small { color: var(--muted); }\n.store-main small.err { color: var(--red-fg); }\n.dist { color: var(--link); font-weight: 700; white-space: nowrap; }\n.scope { background: var(--sky-bg); color: var(--sky-fg); border-radius: 12px; padding: 12px; }\n.scope b { display: block; }\n.sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n.sheet-actions button { min-height: 48px; }\ndetails summary { cursor: pointer; font-weight: 700; min-height: 44px; display: flex; align-items: center; }\npre { white-space: pre-wrap; background: var(--surface-2); border-radius: 12px; padding: 12px; max-height: 300px; overflow: auto; font-size: 12px; margin: 0; }\n.close { justify-self: end; }\n.toast { position: absolute; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); background: #1E293B; color: #fff; padding: 12px 18px; border-radius: 12px; max-width: calc(100% - 32px); z-index: 6; }\n\n.share-line { display: flex; align-items: center; gap: 4px; margin: 0 12px 12px; padding: 4px 4px 4px 14px; border-radius: 12px; background: var(--surface-2); color: var(--muted); font-size: .9rem; }\n.share-line span { flex: 1; }\n.share-line a { color: var(--link); text-decoration: none; }\n";
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
function normalizeItem(o, stock) {
  const jda = o.jda || null;
  const qty = stock && jda != null ? (jda in stock ? stock[jda] : null) : null;
  return {
    id: o.id,
    jda,
    brand: (o.brand || '').trim(),
    title: (o.title || o.id).trim(),
    url: o.url,
    img: o.img || null,
    list: Math.max(Number(o.list), Number(o.site)),
    site: Number(o.site),
    adp: pos(o.adp),
    cart: o.cart > 0 ? o.cart : null,
    servings: o.servings > 0 ? o.servings : null,
    servingSize: o.servingSize || null,
    form: o.form || null,
    category: o.category || null,
    variants: o.variants || null,
    rating: pos(o.rating),
    reviews: o.reviews > 0 ? o.reviews : 0,
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
  if (list <= 0 || price >= list) return 0;
  return Math.min(99, Math.max(0, Math.round(((list - price) / list) * 100)));
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
  ['Gummies', 'gummies'], ['Lozenges', 'lozenges'], ['Packets', 'packets'], ['Bars', 'bars']
];
function shortSize(size) {
  let out = size;
  for (const [a, b] of SHORT) out = out.replace(new RegExp(a.replace(/[()]/g, '\\$&'), 'gi'), b);
  return out;
}

/** Fact pills: pack size first (survives title truncation), servings only when they add information. */
function facts(d) {
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

function matcher(query) {
  const units = searchUnits(query);
  const whole = units.join(' ');
  return (d) => {
    if (!units.length) return true;
    const t = prepare([d.brand, d.title, d.category, d.form].filter(Boolean).join(' '));
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
function cleanCategory(c) {
  if (!c) return c;
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
  const where = mode === 'pickup' && store
    ? `on the shelf at ${/vitamin shoppe/i.test(store.name) ? store.name : 'The Vitamin Shoppe, ' + store.name} (${storeAddress(store)})${shown.some((d) => !d.pickup) ? ' — some walk-in only (no online pickup)' : ', all available for store pickup'}`
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
    if (store && d.qty != null) avail.push(d.qty > 0 ? `${d.qty} at ${store.name}${d.pickup ? '' : ' (walk-in only)'}` : `none at ${store.name}`);
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
  const street = [s.a1 ?? s.address1, s.a2 ?? s.address2].filter(Boolean).join(', ');
  return [street, `${s.city}, ${s.state} ${s.zip}`.trim()].filter(Boolean).join(', ');
}

function relativeTime(ms, now = Date.now()) {
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

  async function getJson(url) {
    let res;
    try {
      res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    } catch {
      throw new Error(navigator.onLine === false ? "You're offline." : "Couldn't reach vitaminshoppe.com.");
    }
    if (res.status === 403) throw new Blocked('Vitamin Shoppe wants to confirm you\'re not a bot.');
    if (!res.ok) throw new Error(`Vitamin Shoppe answered ${res.status}.`);
    try { return await res.json(); } catch { throw new Blocked('Vitamin Shoppe sent a check page instead of data.'); }
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
    state.loading = true; state.error = null; state.blocked = false; render();
    try {
      const first = parseClearancePage(await getJson(clearanceUrl(1)));
      let raw = first.items;
      for (let p = 2; p <= Math.min(first.totalPages, 25); p++) raw = raw.concat(parseClearancePage(await getJson(clearanceUrl(p))).items);
      const seen = new Set();
      raw = raw.filter((o) => !seen.has(o.id) && seen.add(o.id));
      const previous = state.items;
      state.raw = raw; state.savedAt = Date.now();
      put('cache', { savedAt: state.savedAt, items: raw });
      rebuild();
      // New & price drops vs the last list this browser loaded.
      const before = Object.fromEntries(previous.map((d) => [d.id, bestPrice(d)]));
      const diff = changes(before, state.items);
      state.changes = diff.newIds.size || diff.drops.size ? diff : prune(state.changes, state.items);
      if (!state.changes.newIds.size && !state.changes.drops.size) state.onlyChanges = false;
      put('marks', { newIds: [...state.changes.newIds], drops: Object.fromEntries(state.changes.drops) });
      if (state.store) loadStock(); else publish();
    } catch (e) {
      state.error = e.message; state.blocked = e instanceof Blocked;
    } finally {
      state.loading = false; render();
    }
  }

  let stockRun = 0;
  async function loadStock() {
    const store = state.store;
    if (!store || !state.raw.length) return;
    const run = ++stockRun;
    state.stockLoading = true; state.stockError = null; render();
    try {
      const skus = [...new Set(state.raw.map((o) => o.jda).filter(Boolean))];
      const map = {};
      for (let i = 0; i < skus.length; i += 100) {
        const batch = skus.slice(i, i + 100);
        Object.assign(map, Object.fromEntries(batch.map((s) => [s, 0])), parseInventory(await getJson(inventoryUrl(store.id, batch))));
      }
      if (run !== stockRun || state.store?.id !== store.id) return;
      state.stock = { storeId: store.id, at: Date.now(), map };
      put('stock', state.stock);
      rebuild();
      publish();
    } catch (e) {
      if (run === stockRun) { state.stockError = `Couldn't check shelves at ${store.name}. ${e.message}`; state.blocked = e instanceof Blocked; }
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
    renderShareLine();
  }

  function renderShareLine() {
    const el = ref('shareLine');
    if (!el) return;
    const s = state.share;
    if (!s) { el.hidden = true; return; }
    const st = state.shareStatus;
    el.hidden = false;
    el.innerHTML = `<span>📤 ${st?.error ? esc(st.error) : st?.at ? `Shared to your link ${relativeTime(st.at)}` : 'Sharing to your link'}</span>
      <a class="text-btn" href="${esc(s.url)}" target="_blank" rel="noopener">Open</a>
      <button class="text-btn" data-act="stop-share">Stop</button>`;
  }

  const storeSearch = { query: get('storeQuery', ''), results: [], message: null, searching: false };
  async function searchStores() {
    const q = storeSearch.query.trim();
    if (!q) { storeSearch.message = 'Enter a ZIP code or city to find stores.'; return renderSheet(); }
    if (/^\d+$/.test(q) && q.length !== 5) { storeSearch.message = 'ZIP codes have 5 digits.'; return renderSheet(); }
    storeSearch.searching = true; storeSearch.message = null; renderSheet();
    try {
      const { stores, status } = parseStores(await getJson(storeSearchUrl(q)));
      storeSearch.results = stores;
      storeSearch.message = status === 'none' ? `No Vitamin Shoppe stores near “${q}”.`
        : status === 'unrecognized' ? `Couldn't find “${q}”. Try a 5-digit ZIP or “City, ST”.` : null;
      put('storeQuery', q);
    } catch (e) {
      storeSearch.message = e.message;
    } finally {
      storeSearch.searching = false; renderSheet();
    }
  }

  // ------------------------------------------------------------------- UI shell

  const host = document.createElement('div');
  host.id = 'vs-clearance-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${__VSX_CSS__}</style>
    <button class="launcher" part="launcher" aria-label="Open VS Clearance deals">🏷️ <span>Deals</span></button>
    <div class="app" hidden role="dialog" aria-modal="true" aria-label="VS Clearance">
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
        <div data-ref="banner"></div>
        <section class="controls" data-ref="controls"></section>
        <div class="summary" data-ref="summary"></div>
        <ul class="list" data-ref="list"></ul>
        <div class="status" data-ref="status" hidden></div>
        <div class="share-line" data-ref="shareLine" hidden></div>
      </div>
      <div class="sheet-wrap" data-ref="sheetWrap" hidden><div class="sheet" data-ref="sheet" role="dialog" aria-modal="true"></div></div>
      <div class="toast" data-ref="toast" hidden></div>
    </div>`;
  const ref = (n) => root.querySelector(`[data-ref="${n}"]`);
  const app = root.querySelector('.app');
  const launcher = root.querySelector('.launcher');

  function openApp() {
    state.open = true; app.hidden = false; launcher.hidden = true;
    document.documentElement.style.overflow = 'hidden';
    render();
    const stale = !state.savedAt || Date.now() - state.savedAt > 10 * 60_000;
    if (stale) loadDeals();
  }
  function closeApp() {
    state.open = false; app.hidden = true; launcher.hidden = false;
    document.documentElement.style.overflow = '';
    if (location.hash === '#vsdeals') history.replaceState(null, '', location.pathname + location.search);
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

  function render() {
    if (!state.open) return;
    renderShareLine();
    const n = changeIds().size;
    ref('subtitle').textContent = state.loading ? (state.items.length ? 'Refreshing…' : 'Loading live prices…')
      : state.savedAt ? `Updated ${relativeTime(state.savedAt)}` + (n ? ` · ${n} new or cheaper` : '') : 'Live from vitaminshoppe.com';
    root.querySelector('[data-act="refresh"]').classList.toggle('spin', state.loading || state.stockLoading);

    const banner = ref('banner');
    if (state.blocked && state.items.length) {
      banner.innerHTML = `<div class="banner warn"><span><b>Quick check needed.</b> Vitamin Shoppe wants to confirm a person is browsing. Close this, complete any check on the page (or reload it), then reopen Deals.</span>
        <button class="text-btn" data-act="reload-page">Reload page</button></div>`;
    } else if (state.error && state.items.length) {
      banner.innerHTML = `<div class="banner warn"><span>Couldn't refresh · showing deals from ${relativeTime(state.savedAt)}.</span><button class="text-btn" data-act="refresh">Retry</button></div>`;
    } else if (state.stockError) {
      banner.innerHTML = `<div class="banner bad"><span>${esc(state.stockError)}</span><button class="text-btn" data-act="retry-stock">Retry</button></div>`;
    } else banner.innerHTML = '';

    const list = ref('list'); const status = ref('status');
    const have = state.items.length > 0;
    ref('controls').hidden = !have; ref('summary').hidden = !have;
    if (!have) {
      list.innerHTML = state.loading ? '<li class="skeleton"></li>'.repeat(4) : '';
      status.hidden = state.loading;
      status.innerHTML = state.loading ? '' : statusHtml(state.blocked ? '🛡️' : '⚠️',
        state.blocked ? 'Quick check needed' : "Couldn't load deals", esc(state.error || 'Try again.'),
        [[state.blocked ? 'Reload page' : 'Try again', state.blocked ? 'reload-page' : 'refresh', true]]);
      return;
    }
    renderControls();
    const deals = visible();
    const total = state.items.length;
    ref('summary').innerHTML = `<span class="count" aria-label="Showing ${deals.length} of ${total} deals">${deals.length === total ? `${total} deals` : `${deals.length} of ${total}`}</span>
      ${deals.length ? `<button class="tonal-btn" data-act="ai">🧠 Ask AI (${Math.min(deals.length, AI_MAX_ITEMS)})</button>` : ''}
      <label class="sort"><span class="vh">Sort by</span><select data-ref="sort">${SORTS.map((o) => `<option value="${o.id}"${o.id === state.sort ? ' selected' : ''}>⇅ ${esc(o.short)}</option>`).join('')}</select></label>`;
    if (state.mode === 'pickup' && state.stockLoading && !deals.length) {
      list.innerHTML = ''; status.hidden = false;
      status.innerHTML = statusHtml('🏬', 'Checking shelves…', `Looking up stock at ${esc(state.store.name)}.`);
      return;
    }
    if (!deals.length) { list.innerHTML = ''; status.hidden = false; status.innerHTML = noMatchesHtml(); return; }
    status.hidden = true;
    list.innerHTML = deals.map(cardHtml).join('');
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
    ref('controls').innerHTML = `
      <div class="segmented" role="radiogroup" aria-label="Fulfillment">
        <button role="radio" data-act="mode" data-v="ship" aria-checked="${state.mode === 'ship'}">Ship</button>
        <button role="radio" data-act="mode" data-v="pickup" aria-checked="${state.mode === 'pickup'}">Pick up</button>
      </div>
      <button class="store-row" data-act="stores">
        <span aria-hidden="true">📍</span>
        <span class="store-text">${s ? `<small>Your store</small><b>${esc(s.name)}</b>` : `<b>Choose a store</b><small>See its shelf stock · switches to pickup</small>`}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <div class="chips">${chips.join('')}</div>
      <div class="chips">${n ? `<button class="chip" data-act="changes" aria-pressed="${state.onlyChanges}">✨ New & price drops (${n})</button>` : ''}${cats.map((c) => `<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${state.category === c}">${esc(c)}</button>`).join('')}</div>`;
  }

  function cardHtml(d) {
    const est = cartEstimate(d); const off = discount(d); const adp = autoDeliveryDeal(d);
    const isNew = state.changes.newIds.has(d.id); const was = state.changes.drops.get(d.id);
    let stock, dot = '';
    if (state.store && state.stockLoading && d.qty == null) stock = 'Checking shelf…';
    else if (hasStock() && d.qty > 0) { stock = `${d.qty} on the shelf`; dot = 'good'; }
    else if (hasStock() && d.qty != null) stock = d.oos ? 'Not in store · sold out online' : 'Not in store · ships';
    else if (d.oos) { stock = 'Out of stock online'; dot = 'bad'; }
    else { stock = 'In stock online'; dot = 'good'; }
    const pills = facts(d).map((f) => `<span class="pill">${esc(f)}</span>`).join('') +
      (d.rating && d.reviews >= 3 ? `<span class="rating">★ ${d.rating.toFixed(1)} (${d.reviews})</span>` : '');
    return `<li class="card">
      <a class="thumb${d.img ? '' : ' none'}" href="${esc(d.url)}" tabindex="-1" aria-hidden="true">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy">` : '📦'}</a>
      <div class="body">
        <div class="brandline"><span class="brand">${esc(d.brand || 'Vitamin Shoppe')}</span>${isNew ? '<span class="tag new">NEW</span>' : ''}${was != null ? '<span class="tag drop">PRICE DROP</span>' : ''}</div>
        <a class="title" href="${esc(d.url)}">${esc(d.title)}</a>
        <div class="prices"><span class="price">${est != null ? '≈' : ''}${money(bestPrice(d))}</span>${off ? `<span class="was">${money(d.list)}</span><span class="tag off">−${off}%</span>` : ''}</div>
        ${was != null ? `<span class="note">Down from <s>${money(was)}</s> since your last check</span>` : ''}
        ${est != null ? `<span class="note">🛒 Extra ${d.cart}% off in cart (lists ${money(d.site)})</span>` : ''}
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
    return statusHtml('🔍', 'No matching deals', reasons.length ? `Nothing on clearance${at} ${reasons.join(', ')}.` : `Nothing on clearance${at} right now.`,
      fixes.map((f, i) => [f[0], f[1], i === 0]));
  }

  // ------------------------------------------------------------------- sheets

  function openSheet(kind) {
    state.sheet = kind; ref('sheetWrap').hidden = false; renderSheet();
    if (kind === 'stores') {
      const input = ref('sheet').querySelector('input');
      if (storeSearch.query && !storeSearch.results.length) searchStores();
      setTimeout(() => input && !storeSearch.query && input.focus(), 50);
    }
  }
  function closeSheet() { state.sheet = null; ref('sheetWrap').hidden = true; }

  let promptText = '';
  function renderSheet() {
    const sheet = ref('sheet');
    if (state.sheet === 'stores') {
      const rows = storeSearch.results.map((s) => {
        const why = s.closed ? 'Temporarily closed' : !s.pickup ? 'No in-store pickup' : null;
        const today = why || todaysHours(s.hours);
        return `<button class="store${state.store?.id === s.id ? ' selected' : ''}" data-act="pick-store" data-id="${esc(s.id)}"${why ? ' aria-disabled="true"' : ''}>
          <span class="store-main"><b>${esc(s.name)}${state.store?.id === s.id ? ' ✓' : ''}</b>
            <span>${esc([s.a1, s.a2].filter(Boolean).join(', '))}</span><span>${esc(`${s.city}, ${s.state} ${s.zip}`)}</span>
            ${today ? `<small class="${why ? 'err' : ''}">${esc(today)}</small>` : ''}</span>
          <span class="dist">${s.dist >= 0 ? (s.dist < 10 ? s.dist.toFixed(1) : Math.round(s.dist)) + ' mi' : ''}</span></button>`;
      }).join('');
      sheet.innerHTML = `<h2>Choose your store</h2><p class="muted">We'll check which clearance items are on the shelf there.</p>
        <form data-ref="storeForm" class="store-form"><input type="search" inputmode="search" placeholder="ZIP code or City, ST" value="${esc(storeSearch.query)}" aria-label="ZIP code or city">
          <button class="primary-btn" type="submit">${storeSearch.searching ? '…' : 'Search'}</button></form>
        ${storeSearch.message ? `<p class="err">${esc(storeSearch.message)}</p>` : ''}
        <div class="stores">${rows}</div>
        ${state.store ? '<button class="outline-btn" data-act="clear-store">Clear store · ship to home only</button>' : ''}
        <button class="text-btn close" data-act="close-sheet">Close</button>`;
    } else if (state.sheet === 'prompt') {
      const deals = visible(); const shown = Math.min(deals.length, AI_MAX_ITEMS);
      promptText = aiPrompt(deals, deals.length, state.store, state.mode);
      const scope = [state.mode === 'pickup' && state.store ? `On the shelf at ${state.store.name}` : 'Ship to home',
        state.floor && `${state.floor}%+ off`, state.category, state.query && `“${state.query.trim()}”`].filter(Boolean).join(' · ');
      sheet.innerHTML = `<h2>Ask an AI which deals are worth it</h2>
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
      case 'refresh': return loadDeals();
      case 'retry-stock': return loadStock();
      case 'reload-page': location.hash = 'vsdeals'; return location.reload();
      case 'mode':
        if (v === 'pickup' && !state.store) return openSheet('stores');
        return update(() => { state.mode = v; });
      case 'stores': return openSheet('stores');
      case 'floor': return update(() => { state.floor = Number(v); });
      case 'instock': return update(() => { state.inStockOnly = !state.inStockOnly; });
      case 'cat': return update(() => { state.category = state.category === v ? null : v; });
      case 'changes': return update(() => { state.onlyChanges = !state.onlyChanges; });
      case 'clear': return update(() => { state.query = ''; ref('q').value = ''; state.category = null; state.floor = 0; state.onlyChanges = false; });
      case 'clear-search': return update(() => { state.query = ''; ref('q').value = ''; });
      case 'clear-cat': return update(() => { state.category = null; });
      case 'any-floor': return update(() => { state.floor = 0; });
      case 'ship': return update(() => { state.mode = 'ship'; });
      case 'ai': return openSheet('prompt');
      case 'close-sheet': return closeSheet();
      case 'stop-share':
        state.share = null; state.shareStatus = null; put('share', null); put('shareStatus', null);
        renderShareLine(); toast('Stopped sharing from this browser');
        return;
      case 'pick-store': {
        const s = storeSearch.results.find((x) => x.id === el.dataset.id);
        if (!s) return;
        if (s.closed || !s.pickup) return toast(s.closed ? `${s.name} is temporarily closed.` : `${s.name} doesn't offer pickup.`);
        closeSheet();
        update(() => { state.store = s; state.mode = 'pickup'; state.stock = null; rebuild(); });
        await loadStock();
        if (hasStock()) toast(`${state.items.filter((d) => d.qty > 0).length} clearance items on the shelf at ${s.name}`);
        return;
      }
      case 'clear-store':
        closeSheet();
        return update(() => { state.store = null; state.stock = null; state.mode = 'ship'; put('stock', null); rebuild(); });
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
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.sheet) closeSheet(); else closeApp();
  });
  launcher.addEventListener('click', openApp);

  /** #vsdeals-share=<base64url {"url","token"}> from the owner's /setup page pairs this browser. */
  function takePairing() {
    const m = /^#vsdeals-share=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return false;
    try {
      const json = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!/^https:\/\//.test(json.url) || typeof json.token !== 'string' || json.token.length < 16) throw new Error('bad');
      state.share = { url: json.url, token: json.token };
      put('share', state.share);
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => toast('Sharing turned on — your list will appear on your link'), 400);
    } catch {
      setTimeout(() => toast('That sharing link is invalid.'), 400);
    }
    return true;
  }

  function mount() {
    if (!document.body) return setTimeout(mount, 50);
    document.body.appendChild(host);
    const paired = takePairing();
    if (paired || location.hash === '#vsdeals') openApp();
    if (paired && state.raw.length && state.savedAt && Date.now() - state.savedAt <= 10 * 60_000) publish();
  }
  mount();
  window.addEventListener('hashchange', () => { if (location.hash === '#vsdeals' && !state.open) openApp(); });
})();

})();
