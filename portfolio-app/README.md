# Depot – lokale Portfolio- & Trading-App

Eine lokale Web-App, mit der du dein Wertpapierdepot (z. B. bei Trade Republic) verfolgen und analysieren kannst. Die App gibt **keine
Orders** auf. Alle Daten liegen in einer SQLite-Datei auf deinem Rechner.

> **Keine Anlageberatung.** Informationen ohne Gewähr. Auch als solide geltende Aktien können stark fallen.

## Funktionen

- **Übersicht:** Gesamtvermögen mit Tagesveränderung und Wertverlauf (1T, 1W, 1M, YTD, 1J, Max). Beim Überfahren der Kurve zeigt die
  Kopfzahl den Wert an der jeweiligen Stelle. Ab 1M lässt sich die zeitgewichtete Rendite mit dem MSCI World (iShares Core MSCI World,
  EUNL) vergleichen. Dazu kommen „Investiert“ und „Cash“, sortier- und durchsuchbare Positionen, Kennzahlen
  (realisiert, Dividenden, Gebühren, Steuern) und die Aufteilung nach Sektor, Region und Anlageklasse. Börsenstatus und
  Kurszeitpunkt sind immer sichtbar.
- **Positionsseite:** Kurschart mit markierten Käufen und Verkäufen, Kennzahlen (KGV, Marktkapitalisierung, Dividendenrendite,
  52-Wochen-Spanne), Erträge und Kosten, alle Transaktionen. Außerdem Stammdaten ändern und Aktiensplits erfassen.
- **Transaktionen:** Kauf, Verkauf, Dividende, Ein- und Auszahlung, Gebühr, Steuer, Zinsen und Sparplan-Ausführung. Stückzahlen mit bis
  zu 6 Nachkommastellen. Suche nach Name, Ticker, ISIN oder WKN mit Kursvorschlag zum Datum. Standardgebühr 1 €.
  Bearbeiten und Löschen mit „Rückgängig“; Verkäufe von mehr Stücken als gehalten werden verhindert.
- **CSV-Import:** Trade-Republic-Transaktionsexport (automatisch erkannt), pytr, Portfolio Performance und beliebige CSV-Dateien mit
  Spaltenzuordnung. Vor dem Import gibt es eine Vorschau mit Warnungen. Duplikate werden über Datum, ISIN, Stückzahl und Betrag
  erkannt, jeder Import lässt sich rückgängig machen.
- **Sparpläne:** Fällige Ausführungen erscheinen als Vorschlag zum Bestätigen oder Überspringen.
- **Erträge & Steuern:** Dividenden je Monat, Dividendenkalender mit transparenter Hochrechnung der nächsten zwölf Monate (klar als
  Schätzung gekennzeichnet), Verteilung nach Wertpapier, Rendite auf Einstand und eine Jahresübersicht mit Dividenden, Zinsen,
  realisierten Gewinnen, Gebühren und gezahlten Steuern.
- **Solide Wachstumswerte:** Transparente, anpassbare Kriterien mit Begründungskarten (Kennzahlen, Analystenkonsens, Risiken, Quellen
  mit Stand). Detailseiten zeigen These, Risiken und „Was müsste passieren, damit die These falsch ist?“.
- **Watchlist:** Werte beobachten, mit Kursalarm über bzw. unter einer Schwelle. Solange die App geöffnet ist, meldet sie neu
  ausgelöste Alarme als Hinweis und – nach Zustimmung – als Systembenachrichtigung.
- **Einstellungen:** Farbschema, Kursanbieter-Status, vollständige Sicherung (JSON) und CSV-Export, Wiederherstellen, Beispieldaten
  laden oder entfernen, alle Daten löschen.
- **Bedienung:** `N` erfasst eine Transaktion, `⌘K` bzw. `Strg+K` öffnet die Befehlspalette. Standard ist der dunkle Modus; hell und
  „wie System“ sind umschaltbar. Die App ist responsiv, unterstützt Tastatur und Screenreader und respektiert „Bewegung reduzieren“.

## Voraussetzungen

- **Node.js 22.12 oder neuer** (LTS empfohlen) und npm
- macOS, Linux oder Windows. `better-sqlite3` bringt vorkompilierte Binärdateien mit. Falls die Installation trotzdem kompilieren muss,
  braucht macOS die Xcode Command Line Tools (`xcode-select --install`).

## Installation und Start

```bash
cd portfolio-app
npm install && npm run dev
```

Danach <http://127.0.0.1:3000> öffnen. Die App lauscht nur auf `127.0.0.1` und ist im Netzwerk nicht erreichbar.

Beim ersten Start legt die App die Datenbank `data/portfolio.db` an und lädt ein **Beispieldepot**: seit 2023, mit Sparplänen,
Dividenden, einem Aktiensplit (NVIDIA 10:1) und einem geschlossenen Trade. Das Beispieldepot entfernst du unter **Einstellungen →
Beispieldaten**; eigene Buchungen bleiben dabei erhalten. Wer ohne Beispieldaten starten will, setzt vor dem ersten Start
`SEED_ON_FIRST_RUN=false` in `.env.local`.

Produktiv starten (schneller):

```bash
npm run build && npm start
```

## Kursdaten und API-Keys

Die Konfiguration steht in `.env.local` (nicht eingecheckt, steht in `.gitignore`). Als Vorlage dient `.env.example`:

```bash
cp .env.example .env.local
```

| Variable               | Werte                                                | Standard |
| ---------------------- | ---------------------------------------------------- | -------- |
| `MARKET_DATA_PROVIDER` | `yahoo`, `finnhub`, `fmp`, `alphavantage`, `mock`    | `yahoo`  |
| `FX_PROVIDER`          | `ecb` (EZB-Referenzkurse), `mock`                    | `ecb`    |
| `FINNHUB_API_KEY`      | Key von finnhub.io (kostenlos)                       | –        |
| `FMP_API_KEY`          | Key von financialmodelingprep.com                    | –        |
| `ALPHAVANTAGE_API_KEY` | Key von alphavantage.co (kostenlos, 25 Abfragen/Tag) | –        |
| `SEED_ON_FIRST_RUN`    | `false` = beim ersten Start keine Beispieldaten      | `true`   |
| `ALLOWED_HOSTS`        | zusätzliche Hostnamen, z. B. für einen lokalen Proxy | –        |

- **Yahoo Finance** (Standard) braucht keinen Key. Die Daten kommen über eine inoffizielle Schnittstelle und können verzögert sein oder
  ausfallen.
- **Finnhub, FMP und Alpha Vantage** brauchen einen Key. Fehlt er, nutzt die App Yahoo und weist in den Einstellungen darauf hin.
  Liefert der gewählte Anbieter nichts, springt Yahoo als Ersatz ein.
- **`mock`** erzeugt deterministische, simulierte Kurse für Demo und Tests. Die App kennzeichnet sie überall als „Demo-Kurse
  (simuliert)“.
- **Cache und Rate-Limits:** Während der Handelszeit gelten Kurse 60 Sekunden, sonst 15 Minuten. Tagesschlusskurse werden dauerhaft
  gespeichert, Kennzahlen 12 Stunden. Anfragen je Anbieter laufen mit Mindestabstand (z. B. Alpha Vantage 12,5 s). Ist der Anbieter
  nicht erreichbar, zeigt die App den letzten bekannten Kurs mit Zeitstempel.
- **Währungen:** Basiswährung ist Euro. Kaufkurse werden in der Kaufwährung mit dem Wechselkurs der Buchung gespeichert. Aktuelle
  Werte rechnet die App mit den EZB-Referenzkursen um.

API-Keys werden nur auf dem Server gelesen und nie an den Browser gegeben. Unter **Einstellungen → Kursdaten → Verbindung testen**
prüfst du, ob Kursanbieter und Wechselkurse antworten (Ergebnis, Kursstand und Antwortzeit).

## Trade Republic

Trade Republic bietet keine offizielle API für Privatkunden. Die App setzt deshalb auf den **CSV-Transaktionsexport** und die manuelle
Erfassung. Eine inoffizielle Konto-Synchronisation ist bewusst nicht eingebaut.

1. In der Trade-Republic-App: **Profil → Kontoauszüge → Transaktionsexport** und eine CSV-Datei für den gewünschten Zeitraum
   erstellen.
2. In der Depot-App unter **Import** die Datei hineinziehen. Das Format wird automatisch erkannt (Käufe, Verkäufe, Sparpläne,
   Dividenden, Zinsen, Steuern, Ein- und Auszahlungen; Kartenzahlungen werden als Auszahlung gebucht).
3. Die Vorschau prüfen: neue Buchungen, Duplikate, Warnungen (z. B. Verkauf ohne passenden Kauf). Dann importieren.

Der Export lässt sich jederzeit erneut importieren; bereits vorhandene Buchungen werden übersprungen. Unter **Import → Bisherige
Importe** lässt sich ein Import vollständig rückgängig machen.

Weitere Formate:

- **pytr** (`pytr export_transactions`): Semikolon-CSV, Spalten werden vorgeschlagen.
- **Portfolio Performance**: CSV-Export der Buchungen.
- **Eigene CSV**: Spalten und Typen zuordnen, Zahlen- und Datumsformat wählen.
- **CSV-Sicherung dieser App** (Einstellungen → Transaktionen (CSV)): wird automatisch erkannt.

## Solide Wachstumswerte

Die Rubrik prüft eine Liste großer Unternehmen gegen Kriterien zu Größe und Bilanz, Schwankung, Wachstum und Analystenurteilen. Jede
Zahl hat eine Quelle und einen Stand. Fehlen Daten, steht dort „keine Daten“ statt einer Schätzung. Daten, die älter als 90 Tage sind,
werden markiert.

| Datei                         | Inhalt                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `config/growth-criteria.json` | Kriterien, Schwellen, Pflicht/optional, Kandidaten (erklärt in `config/README.md`) |
| `content/research/<SYM>.json` | Anbieterdaten mit Stichtag und Quellen                                             |
| `content/theses/<SYM>.md`     | Redaktionelle Texte (Kurzprofil, These, Risiken, Falsifizierung)                   |

Änderungen wirken beim nächsten Laden der Seite. Die Anbieterdaten aktualisierst du mit einem FMP-Key:

```bash
npm run research:refresh            # alle Kandidaten
npm run research:refresh -- MSFT V  # nur bestimmte Symbole
npm run research:refresh -- --dry-run
```

Für neue Kandidaten kann die Claude-API einen **Textentwurf** schreiben (`ANTHROPIC_API_KEY` in `.env.local`, optional
`ANTHROPIC_MODEL`):

```bash
npm run research:texts            # Kandidaten ohne Text
npm run research:texts -- MSFT    # Neufassung für bestimmte Symbole
```

Entwürfe landen als `content/theses/<SYM>.draft.md` und erscheinen erst in der App, wenn du sie geprüft und in `<SYM>.md` umbenannt
hast. Das Skript meldet fehlende Abschnitte und jede Zahl, die sich nicht aus den Anbieterdaten ableiten lässt; ein Test stellt sicher,
dass auch die mitgelieferten Texte nur belegte Zahlen enthalten.

Die Texte in `content/theses/` werden beim Aktualisieren der Daten nicht verändert. Lies sie gegen, wenn sich Zahlen deutlich geändert haben. Mit echtem
Kursanbieter rechnet die Seite mit Live-Kursen und berechnet Volatilität und maximalen Rückgang aus den Tageskursen. Im Demo-Modus
nutzt sie die datierte Momentaufnahme und zeigt keine simulierten Kurse.

## Sicherung, Wiederherstellung, Zurücksetzen

- **Einstellungen → Sicherung:** Eine vollständige JSON-Sicherung enthält alle Daten und lässt sich dort wiederherstellen. Die CSV-Datei
  enthält alle Transaktionen.
- Vor dem Wiederherstellen, Löschen oder Zurücksetzen legt die App automatisch eine Kopie der Datenbank unter `data/backups/` an.
- Alternativ einfach `data/portfolio.db` kopieren, während die App nicht läuft.

```bash
npm run db:reset              # Sicherung, dann frische Datenbank mit Beispieldaten
npm run db:reset -- --empty   # Sicherung, dann leere Datenbank
```

## Befehle

| Befehl                     | Zweck                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Entwicklungsserver auf 127.0.0.1:3000                      |
| `npm run build`            | Produktions-Build                                          |
| `npm start`                | Produktionsserver auf 127.0.0.1:3000                       |
| `npm test`                 | Unit- und Integrationstests (Vitest)                       |
| `npm run test:e2e`         | Smoke-Tests im Browser (Playwright, eigener Server und DB) |
| `npm run lint`             | ESLint                                                     |
| `npm run typecheck`        | TypeScript-Prüfung                                         |
| `npm run format`           | Prettier                                                   |
| `npm run db:reset`         | Datenbank zurücksetzen (siehe oben)                        |
| `npm run db:generate`      | Neue Migration aus `src/db/schema.ts` erzeugen (Drizzle)   |
| `npm run research:refresh` | Daten der Wachstumswerte über FMP aktualisieren            |

Für die Browser-Tests einmalig `npx playwright install chromium` ausführen. Die Tests starten einen eigenen Server auf Port 3100 mit
der Datenbank `data/e2e.db` und Demo-Kursen; deine Daten bleiben unberührt.

## Rechenregeln

- **Positionen und Cash** werden ausschließlich aus den Transaktionen berechnet, nie gespeichert. Geld ist nie ein Float: Beträge sind
  Dezimal-Strings und werden mit `decimal.js` gerechnet.
- **Einstand:** Durchschnittskostenmethode. Gebühren und Steuern beim Kauf erhöhen den Einstand. Ein Teilverkauf realisiert anteilig.
  Unter **Erträge & Steuern** stehen die realisierten Gewinne zusätzlich nach **FIFO** (älteste Stücke zuerst), so wie die Steuer
  rechnet.
- **Fremdwährung:** Jede Buchung wird mit ihrem Wechselkurs in Euro umgerechnet und auf Cent gerundet. Aktuelle Werte werden mit dem
  aktuellen Kurs umgerechnet.
- **Splits** gelten ab Beginn des Stichtags. Historische Kurse sind split-bereinigt.
- **Tagesveränderung** = Wert jetzt − Wert zum Vortagesschluss (Bestand zu Tagesbeginn, Wechselkurs vom Vortag) − Nettokäufe heute.
  Sie enthält damit auch Währungsbewegungen und passt zum 1T-Verlauf.
- **Wertentwicklung in Prozent:** zeitgewichtet (TWR); Ein- und Auszahlungen verfälschen sie nicht.

## Datenschutz und Sicherheit

- Alle Daten bleiben lokal. Keine Telemetrie (auch die von Next.js ist abgeschaltet), kein Tracking, keine externen Schriften (die
  Schrift Geist wird mitgeliefert), keine Logos von Drittservern.
- Nach außen gehen nur Kursabfragen an den gewählten Anbieter (Symbole und Zeiträume, keine Depotdaten) sowie EZB-Wechselkurse.
- Der Server lauscht nur auf 127.0.0.1. Anfragen mit fremdem Host-Header und schreibende Anfragen von fremden Seiten werden abgewiesen.
- API-Keys stehen nur in `.env.local`.

## Projektstruktur

```
portfolio-app/
├── config/            Kriterien „Solide Wachstumswerte“ (+ README)
├── content/           Anbieterdaten (research/) und Texte (theses/)
├── data/              SQLite-Datenbank und Sicherungen (nicht eingecheckt)
├── drizzle/           SQL-Migrationen
├── e2e/               Playwright-Smoke-Tests
├── scripts/           Setup, Reset, Research-Aktualisierung
└── src/
    ├── app/           Seiten, Server Actions, API-Routen (Next.js App Router)
    ├── components/    UI-Komponenten
    ├── db/            Schema, Verbindung, Beispieldaten
    ├── domain/        Rechenkern (Ledger, Bewertung, Performance, Sparpläne, Börsenzeiten)
    ├── import/        CSV-Parser (Trade Republic, pytr, PP, generisch)
    ├── market/        Kursanbieter-Adapter und Wertpapierkatalog
    ├── research/      Kennzahlen, Kriterien, Markdown für die Wachstumswerte
    └── server/        Serverlogik (Kurse mit Cache, Übersicht, Import, Sicherung …)
```

## Bekannte Einschränkungen

- **Steuern:** Die App übernimmt Steuern aus Importen oder Eingaben, berechnet aber keine (keine Vorabpauschale, kein
  Verlustverrechnungstopf, keine Trennung von Aktien- und sonstigen Verlusten). Die Jahresübersicht zeigt realisierte Gewinne nach FIFO
  als Orientierung; maßgeblich bleibt die Steuerbescheinigung des Brokers.
- **Trade Republic:** nur CSV-Export und manuelle Eingabe. Ändert Trade Republic das Exportformat, kann die Spaltenzuordnung nötig
  werden.
- **Kapitalmaßnahmen:** Nur Aktiensplits werden abgebildet (manuell auf der Positionsseite über das Menü „…“). Spin-offs, Fusionen und Bezugsrechte
  musst du als Transaktionen erfassen.
- **Cash** wird nur in Euro geführt; es gibt kein Fremdwährungskonto.
- **Kurse:** Yahoo ist inoffiziell und kann ausfallen. Kostenlose Anbieter liefern teils verzögerte Kurse. Für manche Wertpapiere
  (z. B. Anleihen, Derivate) findet die Suche keine Kurse; dann gilt der letzte Transaktionskurs.
- **Solide Wachstumswerte:** Die mitgelieferten Daten decken zehn US-Großunternehmen ab (Einschränkung des genutzten FMP-Tarifs). Die
  Texte sind redaktionell (KI-gestützt) und müssen nach einer Aktualisierung von Hand gegengelesen werden. Im Demo-Modus bleiben
  Volatilität und maximaler Rückgang ohne Daten.
- **Kursalarme** werden nur geprüft, solange die App geöffnet ist (alle zwei Minuten); es gibt keine E-Mails oder Push-Nachrichten.
- **Ein Nutzer, ein Rechner:** keine Synchronisation zwischen Geräten.
- Das Format der Datumsfelder richtet sich nach der Spracheinstellung des Browsers.
- Die Browser-Tests laufen mit Chromium; Safari und Firefox sind nur stichprobenartig geprüft.

Geplante Verbesserungen stehen in [IMPROVEMENTS.md](IMPROVEMENTS.md).
