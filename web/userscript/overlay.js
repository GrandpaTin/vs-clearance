// VS Clearance overlay. Runs inside the user's own browser on vitaminshoppe.com and calls the
// same JSON endpoints the site's pages call, with the user's own session. Built into a single
// userscript by scripts/build-userscript.mjs (core.js functions are in scope there).
import {
  SORTS, FLOORS, AI_MAX_ITEMS, normalizeItem, cartEstimate, bestPrice, discount, autoDeliveryDeal, money, facts,
  applyFilters, topCategories, changes, prune, aiPrompt, storeAddress, relativeTime, clearanceUrl, storeSearchUrl,
  inventoryUrl, parseClearancePage, parseStores, parseInventory, todaysHours
} from '../public/core.js';

/* global __VSX_CSS__ */
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
