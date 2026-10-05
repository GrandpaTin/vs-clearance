// Pure deal logic shared by the web app and its tests. Mirrors the Android app's
// DealItem / DealFilters / AiPrompt so both show identical prices and orderings.

export const SORTS = [
  { id: 'discount', label: 'Biggest discount', short: 'Discount' },
  { id: 'priceAsc', label: 'Lowest price', short: 'Cheapest' },
  { id: 'priceDesc', label: 'Highest price', short: 'Priciest' },
  { id: 'value', label: 'Best value (lowest cost per serving)', short: 'Value' },
  { id: 'savings', label: 'Most dollars saved', short: 'Savings' },
  { id: 'brand', label: 'Brand A–Z', short: 'Brand' }
];
export const FLOORS = [0, 25, 50, 65, 75];
export const AI_MAX_ITEMS = 35;

const cents = (p) => Math.round(p * 100);
const pos = (v) => (typeof v === 'number' && v > 0 ? v : null);

/** Snapshot item (Android LocalStore format, -1 = absent) -> normalized deal. */
export function normalizeItem(o, stock) {
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

export function cartEstimate(d) {
  if (!d.cart || d.cart < 1 || d.cart > 95) return null;
  const est = cents(d.list * (1 - d.cart / 100)) / 100;
  return est < d.site - 0.005 ? est : null;
}
export const bestPrice = (d) => cartEstimate(d) ?? d.site;
export function percentOff(list, price) {
  if (list <= 0 || price >= list) return 0;
  return Math.min(99, Math.max(0, Math.round(((list - price) / list) * 100)));
}
export const discount = (d) => percentOff(d.list, bestPrice(d));
export const savings = (d) => Math.max(0, d.list - bestPrice(d));
export const perServing = (d) => (d.servings ? bestPrice(d) / d.servings : null);
// Only a deal when it beats what you'd pay anyway, the in-cart price included.
export const autoDeliveryDeal = (d) => (d.adp && d.adp < bestPrice(d) - 0.005 ? d.adp : null);

export const money = (v) => '$' + v.toFixed(2);
export function perServingLabel(d) {
  const p = perServing(d);
  if (p == null) return null;
  return p < 1 ? `${Math.round(p * 100)}¢/serving` : `${money(p)}/serving`;
}

export function sizeLabel(title) {
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
export function shortSize(size) {
  let out = size;
  for (const [a, b] of SHORT) out = out.replace(new RegExp(a.replace(/[()]/g, '\\$&'), 'gi'), b);
  return out;
}

/** Fact pills: pack size first (survives title truncation), servings only when they add information. */
export function facts(d) {
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

export function normalize(text) {
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

export function matcher(query) {
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
export function relevance(query) {
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

export function sortDeals(items, sort) {
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

export function applyFilters(items, c) {
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
export function inCategory(category, family) {
  const c = (cleanCategory(category) || '').toLowerCase();
  const f = family.toLowerCase();
  return c === f || c.endsWith(' ' + f);
}

/** [family, count] for every category, folding sub-categories into a family that also exists. */
/** "Herbs A-E" -> "Herbs", "Other Protein" -> "Protein", "Herbs & Natural Remedies" -> "Herbs". */
export function cleanCategory(c) {
  if (!c) return c;
  let t = c.trim().replace(/\s+[A-Z]\s*-\s*[A-Z]$/, '').replace(/^Other\s+/i, '');
  if (/^herbs?\b/i.test(t)) t = 'Herbs';
  return t || c;
}

export function categoryCounts(items) {
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

export function topCategories(items, limit = 10) {
  return categoryCounts(items).slice(0, limit).map((e) => e[0]);
}

// ---------------------------------------------------------------------------- changes since last visit

/** New SKUs and real price drops vs the list this viewer saw last time ({id: bestPrice}). */
export function changes(previous, current) {
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
export function prune(ch, current) {
  const now = new Map(current.map((d) => [d.id, d]));
  return {
    newIds: new Set([...ch.newIds].filter((id) => now.has(id))),
    drops: new Map([...ch.drops].filter(([id, old]) => now.has(id) && cents(old) > cents(bestPrice(now.get(id)))))
  };
}

// ---------------------------------------------------------------------------- AI prompt

export function aiPrompt(deals, total, store, mode) {
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

export function storeAddress(s) {
  const street = [s.a1 ?? s.address1, s.a2 ?? s.address2].filter(Boolean).join(', ');
  return [street, `${s.city}, ${s.state} ${s.zip}`.trim()].filter(Boolean).join(', ');
}

export function relativeTime(ms, now = Date.now()) {
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

export const SITE = 'https://www.vitaminshoppe.com';
const BROWSE = 'https://browse.vitaminshoppe.com';
export const PAGE_SIZE = 200; // the search API rejects larger pages
export const clearanceUrl = (page) =>
  `${BROWSE}/search/product/search?path=/cl/clearance/0&format=json&rpp=${PAGE_SIZE}&pageno=${page}&sessionId=&desktopView=false`;
export const storeSearchUrl = (q) => `${BROWSE}/inventory/api/inventory/get-stores-with-inv?address=${encodeURIComponent(q.trim()).replace(/%20/g, '+')}`;
export const inventoryUrl = (storeId, skus) =>
  `${BROWSE}/inventory/api/inventory/pdpinventory?storeId=${encodeURIComponent(storeId)}&skuIds=${skus.join(',')}&source=WEB`;

const str = (v) => (v == null ? null : String(v).trim() || null);
const decode = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&reg;/g, '®').replace(/&trade;/g, '™');
export const absoluteUrl = (p) => p.startsWith('https://') ? p : p.startsWith('http://') ? 'https://' + p.slice(7)
  : p.startsWith('//') ? 'https:' + p : `${SITE}/${p.replace(/^\/+/, '')}`;
export function parseCartDiscount(descriptor) {
  const m = /(\d{1,2})\s*%\s*off\b.*\bin\s+cart/i.exec(descriptor || '');
  return m ? Number(m[1]) : null;
}

/** One product from the listing API -> raw item (same shape the Android app stores). null = unusable row. */
export function parseProduct(p) {
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

export function parseClearancePage(json) {
  const r = json && json.response;
  if (!r) throw new Error('Unexpected response from vitaminshoppe.com');
  const items = (r.products || []).map(parseProduct).filter(Boolean);
  return { items, totalPages: Math.max(1, Number(r.pagination?.totalPages) || 1), total: Number(r.numProducts) || items.length };
}

const tidyTime = (t) => String(t).trim().replace(/^0(\d)/, '$1');
export function parseStores(json) {
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

export function parseInventory(json) {
  const out = {};
  for (const o of json?.skuInventory || []) {
    if (o.skuId == null) continue;
    const qty = parseInt(String(o.quantity ?? '').trim(), 10);
    out[String(o.skuId)] = (o.service || 'available').toLowerCase() === 'available' && qty > 0 ? qty : 0;
  }
  return out;
}

/** Picks today's line from "Monday - Friday: 9 AM – 9 PM" style hours. */
export function todaysHours(lines, date = new Date()) {
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
