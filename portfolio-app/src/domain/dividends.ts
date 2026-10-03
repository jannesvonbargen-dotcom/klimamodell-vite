import { d, Dec, ONE, roundMoney, ZERO } from "./decimal";
import { computeLedger, toEUR } from "./ledger";
import type { Instrument, Split, Transaction } from "./types";
import { type FxTable, fxRateFor } from "./valuation";

/**
 * Dividenden: tatsächliche Zahlungen und eine einfache, transparente
 * Hochrechnung der nächsten 12 Monate. Annahme: Jede Zahlung der letzten
 * 12 Monate wiederholt sich ein Jahr später mit gleichem Betrag je Aktie
 * (split-bereinigt) für den heutigen Bestand. Keine Erhöhungen, keine Sonderdividenden.
 */

export interface DividendPayment {
  transactionId: number;
  instrumentId: number;
  date: string;
  currency: string;
  grossLocal: Dec;
  grossEUR: Dec;
  taxEUR: Dec;
  netEUR: Dec;
  /** Stücke, auf die gezahlt wurde (aus der Buchung oder dem Bestand am Tag). */
  shares: Dec | null;
  /** Betrag je heutiger Aktie in Zahlungswährung (split-bereinigt). */
  perShareAdjusted: Dec | null;
}

function splitFactorAfter(splits: readonly Split[], instrumentId: number, date: string): Dec {
  let factor = ONE;
  for (const s of splits) {
    if (s.instrumentId === instrumentId && date < s.effectiveDate) factor = factor.times(d(s.ratioTo).div(d(s.ratioFrom)));
  }
  return factor;
}

export function dividendPayments(transactions: readonly Transaction[], splits: readonly Split[] = []): DividendPayment[] {
  const out: DividendPayment[] = [];
  for (const tx of transactions) {
    if (tx.type !== "DIVIDEND" || tx.instrumentId === null || !tx.amount) continue;
    const date = tx.executedAt.slice(0, 10);
    const grossLocal = d(tx.amount).abs();
    const grossEUR = toEUR(grossLocal, tx.fxRate);
    const taxEUR = toEUR(d(tx.tax), tx.fxRate);
    const feeEUR = toEUR(d(tx.fee), tx.fxRate);
    let shares = tx.quantity ? d(tx.quantity).abs() : null;
    if (!shares || shares.isZero()) {
      const held = computeLedger(transactions, splits, { asOf: date }).positions.get(tx.instrumentId)?.quantity;
      shares = held && held.gt(0) ? held : null;
    }
    const factor = splitFactorAfter(splits, tx.instrumentId, date);
    out.push({
      transactionId: tx.id,
      instrumentId: tx.instrumentId,
      date,
      currency: tx.currency,
      grossLocal,
      grossEUR,
      taxEUR,
      netEUR: grossEUR.minus(taxEUR).minus(feeEUR),
      shares,
      perShareAdjusted: shares ? grossLocal.div(shares).div(factor) : null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface ExpectedDividend {
  instrumentId: number;
  /** Erwartetes Datum (ein Jahr nach der Vorjahreszahlung). */
  date: string;
  currency: string;
  shares: Dec;
  perShare: Dec;
  grossLocal: Dec;
  grossEUR: Dec | null;
  basedOn: { date: string; transactionId: number };
}

function addYears(date: string, years: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, day));
  // 29. Februar → 28. Februar
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function forecastDividends(input: {
  payments: readonly DividendPayment[];
  holdings: ReadonlyMap<number, Dec>;
  instruments: ReadonlyMap<number, Instrument>;
  fx: FxTable;
  today: string;
}): ExpectedDividend[] {
  const { payments, holdings, fx, today } = input;
  const horizon = addYears(today, 1);
  const lastYearStart = addYears(today, -1);
  const out: ExpectedDividend[] = [];
  for (const p of payments) {
    if (p.date <= lastYearStart || p.date > today || !p.perShareAdjusted) continue;
    const shares = holdings.get(p.instrumentId);
    if (!shares || shares.lte(0)) continue;
    let date = addYears(p.date, 1);
    if (date <= today) date = addYears(date, 1);
    if (date > horizon) continue;
    const grossLocal = roundMoney(p.perShareAdjusted.times(shares));
    const rate = fxRateFor(p.currency, fx);
    out.push({
      instrumentId: p.instrumentId,
      date,
      currency: p.currency,
      shares,
      perShare: p.perShareAdjusted,
      grossLocal,
      grossEUR: rate ? roundMoney(grossLocal.div(rate)) : null,
      basedOn: { date: p.date, transactionId: p.transactionId },
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthBucket {
  month: string; // YYYY-MM
  receivedNetEUR: Dec;
  receivedGrossEUR: Dec;
  expectedGrossEUR: Dec;
}

/** 12 Monate zurück (inkl. laufendem) und 12 voraus. */
export function monthlyBuckets(payments: readonly DividendPayment[], expected: readonly ExpectedDividend[], today: string): MonthBucket[] {
  const [y, m] = today.split("-").map(Number);
  const months: string[] = [];
  for (let i = -11; i <= 12; i++) {
    const dt = new Date(Date.UTC(y, m - 1 + i, 1));
    months.push(dt.toISOString().slice(0, 7));
  }
  const buckets = new Map(months.map((month) => [month, { month, receivedNetEUR: ZERO, receivedGrossEUR: ZERO, expectedGrossEUR: ZERO }]));
  for (const p of payments) {
    const b = buckets.get(p.date.slice(0, 7));
    if (b) {
      b.receivedNetEUR = b.receivedNetEUR.plus(p.netEUR);
      b.receivedGrossEUR = b.receivedGrossEUR.plus(p.grossEUR);
    }
  }
  for (const e of expected) {
    const b = buckets.get(e.date.slice(0, 7));
    if (b && e.grossEUR) b.expectedGrossEUR = b.expectedGrossEUR.plus(e.grossEUR);
  }
  return months.map((month) => buckets.get(month)!);
}
