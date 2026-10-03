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
- [ ] Benchmark-Vergleich (z. B. MSCI World über EUNL.DE) im Wertverlauf, als indexierte zweite Linie
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
- [ ] Verkauf am Tag eines Splits (Reihenfolge innerhalb des Tages)
- [ ] Import: Trade-Republic-Sammelzeilen (Teilausführungen) zusammenführen
- [ ] Zeitzonen: Buchungen kurz nach Mitternacht UTC (Tageszuordnung im Export)

## 5. Performance & Barrierefreiheit

- [x] Transaktionsliste blättert in 100er-Schritten
- [ ] Wertverlauf „Max“ bei vielen Jahren serverseitig ausdünnen
- [ ] Screenreader-Tabellenansicht für Charts (Werte als Tabelle)
- [ ] Kontrastprüfung der Hell-Variante mit dem dataviz-Validator für alle Chartfarben

## 6. Extras

- [ ] Kursalarme zusätzlich als Systembenachrichtigung (nur wenn die App offen ist, Opt-in)
- [ ] Export der Wachstumswerte-Bewertung als PDF/Markdown
- [ ] KI-gestützte Aktualisierung der Thesen-Texte (mit Quellenpflicht und manueller Freigabe)
