// Holt Coop-Aktionen von der öffentlichen Seite "Alle Aktionen" auf coop.ch.
//
// Coop schützt die Seite mit einem Bot-Schutz (DataDome). Dieser Abholer
// versucht NICHT, ihn zu umgehen: höchstens 3 Abrufe, mit Pausen, und bei der
// ersten Sperre wird sofort abgebrochen. Dann bleiben die letzten Daten stehen.

const BASE = 'https://www.coop.ch';
const LIST = '/de/aktionen/alle-aktionen/c/m_1111?page=1&pageSize=200&q=%3Arelevance&sort=relevance';
const MAX_EXTRA_PAGES = 2; // zusätzlich zur ersten Seite → max. 600 Aktionen
const PAUSE_MS = 4000;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (privater Aktionen-Abruf, 2x täglich)',
  'accept-language': 'de-CH,de;q=0.9',
};

export class Blocked extends Error {}

// ---------- Hilfsfunktionen ----------
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function looksBlocked(status, text) {
  return status === 403 || status === 429 || /captcha-delivery|Please enable JS and disable any ad blocker/i.test(text.slice(0, 3000));
}

// Coop-Kategorien auf dieselben Namen wie bei Denner abbilden,
// damit der Kategorie-Filter in der App für beide Händler funktioniert.
export function category(udoCat) {
  const c = (udoCat || []).join('/');
  const top = (udoCat || [])[0] || '';
  const sub = (udoCat || [])[1] || '';
  if (top === 'weine') return 'Wein';
  if (/spirituosen/.test(c)) return 'Spirituosen';
  if (/\bbier/.test(c)) return 'Bier';
  if (/kaffee|tee-|kakao/.test(c) && top === 'lebensmittel') return 'Kaffee/Tee/Kakao';
  if (top === 'lebensmittel') {
    if (sub === 'fruechte-gemuese') return 'Früchte und Gemüse';
    if (sub === 'milchprodukte-eier') return 'Milch/Käse/Eier';
    if (sub === 'fleisch-fisch') return 'Fleisch/Wurst/Fisch';
    if (sub === 'brot-backwaren') return 'Brot/Backwaren';
    if (sub === 'getraenke') return 'Getränke/Säfte';
    if (sub.startsWith('tiefgekuehlt')) return 'Tiefkühlprodukte';
    if (sub === 'fertiggerichte' || sub === 'traiteur-torten') return 'Fertigprodukte';
    if (sub === 'suesses-snacks') {
      if (/schokolade|suessigkeit|biscuit|guetzli|gebaeck|konfekt|bonbon|kaugummi/.test(c)) return 'Schokolade/Süsses';
      return /chips|snack|apero|nuesse|salz/.test(c) ? 'Snack/Apero' : 'Schokolade/Süsses';
    }
    if (sub === 'vorraete') return 'Vorräte';
    return 'Sonstiges';
  }
  if (top === 'kosmetik-gesundheit') return 'Pflege/Kosmetik';
  if (top === 'baby-kind') return 'Baby/Kind';
  if (top === 'haushalt-tier') {
    if (sub === 'tierwelt') return 'Tierbedarf';
    if (/waschen|reinigung|toiletten|haushalt-kueche/.test(sub)) return 'Waschen/Haushalt';
    return 'Non-Food';
  }
  return 'Sonstiges';
}

export function normalize(e, fetchedAt) {
  if (!String(e.elementType || '').includes('ProductTile')) return null;
  const price = num(e.price);
  const label = String(e.savingText || '').trim();
  if (!e.id || !price || !label) return null;
  if (/^online/i.test(label)) return null; // nur im Online-Shop gültig
  const instead = !e.unmarkedSaving && num(e.saving) ? `statt ${num(e.saving).toFixed(2)}` : '';
  const pct = /(\d+)\s*%/.exec(label);
  const name = String(e.title || '').replace(/\s+/g, ' ').trim();
  const brand = String(e.brand || '').trim();
  const detail = [e.quantity, e.priceContext].filter(Boolean).join(' · ');
  const src = e.image?.src || e.image?.loader || '';
  const img = /\/img\/produkte\//.test(src) ? 'https:' + src.replace(/^https?:/, '').replace('/155_155/', '/180_180/') : '';
  return {
    shop: 'coop',
    id: `coop-${e.id}`,
    name,
    detail: detail || brand,
    price,
    priceText: price.toFixed(2),
    insteadText: instead,
    discount: pct ? Number(pct[1]) : null,
    badge: label,
    category: category(e.udoCat),
    from: fetchedAt,
    to: null, // Coop gibt pro Produkt kein Enddatum an
    validText: 'Gültigkeit siehe coop.ch',
    image: img,
    url: e.href ? BASE + e.href : BASE + '/de/aktionen/alle-aktionen/c/m_1111',
    week: 'current',
  };
}

// Produktkacheln aus dem in der Seite eingebetteten JSON lesen
export function parseListHtml(html) {
  const elements = [];
  for (const m of html.matchAll(/data-pagecontent-json='([^']*)'/g)) {
    try {
      const j = JSON.parse(decodeEntities(m[1]));
      for (const a of j.anchors || []) elements.push(...(a.json?.elements || []));
    } catch { /* anderer Block, ignorieren */ }
  }
  const pagingMatch = html.match(/data-backend-url="([^"]*productlandingResultSearch\/paging[^"]*)"/);
  const paging = pagingMatch ? decodeEntities(pagingMatch[1]) : null;
  const pages = Number((html.match(/&quot;numberOfPages&quot;&#x3a;(\d+)/) || [])[1]) || null;
  return { elements, paging, pages };
}

export function parsePagingJson(json) {
  return (json.contentJsons?.anchors || []).flatMap((a) => a.json?.elements || []);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchCoop(fetchImpl = fetch, { pause = PAUSE_MS } = {}) {
  const fetchedAt = new Date().toISOString();
  const res = await fetchImpl(BASE + LIST, { headers: { ...HEADERS, accept: 'text/html' } });
  const html = await res.text();
  if (looksBlocked(res.status, html)) throw new Blocked(`Coop blockiert den Abruf (HTTP ${res.status}, Bot-Schutz).`);
  if (!res.ok) throw new Error(`Coop antwortet mit HTTP ${res.status}`);

  const { elements, paging } = parseListHtml(html);
  if (!elements.length) throw new Error('Keine Produkte in der Coop-Seite gefunden – Seite umgebaut?');

  // Folgeseiten: bei der ersten Sperre aufhören, die erste Seite reicht notfalls
  if (paging) {
    for (let p = 2; p < 2 + MAX_EXTRA_PAGES; p++) {
      await sleep(pause);
      const url = BASE + paging.replace(/([?&])page=\d+/, `$1page=${p}`).replace(/pageSize=\d+/, 'pageSize=200');
      const r = await fetchImpl(url, { headers: { ...HEADERS, accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
      const t = await r.text();
      if (looksBlocked(r.status, t) || !t.trim().startsWith('{')) break;
      const more = parsePagingJson(JSON.parse(t));
      if (!more.length) break;
      elements.push(...more);
    }
  }

  const seen = new Set();
  const items = [];
  for (const e of elements) {
    const it = normalize(e, fetchedAt);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }
  return items;
}
