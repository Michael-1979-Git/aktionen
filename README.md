# Aktionen-App

Zeigt die aktuellen Aktionen von Denner auf dem Handy. Migros und Coop folgen.

Ein Skript holt die Aktionen zweimal täglich bei GitHub ab und legt sie in
`docs/data/aktionen.json` ab. Die App ist eine einfache Webseite in `docs/`,
die GitHub Pages kostenlos bereitstellt und die man auf Android wie eine App
installieren kann.

## Einrichten (einmalig, ca. 10 Minuten)

1. **GitHub-Konto** anlegen, falls noch keines vorhanden: https://github.com/signup
2. **Neues Repository** erstellen: https://github.com/new
   - Name z. B. `aktionen`
   - Sichtbarkeit **Public** (GitHub Pages ist für private Repositories nur im Bezahl-Abo verfügbar)
   - Sonst nichts ankreuzen, dann *Create repository*
3. **Dateien hochladen:** Auf der Seite des leeren Repositorys auf
   *uploading an existing file* klicken und den **Inhalt** des entpackten Ordners
   hineinziehen (nicht den Ordner selbst). Wichtig: Der Ordner `.github` muss mit.
   Auf dem Mac ist er im Finder versteckt – mit `Cmd + Shift + .` einblenden.
   Dann *Commit changes*.
4. **Schreibrechte für die Automatik:** *Settings → Actions → General →
   Workflow permissions →* **Read and write permissions** → *Save*.
5. **Webseite einschalten:** *Settings → Pages → Build and deployment*:
   Source *Deploy from a branch*, Branch **main**, Ordner **/docs** → *Save*.
   Nach 1–2 Minuten steht oben die Adresse, z. B.
   `https://DEINNAME.github.io/aktionen/`.
6. **Ersten Abruf starten:** *Actions → Aktionen abholen → Run workflow*.
   Nach etwa einer Minute sollte ein grüner Haken erscheinen.

## Auf dem Handy installieren

Adresse in **Chrome** öffnen → Menü (⋮) → **Zum Startbildschirm hinzufügen**
bzw. **App installieren**. Danach startet sie wie eine normale App.

## Gut zu wissen

- **Merkliste:** Der Stern speichert eine Aktion auf diesem Gerät. Mit
  *Merkliste teilen* geht die Liste z. B. per WhatsApp an die andere Person.
  Eine automatisch gemeinsame Liste bräuchte einen Server mit Anmeldung.
- **Wenn etwas nicht mehr geht:** Ändert Denner seine Website, schlägt der
  Abruf fehl. GitHub schickt dann eine Mail, und die App zeigt oben einen
  Hinweis. Die zuletzt erfolgreich geholten Aktionen bleiben sichtbar.
- **Nur für den privaten Gebrauch.** Bilder und Texte gehören den Händlern.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `scraper/denner.mjs` | Fragt dieselbe Schnittstelle ab, die denner.ch selbst nutzt (`/nuxt-api/promotions`) |
| `scraper/run.mjs` | Sammelt alle Händler, behält bei Fehlern die alten Daten |
| `docs/` | Die App (HTML, CSS, JavaScript, Offline-Unterstützung) |
| `.github/workflows/aktionen.yml` | Zeitplan für den Abruf |
| `test/denner.test.mjs` | Test der Datenaufbereitung |
