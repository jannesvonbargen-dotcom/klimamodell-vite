import { d, Dec, roundMoney, sum, ZERO } from "@/domain/decimal";
import { dividendPayments, forecastDividends, monthlyBuckets } from "@/domain/dividends";
import { fifoRealized } from "@/domain/fifo";
import { computeLedger } from "@/domain/ledger";
import { todayInBerlin } from "@/domain/market-hours";
import type { Instrument } from "@/domain/types";
import { getFxRates } from "./market";
import { instrumentMap, listSplits, listTransactions } from "./repo";

/** Erträge & Steuern: Dividendenkalender mit Hochrechnung und Jahresübersicht. */

export interface IncomeOverview {
  today: string;
  fxDate: string | null;
  kpis: {
    receivedNet12m: string;
    receivedGross12m: string;
    expectedGross12m: string;
    /** Bruttodividenden der letzten 12 Monate im Verhältnis zum heutigen Einstand. */
    yieldOnCost: string | null;
    paymentsCount12m: number;
    payers: number;
  };
  months: Array<{ month: string; received: number; expected: number; receivedNet: number }>;
  upcoming: Array<{
    date: string;
    instrument: Pick<Instrument, "name" | "symbol" | "isin">;
    shares: string;
    perShare: string;
    currency: string;
    grossLocal: string;
    grossEUR: string | null;
    basedOnDate: string;
  }>;
  recent: Array<{
    date: string;
    instrument: Pick<Instrument, "name" | "symbol" | "isin">;
    grossEUR: string;
    taxEUR: string;
    netEUR: string;
  }>;
  byInstrument: Array<{ instrument: Pick<Instrument, "name" | "symbol" | "isin">; netEUR12m: string; expectedEUR: string; share: string }>;
  years: Array<{
    year: number;
    dividendsGrossEUR: string;
    dividendsNetEUR: string;
    interestEUR: string;
    realizedEUR: string;
    /** Realisierte Gewinne nach FIFO (steuerliche Reihenfolge). */
    realizedFifoEUR: string;
    feesEUR: string;
    taxesEUR: string;
    totalEUR: string;
  }>;
}

function minusYears(date: string, years: number): string {
  return `${Number(date.slice(0, 4)) - years}${date.slice(4)}`;
}

export async function getIncomeOverview(): Promise<IncomeOverview> {
  const today = todayInBerlin();
  const transactions = listTransactions();
  const splits = listSplits();
  const instruments = instrumentMap();
  const ledger = computeLedger(transactions, splits);
  const fifo = fifoRealized(transactions, splits);
  const fx = await getFxRates();
  const holdings = new Map(ledger.openPositions().map((p) => [p.instrumentId, p.quantity]));
  const payments = dividendPayments(transactions, splits);
  const expected = forecastDividends({ payments, holdings, instruments, fx: fx.rates, today });
  const buckets = monthlyBuckets(payments, expected, today);
  const since = minusYears(today, 1);
  const last12 = payments.filter((p) => p.date > since && p.date <= today);
  const cost = sum(ledger.openPositions().map((p) => p.costEUR));
  const gross12 = sum(last12.map((p) => p.grossEUR));
  const ref = (id: number) => {
    const i = instruments.get(id);
    return { name: i?.name ?? "Unbekannt", symbol: i?.symbol ?? "", isin: i?.isin ?? "" };
  };

  const perInstrument = new Map<number, { net: Dec; expected: Dec }>();
  for (const p of last12) {
    const e = perInstrument.get(p.instrumentId) ?? { net: ZERO, expected: ZERO };
    e.net = e.net.plus(p.netEUR);
    perInstrument.set(p.instrumentId, e);
  }
  for (const x of expected) {
    const e = perInstrument.get(x.instrumentId) ?? { net: ZERO, expected: ZERO };
    e.expected = e.expected.plus(x.grossEUR ?? ZERO);
    perInstrument.set(x.instrumentId, e);
  }
  const totalNet12 = sum(last12.map((p) => p.netEUR));
  const expectedTotal = sum(expected.map((e) => e.grossEUR ?? ZERO));

  return {
    today,
    fxDate: fx.date,
    kpis: {
      receivedNet12m: roundMoney(totalNet12).toString(),
      receivedGross12m: roundMoney(gross12).toString(),
      expectedGross12m: roundMoney(expectedTotal).toString(),
      yieldOnCost: cost.gt(0) ? gross12.div(cost).toString() : null,
      paymentsCount12m: last12.length,
      payers: new Set(last12.map((p) => p.instrumentId)).size,
    },
    months: buckets.map((b) => ({
      month: b.month,
      received: Number(roundMoney(b.receivedGrossEUR)),
      receivedNet: Number(roundMoney(b.receivedNetEUR)),
      expected: Number(roundMoney(b.expectedGrossEUR)),
    })),
    upcoming: expected.map((e) => ({
      date: e.date,
      instrument: ref(e.instrumentId),
      shares: e.shares.toString(),
      perShare: e.perShare.toDecimalPlaces(4).toString(),
      currency: e.currency,
      grossLocal: e.grossLocal.toString(),
      grossEUR: e.grossEUR?.toString() ?? null,
      basedOnDate: e.basedOn.date,
    })),
    recent: [...payments]
      .reverse()
      .slice(0, 12)
      .map((p) => ({
        date: p.date,
        instrument: ref(p.instrumentId),
        grossEUR: roundMoney(p.grossEUR).toString(),
        taxEUR: roundMoney(p.taxEUR).toString(),
        netEUR: roundMoney(p.netEUR).toString(),
      })),
    byInstrument: [...perInstrument.entries()]
      .map(([id, v]) => ({
        instrument: ref(id),
        netEUR12m: roundMoney(v.net).toString(),
        expectedEUR: roundMoney(v.expected).toString(),
        share: totalNet12.gt(0) ? v.net.div(totalNet12).toString() : "0",
      }))
      .sort((a, b) => d(b.netEUR12m).comparedTo(a.netEUR12m) || d(b.expectedEUR).comparedTo(a.expectedEUR)),
    years: [...ledger.byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, s]) => ({
        year,
        dividendsGrossEUR: roundMoney(s.dividendsGrossEUR).toString(),
        dividendsNetEUR: roundMoney(s.dividendsNetEUR).toString(),
        interestEUR: roundMoney(s.interestEUR).toString(),
        realizedEUR: roundMoney(s.realizedEUR).toString(),
        realizedFifoEUR: roundMoney(fifo.byYear.get(year) ?? ZERO).toString(),
        feesEUR: roundMoney(s.feesEUR).toString(),
        taxesEUR: roundMoney(s.taxesEUR).toString(),
        totalEUR: roundMoney(s.dividendsNetEUR.plus(s.interestEUR).plus(fifo.byYear.get(year) ?? ZERO)).toString(),
      })),
  };
}
