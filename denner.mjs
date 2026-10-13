// Holt die Denner-Aktionen über dieselbe Schnittstelle, die denner.ch selbst
// beim Klick auf "Weitere Produkte anzeigen" verwendet.

const ENDPOINT = 'https://www.denner.ch/nuxt-api/promotions';
const PAGE_SIZE = 100;
const WEEKS = [
  { flag: 'promo_current_week', week: 'current' },
  { flag: 'promo_next_week', week: 'next' },
];

function attrs(item) {
  const out = {};
  for (const a of item.attributeInfo || []) {
    out[a.attributeName] = a.vals && a.vals[0] ? a.vals[0].value : '';
  }
  return out;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Weinkategorien kommen als "Rotwein / 2024" – für die App reicht "Wein".
function category(raw) {
  const c = (raw || '').trim();
  if (/wein|ros[ée]|champagner/i.test(c)) return 'Wein';
  return c || 'Sonstiges';
}

// Denner bettet teils Formatierungs-Tags ein, z. B. "25% <vertical>ab 2 Stück</vertical>"
function clean(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalize(item, week) {
  const a = attrs(item);
  const image = a.imageUrl || a.thumbnailUrl || '';
  // Sammelaktionen ("auf alle ISANA Produkte") haben Preis 0 → kein Preis anzeigen
  const price = num(a.price) > 0 ? num(a.price) : null;
  return {
    shop: 'denner',
    id: `denner-${a.articleId || item.sku}`,
    name: clean(a.name),
    detail: clean(a.nameSubline || a.content_size_text),
    price,
    priceText: price == null ? '' : (clean(a.priceFormatted) || price.toFixed(2)),
    insteadText: clean(a.insteadPriceText),
    discount: num(a.discount_percent),
    badge: clean(a.discount_text),
    category: category(a._tracking_item_category2),
    from: num(a.promotionFrom) ? new Date(num(a.promotionFrom) * 1000).toISOString() : null,
    // promotionTo ist der Beginn (00:00) des letzten gültigen Tages → auf Tagesende schieben
    to: num(a.promotionTo) ? new Date((num(a.promotionTo) + 86400 - 1) * 1000).toISOString() : null,
    validText: clean(a.promotionLabel),
    image: image ? `${image}?auto=format%2Ccompress&w=240&h=240&fit=fillmax` : '',
    url: a.itemUrl ? `https://www.denner.ch${a.itemUrl}` : 'https://www.denner.ch/de/aktionen/aktuelle-aktionen',
    week,
  };
}

async function fetchPage(flag, page, fetchImpl) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (privater Aktionen-Abruf, 1x täglich)',
    },
    body: JSON.stringify({
      lang: 'de', promoFlag: flag, facetName: null, facetValue: null,
      page, hitsPerPage: PAGE_SIZE, sort: null, includeHighlights: false,
    }),
  });
  if (!res.ok) throw new Error(`Denner antwortet mit HTTP ${res.status} (${flag}, Seite ${page})`);
  const json = await res.json();
  if (!Array.isArray(json.items)) throw new Error('Denner-Antwort hat kein "items"-Feld – Schnittstelle geändert?');
  return json;
}

export async function fetchDenner(fetchImpl = fetch) {
  const items = [];
  const seen = new Set();
  for (const { flag, week } of WEEKS) {
    let page = 1;
    let totalPages = 1;
    do {
      const json = await fetchPage(flag, page, fetchImpl);
      totalPages = Math.min(json.stats?.totalPages ?? 1, 20); // Sicherung gegen Endlosschleife
      for (const raw of json.items) {
        const it = normalize(raw, week);
        const key = `${it.id}-${week}`;
        if (!it.name || seen.has(key)) continue;
        seen.add(key);
        items.push(it);
      }
      page++;
      await new Promise((r) => setTimeout(r, 500)); // höflich bleiben
    } while (page <= totalPages);
  }
  return items;
}
