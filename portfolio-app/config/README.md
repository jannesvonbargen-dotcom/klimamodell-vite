# Konfiguration: Solide Wachstumswerte

Die Datei `growth-criteria.json` legt fest, welche Aktien in der Rubrik „Solide Wachstumswerte“
geprüft werden und nach welchen Regeln eine Aktie als Empfehlung erscheint. Änderungen wirken
sofort beim nächsten Laden der Seite.

## Allgemein

| Feld                | Bedeutung                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `staleAfterDays`    | Ab diesem Alter (in Tagen) gelten Daten und Einschätzungen als veraltet und werden markiert.                                       |
| `maxFailedOptional` | Wie viele **optionale** Kriterien höchstens verfehlt werden dürfen. Pflichtkriterien (`required: true`) müssen immer erfüllt sein. |
| `candidates`        | Ticker, die geprüft werden. Für jeden Ticker muss `content/research/<TICKER>.json` existieren (`npm run research:refresh`).        |

## Kriterien

Jedes Kriterium hat `enabled` (an/aus), `required` (Pflicht ja/nein) und meist einen Schwellenwert `value`.
Kann ein Kriterium mangels Daten nicht geprüft werden, gilt es als „keine Daten“ – es zählt weder als erfüllt noch als verfehlt.
Mit `notApplicableIndustries` lässt sich ein Kriterium für Branchen abschalten, in denen es keinen Sinn ergibt
(z. B. Free Cashflow und Verschuldungsgrad bei Banken).

| Schlüssel                  | Prüfung                                                                                                                    | Datenquelle                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `minMarketCapUSD`          | Marktkapitalisierung ≥ `value` US-Dollar                                                                                   | FMP-Profil                                  |
| `profitableYears`          | Jahresüberschuss > 0 in den letzten `value` Geschäftsjahren                                                                | FMP-Gewinn- und Verlustrechnung             |
| `positiveFreeCashFlow`     | Free Cashflow im letzten Geschäftsjahr > 0                                                                                 | FMP-Cashflow-Rechnung                       |
| `maxDebtToEquity`          | Verschuldungsgrad (Fremd- zu Eigenkapital) ≤ `value`                                                                       | FMP-Kennzahlen (TTM)                        |
| `maxBeta`                  | Beta (Schwankung relativ zum Markt) ≤ `value`                                                                              | FMP-Profil                                  |
| `maxVolatility`            | Annualisierte Volatilität der letzten 12 Monate ≤ `value` (0,35 = 35 %)                                                    | berechnet aus Tageskursen des Kursanbieters |
| `maxDrawdown`              | Größter Rückgang vom Hoch in den letzten 12 Monaten ≤ `value`                                                              | berechnet aus Tageskursen des Kursanbieters |
| `minRevenueCagr`           | Durchschnittliches jährliches Umsatzwachstum über `years` Jahre ≥ `value`                                                  | FMP-Gewinn- und Verlustrechnung             |
| `minEpsCagr`               | Durchschnittliches jährliches Wachstum des Gewinns je Aktie über `years` Jahre ≥ `value`                                   | FMP-Gewinn- und Verlustrechnung             |
| `minGrowthYears`           | Umsatz in mindestens `value` von `of` Jahren gestiegen                                                                     | FMP-Gewinn- und Verlustrechnung             |
| `minExpectedRevenueGrowth` | Erwartetes Umsatzwachstum im nächsten Geschäftsjahr ≥ `value` (Schätzung gegenüber Schätzung des Vorjahres, gleiche Basis) | FMP-Analystenschätzungen                    |
| `minBuyShare`              | Anteil der Kaufempfehlungen an allen Analystenurteilen ≥ `value`                                                           | FMP-Analystenübersicht                      |
| `minTargetUpside`          | Durchschnittliches Kursziel mindestens `value` über dem aktuellen Kurs                                                     | FMP-Kursziele, Kurs vom Kursanbieter        |

Im Demo-Modus (simulierte Kurse) werden Volatilität, Drawdown und Kursziel-Abstand nicht aus Demo-Kursen berechnet:
Volatilität und Drawdown zeigen „keine Daten“, der Kursziel-Abstand nutzt den Kurs aus der Datenmomentaufnahme.
