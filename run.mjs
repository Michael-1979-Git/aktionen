// Holt alle Händler und schreibt aktionen.json.
// Schlägt ein Händler fehl, bleiben seine letzten Daten bis zu 3 Tage erhalten.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchDenner } from './denner.mjs';
import { fetchCoop } from './coop.mjs';

const OUT = fileURLToPath(new URL('./aktionen.json', import.meta.url));

const SHOPS = {
  denner: fetchDenner,
  coop: fetchCoop,
};

const MIN_ITEMS = 20;               // weniger gilt als Fehler (z. B. Seite umgebaut)
const KEEP_OLD_MS = 3 * 86400e3;    // alte Daten höchstens 3 Tage weiterzeigen
const ALERT_AFTER_MS = 24 * 3600e3; // erst nach 1 Tag ohne Erfolg eine Fehler-Mail

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { items: [], sources: {} };
  }
}

const now = Date.now();
const previous = await loadPrevious();
const items = [];
const sources = {};
let alert = false;

for (const [shop, fetcher] of Object.entries(SHOPS)) {
  try {
    const got = await fetcher();
    if (got.length < MIN_ITEMS) throw new Error(`nur ${got.length} Aktionen gefunden`);
    items.push(...got);
    sources[shop] = { ok: true, count: got.length, updated: new Date().toISOString() };
    console.log(`${shop}: ${got.length} Aktionen`);
  } catch (err) {
    const prev = previous.sources?.[shop] || {};
    const lastOk = prev.updated ? Date.parse(prev.updated) : 0;
    const old = now - lastOk < KEEP_OLD_MS ? previous.items.filter((i) => i.shop === shop) : [];
    items.push(...old);
    sources[shop] = { ...prev, ok: false, error: String(err.message || err), failedAt: new Date().toISOString() };
    if (now - lastOk > ALERT_AFTER_MS) alert = true;
    console.error(`${shop}: FEHLER – ${err.message}. Zeige ${old.length} Einträge vom letzten Erfolg.`);
  }
}

await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), sources, items }));
console.log(`Geschrieben: ${items.length} Aktionen`);

// Exit-Code ≠ 0 löst bei GitHub eine Fehler-Mail aus – nur bei länger andauernden Problemen.
if (alert) process.exit(1);
