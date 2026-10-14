// VS Clearance overlay. Runs inside the user's own browser on vitaminshoppe.com and calls the
// same JSON endpoints the site's pages call, with the user's own session. Built into a single
// userscript by scripts/build-userscript.mjs (core.js functions are in scope there).
import {
  SORTS, FLOORS, AI_MAX_ITEMS, normalizeItem, cartEstimate, bestPrice, discount, autoDeliveryDeal, money, facts,
  applyFilters, topCategories, changes, prune, aiPrompt, storeAddress, relativeTime, clearanceUrl, storeSearchUrl,
  inventoryUrl, parseClearancePage, parseStores, parseInventory, todaysHours, isListingDespiteStatus
} from '../public/core.js';

/* global __VSX_CSS__, __VSX_VERSION__, __VSX_HOME__ */
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
  try {
    rebuild();
    restoreMarks();
  } catch {
    // A saved list from another version (or a damaged save): start fresh instead of failing to load.
    state.raw = []; state.savedAt = null; state.items = [];
    for (const k of ['cache', 'marks', 'baseline']) put(k, null);
  }

  // ------------------------------------------------------------------- loading

  /** One list load at a time; a second request shares (and waits for) the one already running. */
  function loadDeals() {
    if (!loadDeals.p) loadDeals.p = loadDealsNow().finally(() => { loadDeals.p = null; });
    return loadDeals.p;
  }
  async function loadDealsNow() {
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
    // Already checking this store: a second run would only send every batch twice.
    if (state.stockLoading && loadStock.storeId === store.id) return;
    loadStock.storeId = store.id;
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
    // Esc works straight away (focus starts on the page underneath). With no list and a problem shown,
    // start on its action (Try again / Reload page) instead.
    const action = !state.items.length && !state.loading && !ref('status').hidden && ref('status').querySelector('button, a.primary-btn');
    (action || app).focus({ preventScroll: true });
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
    const now = Date.now();
    const listDue = state.error ? !state.blocked && !state.siteChanged && now >= nextErrorRetry : listIsOld();
    const stockDue = state.stockError ? !state.stockBlocked && now >= nextStockRetry : stockIsDue();
    if (listDue) loadDeals(); else if (stockDue) loadStock({ onlyMissing: gapsOnly() });
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
    if (state.sheet) {
      const live = ref('sheetLive');
      live.textContent = '';
      requestAnimationFrame(() => { live.textContent = text; }); // re-announced even when repeated
    }
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
        if (!state.error && state.items.length) toast(state.partialNote ? 'Deals partly updated — see the note above' : 'Deals updated');
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
