import { d, roundMoney, sum, ZERO } from "@/domain/decimal";
import type { LedgerIssue, YearStats } from "@/domain/ledger";
import { EXCHANGES, type ExchangeId, marketStatus, todayInBerlin } from "@/domain/market-hours";
import { buildValueSeries, businessDays, type KeyedSeries, type RangeKey, rangeStart } from "@/domain/performance";
import { dueExecutionDates } from "@/domain/savings-plan";
import { germanHolidaySet } from "@/domain/market-hours";
import type { Instrument, Split, Transaction } from "@/domain/types";
import { type PortfolioTotals, type PositionValuation, valuePortfolio } from "@/domain/valuation";
import { catalogByIsin } from "@/market/catalog";
import { getDailyHistory, getFxHistory, getFxRates, getIntraday, getQuotes, providerInfo, type ProviderInfo } from "./market";
import { instrumentMap, listExecutions, listSavingsPlans, listSplits, listTransactions } from "./repo";

/** Serverseitige Aufbereitung der Depotdaten für die Oberfläche. */

export interface PositionRow extends PositionValuation {
  instrument: Instrument;
}

export interface AllocationSlice {
  label: string;
  valueEUR: string;
  share: string;
}

export interface MarketInfo {
  exchange: ExchangeId;
  name: string;
  open: boolean;
  nextChange: string;
}

export interface OverviewData {
  today: string;
  provider: ProviderInfo;
  quoteErrors: string[];
  lastQuoteAt: string | null;
  fxDate: string | null;
  fxStale: boolean;
  totals: PortfolioTotals;
  positions: PositionRow[];
  staleQuotes: number;
  missingQuotes: number;
  issues: LedgerIssue[];
  markets: MarketInfo[];
  allocation: { sector: AllocationSlice[]; region: AllocationSlice[]; kind: AllocationSlice[] };
  years: Array<{ year: number } & Record<keyof YearStats, string>>;
  pendingSavings: number;
  transactionCount: number;
}

export function marketInfos(ids: ExchangeId[] = ["LSX", "XETRA", "NYSE"]): MarketInfo[] {
  return ids.map((id) => {
    const s = marketStatus(id);
    return { exchange: id, name: EXCHANGES[id].name, open: s.open, nextChange: s.nextChange.toISOString() };
  });
}

function regionOf(instrument: Instrument): string {
  const c = instrument.country ?? catalogByIsin(instrument.isin)?.country ?? null;
  if (!c) return "Unbekannt";
  if (["USA", "US", "United States", "Kanada", "Canada"].includes(c)) return "Nordamerika";
  if (["Welt", "World"].includes(c)) return "Welt (ETF)";
  if (["Schwellenländer"].includes(c)) return "Schwellenländer";
  if (["Japan", "China", "Taiwan", "Südkorea", "Indien", "Australien"].includes(c)) return "Asien-Pazifik";
  return "Europa";
}

function allocate(rows: PositionRow[], keyFn: (r: PositionRow) => string): AllocationSlice[] {
  const total = sum(rows.map((r) => d(r.marketValueEUR)));
  const groups = new Map<string, ReturnType<typeof d>>();
  for (const r of rows) {
    const key = keyFn(r);
    groups.set(key, (groups.get(key) ?? ZERO).plus(r.marketValueEUR));
  }
  return [...groups.entries()]
    .map(([label, value]) => ({ label, valueEUR: value.toString(), share: total.isZero() ? "0" : value.div(total).toString() }))
    .sort((a, b) => d(b.valueEUR).cmp(d(a.valueEUR)));
}

export function pendingSavingsSuggestions(today = todayInBerlin()) {
  const plans = listSavingsPlans();
  const handled = new Set(listExecutions().map((e) => `${e.planId}|${e.dueDate}`));
  const holidays = germanHolidaySet(2015, Number(today.slice(0, 4)) + 1);
  const out: Array<{ planId: number; instrumentId: number; dueDate: string; amount: string; fee: string }> = [];
  for (const plan of plans) {
    for (const date of dueExecutionDates(plan, today, holidays)) {
      if (!handled.has(`${plan.id}|${date}`)) out.push({ planId: plan.id, instrumentId: plan.instrumentId, dueDate: date, amount: plan.amount, fee: plan.fee });
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export async function getOverview(): Promise<OverviewData> {
  const today = todayInBerlin();
  const transactions = listTransactions();
  const splits = listSplits();
  const instruments = instrumentMap();
  const heldIds = new Set(transactions.filter((t) => t.instrumentId !== null).map((t) => t.instrumentId!));
  const symbols = [...heldIds].map((id) => instruments.get(id)?.symbol).filter((s): s is string => !!s);
  const [quotes, fx] = await Promise.all([getQuotes(symbols), getFxRates()]);
  const valuation = valuePortfolio({ transactions, splits, instruments, quotes: quotes.quotes, fx: fx.rates, today });

  const positions: PositionRow[] = valuation.positions.map((p) => ({ ...p, instrument: instruments.get(p.instrumentId)! }));
  const years = [...valuation.ledger.byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, s]) => ({
      year,
      realizedEUR: roundMoney(s.realizedEUR).toString(),
      dividendsGrossEUR: roundMoney(s.dividendsGrossEUR).toString(),
      dividendsNetEUR: roundMoney(s.dividendsNetEUR).toString(),
      interestEUR: roundMoney(s.interestEUR).toString(),
      feesEUR: roundMoney(s.feesEUR).toString(),
      taxesEUR: roundMoney(s.taxesEUR).toString(),
      depositsEUR: roundMoney(s.depositsEUR).toString(),
      withdrawalsEUR: roundMoney(s.withdrawalsEUR).toString(),
    }));

  return {
    today,
    provider: providerInfo(),
    quoteErrors: quotes.errors,
    lastQuoteAt: quotes.lastFetchedAt,
    fxDate: fx.date,
    fxStale: fx.stale,
    totals: valuation.totals,
    positions,
    staleQuotes: positions.filter((p) => p.quoteStale).length,
    missingQuotes: valuation.missingQuotes.length,
    issues: valuation.ledger.issues,
    markets: marketInfos(),
    allocation: {
      sector: allocate(positions, (r) => (r.instrument.kind === "ETF" ? "ETFs (breit gestreut)" : (r.instrument.sector ?? "Unbekannt"))),
      region: allocate(positions, (r) => regionOf(r.instrument)),
      kind: allocate(positions, (r) => (r.instrument.kind === "ETF" ? "ETFs" : "Aktien")),
    },
    years,
    pendingSavings: pendingSavingsSuggestions(today).length,
    transactionCount: transactions.length,
  };
}

// ---------------------------------------------------------------------------
// Wertverlauf

export interface ChartPoint {
  /** "YYYY-MM-DD" oder "YYYY-MM-DDTHH:mm" */
  key: string;
  /** Gesamtvermögen in EUR (für die Darstellung; gerundet auf Cent). */
  value: number;
  /** Gewinn seit Beginn des Zeitraums (ohne Ein-/Auszahlungen). */
  gain: number;
  /** Zeitgewichtete Rendite seit Beginn (Bruch). */
  twr: number;
}

export interface PerformanceData {
  range: RangeKey;
  points: ChartPoint[];
  intraday: boolean;
}

function toKeyed(points: Array<{ key: string; close: string }>): KeyedSeries {
  return points.map((p) => ({ key: p.key, value: p.close }));
}

function subtractDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

async function loadSeriesInputs(
  transactions: Transaction[],
  instruments: Map<number, Instrument>,
  from: string,
  today: string,
): Promise<{ prices: Map<string, KeyedSeries>; fx: Map<string, KeyedSeries>; symbols: string[] }> {
  const ids = [...new Set(transactions.filter((t) => t.instrumentId !== null).map((t) => t.instrumentId!))];
  const relevant = ids.map((id) => instruments.get(id)).filter((i): i is Instrument => !!i);
  const prices = new Map<string, KeyedSeries>();
  await Promise.all(
    relevant.map(async (i) => {
      prices.set(i.symbol, toKeyed(await getDailyHistory(i.symbol, subtractDays(from, 10), today)));
    }),
  );
  const currencies = [...new Set(relevant.map((i) => i.currency))];
  const fxHistory = await getFxHistory(currencies, subtractDays(from, 10), today);
  const fx = new Map<string, KeyedSeries>();
  for (const [ccy, points] of fxHistory) fx.set(ccy, toKeyed(points));
  return { prices, fx, symbols: relevant.map((i) => i.symbol) };
}

export async function getPerformance(range: RangeKey): Promise<PerformanceData> {
  const today = todayInBerlin();
  const transactions = listTransactions();
  const splits: Split[] = listSplits();
  const instruments = instrumentMap();
  if (transactions.length === 0) return { range, points: [], intraday: false };
  const firstDate = transactions.reduce((min, t) => (t.executedAt < min ? t.executedAt : min), transactions[0].executedAt).slice(0, 10);

  if (range === "1D" || range === "1W") {
    const days = range === "1D" ? 1 : 5;
    const { prices, fx, symbols } = await loadSeriesInputs(transactions, instruments, subtractDays(today, days === 1 ? 7 : 14), today);
    const intraday = new Map<string, Array<{ key: string; close: string }>>();
    await Promise.all(symbols.map(async (s) => intraday.set(s, (await getIntraday(s, days)).points)));
    const allKeys = new Set<string>();
    for (const pts of intraday.values()) for (const p of pts) allKeys.add(p.key);
    let keys = [...allKeys].sort();
    if (keys.length === 0) return getPerformance("1M");
    // Nur Handelstage des Zeitraums, plus Basispunkt (Vortagesschluss)
    const sessionDays = [...new Set(keys.map((k) => k.slice(0, 10)))].sort().slice(-days);
    keys = keys.filter((k) => sessionDays.includes(k.slice(0, 10)));
    const baseline = subtractDays(sessionDays[0], 1);
    const merged = new Map<string, KeyedSeries>();
    for (const [symbol, daily] of prices) {
      const intra = (intraday.get(symbol) ?? []).map((p) => ({ key: p.key, value: p.close }));
      merged.set(symbol, [...daily.filter((p) => p.key < sessionDays[0]), ...intra]);
    }
    const quotes = await getQuotes(symbols);
    const latestPrices = new Map([...quotes.quotes.entries()].map(([s, q]) => [s, q.price]));
    const series = buildValueSeries({ transactions, splits, instruments, prices: merged, fx, keys: [baseline, ...keys], latestPrices });
    return { range, intraday: true, points: series.map(toChartPoint) };
  }

  const start = rangeStart(range, today, firstDate);
  const { prices, fx, symbols } = await loadSeriesInputs(transactions, instruments, start, today);
  const keys = [start, ...businessDays(start, today).filter((day) => day > start)];
  const quotes = await getQuotes(symbols);
  const latestPrices = new Map([...quotes.quotes.entries()].map(([s, q]) => [s, q.price]));
  const series = buildValueSeries({ transactions, splits, instruments, prices, fx, keys, latestPrices });
  return { range, intraday: false, points: series.map(toChartPoint) };
}

function toChartPoint(p: { key: string; totalEUR: string; gainEUR: string; twr: string }): ChartPoint {
  return {
    key: p.key,
    value: Number(roundMoney(d(p.totalEUR)).toString()),
    gain: Number(roundMoney(d(p.gainEUR)).toString()),
    twr: Number(d(p.twr).toDecimalPlaces(8).toString()),
  };
}
