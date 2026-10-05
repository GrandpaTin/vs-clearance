import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItem, cartEstimate, bestPrice, discount, autoDeliveryDeal, perServingLabel, facts, applyFilters, sortDeals,
  changes, prune, aiPrompt, sizeLabel, shortSize, matcher, categoryCounts, inCategory, storeAddress, cleanCategory
} from '../public/core.js';

// Same shape the Android app publishes (LocalStore.dealToJson, -1 = absent).
const raw = (id, o = {}) => ({
  id, jda: 'j' + id, brand: 'Brand', title: `Product ${id}`, url: `https://www.vitaminshoppe.com/p/${id}`, img: '',
  list: 20, site: 10, adp: -1, cart: -1, servings: -1, servingSize: '', form: '', category: '', variants: '',
  rating: -1, reviews: 0, oos: false, pickup: true, ...o
});
const item = (id, o, stock) => normalizeItem(raw(id, o), stock);

test('cart-only discount is estimated from list price, as on the site', () => {
  const liver = item('GH-1003', { list: 34.97, site: 34.97, cart: 75 });
  assert.equal(cartEstimate(liver), 8.74);
  assert.equal(discount(liver), 75);
  const partial = item('TM', { list: 32.97, site: 26.39, cart: 50 });
  assert.equal(bestPrice(partial), 16.49);
  assert.equal(cartEstimate(item('X', { list: 20, site: 4, cart: 50 })), null, 'estimate must beat the page price');
  assert.equal(cartEstimate(item('Y', { cart: 100 })), null);
});

test('per-serving labels and fact pills', () => {
  assert.equal(perServingLabel(item('a', { site: 6.24, servings: 60 })), '10¢/serving');
  assert.equal(perServingLabel(item('b', { site: 12.5, servings: 10 })), '$1.25/serving');
  assert.equal(sizeLabel('Fadogia (60 Vegetarian Capsules)'), '60 Vegetarian Capsules');
  assert.equal(shortSize('60 Vegetarian Capsules'), '60 veg caps');
  assert.equal(shortSize('90 Tablet(s)'), '90 tabs');
  assert.deepEqual(facts(item('c', { title: 'Oregon Grape (90 Capsules)', servings: 90, site: 3.49 })), ['90 caps', '4¢/serving']);
  assert.deepEqual(facts(item('d', { title: 'Gummies (40 Gummies)', servings: 20, site: 3.24 })), ['40 gummies', '20 servings', '16¢/serving']);
});

test('search ignores case, accents and punctuation', () => {
  const omega = item('o', { brand: 'Nordic Naturals', title: 'Ultimate Omega-3 Fish Oil' });
  const creme = item('c', { brand: 'Café', title: 'Crème Protein' });
  for (const q of ['omega 3', 'OMEGA-3', 'omega3', 'fishoil']) assert.ok(matcher(q)(omega), q);
  assert.ok(matcher('creme cafe')(creme));
  assert.ok(!matcher('zinc')(omega));
});

test('search: short words stick to the word before, matches start at word boundaries', () => {
  const d3 = item('a', { brand: 'NOW', title: 'Vitamin D-3 5000 IU' });
  const multi = item('b', { brand: 'Alive', title: 'Multivitamin Gummies for Kids' });
  const drink = item('c', { brand: 'Barebells', title: 'Protein Drink 24g' });
  const k2 = item('d', { brand: 'Jarrow', title: 'MK-7 Vitamin K2' });
  const b12 = item('e', { brand: 'Garden of Life', title: 'Vitamin Code B12' });
  const all = [d3, multi, drink, k2, b12];
  const ids = (q) => all.filter(matcher(q)).map((d) => d.id);
  assert.deepEqual(ids('vitamin d'), ['a']);
  assert.deepEqual(ids('d3'), ['a']);
  assert.deepEqual(ids('k2'), ['d']);
  assert.deepEqual(ids('b12'), ['e']);
  assert.deepEqual(ids('vitamin k2'), ['d']);
  // Title matches lead, then the chosen sort.
  const vs = item('f', { brand: 'The Vitamin Shoppe', title: 'Collagen', site: 1 });
  const got = applyFilters([vs, b12], { query: 'vitamin', sort: 'priceAsc' }).map((d) => d.id);
  assert.deepEqual(got, ['e', 'f']);
});

test('Auto Delivery only counts when it beats the in-cart price', () => {
  assert.equal(autoDeliveryDeal(item('a', { list: 60, site: 60, cart: 75, adp: 50.97 })), null);
  assert.equal(autoDeliveryDeal(item('b', { list: 20, site: 10, adp: 9 })), 9);
});

test('search: no hits straddling words, plurals, and the product itself first', () => {
  const cogni = item('a', { title: 'Brain Gummies with Cognizin Citicoline' });
  const multi = item('b', { title: "Men's Multivitamin To Help" });
  const straw = item('c', { title: 'Strawberry Protein' });
  const all = [cogni, multi, straw];
  assert.deepEqual(all.filter(matcher('zinc')).map((d) => d.id), []);
  assert.deepEqual(all.filter(matcher('mint')).map((d) => d.id), []);
  assert.deepEqual(all.filter(matcher('berry')).map((d) => d.id), ['c']);
  const pro = item('p', { title: 'Daily Probiotic 50 Billion' });
  assert.ok(matcher('probiotics')(pro) && matcher('probiotic')(pro));
  const creamer = item('k', { title: 'Collagen Creamer with Magnesium', site: 1 });
  const citrate = item('m', { title: 'Magnesium Citrate Complex', site: 9 });
  const glyc = item('g', { title: 'Sleep Support - Magnesium Glycinate', site: 5 });
  const got = applyFilters([creamer, citrate, glyc], { query: 'magnesium', sort: 'priceAsc' }).map((d) => d.id);
  assert.deepEqual(got, ['m', 'g', 'k']);
  // A whey powder leads; bars, creamers and snacks made with protein follow.
  const bar = item('b', { title: 'Protein Bar - Chocolate', category: 'Protein Bars', site: 1 });
  const whey = item('w', { title: 'Whey Protein Isolate', category: 'Build Muscle', site: 30 });
  const peptides = item('p', { title: 'Collagen Peptides Powder', site: 20 });
  const creamer2 = item('c', { title: 'Collagen Creamer with Magnesium', site: 2 });
  assert.deepEqual(applyFilters([bar, whey], { query: 'protein', sort: 'priceAsc' }).map((d) => d.id), ['w', 'b']);
  assert.deepEqual(applyFilters([creamer2, peptides], { query: 'collagen', sort: 'priceAsc' }).map((d) => d.id), ['p', 'c']);
  assert.deepEqual(applyFilters([whey, bar], { query: 'protein bar', sort: 'priceDesc' }).map((d) => d.id), ['b']);
  const fish = item('f', { title: 'Critical Omega - 2,400 mg Fish Oil', site: 9 });
  const buckthorn = item('s', { title: 'Omega-7 Sea Buckthorn Blend', category: 'Fish Oil', site: 1 });
  assert.deepEqual(applyFilters([buckthorn, fish], { query: 'fish oil', sort: 'priceAsc' }).map((d) => d.id), ['f', 's']);
});

test('filters: discount floor, in-stock, pickup shelf stock, category, only-ids', () => {
  const stock = { ja: 3, jb: 0 };
  const items = [
    item('a', { site: 5, category: 'Magnesium' }, stock),
    item('b', { site: 15 }, stock),
    item('c', { site: 5, oos: true }, stock),
    item('d', { site: 5, pickup: false, jda: 'ja' }, stock)
  ];
  const ids = (c) => applyFilters(items, { sort: 'discount', ...c }).map((d) => d.id);
  assert.deepEqual(ids({ minDiscount: 75 }), ['a', 'c', 'd']);
  assert.deepEqual(ids({ inStockOnly: true }), ['a', 'd', 'b']);
  // On the shelf counts even when the store won't hold it for online pickup (walk-in only).
  assert.deepEqual(ids({ mode: 'pickup' }), ['a', 'd']);
  assert.deepEqual(ids({ category: 'magnesium' }), ['a']);
  assert.deepEqual(ids({ onlyIds: new Set(['b']) }), ['b']);
});

test('sorts match the Android app, including best value with missing servings last', () => {
  const items = [
    item('a', { brand: 'Nordic', site: 5, servings: 60 }),
    item('b', { brand: 'KAL', site: 15, servings: 30 }),
    item('c', { brand: 'Gaia', site: 20, cart: 75 }),
    item('d', { brand: 'Cafe', list: 40, site: 30 })
  ];
  const ids = (s) => sortDeals(items, s).map((d) => d.id);
  assert.deepEqual(ids('discount'), ['c', 'a', 'b', 'd']);
  assert.deepEqual(ids('priceDesc'), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids('value'), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids('brand'), ['d', 'c', 'b', 'a']);
});

test('changes since last visit: new items, real drops, no false drops', () => {
  const now = [item('a', { site: 9 }), item('b', { site: 8.004 }), item('d')];
  const ch = changes({ a: 10, b: 8, c: 5 }, now);
  assert.deepEqual([...ch.newIds], ['d']);
  assert.deepEqual([...ch.drops], [['a', 10]]);
  assert.equal(changes({}, now).newIds.size, 0, 'first visit marks nothing');
  assert.deepEqual([...changes({ a: 10 }, [item('a', { site: 9.99 })]).drops.keys()], ['a'], 'one-cent drop counts');
  const pruned = prune(ch, [item('a', { site: 12 })]);
  assert.equal(pruned.drops.size, 0, 'a drop whose price went back up is removed');
  assert.equal(pruned.newIds.size, 0, 'vanished item is removed');
});

test('AI prompt: top 35, real links, store context, cart note', () => {
  const many = Array.from({ length: 50 }, (_, i) => item('p' + (i + 1), { servings: 10 }));
  const store = { id: '702', name: 'Tampa, FL', a1: '102 N Dale Mabry Hwy', a2: '', city: 'Tampa', state: 'FL', zip: '33609' };
  const text = aiPrompt(many, 50, store, 'pickup');
  assert.match(text, /top 35 of 50/);
  assert.match(text, /on the shelf at The Vitamin Shoppe, Tampa, FL/);
  assert.match(text, /https:\/\/www\.vitaminshoppe\.com\/p\/p1\b/);
  assert.doesNotMatch(text, /\/p36\b/);
  const cartText = aiPrompt([item('g', { cart: 75 })], 1, null, 'ship');
  assert.match(cartText, /≈\$5\.00 in cart/);
  assert.match(cartText, /are estimates/);
});

test('sub-categories fold into a family that exists, and filter with it', () => {
  const items = [
    item('a', { category: 'Probiotics' }), item('b', { category: "Women's Probiotics" }),
    item('c', { category: 'Refrigerated Probiotics' }), item('d', { category: 'Sports Probiotics Blend' }),
    item('e', { category: 'Creatine' })
  ];
  assert.deepEqual(categoryCounts(items), [['Probiotics', 3], ['Creatine', 1], ['Sports Probiotics Blend', 1]]);
  assert.equal(applyFilters(items, { category: 'Probiotics' }).length, 3);
  assert.ok(inCategory("Men's Probiotics", 'probiotics'));
  assert.ok(!inCategory('Probiotics Plus', 'Probiotics'));
});

test('store address accepts both field spellings', () => {
  const base = { city: 'Town', state: 'NY', zip: '10001' };
  assert.equal(storeAddress({ ...base, a1: '1 Main St' }), '1 Main St, Town, NY 10001');
  assert.equal(storeAddress({ ...base, address1: '1 Main St', address2: 'Unit 2' }), '1 Main St, Unit 2, Town, NY 10001');
});

test('category names are tidied before grouping', () => {
  assert.equal(cleanCategory('Herbs A-E'), 'Herbs');
  assert.equal(cleanCategory('Herbs & Natural Remedies'), 'Herbs');
  assert.equal(cleanCategory('Other Protein'), 'Protein');
  assert.equal(cleanCategory('Vitamin D'), 'Vitamin D');
  const items = [item('a', { category: 'Herbs A-E' }), item('b', { category: 'Herbs T-Z' })];
  assert.deepEqual(categoryCounts(items), [['Herbs', 2]]);
  assert.equal(applyFilters(items, { category: 'Herbs' }).length, 2);
});
