# Verbesserungen

Laufende Liste für die Weiterentwicklung. Reihenfolge der Priorität: Fehler → fehlende Funktionen → Design → Randfälle →
Performance & Barrierefreiheit → Extras. Erledigtes bleibt zur Nachvollziehbarkeit abgehakt stehen.

## 1. Fehler

- [x] Duplikat-Schlüssel manueller Buchungen passten nicht zum Import (Kurs statt Kurswert) – zentral berechnet, beim Start repariert
- [x] Tagesveränderung ohne Währungseffekt widersprach dem 1T-Verlauf – Wechselkurs zum Vortagesschluss eingebaut
- [x] Beispieldepot zeitweise mit negativem Cash – angepasst und per Test abgesichert
- [x] Wertpapier-Suchfeld ohne zugänglichen Namen (cmdk überschreibt die ID) – Label über cmdk
- [x] Befehlspalette wählte bei asynchronen Treffern den falschen Eintrag – Depot-Treffer zuerst
- [x] 2 Cent Rundungsdifferenz zwischen Tagesveränderung und Endpunkt der 1T-Kurve – Wertverlauf rundet je Position wie die Bewertung

## 2. Fehlende Funktionen

- [x] Einstellungen: Sicherung/Wiederherstellung (JSON), CSV-Export, Beispieldaten, Daten löschen
- [x] Watchlist mit Kursalarmen
- [x] Dividendenkalender: erwartete Ausschüttungen der nächsten 12 Monate (aus bisherigen Zahlungen hochgerechnet, klar als Schätzung)
- [x] Steuerübersicht je Jahr: Erträge, Gebühren, gezahlte Steuern; Hinweis auf FIFO-Abweichung
- [ ] Steuerübersicht: Kapitalertragsteuer, Soli und Kirchensteuer getrennt (braucht getrennte Erfassung)
- [x] Benchmark-Vergleich (MSCI World über EUNL.DE) im Wertverlauf ab 1M, zeitgewichtet seit Beginn des Zeitraums
- [ ] Benchmark auch für 1T/1W (Intraday-Kurse des Index)
- [ ] Mehrere Depots/Konten (z. B. TR + zweiter Broker) mit Filter
- [ ] Kapitalmaßnahmen: Spin-off und Umtausch (ISIN-Wechsel) geführt erfassen
- [ ] PDF-Import von Abrechnungen (nice to have)

## 3. Design-Feinschliff

- [x] Lade-Skelette, Fehler- und 404-Seite
- [x] 1T am Wochenende als „Letzter Handelstag“
- [x] Kennzahlen-Kacheln auf schmalen Bildschirmen
- [ ] Positionsliste: Sparkline je Position (30 Tage)
- [ ] Monatsüberschriften der Transaktionsliste mit Monatssumme
- [ ] Leerer Zustand der Wachstumswerte-Detailseite ohne Text schöner gestalten

## 4. Randfälle

- [ ] Buchungen in GBp/GBX (London) im Formular explizit unterstützen
- [x] Kauf/Verkauf am Tag eines Splits: Split wirkt zu Tagesbeginn (per Test abgesichert)
- [x] Import: Teilausführungen mit gleicher Transaktions-ID werden einzeln gebucht und beim erneuten Import als Duplikat erkannt (geprüft)
- [x] Zeitzonen: Trade-Republic-Buchungen kurz vor Mitternacht UTC behalten ihr Buchungsdatum (sonst z. B. Zinsen vom 31.12. im falschen Steuerjahr)

## 5. Performance & Barrierefreiheit

- [x] Transaktionsliste blättert in 100er-Schritten
- [ ] Wertverlauf „Max“ bei vielen Jahren serverseitig ausdünnen
- [x] Tabellenansicht für alle Charts („Werte als Tabelle“, ausklappbar)
- [ ] Kontrastprüfung der Hell-Variante mit dem dataviz-Validator für alle Chartfarben

## 6. Extras

- [ ] Kursalarme zusätzlich als Systembenachrichtigung (nur wenn die App offen ist, Opt-in)
- [ ] Export der Wachstumswerte-Bewertung als PDF/Markdown
- [ ] KI-gestützte Aktualisierung der Thesen-Texte (mit Quellenpflicht und manueller Freigabe)
