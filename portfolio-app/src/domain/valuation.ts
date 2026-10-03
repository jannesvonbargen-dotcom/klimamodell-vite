import { d, Dec, isZeroQty, ratio, roundMoney, sum, ZERO } from "./decimal";
import { averageCostEUR, averageCostLocal, computeLedger, grossAmount, type Ledger, toEUR } from "./ledger";
import { isBuyLike, type Instrument, type Split, type Transaction } from "./types";

export interface Quote {
  symbol: string;
  /** Letzter Kurs in `currency`. */
  price: string;
  /** Schlusskurs des Vortags in `currency`. */
  previousClose: string | null;
  currency: string;
  /** ISO-Zeitstempel des Kurses. */
  asOf: string;
  /** true, wenn der Kurs aus dem Cache stammt, weil der Anbieter nicht erreichbar war. */
  stale?: boolean;
  source: string;
}

/** Wechselkurse: Einheiten Fremdwährung je 1 EUR. */
export type FxTable = ReadonlyMap<string, string>;

export type PriceSource = "quote" | "last-transaction" | "none";

export interface PositionValuation {
  instrumentId: number;
  quantity: string;
  costEUR: string;
  avgCostEUR: string | null;
  avgCostLocal: string | null;
  costCurrency: string | null;
  priceLocal: string | null;
  priceCurrency: string | null;
  priceEUR: string | null;
  marketValueEUR: string;
  unrealizedEUR: string;
  unrealizedPct: string | null;
  dayChangeEUR: string | null;
  dayChangePct: string | null;
  /** Anteil am Depotwert (0–1). */
  weight: string | null;
  realizedEUR: string;
  dividendsNetEUR: string;
  priceSource: PriceSource;
  quoteAsOf: string | null;
  quoteStale: boolean;
}

export interface PortfolioTotals {
  marketValueEUR: string;
  costEUR: string;
  unrealizedEUR: string;
  unrealizedPct: string | null;
  cashEUR: string;
  totalEUR: string;
  dayChangeEUR: string;
  dayChangePct: string | null;
  investedShare: string | null;
  cashShare: string | null;
  realizedEUR: string;
  dividendsNetEUR: string;
  dividendsGrossEUR: string;
  interestEUR: string;
  feesEUR: string;
  taxesEUR: string;
  depositsEUR: string;
  withdrawalsEUR: string;
}

export interface PortfolioValuation {
  positions: PositionValuation[];
  totals: PortfolioTotals;
  ledger: Ledger;
  /** Instrumente ohne aktuellen Kurs (Fallback auf letzten Transaktionskurs). */
  missingQuotes: number[];
}

export function fxRateFor(currency: string, fx: FxTable): Dec | null {
  if (currency === "EUR") return d(1);
  // GBp (Pence) wird von manchen Anbietern für London genutzt
  if (currency === "GBp" || currency === "GBX") {
    const gbp = fx.get("GBP");
    return gbp ? d(gbp).times(100) : null;
  }
  const rate = fx.get(currency);
  return rate ? d(rate) : null;
}

export interface ValuationInput {
  transactions: readonly Transaction[];
  splits?: readonly Split[];
  instruments: ReadonlyMap<number, Instrument>;
  quotes: ReadonlyMap<string, Quote>;
  fx: FxTable;
  /**
   * Wechselkurse zum Vortagesschluss. Damit enthält die Tagesveränderung auch
   * Währungsbewegungen (wie die Wertentwicklung). Fehlt sie, gilt `fx`.
   */
  fxPrevious?: FxTable;
  /** Heutiges Datum (YYYY-MM-DD, Europe/Berlin). */
  today: string;
}

/**
 * Bewertet das Depot: Marktwerte, unrealisierte G/V, Tagesveränderung,
 * Gewichte und Summen. Die Tagesveränderung ist
 *   Wert jetzt − Wert zum Vortagesschluss (Bestand zu Tagesbeginn) − Nettokäufe heute,
 * sodass Käufe und Verkäufe des Tages die Kennzahl nicht verfälschen.
 */
export function valuePortfolio(input: ValuationInput): PortfolioValuation {
  const { transactions, splits = [], instruments, quotes, fx, fxPrevious, today } = input;
  const ledger = computeLedger(transactions, splits);
  const yesterday = previousDay(today);
  const startOfDay = computeLedger(transactions, splits, { asOf: yesterday });

  // Nettokäufe heute je Instrument in EUR (Kurswert ohne Gebühren)
  const todaysNetBuys = new Map<number, Dec>();
  for (const tx of transactions) {
    if (!tx.executedAt.startsWith(today) || tx.instrumentId === null) continue;
    if (tx.type !== "BUY" && tx.type !== "SAVINGS_PLAN" && tx.type !== "SELL") continue;
    const grossEUR = toEUR(grossAmount(tx), tx.fxRate);
    const signed = isBuyLike(tx.type) ? grossEUR : grossEUR.neg();
    todaysNetBuys.set(tx.instrumentId, (todaysNetBuys.get(tx.instrumentId) ?? ZERO).plus(signed));
  }

  const missingQuotes: number[] = [];
  interface Row {
    v: Omit<PositionValuation, "weight">;
    marketValue: Dec;
    dayChange: Dec | null;
    startValue: Dec | null;
  }
  const rows: Row[] = [];

  // Positionen, die heute komplett verkauft wurden, tragen trotzdem zur Tagesveränderung bei
  const relevantIds = new Set<number>([
    ...ledger.openPositions().map((p) => p.instrumentId),
    ...[...todaysNetBuys.keys()].filter((id) => {
      const startPos = startOfDay.positions.get(id);
      return startPos && !isZeroQty(startPos.quantity);
    }),
  ]);

  let closedTodayDayChange = ZERO;
  let closedTodayStart = ZERO;

  for (const id of relevantIds) {
    const p = ledger.positions.get(id);
    if (!p) continue;
    const instrument = instruments.get(id);
    const quote = instrument ? quotes.get(instrument.symbol) : undefined;
    const quoteFx = quote ? fxRateFor(quote.currency, fx) : null;

    let priceEUR: Dec | null = null;
    let priceLocal: Dec | null = null;
    let priceCurrency: string | null = null;
    let prevCloseEUR: Dec | null = null;
    let priceSource: PriceSource = "none";

    if (quote && quoteFx) {
      priceLocal = d(quote.price);
      priceCurrency = quote.currency;
      priceEUR = priceLocal.div(quoteFx);
      const prevFx = (fxPrevious && fxRateFor(quote.currency, fxPrevious)) || quoteFx;
      prevCloseEUR = quote.previousClose ? d(quote.previousClose).div(prevFx) : null;
      priceSource = "quote";
    } else if (p.lastPriceEUR) {
      priceEUR = p.lastPriceEUR;
      priceLocal = p.lastPriceLocal;
      priceCurrency = p.localCurrency;
      priceSource = "last-transaction";
      missingQuotes.push(id);
    } else {
      missingQuotes.push(id);
    }

    const marketValue = priceEUR ? roundMoney(p.quantity.times(priceEUR)) : ZERO;
    const startQty = startOfDay.positions.get(id)?.quantity ?? ZERO;
    const netBuys = todaysNetBuys.get(id) ?? ZERO;
    let dayChange: Dec | null = null;
    let startValue: Dec | null = null;
    if (prevCloseEUR) {
      startValue = roundMoney(startQty.times(prevCloseEUR));
      dayChange = marketValue.minus(startValue).minus(netBuys);
    }

    if (isZeroQty(p.quantity)) {
      // Heute komplett verkauft: nur in die Tagesveränderung einrechnen
      if (dayChange) closedTodayDayChange = closedTodayDayChange.plus(dayChange);
      if (startValue) closedTodayStart = closedTodayStart.plus(startValue);
      continue;
    }

    const unrealized = marketValue.minus(p.costEUR);
    const dayBase = startValue && !startValue.isZero() ? startValue : netBuys.gt(0) ? netBuys : null;
    rows.push({
      marketValue,
      dayChange,
      startValue,
      v: {
        instrumentId: id,
        quantity: p.quantity.toString(),
        costEUR: roundMoney(p.costEUR).toString(),
        avgCostEUR: averageCostEUR(p)?.toString() ?? null,
        avgCostLocal: averageCostLocal(p)?.toString() ?? null,
        costCurrency: p.mixedCurrencies ? null : p.localCurrency,
        priceLocal: priceLocal?.toString() ?? null,
        priceCurrency,
        priceEUR: priceEUR?.toString() ?? null,
        marketValueEUR: marketValue.toString(),
        unrealizedEUR: roundMoney(unrealized).toString(),
        unrealizedPct: ratio(unrealized, p.costEUR)?.toString() ?? null,
        dayChangeEUR: dayChange ? roundMoney(dayChange).toString() : null,
        dayChangePct: dayChange && dayBase ? (ratio(dayChange, dayBase)?.toString() ?? null) : null,
        realizedEUR: roundMoney(p.realizedEUR).toString(),
        dividendsNetEUR: roundMoney(p.dividendsNetEUR).toString(),
        priceSource,
        quoteAsOf: quote?.asOf ?? null,
        quoteStale: Boolean(quote?.stale),
      },
    });
  }

  const marketValueTotal = sum(rows.map((r) => r.marketValue));
  const costTotal = sum(ledger.openPositions().map((p) => p.costEUR));
  const unrealizedTotal = marketValueTotal.minus(costTotal);
  const cash = ledger.cashEUR;
  const total = marketValueTotal.plus(cash);

  const dayChangeTotal = sum(rows.map((r) => r.dayChange ?? ZERO)).plus(closedTodayDayChange);
  // Basis: Gesamtvermögen zu Tagesbeginn (Depot zum Vortagesschluss + Cash zu Tagesbeginn)
  const startDepot = sum(rows.map((r) => r.startValue ?? ZERO)).plus(closedTodayStart);
  const dayBaseTotal = startDepot.plus(startOfDay.cashEUR);

  const positions: PositionValuation[] = rows
    .map((r) => ({
      ...r.v,
      weight: ratio(r.marketValue, marketValueTotal)?.toString() ?? null,
    }))
    .sort((a, b) => d(b.marketValueEUR).cmp(d(a.marketValueEUR)));

  return {
    positions,
    ledger,
    missingQuotes,
    totals: {
      marketValueEUR: marketValueTotal.toString(),
      costEUR: roundMoney(costTotal).toString(),
      unrealizedEUR: roundMoney(unrealizedTotal).toString(),
      unrealizedPct: ratio(unrealizedTotal, costTotal)?.toString() ?? null,
      cashEUR: roundMoney(cash).toString(),
      totalEUR: roundMoney(total).toString(),
      dayChangeEUR: roundMoney(dayChangeTotal).toString(),
      dayChangePct: dayBaseTotal.gt(0) ? (ratio(dayChangeTotal, dayBaseTotal)?.toString() ?? null) : null,
      investedShare: total.gt(0) ? (ratio(marketValueTotal, total)?.toString() ?? null) : null,
      cashShare: total.gt(0) ? (ratio(cash, total)?.toString() ?? null) : null,
      realizedEUR: roundMoney(ledger.realizedEUR).toString(),
      dividendsNetEUR: roundMoney(ledger.dividendsNetEUR).toString(),
      dividendsGrossEUR: roundMoney(ledger.dividendsGrossEUR).toString(),
      interestEUR: roundMoney(ledger.interestEUR).toString(),
      feesEUR: roundMoney(ledger.feesEUR).toString(),
      taxesEUR: roundMoney(ledger.taxesEUR).toString(),
      depositsEUR: roundMoney(ledger.depositsEUR).toString(),
      withdrawalsEUR: roundMoney(ledger.withdrawalsEUR).toString(),
    },
  };
}

/** Vortag eines ISO-Datums (YYYY-MM-DD). */
export function previousDay(date: string): string {
  const [y, m, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
