import { d, Dec, isZeroQty, ZERO } from "./decimal";
import { buildEvents, grossAmount, toEUR } from "./ledger";
import type { Split, Transaction } from "./types";

/**
 * Realisierte Gewinne nach FIFO („first in, first out“) – so rechnet das
 * deutsche Steuerrecht (§ 20 Abs. 4 Satz 7 EStG). Die übrige App nutzt die
 * Durchschnittskostenmethode; beide Summen sind gleich, sobald eine Position
 * vollständig verkauft ist, verteilen sich aber unterschiedlich auf die Jahre.
 * Kaufnebenkosten (Gebühren, Steuern beim Kauf) erhöhen die Anschaffungskosten,
 * Verkaufsgebühren mindern den Erlös.
 */

interface Lot {
  quantity: Dec;
  costEUR: Dec;
  date: string;
}

export interface FifoSale {
  transactionId: number;
  instrumentId: number;
  date: string;
  quantity: Dec;
  proceedsEUR: Dec;
  costEUR: Dec;
  realizedEUR: Dec;
  /** Datum des ältesten verbrauchten Kaufs. */
  firstLotDate: string | null;
}

export interface FifoResult {
  sales: FifoSale[];
  byYear: Map<number, Dec>;
  totalEUR: Dec;
}

export function fifoRealized(transactions: readonly Transaction[], splits: readonly Split[] = []): FifoResult {
  const lots = new Map<number, Lot[]>();
  const sales: FifoSale[] = [];
  const byYear = new Map<number, Dec>();
  let total = ZERO;

  for (const event of buildEvents(transactions, splits)) {
    if (event.kind === "split") {
      const factor = d(event.split.ratioTo).div(d(event.split.ratioFrom));
      for (const lot of lots.get(event.split.instrumentId) ?? []) lot.quantity = lot.quantity.times(factor);
      continue;
    }
    const tx = event.tx;
    if (tx.instrumentId === null || !["BUY", "SAVINGS_PLAN", "SELL"].includes(tx.type)) continue;
    const qty = d(tx.quantity).abs();
    if (qty.isZero()) continue;
    const grossEUR = toEUR(grossAmount(tx), tx.fxRate);
    const feeEUR = toEUR(d(tx.fee), tx.fxRate);
    const taxEUR = toEUR(d(tx.tax), tx.fxRate);
    const queue = lots.get(tx.instrumentId) ?? [];
    lots.set(tx.instrumentId, queue);

    if (tx.type !== "SELL") {
      queue.push({ quantity: qty, costEUR: grossEUR.plus(feeEUR).plus(taxEUR), date: event.key.slice(0, 10) });
      continue;
    }

    const held = queue.reduce((a, l) => a.plus(l.quantity), ZERO);
    const sellQty = qty.gt(held) && !isZeroQty(qty.minus(held)) ? held : qty;
    const soldGrossEUR = sellQty.eq(qty) ? grossEUR : grossEUR.times(sellQty).div(qty);
    const proceeds = soldGrossEUR.minus(feeEUR);
    let remaining = sellQty;
    let cost = ZERO;
    let firstLotDate: string | null = null;
    while (remaining.gt(0) && queue.length > 0) {
      const lot = queue[0];
      firstLotDate ??= lot.date;
      if (lot.quantity.lte(remaining) || isZeroQty(lot.quantity.minus(remaining))) {
        cost = cost.plus(lot.costEUR);
        remaining = remaining.minus(lot.quantity);
        queue.shift();
      } else {
        const part = lot.costEUR.times(remaining).div(lot.quantity);
        cost = cost.plus(part);
        lot.costEUR = lot.costEUR.minus(part);
        lot.quantity = lot.quantity.minus(remaining);
        remaining = ZERO;
      }
      if (isZeroQty(remaining)) remaining = ZERO;
    }
    const realized = proceeds.minus(cost);
    const year = Number(event.key.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? ZERO).plus(realized));
    total = total.plus(realized);
    sales.push({
      transactionId: tx.id,
      instrumentId: tx.instrumentId,
      date: event.key.slice(0, 10),
      quantity: sellQty,
      proceedsEUR: proceeds,
      costEUR: cost,
      realizedEUR: realized,
      firstLotDate,
    });
  }
  return { sales, byYear, totalEUR: total };
}
