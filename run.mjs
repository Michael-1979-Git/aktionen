// Holt alle Händler und schreibt docs/data/aktionen.json.
// Schlägt ein Händler fehl, bleiben seine Daten vom letzten erfolgreichen Lauf erhalten.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDenner } from './denner.mjs';

const OUT = fileURLToPath(new URL('../docs/data/aktionen.json', import.meta.url));

// Hier kommen später Migros und Coop dazu.
const SHOPS = {
  denner: fetchDenner,
};

const MIN_ITEMS = 20; // weniger gilt als Fehler (z. B. Seite umgebaut)

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { items: [], sources: {} };
  }
}

const previous = await loadPrevious();
const items = [];
const sources = {};
let failures = 0;

for (const [shop, fetcher] of Object.entries(SHOPS)) {
  try {
    const got = await fetcher();
    if (got.length < MIN_ITEMS) throw new Error(`nur ${got.length} Aktionen gefunden`);
    items.push(...got);
    sources[shop] = { ok: true, count: got.length, updated: new Date().toISOString() };
    console.log(`${shop}: ${got.length} Aktionen`);
  } catch (err) {
    failures++;
    const old = previous.items.filter((i) => i.shop === shop);
    items.push(...old);
    sources[shop] = {
      ...(previous.sources?.[shop] || {}),
      ok: false,
      error: String(err.message || err),
    };
    console.error(`${shop}: FEHLER – ${err.message}. Behalte ${old.length} alte Einträge.`);
  }
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), sources, items }));
console.log(`Geschrieben: ${items.length} Aktionen`);

// Exit-Code ≠ 0 löst bei GitHub eine Fehler-Mail aus.
if (failures) process.exit(1);
