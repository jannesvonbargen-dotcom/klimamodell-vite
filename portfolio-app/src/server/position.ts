import { d, roundMoney, ZERO } from "@/domain/decimal";
import { computeLedger, grossAmount } from "@/domain/ledger";
import { exchangeForInstrument, marketStatus, nowInBerlin, todayInBerlin } from "@/domain/market-hours";
import type { Instrument } from "@/domain/types";
import { valuePortfolio } from "@/domain/valuation";
import type { Fundamentals } from "@/market/types";
import {
  getDailyHistory,
  getFundamentals,
  getFxHistory,
  getFxRates,
  getIntraday,
  getPreviousCloseFx,
  getQuotes,
  syncInstrumentCurrencies,
} from "./market";
import { getInstrumentByIsin, instrumentMap, listSplits, listTransactionRows, toTransaction } from "./repo";

/** Daten für die Detailseite einer Position. */

export type InstrumentRange = "1D" | "1W" | "1M" | "1Y" | "5Y" | "MAX";

export interface PositionDetail {
  instrument: Instrument;
  quote: { price: string; previousClose: string | null; currency: string; asOf: string; stale: boolean; source: string } | null;
  marketOpen: boolean;
  position: {
    quantity: string;
    costEUR: string;
    avgCostEUR: string | null;
    avgCostLocal: string | null;
    costCurrency: string | null;
    marketValueEUR: string;
    unrealizedEUR: string;
    unrealizedPct: string | null;
    dayChangeEUR: string | null;
    dayChangePct: string | null;
    weight: string | null;
    priceSource: string;
  } | null;
  realizedEUR: string;
  dividendsNetEUR: string;
  dividendsGrossEUR: string;
  feesEUR: string;
  firstBuyAt: string | null;
  transactions: Array<{
    id: number;
    type: string;
    executedAt: string;
    quantity: string | null;
    price: string | null;
    amount: string | null;
    currency: string;
    fxRate: string;
    fee: string;
    tax: string;
    note: string | null;
    source: string;
  }>;
  dividendsByYear: Array<{ year: number; grossEUR: string; netEUR: string; count: number }>;
  fundamentals: (Fundamentals & { stale?: boolean }) | null;
  splits: Array<{ id: number; effectiveDate: string; ratioFrom: string; ratioTo: string }>;
}

export async function getPositionDetail(isin: string): Promise<PositionDetail | null> {
  let instrument = getInstrumentByIsin(isin);
  if (!instrument) return null;
  const rows = listTransactionRows();
  const allTx = rows.map(toTransaction);
  const splits = listSplits();
  const instruments = instrumentMap();
  const symbols = [
    ...new Set(
      allTx
        .filter((t) => t.instrumentId)
        .map((t) => instruments.get(t.instrumentId!)?.symbol)
        .filter((s): s is string => !!s),
    ),
  ];
  if (!symbols.includes(instrument.symbol)) symbols.push(instrument.symbol);
  const [quotes, fx, fundamentals] = await Promise.all([getQuotes(symbols), getFxRates(), getFundamentals(instrument.symbol)]);
  syncInstrumentCurrencies(quotes.quotes);
  instrument = getInstrumentByIsin(isin)!;
  const today = todayInBerlin();
  const valuation = valuePortfolio({
    transactions: allTx,
    splits,
    instruments: instrumentMap(),
    quotes: quotes.quotes,
    fx: fx.rates,
    fxPrevious: await getPreviousCloseFx([...new Set([...quotes.quotes.values()].map((q) => q.currency))], today),
    today,
  });
  const row = valuation.positions.find((p) => p.instrumentId === instrument!.id);
  const ledgerPos = valuation.ledger.positions.get(instrument.id);
  const own = rows.filter((r) => r.instrumentId === instrument!.id);
  const q = quotes.quotes.get(instrument.symbol);

  const byYear = new Map<number, { gross: ReturnType<typeof d>; net: ReturnType<typeof d>; count: number }>();
  for (const r of own.filter((t) => t.type === "DIVIDEND")) {
    const ledger = computeLedger([toTransaction(r)]);
    const year = Number(r.executedAt.slice(0, 4));
    const entry = byYear.get(year) ?? { gross: ZERO, net: ZERO, count: 0 };
    entry.gross = entry.gross.plus(ledger.dividendsGrossEUR);
    entry.net = entry.net.plus(ledger.dividendsNetEUR);
    entry.count++;
    byYear.set(year, entry);
  }

  return {
    instrument,
    quote: q
      ? { price: q.price, previousClose: q.previousClose, currency: q.currency, asOf: q.asOf, stale: Boolean(q.stale), source: q.source }
      : null,
    marketOpen: marketStatus(exchangeForInstrument(instrument.symbol, instrument.currency)).open,
    position: row
      ? {
          quantity: row.quantity,
          costEUR: row.costEUR,
          avgCostEUR: row.avgCostEUR,
          avgCostLocal: row.avgCostLocal,
          costCurrency: row.costCurrency,
          marketValueEUR: row.marketValueEUR,
          unrealizedEUR: row.unrealizedEUR,
          unrealizedPct: row.unrealizedPct,
          dayChangeEUR: row.dayChangeEUR,
          dayChangePct: row.dayChangePct,
          weight: row.weight,
          priceSource: row.priceSource,
        }
      : null,
    realizedEUR: roundMoney(ledgerPos?.realizedEUR ?? ZERO).toString(),
    dividendsNetEUR: roundMoney(ledgerPos?.dividendsNetEUR ?? ZERO).toString(),
    dividendsGrossEUR: roundMoney(ledgerPos?.dividendsGrossEUR ?? ZERO).toString(),
    feesEUR: roundMoney(ledgerPos?.feesEUR ?? ZERO).toString(),
    firstBuyAt: ledgerPos?.firstBuyAt ?? null,
    transactions: own.map((r) => ({
      id: r.id,
      type: r.type,
      executedAt: r.executedAt,
      quantity: r.quantity,
      price: r.price,
      amount: r.amount,
      currency: r.currency,
      fxRate: r.fxRate,
      fee: r.fee,
      tax: r.tax,
      note: r.note,
      source: r.source,
    })),
    dividendsByYear: [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, v]) => ({ year, grossEUR: roundMoney(v.gross).toString(), netEUR: roundMoney(v.net).toString(), count: v.count })),
    fundamentals,
    splits: splits.filter((s) => s.instrumentId === instrument!.id),
  };
}

export interface InstrumentChart {
  range: InstrumentRange;
  currency: string;
  intraday: boolean;
  points: Array<{ key: string; price: number }>;
  /** Eigene Käufe/Verkäufe als Marker (Kurs split-bereinigt, in Notierungswährung). */
  markers: Array<{ key: string; type: "BUY" | "SELL" | "SAVINGS_PLAN"; price: number; quantity: string }>;
  previousClose: number | null;
}

function subtractDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export async function getInstrumentChart(isin: string, range: InstrumentRange): Promise<InstrumentChart | null> {
  const instrument = getInstrumentByIsin(isin);
  if (!instrument) return null;
  const today = todayInBerlin();
  const rows = listTransactionRows().filter((r) => r.instrumentId === instrument.id && ["BUY", "SELL", "SAVINGS_PLAN"].includes(r.type));
  const splits = listSplits().filter((s) => s.instrumentId === instrument.id);
  const quote = (await getQuotes([instrument.symbol])).quotes.get(instrument.symbol);

  let points: Array<{ key: string; price: number }> = [];
  let intraday = false;
  if (range === "1D" || range === "1W") {
    const result = await getIntraday(instrument.symbol, range === "1D" ? 1 : 5);
    points = result.points.map((p) => ({ key: p.key, price: Number(p.close) }));
    intraday = true;
  }
  if (points.length === 0) {
    const firstTrade = rows.reduce<string | null>((min, r) => (!min || r.executedAt < min ? r.executedAt.slice(0, 10) : min), null);
    const from =
      range === "1M"
        ? subtractDays(today, 31)
        : range === "1Y" || range === "1D" || range === "1W"
          ? subtractDays(today, 366)
          : range === "5Y"
            ? subtractDays(today, 5 * 366)
            : subtractDays(firstTrade && firstTrade < subtractDays(today, 5 * 366) ? firstTrade : subtractDays(today, 5 * 366), 7);
    const history = await getDailyHistory(instrument.symbol, from, today);
    points = history.map((p) => ({ key: p.key, price: Number(p.close) }));
    intraday = false;
    if (quote && points.length && points[points.length - 1].key < today) points.push({ key: today, price: Number(quote.price) });
  } else if (quote) {
    const now = nowInBerlin();
    if (points[points.length - 1].key < now) points.push({ key: now, price: Number(quote.price) });
  }

  // Marker: Transaktionskurs in Notierungswährung umgerechnet, split-bereinigt
  const quoteCurrency = quote?.currency ?? instrument.currency;
  const first = points[0]?.key ?? "";
  const visible = rows.filter(
    (r) => (intraday ? r.executedAt.slice(0, 16) : r.executedAt.slice(0, 10)) >= first.slice(0, intraday ? 16 : 10),
  );
  let fxSeries: Array<{ key: string; close: string }> = [];
  if (quoteCurrency !== "EUR" && visible.some((r) => r.currency !== quoteCurrency)) {
    const ccy = quoteCurrency === "GBp" ? "GBP" : quoteCurrency;
    fxSeries =
      (await getFxHistory([ccy], subtractDays(visible[visible.length - 1]?.executedAt.slice(0, 10) ?? today, 10), today)).get(ccy) ?? [];
  }
  const fxOn = (date: string): ReturnType<typeof d> | null => {
    const hit = fxSeries.filter((p) => p.key <= date).at(-1);
    if (!hit) return null;
    return quoteCurrency === "GBp" ? d(hit.close).times(100) : d(hit.close);
  };
  const markers = visible
    .map((r) => {
      const qty = d(r.quantity ?? "0");
      if (qty.isZero()) return null;
      const unitTx = grossAmount(r).div(qty);
      let unit: ReturnType<typeof d> | null;
      if (r.currency === quoteCurrency) unit = unitTx;
      else {
        const unitEUR = unitTx.div(d(r.fxRate || "1"));
        if (quoteCurrency === "EUR") unit = unitEUR;
        else {
          const rate = fxOn(r.executedAt.slice(0, 10));
          unit = rate ? unitEUR.times(rate) : null;
        }
      }
      if (!unit) return null;
      let factor = d(1);
      for (const s of splits) if (r.executedAt.slice(0, 10) < s.effectiveDate) factor = factor.times(d(s.ratioTo).div(s.ratioFrom));
      const key = nearestKey(points, intraday ? r.executedAt.slice(0, 16) : r.executedAt.slice(0, 10));
      if (!key) return null;
      return {
        key,
        type: r.type as "BUY" | "SELL" | "SAVINGS_PLAN",
        price: Number(unit.div(factor).toDecimalPlaces(4).toString()),
        quantity: qty.toString(),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return {
    range,
    currency: quote?.currency ?? instrument.currency,
    intraday,
    points,
    markers,
    previousClose: quote?.previousClose ? Number(quote.previousClose) : null,
  };
}

function nearestKey(points: Array<{ key: string }>, target: string): string | null {
  if (points.length === 0) return null;
  for (const p of points) if (p.key >= target) return p.key;
  return null;
}
