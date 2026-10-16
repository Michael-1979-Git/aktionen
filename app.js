'use strict';

const SHOPS = {
  migros: { label: 'Migros', color: 'var(--migros)' },
  coop: { label: 'Coop', color: 'var(--coop)' },
  denner: { label: 'Denner', color: 'var(--denner)' },
};
const SAVED_KEY = 'aktionen.merkliste.v1';
const UI_KEY = 'aktionen.ui.v1';

const $ = (s) => document.querySelector(s);
const state = {
  data: { items: [], sources: {} },
  week: 'current',
  shops: new Set(),
  q: '',
  cat: '',
  sort: 'discount',
  saved: loadSaved(),
};

// ---------- Speicher (nur auf diesem Gerät) ----------
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function loadSaved() { return read(SAVED_KEY) || {}; }
function key(it) { return `${it.id}|${it.week}`; }

// ---------- Hilfsfunktionen ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
const fmtPrice = (it) => {
  if (!(it.price > 0)) return '';
  if (it.priceText && !/^\d+(\.\d)?$/.test(it.priceText)) return it.priceText; // z. B. "–.99"
  return it.price.toFixed(2);
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isExpired = (it) => it.to && new Date(it.to) < new Date();

function validLabel(it) {
  if (it.validText) return it.validText;
  if (it.from && it.to) return `${fmtDate(it.from)}–${fmtDate(it.to)}`;
  return '';
}

// ---------- Daten laden ----------
async function load() {
  try {
    const res = await fetch('aktionen.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
  } catch (e) {
    showNotice('Die Aktionen konnten nicht geladen werden. Bist du offline?');
  }
  const present = new Set(state.data.items.map((i) => i.shop));
  const ui = read(UI_KEY);
  state.shops = new Set((ui?.shops || [...present]).filter((s) => present.has(s)));
  if (!state.shops.size) state.shops = present;
  if (ui?.sort) state.sort = ui.sort;

  const upd = state.data.updated ? new Date(state.data.updated) : null;
  $('#updated').textContent = upd ? `Stand ${upd.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${upd.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}` : '';

  const failed = Object.entries(state.data.sources || {}).filter(([, s]) => s && s.ok === false);
  if (failed.length) {
    showNotice(failed.map(([shop, s]) => {
      const label = SHOPS[shop]?.label || shop;
      const has = state.data.items.some((i) => i.shop === shop);
      return has
        ? `${label}: letzte Aktualisierung fehlgeschlagen, angezeigt wird der Stand vom ${fmtDate(s.updated)}.`
        : `${label}: zurzeit keine Daten (Abruf blockiert oder gestört).`;
    }).join(' '));
  }

  const next = state.data.items.filter((i) => i.week === 'next' && i.from).map((i) => i.from).sort()[0];
  if (next) document.querySelector('[data-week="next"]').textContent = `Ab ${fmtDate(next)}`;

  renderShops(present);
  renderCats();
  $('#sort').value = state.sort;
  render();
}

function showNotice(text) { const n = $('#notice'); n.textContent = text; n.hidden = false; }

// ---------- Filter-Steuerelemente ----------
function renderShops(present) {
  const el = $('#shops');
  el.innerHTML = Object.entries(SHOPS).map(([id, s]) => {
    if (!present.has(id)) {
      const src = state.data.sources?.[id];
      const why = src ? 'gestört' : 'bald';
      return `<span class="chip soon" title="${src ? 'Zurzeit keine Daten' : 'Noch nicht angebunden'}"><span class="dot" style="background:${s.color}"></span>${s.label} · ${why}</span>`;
    }
    return `<button class="chip" data-shop="${id}" aria-pressed="${state.shops.has(id)}"><span class="dot" style="background:${s.color}"></span>${s.label}</button>`;
  }).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-shop]');
    if (!b) return;
    const id = b.dataset.shop;
    if (state.shops.has(id) && state.shops.size > 1) state.shops.delete(id); else state.shops.add(id);
    el.querySelectorAll('[data-shop]').forEach((x) => x.setAttribute('aria-pressed', state.shops.has(x.dataset.shop)));
    saveUi(); renderCats(); render();
  };
}

function renderCats() {
  const counts = {};
  for (const it of state.data.items) {
    if (!state.shops.has(it.shop)) continue;
    counts[it.category] = (counts[it.category] || 0) + 1;
  }
  const sel = $('#cat');
  const cur = state.cat;
  sel.innerHTML = '<option value="">Alle Kategorien</option>' +
    Object.keys(counts).sort((a, b) => a.localeCompare(b, 'de')).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = counts[cur] ? cur : '';
  state.cat = sel.value;
}

function saveUi() { store(UI_KEY, { shops: [...state.shops], sort: state.sort }); }

// ---------- Liste ----------
function currentItems() {
  let items;
  if (state.week === 'saved') {
    items = Object.values(state.saved);
  } else {
    items = state.data.items.filter((i) => i.week === state.week && !isExpired(i));
  }
  items = items.filter((i) => state.shops.has(i.shop) || state.week === 'saved');
  if (state.cat) items = items.filter((i) => i.category === state.cat);
  if (state.q) {
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    items = items.filter((i) => { const h = norm(`${i.name} ${i.detail} ${i.category}`); return words.every((w) => h.includes(w)); });
  }
  const by = {
    discount: (a, b) => (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name, 'de'),
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
    price: (a, b) => (a.price > 0 ? a.price : 1e9) - (b.price > 0 ? b.price : 1e9),
  }[state.sort];
  return items.sort(by);
}

const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>';

function card(it) {
  const shop = SHOPS[it.shop] || { label: it.shop, color: 'var(--muted)' };
  const saved = !!state.saved[key(it)];
  const expired = isExpired(it);
  return `<li class="card"${expired ? ' style="opacity:.55"' : ''}>
    <div class="card__img">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div>
    <div class="card__body">
      <div class="card__shop"><span class="dot" style="background:${shop.color}"></span>${esc(shop.label)}</div>
      <h2 class="card__name"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a></h2>
      <div class="card__detail">${esc(it.detail)}</div>
      <div class="card__price">
        ${fmtPrice(it) ? `<span class="price">${esc(fmtPrice(it))}</span>` : ''}
        ${it.insteadText ? `<span class="instead">${esc(it.insteadText)}</span>` : ''}
        ${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ''}
      </div>
      <div class="valid">${expired ? 'Abgelaufen · ' : ''}${esc(validLabel(it))}</div>
    </div>
    <button class="star" data-key="${esc(key(it))}" aria-pressed="${saved}" aria-label="${saved ? 'Von Merkliste entfernen' : 'Auf Merkliste'}">${STAR}</button>
  </li>`;
}

// Schrittweise anzeigen: erst 60 Karten, beim Scrollen jeweils 60 weitere
const STEP = 60;
let lookup = new Map();
let shownItems = [];
let shown = 0;
const sentinel = document.createElement('li');
sentinel.setAttribute('aria-hidden', 'true');
sentinel.style.cssText = 'list-style:none;height:1px';
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) more(); }, { rootMargin: '800px' })
  : null;

function more() {
  if (shown >= shownItems.length) return;
  const next = shownItems.slice(shown, shown + STEP);
  shown += next.length;
  sentinel.remove();
  $('#list').insertAdjacentHTML('beforeend', next.map(card).join(''));
  if (shown < shownItems.length) $('#list').appendChild(sentinel);
}

function render() {
  const items = currentItems();
  lookup = new Map(items.map((i) => [key(i), i]));
  shownItems = items;
  shown = 0;
  $('#list').innerHTML = '';
  more();
  if (io) { io.disconnect(); io.observe(sentinel); } else { while (shown < shownItems.length) more(); }
  $('#count').textContent = `${items.length} ${items.length === 1 ? 'Aktion' : 'Aktionen'}`;
  const nSaved = Object.keys(state.saved).length;
  $('#savedCount').textContent = nSaved ? `(${nSaved})` : '';
  $('#share').hidden = !(state.week === 'saved' && nSaved);
  const empty = $('#empty');
  empty.hidden = items.length > 0;
  empty.textContent = state.week === 'saved'
    ? 'Noch nichts gemerkt. Tippe auf den Stern bei einer Aktion.'
    : 'Keine Aktionen gefunden.';
}

// ---------- Ereignisse ----------
$('.seg').onclick = (e) => {
  const b = e.target.closest('[data-week]');
  if (!b) return;
  state.week = b.dataset.week;
  document.querySelectorAll('.seg [data-week]').forEach((x) => x.setAttribute('aria-selected', x === b));
  render();
  window.scrollTo({ top: 0 });
};
let qTimer;
$('#q').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); };
$('#cat').onchange = (e) => { state.cat = e.target.value; render(); };
$('#sort').onchange = (e) => { state.sort = e.target.value; saveUi(); render(); };

$('#list').onclick = (e) => {
  const b = e.target.closest('.star');
  if (!b) return;
  const k = b.dataset.key;
  if (state.saved[k]) delete state.saved[k];
  else { const it = lookup.get(k); if (it) state.saved[k] = it; }
  store(SAVED_KEY, state.saved);
  if (state.week === 'saved') render();
  else {
    const on = !!state.saved[k];
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Von Merkliste entfernen' : 'Auf Merkliste');
    const n = Object.keys(state.saved).length;
    $('#savedCount').textContent = n ? `(${n})` : '';
  }
};

// Merkliste als Text teilen, z. B. per WhatsApp an die Frau / den Mann
$('#share').onclick = async () => {
  const items = Object.values(state.saved).filter((i) => !isExpired(i));
  const byShop = {};
  for (const i of items) (byShop[i.shop] ||= []).push(i);
  const text = Object.entries(byShop).map(([shop, list]) =>
    `${SHOPS[shop]?.label || shop}:\n` + list.map((i) => `• ${i.name} – ${fmtPrice(i)}${i.badge ? ` (${i.badge})` : ''}, ${validLabel(i)}`).join('\n')
  ).join('\n\n');
  if (!text) return;
  try {
    if (navigator.share) await navigator.share({ title: 'Einkauf – Aktionen', text });
    else { await navigator.clipboard.writeText(text); alert('Liste kopiert.'); }
  } catch {}
};

// ---------- Offline-Unterstützung ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
}

load();
