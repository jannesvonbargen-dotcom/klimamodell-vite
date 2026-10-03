# Verbesserungen

Laufende Liste für die Weiterentwicklung. Reihenfolge der Priorität: Fehler → fehlende Funktionen → Design → Randfälle →
Performance & Barrierefreiheit → Extras. Erledigtes bleibt zur Nachvollziehbarkeit abgehakt stehen.

## 1. Fehler

- [x] Duplikat-Schlüssel manueller Buchungen passten nicht zum Import (Kurs statt Kurswert) – zentral berechnet, beim Start repariert
- [x] Tagesveränderung ohne Währungseffekt widersprach dem 1T-Verlauf – Wechselkurs zum Vortagesschluss eingebaut
- [x] Beispieldepot zeitweise mit negativem Cash – angepasst und per Test abgesichert
- [x] Wertpapier-Suchfeld ohne zugänglichen Namen (cmdk überschreibt die ID) – Label über cmdk
- [x] Befehlspalette wählte bei asynchronen Treffern den falschen Eintrag – Depot-Treffer zuerst
- [x] Ersatzanbieter sprang nur bei Totalausfall ein – jetzt je fehlendem Symbol (z. B. SAP bei Finnhub-Gratis-Tarif)
- [x] Hydration-Fehler auf Wachstumswerte-Detailseiten: kompakte Zahlen („57 Mrd. $“) rundeten in Node und Browser verschieden – eigene, deterministische Formatierung
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
- [x] Aktiensplits aus dem Trade-Republic-Export: Link „Split erfassen“ öffnet den vorausgefüllten Dialog der Position
- [ ] Kapitalmaßnahmen: Spin-off und Umtausch (ISIN-Wechsel) geführt erfassen
- [ ] PDF-Import von Abrechnungen (nice to have)

- [x] Verbindungstest für Kursanbieter und Wechselkurse in den Einstellungen

## 3. Design-Feinschliff

- [x] Lade-Skelette, Fehler- und 404-Seite
- [x] 1T am Wochenende als „Letzter Handelstag“
- [x] Kennzahlen-Kacheln auf schmalen Bildschirmen
- [x] Positionsliste: Sparkline je Position (30 Tage), sortierbar
- [x] Monatsüberschriften der Transaktionsliste mit Summe der Kontobewegungen
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
- [x] Kontrastprüfung mit dem dataviz-Validator: alle Checks bestanden; drei helle Farben unter 3:1 im Hell-Modus nur im Donut mit Beschriftung

## 6. Extras

- [ ] Kursalarme zusätzlich als Systembenachrichtigung (nur wenn die App offen ist, Opt-in)
- [ ] Export der Wachstumswerte-Bewertung als PDF/Markdown
- [ ] KI-gestützte Aktualisierung der Thesen-Texte (mit Quellenpflicht und manueller Freigabe)
