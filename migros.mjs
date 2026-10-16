// Holt die Migros-Angebote "in den Filialen" über dieselbe Schnittstelle,
// die migros.ch/de/offers/home verwendet. Ablauf:
//   1. Gast-Schlüssel holen (wie jeder Besucher ohne Anmeldung)
//   2. Angebots-IDs suchen (max. 500 pro Anfrage)
//   3. Produktdetails in Paketen à 250 laden
// Rund 12–15 Anfragen pro Lauf, mit Pausen. Bei Sperre (401/403/429) Abbruch.

const BASE = 'https://www.migros.ch';
const PAGE = 500;
const CARD_BATCH = 250;
const PAUSE_MS = 1000;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (privater Aktionen-Abruf, 2x täglich)',
  'accept-language': 'de-CH,de;q=0.9',
  accept: 'application/json, text/plain, */*',
};
const IMG_STACK = 'mo-boxed/v-w-240-h-240';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(fetchImpl, path, { method = 'GET', token, body } = {}) {
  const res = await fetchImpl(BASE + path, {
    method,
    headers: { ...HEADERS, ...(token ? { leshopch: token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Migros antwortet mit HTTP ${res.status} (${path.split('?')[0]})`);
  return res;
}

// Migros-Kategorien auf dieselben Namen wie bei Denner abbilden
export function category(breadcrumb) {
  const top = breadcrumb?.[0]?.slugs?.[0] || '';
  const sub = breadcrumb?.[1]?.slugs?.slice(-1)[0] || '';
  switch (top) {
    case 'fruchte-gemuse': return 'Früchte und Gemüse';
    case 'fleisch-fisch': return 'Fleisch/Wurst/Fisch';
    case 'milchprodukte-eier-frische-ferti': return sub === 'frische-fertiggerichte' ? 'Fertigprodukte' : 'Milch/Käse/Eier';
    case 'brot-backwaren-fruhstuck': return 'Brot/Backwaren';
    case 'getranke-kaffee-tee':
      if (/kaffee|tee|kakao/.test(sub)) return 'Kaffee/Tee/Kakao';
      if (/bier/.test(sub)) return 'Bier';
      if (/wein|schaumwein/.test(sub)) return 'Wein';
      return 'Getränke/Säfte';
    case 'snacks-sussigkeiten': return /snacks-chips|apero|nusse/.test(sub) ? 'Snack/Apero' : 'Schokolade/Süsses';
    case 'pasta-wurzmittel-konserven': return /konserven-fertiggerichte/.test(sub) ? 'Fertigprodukte' : 'Vorräte';
    case 'tiefkuhlprodukte': return 'Tiefkühlprodukte';
    case 'wein-bier-spirituosen': return /bier/.test(sub) ? 'Bier' : /spirituosen/.test(sub) ? 'Spirituosen' : 'Wein';
    case 'beauty-gesundheit': return 'Pflege/Kosmetik';
    case 'reinigung-waschepflege-haushalt': return 'Waschen/Haushalt';
    case 'baby-und-kind': return 'Baby/Kind';
    case 'tierbedarf': return 'Tierbedarf';
    case '': return 'Sonstiges';
    default: return 'Non-Food';
  }
}

function badgeText(badges) {
  const b = badges || [];
  const pct = b.find((x) => x.type === 'PERCENTAGE_PROMOTION')?.description;
  const min = b.find((x) => x.type === 'MINIMUM_PIECES')?.description;
  const cumulus = b.find((x) => x.type === 'CUMULUS_PROMOTION')?.description;
  if (pct) return min ? `${pct} ${min.replace(/^Ab/, 'ab')}` : pct;
  if (cumulus) return `${cumulus} Cumulus-Punkte`;
  if (b.some((x) => x.type === 'HIT_PROMOTION')) return 'Hit';
  return (b[0]?.description || 'Aktion').trim();
}

const fmtCh = (d) => { const [y, m, day] = d.split('-'); return `${day}.${m}.`; };

export function normalize(card, week) {
  const o = card.offer;
  if (!o) return null;
  const promo = o.promotionPrice?.advertisedValue ?? null;
  const normal = o.price?.advertisedValue ?? null;
  const price = promo ?? normal;
  if (!price || price <= 0) return null;
  const pctBadge = (o.badges || []).find((x) => x.type === 'PERCENTAGE_PROMOTION')?.description;
  const pct = pctBadge ? Number((/(\d+)/.exec(pctBadge) || [])[1]) : (normal && promo && normal > promo ? Math.round((1 - promo / normal) * 100) : null);
  const range = o.promotionDateRange || {};
  const imgUrl = card.images?.[0]?.url || card.imageTransparent?.url || '';
  const title = String(card.title || card.name || '').replace(/\s*·\s*/g, ' · ').replace(/\s+/g, ' ').trim().replace(/ · $/, '');
  return {
    shop: 'migros',
    id: `migros-${card.uid}`,
    name: title.replace(/^Migros · /, ''),
    detail: [o.quantity, o.quantityPrice].filter(Boolean).join(' · '),
    price,
    priceText: o.promotionPrice?.advertisedDisplayValue || o.price?.advertisedDisplayValue || price.toFixed(2),
    insteadText: normal && promo && normal > promo ? `statt ${o.price.advertisedDisplayValue || normal.toFixed(2)}` : '',
    discount: Number.isFinite(pct) ? pct : null,
    badge: badgeText(o.badges),
    category: category(card.breadcrumb),
    from: range.startDate ? `${range.startDate}T00:00:00+02:00` : null,
    to: range.endDate ? `${range.endDate}T23:59:59+02:00` : null,
    validText: range.startDate && range.endDate ? `${fmtCh(range.startDate)}–${fmtCh(range.endDate)}${range.endDate.slice(0, 4)}` : '',
    image: imgUrl ? imgUrl.replace('{stack}', IMG_STACK) : '',
    url: card.productUrls || (card.migrosId ? `${BASE}/de/product/${card.migrosId}` : `${BASE}/de/offers/home`),
    week,
  };
}

async function fetchPeriod(fetchImpl, token, period, week, pause) {
  const ids = [];
  let total = 1;
  let start = null;
  for (let from = 0; from < total && from < 5000; from += PAGE) {
    const res = await call(fetchImpl, '/product-display/public/web/v3/products/promotion/search', {
      method: 'POST', token,
      body: { storeType: 'OFFLINE', period, language: 'de', filters: {}, sortFields: ['CATEGORY_LEVEL'], sortOrder: 'ASC', from, until: from + PAGE, region: 'national', warehouse: '1' },
    });
    const j = await res.json();
    total = j.numberOfItems || 0;
    start = j.startDate || start;
    ids.push(...(j.items || []).filter((i) => i.type === 'PRODUCT').map((i) => i.id));
    await sleep(pause);
  }
  const uniq = [...new Set(ids)];
  const items = [];
  for (let i = 0; i < uniq.length; i += CARD_BATCH) {
    const res = await call(fetchImpl, '/product-display/public/v4/product-cards', {
      method: 'POST', token,
      body: { productFilter: { uids: uniq.slice(i, i + CARD_BATCH) }, offerFilter: { storeType: 'OFFLINE', region: 'national', ...(start ? { ongoingOfferDate: `${start}T00:00:00` } : {}) } },
    });
    for (const c of await res.json()) {
      const it = normalize(c, week);
      if (it && it.name) items.push(it);
    }
    await sleep(pause);
  }
  return items;
}

export async function fetchMigros(fetchImpl = fetch, { pause = PAUSE_MS } = {}) {
  const g = await call(fetchImpl, '/authentication/public/v1/api/guest?authorizationNotRequired=true');
  const token = g.headers.get('leshopch');
  if (!token) throw new Error('Migros hat keinen Gast-Schlüssel geliefert – Schnittstelle geändert?');

  const current = await fetchPeriod(fetchImpl, token, 'CURRENT', 'current', pause);
  let next = [];
  try {
    next = await fetchPeriod(fetchImpl, token, 'UPCOMING', 'next', pause);
  } catch (err) {
    console.error(`migros: Vorschau nächste Woche nicht verfügbar – ${err.message}`);
  }
  const seen = new Set();
  return [...current, ...next].filter((i) => { const k = `${i.id}|${i.week}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
