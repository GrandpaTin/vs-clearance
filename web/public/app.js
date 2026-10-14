import {
  SORTS, FLOORS, AI_MAX_ITEMS, normalizeItem, isUsableItem, cartEstimate, bestPrice, discount, autoDeliveryDeal, money,
  facts, applyFilters, categoryCounts, inCategory, changes, prune, aiPrompt, storeAddress, relativeTime
} from './core.js';

// First thing once the app's code has loaded: boot-check.js only steps in when this never happens.
document.documentElement.dataset.booted = '1';

const $ = (id) => document.getElementById(id);
// Stamped with the commit by the Pages build (same stamp as sw.js's VERSION); 'dev' when served locally.
const BUILD = 'dev';
// Desktop browsers expose navigator.share too, but there the expected action is a copy.
const nativeShare = !!navigator.share && /iphone|ipad|ipod|android/i.test(navigator.userAgent);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------- persistence (per device)

const store = {
  get(key, fallback) { try { const v = localStorage.getItem('vs.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('vs.' + key, JSON.stringify(value)); } catch { /* private mode */ } }
};

const state = {
  snapshot: null,
  etag: null,
  items: [],
  query: '',
  category: store.get('category', null),
  floor: store.get('floor', 0),
  sort: store.get('sort', 'discount'),
  inStockOnly: store.get('inStockOnly', true),
  mode: store.get('mode', 'ship'),
  onlyChanges: false,
  changes: { newIds: new Set(), drops: new Map() },
  loading: true,
  error: null
};

function savePrefs() {
  store.set('category', state.category); store.set('floor', state.floor); store.set('sort', state.sort);
  store.set('inStockOnly', state.inStockOnly); store.set('mode', state.mode);
}

// ------------------------------------------------------------------- data

let quietFailures = 0;
let inflight = null;

async function load({ manual = false } = {}) {
  // First visit, download still coming: a background check would only throw it away and start over.
  if (inflight && !state.snapshot && !manual) return;
  $('refresh').classList.add('spin');
  const before = state.error;
  const wasLoading = state.loading;
  const hadList = !!state.snapshot;
  const previousPublished = state.snapshot?.publishedAt;
  let changed = true;
  // Never leave a stalled connection unexplained: after 15 s say so. With a list on screen, give
  // up on the check; on a first visit keep the (large) download going and take it if it lands.
  const abort = new AbortController();
  // A retry replaces a download still hanging (two would only compete on a weak signal).
  if (inflight) { inflight.superseded = true; inflight.abort(); }
  inflight = abort;
  try {
    let timer = setTimeout(function stalled() {
      if (hadList || state.snapshot) return abort.abort();
      state.loading = false;
      state.error = navigator.onLine === false ? 'offline' : 'stalled';
      render();
      timer = setTimeout(() => abort.abort(), 45000);
    }, 15000);
    let res;
    try {
      res = await fetch('api/snapshot', { headers: state.etag ? { 'If-None-Match': state.etag } : {}, cache: 'no-cache', signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
    // A 304 only means "same as the list you have": with none on screen, it's a miss.
    if (res.status === 304 && !state.snapshot) { state.etag = null; throw new Error('HTTP 304'); }
    if (res.status === 304) {
      state.error = null;
      quietFailures = 0;
      changed = false;
      if (manual) toast(oldList() ? `No newer list yet — this one is from ${relativeTime(state.snapshot.savedAt || state.snapshot.publishedAt)}` : 'You’re up to date');
      return;
    }
    if (res.status === 404) {
      if (state.snapshot) throw new Error('HTTP 404'); // keep the list; say the check failed
      state.snapshot = null; state.error = 'empty'; return;
    }
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    // The service worker answers with its saved copy when the network is down.
    const via = res.headers.get('X-From-Cache');
    const fromCache = !!via;
    // The phone may still have bars (a weak in-store signal): only say "offline" when it really is,
    // and "slow" only when the network was slow rather than unreachable.
    const cached = navigator.onLine === false ? 'offline' : via === 'error' ? 'failed' : 'slow';
    if (fromCache && state.snapshot) {
      // The worker turns a failed check into its saved copy: same grace as a failed fetch (one blip
      // on flaky mobile data isn't news; two in a row are). Offline shows at once.
      if (!manual && !wasLoading && cached !== 'offline' && before !== 'offline' && ++quietFailures < 2) { changed = false; return; }
      state.error = cached; changed = false;
      const said = { offline: ['Still offline', 'You’re offline'], slow: ['Connection is still slow', 'Connection is slow'], failed: ['Still couldn’t check for updates', 'Couldn’t check for updates'] }[cached];
      if (manual) toast(before === cached ? said[0] : said[1]);
      return;
    }
    let snap, raw;
    try {
      raw = await res.text();
      snap = JSON.parse(raw);
      acceptSnapshot(snap);
    } catch {
      throw Object.assign(new Error('unreadable'), { unreadable: true });
    }
    // Keep a good list for offline use (the service worker doesn't see a first visit's download).
    if (!fromCache && window.caches) {
      caches.open('vs-list').then((c) => c.put('api/snapshot', new Response(raw, { headers: { 'Content-Type': 'application/json' } }))).catch(() => {});
    }
    // Only now: an ETag for a list that couldn't be read would make every retry a "nothing new" 304.
    if (!fromCache) state.etag = res.headers.get('ETag');
    quietFailures = 0;
    state.error = fromCache ? cached : null;
    const sameList = hadList && previousPublished === snap.publishedAt;
    if (manual) toast(fromCache ? `${{ offline: 'You’re offline', slow: 'Connection is slow', failed: 'Couldn’t check for updates' }[cached]} · showing the last deals loaded`
      : sameList ? (oldList() ? `No newer list yet — this one is from ${relativeTime(snap.savedAt || snap.publishedAt)}` : 'You’re up to date')
      : oldList() ? `Loaded · this list is from ${relativeTime(snap.savedAt || snap.publishedAt)}`
      : hadList ? 'Updated' : 'Deals loaded');
  } catch (e) {
    if (abort.superseded) { changed = false; return; } // a newer attempt took over
    if (e && e.unreadable) state.etag = null;
    const failure = navigator.onLine === false ? 'offline' : e && e.unreadable ? 'bad' : e && e.status >= 500 ? 'server' : 'failed';
    if (!manual && !wasLoading && state.snapshot && failure !== 'offline' && before !== 'offline' && ++quietFailures < 2) {
      changed = false;
      return; // flaky mobile data: wait for the next check before warning
    }
    state.error = failure;
    // The banner says it; a toast is only needed when the banner was already up (nothing visibly changes).
    if (manual && state.snapshot && before === state.error) toast(state.error === 'offline' ? 'Still offline' : state.error === 'slow' ? 'Connection is still slow' : 'Still couldn’t check for updates');
    changed = !state.snapshot;
  } finally {
    if (inflight === abort) inflight = null;
    if (abort.superseded) return; // eslint-disable-line no-unsafe-finally -- the newer attempt renders
    state.loading = false;
    $('refresh').classList.remove('spin');
    // Rebuilding the list knocks keyboard focus off the page, so the background poll only
    // re-renders when something actually changed.
    if (changed || manual || wasLoading || state.error !== before) render(); else renderHeader();
  }
}

function acceptSnapshot(snap) {
  if (!snap || !Array.isArray(snap.items)) throw new Error('not a deals list');
  // A time in seconds is converted; one before 2020 or more than a day ahead is unknown (null).
  const when = (v) => {
    let t = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Date.parse(v) || null : null;
    if (t != null && t > 1e9 && t < 1e11) t *= 1000;
    return t != null && t >= Date.UTC(2020, 0, 1) && t <= Date.now() + 864e5 ? t : null;
  };
  snap.publishedAt = when(snap.publishedAt);
  snap.savedAt = when(snap.savedAt);
  // Stock must be a plain { sku: count } object of whole numbers; anything else just means "no shelf stock".
  if (!snap.stock || typeof snap.stock !== 'object' || Array.isArray(snap.stock)) snap.stock = null;
  else snap.stock = Object.fromEntries(Object.entries(snap.stock).filter(([, n]) => Number.isFinite(Number(n)) && Number(n) >= 0)
    .map(([k, n]) => [k, Math.floor(Number(n))]));
  // A store needs an id; a missing name reads as its address (or "your store"), never "undefined".
  if (!snap.store || typeof snap.store !== 'object' || snap.store.id == null) snap.store = null;
  else {
    snap.store.id = String(snap.store.id);
    const name = typeof snap.store.name === 'string' && snap.store.name.trim();
    snap.store.name = name || storeAddress(snap.store) || 'the shared store';
  }
  if (snap.stockStoreId != null) snap.stockStoreId = String(snap.stockStoreId);
  const stock = snap.stockStoreId && snap.store && snap.stockStoreId === snap.store.id ? snap.stock : null;
  // One malformed row (no id, link or price) is skipped rather than taking the whole list down,
  // and a repeated id keeps its first row (shares, marks and cards are keyed by id).
  const ids = new Set();
  const items = snap.items.filter(isUsableItem).map((o) => normalizeItem(o, stock))
    .filter((d) => !ids.has(d.id) && ids.add(d.id));
  // "New & price drops" are tracked per viewer: compare with the list this device saw last time.
  const seen = store.get('seen', null);
  const marks = store.get('marks', null);
  if (seen && marks?.publishedAt !== snap.publishedAt) {
    const diff = changes(seen, items);
    const carried = marks ? { newIds: new Set(marks.newIds), drops: new Map(Object.entries(marks.drops)) } : diff;
    state.changes = diff.newIds.size || diff.drops.size ? diff : prune(carried, items);
  } else if (marks) {
    state.changes = prune({ newIds: new Set(marks.newIds), drops: new Map(Object.entries(marks.drops)) }, items);
  }
  store.set('marks', { publishedAt: snap.publishedAt, newIds: [...state.changes.newIds], drops: Object.fromEntries(state.changes.drops) });
  store.set('seen', Object.fromEntries(items.map((d) => [d.id, bestPrice(d)])));
  state.snapshot = snap;
  state.items = items;
  if (state.mode === 'pickup' && !hasStock()) state.mode = 'ship';
  if (state.category && !items.some((d) => inCategory(d.category, state.category))) state.category = null;
  if (!state.changes.newIds.size && !state.changes.drops.size) state.onlyChanges = false;
}

const oldList = () => !!state.snapshot && !!(state.snapshot.savedAt || state.snapshot.publishedAt) &&
  Date.now() - (state.snapshot.savedAt || state.snapshot.publishedAt) > 36 * 3600e3;
const hasStock = () => !!(state.snapshot?.store && state.snapshot.stockStoreId === state.snapshot.store.id && state.snapshot.stock);
const changeIds = () => new Set([...state.changes.newIds, ...state.changes.drops.keys()]);

function visible() {
  return applyFilters(state.items, {
    query: state.query, category: state.category, minDiscount: state.floor, inStockOnly: state.inStockOnly,
    mode: state.mode, sort: state.sort, onlyIds: state.onlyChanges ? changeIds() : null
  });
}

// ------------------------------------------------------------------- render

// Lists are rebuilt with innerHTML; this finds the equivalent control again afterwards.
function focusKey() {
  const el = document.activeElement;
  if (!el || el === document.body || !el.closest('#main')) return null;
  if (el.dataset.act) return `[data-act="${el.dataset.act}"]` + (el.dataset.v != null ? `[data-v="${CSS.escape(el.dataset.v)}"]` : '') +
    (el.dataset.id != null ? `[data-id="${CSS.escape(el.dataset.id)}"]` : '');
  if (el.dataset.mode) return `[data-mode="${el.dataset.mode}"]`;
  return null;
}

function revealActiveChips() {
  for (const row of [$('floor-chips'), $('cat-chips')]) {
    const on = row.querySelector('.chip[aria-pressed="true"]:not([data-v="0"])');
    if (!on || row.scrollWidth <= row.clientWidth) { row.scrollLeft = 0; fadeEdges(row); continue; }
    if (on.offsetLeft + on.offsetWidth <= row.clientWidth - 32) row.scrollLeft = 0;
    else {
      const r = on.getBoundingClientRect(), box = row.getBoundingClientRect();
      if (r.left < box.left + 8 || r.right > box.right - 32) row.scrollLeft += r.left - box.left - 12;
    }
    fadeEdges(row);
  }
}

function fadeEdges(row) {
  row.classList.toggle('scrolled', row.scrollLeft > 4);
}
for (const id of ['floor-chips', 'cat-chips']) $(id).addEventListener('scroll', (e) => fadeEdges(e.target), { passive: true });

function render() {
  const key = focusKey();
  try {
    renderBody();
  } catch (err) {
    // Something in the list this page can't handle: say so rather than leave placeholders spinning.
    console.error(err);
    $('list').replaceChildren();
    const box = $('status');
    box.hidden = false;
    box.innerHTML = statusHtml('⚠️', 'Couldn’t show this list', 'The shared list has something this page can’t read. Try again in a minute.', [['Try again', 'retry', true]]);
    return;
  }
  // After layout settles: measuring the chip rows right after swapping in hundreds of cards would
  // force the whole list to lay out on the spot.
  if (state.snapshot) requestAnimationFrame(revealActiveChips);
  if (!key) return;
  const again = document.querySelector('#main ' + key);
  if (again && again.offsetParent) again.focus({ preventScroll: true });
  else if (document.activeElement === document.body) $('count').focus({ preventScroll: true });
}

function renderHeader() {
  const snap = state.snapshot;
  if (state.loading) $('subtitle').textContent = snap ? 'Checking for newer deals…' : 'Loading…';
  else if (snap) {
    const n = changeIds().size;
    $('subtitle').textContent = `${oldList() ? 'List from' : 'Updated'} ${relativeTime(snap.savedAt || snap.publishedAt)}` + (n ? ` · ${n} new or cheaper` : '');
  } else $('subtitle').textContent = state.error === 'stalled' ? 'Still loading — slow connection…' : 'Shared clearance list';

  // banner for stale / failed refresh with data on screen
  // Before there's a list, "browse here" and a search box would promise something that isn't there.
  document.querySelector('.search').hidden = (!snap && !state.loading) || (!!snap && !state.items.length);
  const notice = !!snap && (!!state.error || (state.items.length > 0 && oldList()));
  // One banner at a time: a stale or failed-update notice (which links to the app too) wins.
  $('intro').hidden = !introWanted || !snap || !state.items.length || notice ||
    !$('update-banner').hidden;
  if (snap) $('intro-text').innerHTML = hasStock()
    ? '<b>Clearance deals, shared with you.</b> Browse here, or <a href="get/">get the free app</a> to check <i>your</i> store.'
    : '<b>Clearance deals, shared with you.</b> Browse here, or <a href="get/">get the free app</a> for your store’s shelf stock.';
  const banner = $('banner');
  const hadFocus = banner.contains(document.activeElement);
  // The "new version" notice owns the banner slot until the reload.
  if (!$('update-banner').hidden) { banner.hidden = true; return; }
  if (snap && state.error) {
    banner.hidden = false;
    const shown = oldList() ? `showing the list from ${relativeTime(snap.savedAt || snap.publishedAt)} — prices may have changed` : 'showing the last deals loaded';
    const why = state.error === 'offline' ? 'You’re offline' : state.error === 'slow' ? 'Connection is slow' : state.error === 'bad' ? 'Couldn’t read the latest list' : 'Couldn’t check for updates';
    banner.innerHTML = `<span>${why} · ${shown}.</span>` +
      '<button class="text-btn" type="button" data-act="refresh">Try again</button>';
    if (hadFocus) banner.querySelector('button').focus();
  }
  else if (snap && state.items.length && oldList()) {
    banner.hidden = false;
    const age = relativeTime(snap.savedAt || snap.publishedAt);
    if (store.get('staleAck', null) === snap.publishedAt) {
      // Already acknowledged: one quiet line until a newer list arrives.
      banner.innerHTML = `<span>List from ${age} · prices may have changed</span>`;
    } else {
      banner.innerHTML = (introWanted
        ? (matchMedia('(max-width: 480px)').matches
          ? `<span><b>Shared list from ${age}</b> — prices may have changed. <a href="get/">Get the free app</a></span>`
          : `<span><b>Clearance deals, shared with you</b> · this list is from ${age} — prices may have changed. <a href="get/">Get the free app</a> for live prices at your store.</span>`)
        : `<span>This shared list is from ${age} — prices may have changed. <a href="get/">Get the app</a> for live prices anytime.</span>`) +
        '<button class="text-btn" type="button" data-act="stale-ok">Got it</button>';
    }
  } else banner.hidden = true;
  // The banner's Try again was pressed and it went away: land somewhere sensible, not on <body>.
  if (hadFocus && (banner.hidden || !banner.contains(document.activeElement))) {
    (banner.hidden ? $('refresh') : banner.querySelector('button, a') || $('refresh')).focus();
  }
}

let cardCache = new Map();

// A card's markup depends only on the item, the mode, the store and its new / price-drop marks.
const cardMemo = new WeakMap();
function cachedCardHtml(d) {
  const key = `${state.mode}|${hasStock() ? state.snapshot.store.id : ''}|${state.changes.newIds.has(d.id)}|${state.changes.drops.get(d.id) ?? ''}`;
  const hit = cardMemo.get(d);
  if (hit && hit.key === key) return hit.html;
  const html = cardHtml(d);
  cardMemo.set(d, { key, html });
  return html;
}

let renderToken = 0;
function renderBody() {
  renderToken++; // a newer render cancels cards still being added from the last one
  const snap = state.snapshot;
  const list = $('list');
  const status = $('status');
  $('controls').hidden = !snap;
  $('summary').hidden = !snap || !state.items.length;
  renderHeader();

  if (state.loading && !snap) {
    list.innerHTML = '<li class="skeleton"></li>'.repeat(4);
    cardCache = new Map();
    status.hidden = true;
    return;
  }
  if (!snap) {
    list.innerHTML = '';
    cardCache = new Map();
    status.hidden = false;
    status.innerHTML = state.error === 'stalled'
      ? statusHtml('⏳', 'Still loading deals…', 'Your connection is slow; the deals will appear here as soon as they arrive.', [['Try again', 'retry', false]])
      : state.error === 'empty'
      ? statusHtml('🏷️', 'No deals shared yet', 'The person who sent this link hasn’t shared a list yet. You can still get VS Clearance for your own phone or computer — it’s free.', [['Get the app', 'get', true], ['Check again', 'retry', false]])
      : statusHtml('⚠️', 'Couldn’t load deals', state.error === 'offline' || navigator.onLine === false
        ? 'You seem to be offline. Check your connection and try again.'
        : state.error === 'bad' ? 'The shared list couldn’t be read. Try again in a minute.'
        : state.error === 'server' ? 'The deals server had a problem. Try again in a minute.'
        : 'The deals server didn’t answer. Try again in a minute.', [['Try again', 'retry', true]]);
    return;
  }

  renderControls();
  const deals = visible();
  const total = state.mode === 'pickup'
    ? applyFilters(state.items, { mode: 'pickup' }).length
    : state.items.length;
  const unit = state.mode === 'pickup' ? 'in store' : 'deals';
  $('count').textContent = deals.length === total ? `${total} ${unit}` : `${deals.length} of ${total}`;
  $('count').setAttribute('aria-label', `Showing ${deals.length} of ${total} deals`);
  $('ask-ai').hidden = deals.length === 0;
  $('ask-ai').setAttribute('aria-label', `Ask AI to review ${Math.min(deals.length, AI_MAX_ITEMS)} deal${Math.min(deals.length, AI_MAX_ITEMS) === 1 ? '' : 's'}`);

  if (!deals.length) {
    list.innerHTML = '';
    status.hidden = false;
    status.innerHTML = noMatchesHtml();
    return;
  }
  status.hidden = true;
  status.innerHTML = '';
  // Reuse the card element when its markup is unchanged so images don't reload and flash.
  // Every built card is kept (filters only hide them), minus deals no longer in the list.
  const ids = new Set(state.items.map((d) => d.id));
  const next = new Map([...cardCache].filter(([id]) => ids.has(id)));
  const tpl = document.createElement('template');
  const build = (d) => {
    const html = cachedCardHtml(d);
    const old = next.get(d.id);
    if (old && old.html === html) return old.el;
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild;
    next.set(d.id, { html, el });
    return el;
  };
  // Building hundreds of new cards at once freezes a phone for a second: show the first screenful
  // now and add the rest in small steps (cards already built are reused, so later renders are quick).
  const fresh = deals.filter((d) => !next.has(d.id)).length;
  const first = fresh > 60 ? 40 : deals.length;
  const els = deals.slice(0, first).map(build);
  cardCache = next;
  list.replaceChildren(...els);
  if (first < deals.length) {
    const token = renderToken;
    const rest = deals.slice(first);
    const more = () => {
      if (token !== renderToken) return;
      const chunk = rest.splice(0, 60).map(build);
      list.append(...chunk);
      if (rest.length) setTimeout(more, 0);
    };
    setTimeout(more, 0);
  }
}

function renderControls() {
  const pickupOk = hasStock();
  // Pick up only means something when the list carries a store's shelf stock.
  $('fulfil').hidden = !pickupOk;
  for (const b of document.querySelectorAll('.segmented button')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
    b.tabIndex = b.dataset.mode === state.mode ? 0 : -1;
  }
  const s = state.snapshot.store;
  // Without shelf stock there's nothing store-specific to say (the header already offers the app).
  $('store-line').hidden = !(s && pickupOk);
  $('store-line').innerHTML = s && pickupOk
    ? `Shelf stock is for <b>${esc(s.name)}</b>${storeAddress(s) ? ' · ' + esc(storeAddress(s)) : ''}. <a href="get/">Check your store</a>`
    : '';

  const chips = [];
  const hasClear = !!(state.query || state.category || state.floor || state.onlyChanges);
  if (hasClear) chips.push(`<button class="chip clear" data-act="clear">Clear filters</button>`);
  if (state.mode === 'ship' && (!state.inStockOnly || state.items.some((d) => d.oos))) {
    chips.push(`<button class="chip" data-act="instock" aria-pressed="${state.inStockOnly}">In stock online</button>`);
  }
  // Each discount chip shows how many deals it leaves; one that changes nothing is dropped.
  const base = { query: state.query, category: state.category, inStockOnly: state.inStockOnly, mode: state.mode,
    sort: state.sort, onlyIds: state.onlyChanges ? changeIds() : null };
  let prev = -1;
  // Nothing matches at all: the empty state offers the fixes, so a row of zeros would only add noise.
  const counting = { ...base, unsorted: true };
  // One filter pass; each discount level is a count over it.
  const anyDiscount = applyFilters(state.items, { ...counting, minDiscount: 0 });
  const atLeast = (f) => (f ? anyDiscount.filter((d) => discount(d) >= f).length : anyDiscount.length);
  const none = anyDiscount.length === 0;
  const nActive = state.floor ? atLeast(state.floor) : -1;
  for (const f of none ? [] : FLOORS) {
    const n = atLeast(f);
    // "Any discount" that would show exactly what the active floor shows is just noise (Clear resets it).
    if (!f && state.floor && n === nActive) { prev = n; continue; }
    if (f && (n === 0 || n > prev * 0.97) && state.floor !== f) continue;
    prev = n;
    chips.push(`<button class="chip" data-act="floor" data-v="${f}" aria-pressed="${state.floor === f}">${f ? f + '%+ off' : 'Any discount'} <span class="n">${n}</span></button>`);
  }
  // On touch screens the row scrolls sideways: what's active (and Clear) leads so it's in view.
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse) {
    const pri = (h) => h.includes('chip clear') ? 0 : /data-act="floor" data-v="[1-9]\d*" aria-pressed="true"/.test(h) ? 1 : 2;
    chips.sort((a, b) => pri(a) - pri(b));
  }
  const row = $('floor-chips');
  row.innerHTML = chips.join('');
  if (hasClear && !renderControls.hadClear) row.scrollLeft = 0;
  renderControls.hadClear = hasClear;

  // Category chips count within the other filters; the rest of the categories live in "More".
  const catBase = { ...base, minDiscount: state.floor, category: null, unsorted: true };
  const inView = applyFilters(state.items, catBase);
  const all = categoryCounts(state.items);
  // One pass over the list, then each family sums the categories that fold into it.
  const perCat = new Map();
  for (const d of inView) { const k = d.category; perCat.set(k, (perCat.get(k) || 0) + 1); }
  const countMemo = new Map();
  const countIn = (c) => {
    if (!countMemo.has(c)) {
      let n = 0;
      for (const [k, v] of perCat) if (k && inCategory(k, c)) n += v;
      countMemo.set(c, n);
    }
    return countMemo.get(c);
  };
  // Families with nothing under the current filters (e.g. none on this store's shelf) are left out.
  const counted = all.map((e, i) => [e[0], countIn(e[0]), i]);
  const live = counted.filter((e) => e[0] === state.category || e[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((e) => e[0]);
  // The active category leads, so a returning visitor sees why the list is short.
  const cats = [...(state.category ? [state.category] : []), ...live.filter((c) => c !== state.category)].slice(0, 8);
  const more = live.filter((c) => !cats.includes(c)).sort((a, b) => a.localeCompare(b));
  const n = changeIds().size;
  const catChips = [
    ...(n ? [`<button class="chip" data-act="changes" aria-pressed="${state.onlyChanges}">✨ New & price drops (${n})</button>`] : []),
    ...cats.map((c) => `<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${state.category === c}">${esc(c)} <span class="n">${countIn(c)}</span></button>`),
    ...(more.length ? [`<label class="chip more"><span>More categories (${more.length})</span><select id="cat-more" aria-label="More categories">
      <option value="">More categories…</option>${more.map((c) => `<option value="${esc(c)}">${esc(c)} (${countIn(c)})</option>`).join('')}</select></label>`] : [])
  ];
  if (coarse) {
    // "More" comes second only when the active category came from it (so the choice is visible).
    const fromMore = !!state.category && !cats.slice(1).includes(state.category) && !live.slice(0, 8).includes(state.category);
    const pri = (h) => /data-act="cat"[^>]*aria-pressed="true"/.test(h) ? 0 : h.includes('chip more') ? (fromMore ? 1 : 4) : h.includes('data-act="changes"') ? 2 : 3;
    catChips.sort((a, b) => pri(a) - pri(b));
  }
  $('cat-chips').innerHTML = catChips.join('');

  const sel = $('sort');
  if (!sel.options.length) sel.innerHTML = SORTS.map((o) => `<option value="${o.id}">${esc(o.short)}</option>`).join('');
  sel.value = state.sort;
}

const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81a3 3 0 1 0 0 4.38l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"/></svg>';

function cardHtml(d) {
  const est = cartEstimate(d);
  const off = discount(d);
  const adp = autoDeliveryDeal(d);
  const isNew = state.changes.newIds.has(d.id);
  const was = state.changes.drops.get(d.id);
  const store = state.snapshot.store;
  let stock, dot;
  const shelf = store && hasStock() ? d.qty : undefined;
  if (state.mode === 'pickup') {
    if (shelf != null && shelf > 0) { stock = `${shelf} on the shelf${d.pickup ? '' : ' · walk‑in only'}`; dot = 'good'; }
    else if (shelf != null) { stock = 'Not on the shelf'; dot = ''; }
    else { stock = 'Shelf stock unknown'; dot = ''; }
  } else {
    stock = d.oos ? 'Out of stock online' : 'In stock online';
    dot = d.oos ? 'bad' : 'good';
    if (shelf != null) stock += shelf > 0 ? ` · ${shelf} in store${d.pickup ? '' : ' (walk‑in only)'}` : ' · none in store';
  }
  const pills = facts(d).map((f) => `<span class="pill">${esc(f)}</span>`).join('') +
    (d.rating && d.reviews >= 3 ? `<span class="rating">★ ${d.rating.toFixed(1)} (${d.reviews})</span>` : '');
  const priceLabel = est != null ? `About ${money(est)} in cart` : money(d.site);
  return `<li class="card">
    <a class="thumb${d.img ? '' : ' none'}" href="${esc(d.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '📦'}</a>
    <div class="body">
      <div class="brandline"><span class="brand">${esc(d.brand || 'Vitamin Shoppe')}</span>${isNew ? '<span class="tag new">NEW</span>' : ''}${was != null ? '<span class="tag drop">PRICE DROP</span>' : ''}</div>
      <a class="title" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a>
      <div class="prices">
        <span class="visually-hidden">${esc(priceLabel + (off ? `, was ${money(d.list)}, ${off} percent off` : ''))}</span>
        <span class="price" aria-hidden="true">${est != null ? '≈' : ''}${money(bestPrice(d))}</span>
        ${off ? `<span class="was" aria-hidden="true">${money(d.list)}</span><span class="tag off" aria-hidden="true">−${off}%</span>` : ''}
      </div>
      ${was != null ? `<span class="note">Down from <s>${money(was)}</s> since your last visit</span>` : ''}
      ${est != null ? `<span class="note cart">${Math.round(d.site * 100) !== Math.round(d.list * 100) ? `Extra ${d.cart}% off in cart (page shows ${money(d.site)})` : `${d.cart}% off at checkout`}</span>` : ''}
      ${adp ? `<span class="note">${money(adp)} with Auto Delivery</span>` : ''}
      ${pills ? `<div class="pills">${pills}</div>` : ''}
      <div class="foot">
        <span class="stock"><span class="dot ${dot}"></span>${esc(stock)}</span>
        <button class="icon-btn" data-act="share" data-id="${esc(d.id)}" aria-label="Share ${esc(d.title)}">${ICON_SHARE}</button>
        <a class="icon-btn" href="${esc(d.url)}" target="_blank" rel="noopener" tabindex="-1" aria-label="Open ${esc(d.title)} on vitaminshoppe.com">${ICON_OPEN}</a>
      </div>
    </div>
  </li>`;
}

function statusHtml(icon, title, body, actions = []) {
  return `<div class="badge" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${body}</p>` +
    (actions.length ? `<div class="actions">${actions.map(([label, act, primary]) =>
      `<button class="${primary ? 'primary-btn' : 'outline-btn'}" data-act="${act}">${label}</button>`).join('')}</div>` : '');
}

function noMatchesHtml() {
  if (!state.items.length) {
    const when = state.snapshot && (state.snapshot.savedAt || state.snapshot.publishedAt);
    return statusHtml('🏷️', 'No deals in this list', when
      ? `The last shared list (${relativeTime(when)}) had no deals on it. Check back later, or get the app to browse every clearance deal yourself.`
      : 'The person who shared it hasn’t published any deals yet. Check back later, or get the app to browse every clearance deal yourself.', [['Get the app', 'get', true]]);
  }
  const store = state.snapshot.store;
  const atStore = state.mode === 'pickup' && store ? ` at ${esc(store.name)}` : '';
  const reasons = [
    state.query && `matching “${esc(state.query.trim())}”`,
    state.category && `in ${esc(state.category)}`,
    state.floor && `at ${state.floor}%+ off`,
    state.mode === 'ship' && state.inStockOnly && state.items.some((d) => d.oos) && 'in stock online'
  ].filter(Boolean);
  const fixes = [];
  if (state.query) fixes.push(['Clear search', 'clear-search']);
  if (state.category) fixes.push(['All categories', 'clear-cat']);
  if (state.floor) fixes.push(['Any discount', 'any-floor']);
  if (state.onlyChanges) fixes.push(['Show everything', 'clear']);
  if (state.mode === 'pickup') fixes.push(['Show ship-to-home', 'ship']);
  if (!fixes.length && state.mode === 'ship' && state.inStockOnly && state.items.some((d) => d.oos)) fixes.push(['Include out of stock', 'instock']);
  return statusHtml('🔍', 'No matching deals',
    reasons.length ? `Nothing on clearance${atStore} ${reasons.join(', ')}.` : `Nothing on clearance${atStore} right now.`,
    fixes.map((f, i) => [f[0], f[1], i === 0]));
}

// ------------------------------------------------------------------- actions

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function update(change) {
  change();
  savePrefs();
  render();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act], [data-mode]');
  if (!el) return;
  if (el.dataset.mode) {
    if (el.dataset.mode === 'pickup' && !hasStock()) return toast('This share has no shelf stock — get the app to check your store.');
    return update(() => { state.mode = el.dataset.mode; });
  }
  const act = el.dataset.act;
  switch (act) {
    case 'floor': return update(() => { state.floor = Number(el.dataset.v); });
    case 'instock': return update(() => { state.inStockOnly = !state.inStockOnly; });
    case 'cat': return update(() => { state.category = state.category === el.dataset.v ? null : el.dataset.v; });
    case 'changes': return update(() => { state.onlyChanges = !state.onlyChanges; });
    case 'clear': {
      const viaKeys = document.activeElement === el;
      update(() => { state.query = ''; $('q').value = ''; $('q-clear').hidden = true; state.category = null; state.floor = 0; state.onlyChanges = false; });
      if (viaKeys) { const first = document.querySelector('#floor-chips .chip'); if (first) first.focus({ preventScroll: true }); }
      return;
    }
    case 'clear-search': update(() => { state.query = ''; $('q').value = ''; $('q-clear').hidden = true; }); return $('q').focus();
    case 'clear-cat': return update(() => { state.category = null; });
    case 'any-floor': return update(() => { state.floor = 0; });
    case 'ship': return update(() => { state.mode = 'ship'; });
    case 'retry': return retryFirstLoad();
    case 'get': location.href = 'get/'; return;
    case 'refresh': return load({ manual: true });
    case 'reload': location.reload(); return;
    case 'stale-ok':
      store.set('staleAck', state.snapshot?.publishedAt ?? null);
      if (introWanted) { introWanted = false; store.set('introDismissed', true); }
      renderHeader();
      // Not the search box: on a phone that would open the keyboard over the list.
      (document.querySelector('#floor-chips .chip') || $('count')).focus({ preventScroll: true });
      return;
    case 'share': return shareDeal(state.items.find((d) => d.id === el.dataset.id));
  }
});

// Nothing on screen yet: show the loading state again so the attempt is visible either way.
async function retryFirstLoad() {
  state.loading = true; render();
  // A short minimum so a quick failure still reads as "tried again".
  await Promise.all([load({ manual: true }), new Promise((r) => setTimeout(r, 400))]);
  if (state.error === 'offline') toast('Still offline — check your connection.');
  else if (state.error === 'empty') toast('Still nothing shared yet — check back later.');
  else if (state.error === 'server') toast('The deals server still has a problem — try again in a minute.');
  else if (state.error === 'bad') toast('Still couldn’t read the list — try again in a minute.');
  else if (state.error === 'stalled') toast('Still loading — your connection is slow.');
  else if (state.error) toast('Still no answer from the deals server — try again in a minute.');
  const again = document.querySelector('#status [data-act="retry"]');
  if (again) again.focus();
  else if (state.snapshot) (matchMedia('(pointer: coarse)').matches ? $('count') : $('q')).focus({ preventScroll: true });
}

async function shareDeal(d) {
  if (!d) return;
  const est = cartEstimate(d);
  const off = discount(d);
  const text = `${d.brand ? d.brand + ' — ' : ''}${d.title}\n${est != null ? '≈' + money(est) + ' in cart' : money(d.site)}` +
    `${off ? ` (was ${money(d.list)}, ${off}% off)` : ''} at The Vitamin Shoppe`;
  try {
    if (nativeShare) await navigator.share({ title: d.title, text, url: d.url });
    else { await navigator.clipboard.writeText(`${text}\n${d.url}`); toast('Deal copied'); }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // closed the share sheet
    toast(copyFallback(`${text}\n${d.url}`) ? 'Deal copied' : 'Couldn’t copy here — open the deal to share it from the store page');
  }
}

// Clipboard refused (some in-app browsers, older Safari): the old select-and-copy route.
function copyFallback(text) {
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not supported */ }
  t.remove();
  return ok;
}

// Offline (images aren't cached) or a missing product photo: show the 📦 placeholder, not a broken icon.
$('list').addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  img.parentNode.classList.add('none');
  img.replaceWith('📦');
}, true);

let typing;
$('q').disabled = false; // enabled once the app is running (see index.html)
$('q').addEventListener('input', (e) => {
  $('q-clear').hidden = !e.target.value;
  clearTimeout(typing);
  const value = e.target.value;
  typing = setTimeout(() => { state.query = value; render(); }, 120);
});
$('q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (matchMedia('(pointer: coarse)').matches) e.target.blur();
  else $('count').focus({ preventScroll: true });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || $('prompt-dialog').open) return;
  const t = e.target;
  if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  e.preventDefault();
  $('q').focus();
});
$('q-clear').addEventListener('click', () => { $('q').value = ''; $('q-clear').hidden = true; state.query = ''; render(); $('q').focus(); });
$('fulfil').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const mode = state.mode === 'ship' ? 'pickup' : 'ship';
  update(() => { state.mode = mode; });
  document.querySelector(`#fulfil [data-mode="${mode}"]`).focus();
});
$('sort').addEventListener('change', (e) => update(() => { state.sort = e.target.value; }));
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'cat-more' || !['ArrowDown', 'ArrowUp'].includes(e.key) || e.altKey) return;
  e.preventDefault();
  try { e.target.showPicker(); } catch { /* older browsers: Space/Alt+Down still open it */ }
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'cat-more' || !e.target.value) return;
  const v = e.target.value;
  update(() => { state.category = v; });
  const chip = document.querySelector(`#cat-chips [data-act="cat"][data-v="${CSS.escape(v)}"]`);
  if (chip) { chip.focus({ preventScroll: true }); chip.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
});
// From far down the list: back to the top with the search box ready.
$('to-search').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('q').focus({ preventScroll: true });
});
$('refresh').addEventListener('click', () => (state.snapshot ? load({ manual: true }) : retryFirstLoad()));

// AI prompt sheet
let promptText = '';
$('ask-ai').addEventListener('click', () => {
  const deals = visible();
  if (!deals.length) return toast('No deals to review — loosen your filters first.');
  const s = state.snapshot.store;
  promptText = aiPrompt(deals, deals.length, s, state.mode);
  const shown = Math.min(deals.length, AI_MAX_ITEMS);
  const scope = [state.mode === 'pickup' && s ? `On the shelf at ${s.name}` : hasStock() && 'Ship to home',
    state.floor && `${state.floor}%+ off`, state.category, state.query && `“${state.query.trim()}”`].filter(Boolean).join(' · ');
  $('prompt-scope').innerHTML = `<b>${deals.length > shown ? `Top ${shown} of ${deals.length} deals` : `${shown} deals`}</b>${esc(scope)}` +
    (deals.length > shown ? `<small>Sorted by ${esc((SORTS.find((o) => o.id === state.sort) || SORTS[0]).label.toLowerCase())}.</small>` : '');
  $('prompt-text').textContent = promptText;
  $('copy-prompt').textContent = 'Copy prompt';
  $('copy-note').textContent = '';
  $('ai-links').hidden = true;
  $('prompt-details').open = false;
  $('share-prompt').hidden = !nativeShare;
  $('prompt-dialog').showModal();
  $('copy-prompt').focus();
});
// Feedback lives in the sheet: the page toast sits underneath the modal.
$('copy-prompt').addEventListener('click', async () => {
  const btn = $('copy-prompt');
  const note = $('copy-note');
  try {
    await navigator.clipboard.writeText(promptText);
    btn.textContent = 'Copied ✓';
    note.textContent = 'Now paste it into your AI chat:';
    $('ai-links').hidden = false;
  } catch {
    btn.textContent = 'Copy prompt';
    note.textContent = 'Couldn’t copy automatically — the prompt is selected below; copy it from there.';
    $('prompt-details').open = true;
    const range = document.createRange();
    range.selectNodeContents($('prompt-text'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  clearTimeout(btn.timer);
  btn.timer = setTimeout(() => { btn.textContent = 'Copy prompt'; }, 2500);
});
$('share-prompt').addEventListener('click', async () => {
  try {
    await navigator.share({ title: 'Vitamin Shoppe clearance deals to review', text: promptText });
  } catch (e) {
    if (e && e.name === 'AbortError') return; // closed the share sheet
    $('copy-prompt').click(); // in-app browsers refuse share: copy (or select) the prompt instead
  }
});
$('prompt-dialog').addEventListener('click', (e) => { if (e.target === $('prompt-dialog')) $('prompt-dialog').close(); });

// iPhone "Add to Home Screen" hint (Safari has no install prompt)
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
// The Home Screen tip waits for a later visit, so a first-time visitor sees one banner, not two.
var introWanted = !standalone && !store.get('introDismissed', false);
const firstSeen = store.get('firstSeen', null) ?? Date.now();
store.set('firstSeen', firstSeen);
if (!introWanted && isIos && !standalone && !store.get('installHintDismissed', false) && Date.now() - firstSeen > 12 * 3600e3) {
  $('install-hint').hidden = false;
}
$('intro-dismiss').addEventListener('click', () => {
  introWanted = false;
  $('intro').hidden = true; store.set('introDismissed', true);
  renderHeader();
  const next = document.querySelector('#floor-chips .chip') || $('q');
  next.focus({ preventScroll: true });
});
$('install-dismiss').addEventListener('click', () => {
  $('install-hint').hidden = true; store.set('installHintDismissed', true);
  (document.querySelector('#floor-chips .chip') || $('q')).focus({ preventScroll: true });
});

// keep fresh: poll while visible, and immediately when the app comes back
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
window.addEventListener('online', () => load());
window.addEventListener('offline', () => { if (state.snapshot) { state.error = 'offline'; renderHeader(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if (state.snapshot && document.visibilityState === 'visible') renderHeader(); }, 60_000);

// A new version of the site: the new service worker takes over and the page offers a reload.
// (Not on the very first visit, when there was no worker before.)
if ('serviceWorker' in navigator) {
  let hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // A tab left open for days still learns about new versions: hourly, and whenever it's looked at again.
    const check = () => { if (reg && document.visibilityState === 'visible') reg.update().catch(() => {}); };
    setInterval(check, 3600e3);
    document.addEventListener('visibilitychange', check);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const offer = hadWorker;
    hadWorker = true; // the first worker taking over isn't news; the next one is
    if (!offer) return;
    // The page usually already runs the new code (the worker fetches network-first); ask the
    // new worker which version it is and only offer a reload when this page is older.
    if (BUILD === 'dev' || !navigator.serviceWorker.controller) { showUpdate(); return; }
    navigator.serviceWorker.controller.postMessage('version');
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    const v = e.data && e.data.version;
    if (typeof v === 'string' && !v.endsWith('-' + BUILD)) showUpdate();
  });
}
function showUpdate() {
  $('update-banner').hidden = false;
  renderHeader();
}

render();
load();
// Show the list saved on this device straight away (weak in-store signal); load() replaces it.
(async () => {
  try {
    const r = window.caches && await caches.match('api/snapshot');
    if (!r || state.snapshot) return;
    const snap = await r.json();
    if (state.snapshot || !Array.isArray(snap?.items)) return;
    acceptSnapshot(snap);
    render();
  } catch { /* no saved copy: the network load shows its own states */ }
})();
setTimeout(() => {
  if (state.loading && !state.snapshot) $('subtitle').textContent = 'Still loading — slow connection…';
}, 10000);
