// Test mit nachgebildeten Denner-Antworten (aus echten Daten vom 13.10.2026).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchDenner } from '../scraper/denner.mjs';

const rows = JSON.parse(await readFile(process.argv[2] || new URL('./denner-beispiel.json', import.meta.url), 'utf8'));
const toRaw = (r) => {
  const pct = /^(\d+)%/.exec(r[5]);
  const a = { name: r[1], nameSubline: r[2], price: r[3], insteadPriceText: r[4], discount_text: r[5],
    discount_percent: pct ? pct[1] : '', _tracking_item_category2: r[6], promotionFrom: String(r[7]),
    promotionTo: String(r[8]), promotionLabel: r[9], imageUrl: r[10] ? 'https://denner.imgix.net/assets/' + r[10] : '',
    itemUrl: r[11], articleId: (/~p(\d+)/.exec(r[11]) || [])[1] };
  return { sku: 'x', attributeInfo: Object.entries(a).map(([k, v]) => ({ attributeName: k, vals: [{ value: v, label: '' }] })) };
};
const byFlag = { promo_current_week: rows.filter(r => r[0] === 0), promo_next_week: rows.filter(r => r[0] === 1) };
let calls = 0;
const fakeFetch = async (url, init) => {
  calls++;
  const b = JSON.parse(init.body);
  const list = byFlag[b.promoFlag];
  const slice = list.slice((b.page - 1) * b.hitsPerPage, b.page * b.hitsPerPage);
  return { ok: true, json: async () => ({ items: slice.map(toRaw), stats: { totalPages: Math.ceil(list.length / b.hitsPerPage) } }) };
};
const items = await fetchDenner(fakeFetch);
console.log('Aufrufe:', calls, 'Aktionen:', items.length);
assert.ok(items.length > 450);
assert.equal(items.filter(i => i.week === 'current').length, 225);
const mango = items.find(i => i.name === 'Mango');
console.log(mango);
assert.equal(mango.price, 0.99);
assert.equal(mango.discount, 34);
assert.ok(mango.url.startsWith('https://www.denner.ch/de/aktionen/mango'));
assert.ok(items.every(i => i.from && i.to));
assert.ok(!items.some(i => /Rotwein/.test(i.category)));
console.log('Kategorien:', [...new Set(items.map(i => i.category))].join(', '));
// Fehlerfall
await assert.rejects(fetchDenner(async () => ({ ok: false, status: 403 })), /HTTP 403/);
console.log('OK');
