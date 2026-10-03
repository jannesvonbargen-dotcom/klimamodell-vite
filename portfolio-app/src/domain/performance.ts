import { d, Dec, ONE, roundMoney, ZERO } from "./decimal";
import { buildEvents, Ledger } from "./ledger";
import type { Instrument, Split, Transaction } from "./types";
import { fxRateFor } from "./valuation";

/**
 * Wertverlauf des Gesamtvermögens (Depot + Cash) über beliebige Zeitpunkte.
 * Für jeden Zeitpunkt werden alle Transaktionen bis dahin angewendet und der
 * Bestand mit dem zuletzt bekannten Kurs bewertet.
 *
 * Rendite: zeitgewichtet (TWR). Ein-/Auszahlungen gelten als zu Beginn des
 * Intervalls erfolgt; Käufe/Verkäufe sind interne Umschichtungen.
 */

/** Sortierte Zeitreihe; `key` ist "YYYY-MM-DD" oder "YYYY-MM-DDTHH:mm". */
export type KeyedSeries = ReadonlyArray<{ key: string; value: string }>;

export interface SeriesPoint {
  /** Zeitpunkt ("YYYY-MM-DD" oder "YYYY-MM-DDTHH:mm"). */
  key: string;
  totalEUR: string;
  depotEUR: string;
  cashEUR: string;
  /** Externer Fluss (Einzahlung − Auszahlung) in diesem Intervall. */
  flowEUR: string;
  /** Kumulierter Gewinn seit Beginn der Reihe (ohne externe Flüsse). */
  gainEUR: string;
  /** Kumulierte zeitgewichtete Rendite seit Beginn (Bruch). */
  twr: string;
  /** Einstand der gehaltenen Positionen. */
  investedEUR: string;
}

/** Gibt den letzten Wert mit key ≤ target zurück; der Cursor wandert nur vorwärts. */
class SeriesCursor {
  private index = -1;
  constructor(private readonly series: KeyedSeries) {}
  valueAt(target: string): string | null {
    while (this.index + 1 < this.series.length && compareKeys(this.series[this.index + 1].key, target) <= 0) {
      this.index++;
    }
    return this.index >= 0 ? this.series[this.index].value : null;
  }
}

/** Vergleicht Datums-/Zeitschlüssel; ein reines Datum steht für das Tagesende. */
function compareKeys(a: string, b: string): number {
  const na = a.length === 10 ? `${a}T23:59` : a;
  const nb = b.length === 10 ? `${b}T23:59` : b;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

export interface BuildSeriesInput {
  transactions: readonly Transaction[];
  splits?: readonly Split[];
  instruments: ReadonlyMap<number, Instrument>;
  /** Kurse je Symbol in Notierungswährung des Instruments. */
  prices: ReadonlyMap<string, KeyedSeries>;
  /** Wechselkurse je Währung (Einheiten je EUR). */
  fx: ReadonlyMap<string, KeyedSeries>;
  /** Aufsteigend sortierte Zeitpunkte. */
  keys: readonly string[];
  /** Optional: aktueller Kurs pro Symbol für den letzten Punkt (z. B. Live-Kurs). */
  latestPrices?: ReadonlyMap<string, string>;
}

export function buildValueSeries(input: BuildSeriesInput): SeriesPoint[] {
  const { transactions, splits = [], instruments, prices, fx, keys } = input;
  if (keys.length === 0) return [];
  const events = buildEvents(transactions, splits);
  const ledger = new Ledger();
  const priceCursors = new Map<string, SeriesCursor>();
  const fxCursors = new Map<string, SeriesCursor>();
  for (const [symbol, series] of prices) priceCursors.set(symbol, new SeriesCursor(series));
  for (const [ccy, series] of fx) fxCursors.set(ccy, new SeriesCursor(series));

  // Historische Kurse sind split-bereinigt: vor einem Split gehaltene Stücke
  // werden mit dem Faktor aller späteren Splits multipliziert bewertet.
  const splitsByInstrument = new Map<number, Split[]>();
  for (const s of splits) {
    const list = splitsByInstrument.get(s.instrumentId) ?? [];
    list.push(s);
    splitsByInstrument.set(s.instrumentId, list);
  }
  const splitFactorAfter = (instrumentId: number, key: string): Dec => {
    let factor = ONE;
    for (const s of splitsByInstrument.get(instrumentId) ?? []) {
      if (key.slice(0, 10) < s.effectiveDate) factor = factor.times(d(s.ratioTo).div(d(s.ratioFrom)));
    }
    return factor;
  };

  let eventIndex = 0;
  let prevTotal: Dec | null = null;
  let twrFactor = ONE;
  let cumulativeFlow = ZERO;
  let firstTotal: Dec | null = null;
  const points: SeriesPoint[] = [];

  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    const limit = key.length === 10 ? `${key}T23:59` : key;
    let flow = ZERO;
    while (eventIndex < events.length && events[eventIndex].key <= limit) {
      const before = ledger.cashEffects.length;
      ledger.apply(events[eventIndex]);
      for (let i = before; i < ledger.cashEffects.length; i++) flow = flow.plus(ledger.cashEffects[i].externalEUR);
      eventIndex++;
    }

    // Aktuelle Wechselkurse für diesen Zeitpunkt
    const fxNow = new Map<string, string>();
    for (const [ccy, cursor] of fxCursors) {
      const v = cursor.valueAt(key);
      if (v) fxNow.set(ccy, v);
    }

    let depot = ZERO;
    let invested = ZERO;
    for (const p of ledger.openPositions()) {
      invested = invested.plus(p.costEUR);
      const instrument = instruments.get(p.instrumentId);
      let priceEUR: Dec | null = null;
      if (instrument) {
        const isLast = k === keys.length - 1;
        const latest = isLast ? input.latestPrices?.get(instrument.symbol) : undefined;
        const local = latest ?? priceCursors.get(instrument.symbol)?.valueAt(key) ?? null;
        const rate = fxRateFor(instrument.currency, fxNow);
        if (local && rate) priceEUR = d(local).times(splitFactorAfter(p.instrumentId, key)).div(rate);
      }
      // Kein Kurs bekannt (z. B. vor Beginn der Kurshistorie): letzter Transaktionskurs
      if (!priceEUR) priceEUR = p.lastPriceEUR;
      if (priceEUR) depot = depot.plus(p.quantity.times(priceEUR));
    }
    depot = roundMoney(depot);
    const cash = ledger.cashEUR;
    const total = depot.plus(cash);

    if (prevTotal === null) {
      firstTotal = total;
    } else {
      cumulativeFlow = cumulativeFlow.plus(flow);
      const base = prevTotal.plus(flow);
      if (base.gt(0)) twrFactor = twrFactor.times(total.div(base));
    }
    const gain = total.minus(firstTotal ?? ZERO).minus(cumulativeFlow);

    points.push({
      key,
      totalEUR: total.toString(),
      depotEUR: depot.toString(),
      cashEUR: cash.toString(),
      flowEUR: flow.toString(),
      gainEUR: roundMoney(gain).toString(),
      twr: twrFactor.minus(1).toString(),
      investedEUR: roundMoney(invested).toString(),
    });
    prevTotal = total;
  }
  return points;
}

/** Werktage (Mo–Fr) zwischen from und to (inklusive), als YYYY-MM-DD. */
export function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export type RangeKey = "1D" | "1W" | "1M" | "YTD" | "1Y" | "MAX";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "1D": "1T",
  "1W": "1W",
  "1M": "1M",
  YTD: "YTD",
  "1Y": "1J",
  MAX: "Max",
};

/** Startdatum eines Zeitraums relativ zu `today` (YYYY-MM-DD). */
export function rangeStart(range: RangeKey, today: string, firstDate: string | null): string {
  const [y, m, day] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  switch (range) {
    case "1D":
      return today;
    case "1W":
      dt.setUTCDate(dt.getUTCDate() - 7);
      break;
    case "1M":
      dt.setUTCMonth(dt.getUTCMonth() - 1);
      break;
    case "YTD":
      return `${y - 1}-12-31`;
    case "1Y":
      dt.setUTCFullYear(dt.getUTCFullYear() - 1);
      break;
    case "MAX":
      return firstDate ?? today;
  }
  const start = dt.toISOString().slice(0, 10);
  return firstDate && start < firstDate ? firstDate : start;
}

/** Zusammenfassung eines Zeitraums. */
export function summarizeSeries(points: readonly SeriesPoint[]): { gainEUR: string; twr: string } | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  return { gainEUR: last.gainEUR, twr: last.twr };
}
