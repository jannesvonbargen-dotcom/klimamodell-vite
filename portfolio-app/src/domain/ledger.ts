import { d, Dec, isZeroQty, roundMoney, ZERO } from "./decimal";
import { isBuyLike, type Split, type Transaction } from "./types";

/**
 * Das Ledger berechnet Positionen und Cash ausschließlich aus Transaktionen
 * (Single Source of Truth). Einstand nach Durchschnittskostenmethode:
 * Kaufgebühren (und Kaufsteuern wie die FTT) erhöhen den Einstand, beim
 * Verkauf wird der Einstand anteilig ausgebucht.
 *
 * Alle Euro-Beträge werden pro Buchung auf Cent gerundet (so wie ein Broker
 * bucht); Einstand und Durchschnittskurs werden mit voller Präzision geführt.
 */

export interface PositionState {
  instrumentId: number;
  quantity: Dec;
  /** Einstand gesamt in EUR für die aktuell gehaltenen Stücke. */
  costEUR: Dec;
  /** Einstand in Kaufwährung (nur sinnvoll, wenn alle Käufe in derselben Währung). */
  costLocal: Dec;
  localCurrency: string | null;
  mixedCurrencies: boolean;
  realizedEUR: Dec;
  dividendsGrossEUR: Dec;
  dividendsNetEUR: Dec;
  feesEUR: Dec;
  taxesEUR: Dec;
  /** Kaufkosten (inkl. Gebühren) aller jemals gekauften Stücke. */
  totalBoughtEUR: Dec;
  totalSoldEUR: Dec;
  firstBuyAt: string | null;
  lastTradeAt: string | null;
  /** Letzter Transaktionskurs in EUR je Stück – Fallback, wenn kein Kurs vorliegt. */
  lastPriceEUR: Dec | null;
  lastPriceLocal: Dec | null;
}

export interface YearStats {
  realizedEUR: Dec;
  dividendsGrossEUR: Dec;
  dividendsNetEUR: Dec;
  interestEUR: Dec;
  feesEUR: Dec;
  taxesEUR: Dec;
  depositsEUR: Dec;
  withdrawalsEUR: Dec;
}

export type LedgerIssue =
  | {
      kind: "OVERSELL";
      transactionId: number;
      instrumentId: number;
      held: string;
      requested: string;
      executedAt: string;
    }
  | { kind: "MISSING_INSTRUMENT"; transactionId: number; executedAt: string }
  | { kind: "MISSING_QUANTITY"; transactionId: number; executedAt: string }
  | { kind: "NEGATIVE_CASH"; transactionId: number; executedAt: string; cash: string };

export interface CashEffect {
  transactionId: number;
  executedAt: string;
  deltaEUR: Dec;
  /** Ein-/Auszahlungen: zählen als externer Fluss, nicht als Rendite. */
  externalEUR: Dec;
}

function emptyYear(): YearStats {
  return {
    realizedEUR: ZERO,
    dividendsGrossEUR: ZERO,
    dividendsNetEUR: ZERO,
    interestEUR: ZERO,
    feesEUR: ZERO,
    taxesEUR: ZERO,
    depositsEUR: ZERO,
    withdrawalsEUR: ZERO,
  };
}

function emptyPosition(instrumentId: number): PositionState {
  return {
    instrumentId,
    quantity: ZERO,
    costEUR: ZERO,
    costLocal: ZERO,
    localCurrency: null,
    mixedCurrencies: false,
    realizedEUR: ZERO,
    dividendsGrossEUR: ZERO,
    dividendsNetEUR: ZERO,
    feesEUR: ZERO,
    taxesEUR: ZERO,
    totalBoughtEUR: ZERO,
    totalSoldEUR: ZERO,
    firstBuyAt: null,
    lastTradeAt: null,
    lastPriceEUR: null,
    lastPriceLocal: null,
  };
}

/** Rechnet einen Betrag in Transaktionswährung in EUR um (auf Cent gerundet). */
export function toEUR(amountLocal: Dec, fxRate: string | null | undefined): Dec {
  const fx = d(fxRate || "1");
  if (fx.lte(0)) throw new Error(`Ungültiger Wechselkurs: ${fxRate}`);
  return roundMoney(amountLocal.div(fx));
}

/** Kurswert einer Transaktion in Transaktionswährung. */
export function grossAmount(tx: Pick<Transaction, "amount" | "quantity" | "price">): Dec {
  if (tx.amount !== null && tx.amount !== undefined && tx.amount !== "") return d(tx.amount).abs();
  if (tx.quantity && tx.price) return roundMoney(d(tx.quantity).abs().times(d(tx.price)));
  return ZERO;
}

export type LedgerEvent =
  | { kind: "tx"; key: string; tx: Transaction }
  | { kind: "split"; key: string; split: Split };

const TYPE_ORDER: Record<string, number> = {
  DEPOSIT: 0,
  BUY: 1,
  SAVINGS_PLAN: 1,
  SELL: 2,
  DIVIDEND: 3,
  INTEREST: 3,
  FEE: 4,
  TAX: 4,
  WITHDRAWAL: 5,
};

/** Sortiert Transaktionen und Splits in eine stabile, chronologische Reihenfolge. */
export function buildEvents(transactions: readonly Transaction[], splits: readonly Split[] = []): LedgerEvent[] {
  const events: LedgerEvent[] = [
    // Splits wirken zu Beginn des Stichtags – vor allen Transaktionen
    ...splits.map((split) => ({ kind: "split" as const, key: `${split.effectiveDate}T00:00`, split })),
    ...transactions.map((tx) => ({ kind: "tx" as const, key: normalizeTimestamp(tx.executedAt), tx })),
  ];
  return events.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "split" ? -1 : 1;
    if (a.kind === "tx" && b.kind === "tx") {
      const ta = TYPE_ORDER[a.tx.type] ?? 9;
      const tb = TYPE_ORDER[b.tx.type] ?? 9;
      if (ta !== tb) return ta - tb;
      return a.tx.id - b.tx.id;
    }
    return 0;
  });
}

/** "2024-05-01" → "2024-05-01T12:00"; längere Zeitstempel werden auf Minuten gekürzt. */
export function normalizeTimestamp(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return `${ts}T12:00`;
  return ts.slice(0, 16);
}

export class Ledger {
  readonly positions = new Map<number, PositionState>();
  cashEUR: Dec = ZERO;
  depositsEUR: Dec = ZERO;
  withdrawalsEUR: Dec = ZERO;
  realizedEUR: Dec = ZERO;
  dividendsGrossEUR: Dec = ZERO;
  dividendsNetEUR: Dec = ZERO;
  interestEUR: Dec = ZERO;
  feesEUR: Dec = ZERO;
  taxesEUR: Dec = ZERO;
  readonly byYear = new Map<number, YearStats>();
  readonly issues: LedgerIssue[] = [];
  readonly cashEffects: CashEffect[] = [];

  private year(ts: string): YearStats {
    const y = Number(ts.slice(0, 4));
    let stats = this.byYear.get(y);
    if (!stats) {
      stats = emptyYear();
      this.byYear.set(y, stats);
    }
    return stats;
  }

  private position(instrumentId: number): PositionState {
    let p = this.positions.get(instrumentId);
    if (!p) {
      p = emptyPosition(instrumentId);
      this.positions.set(instrumentId, p);
    }
    return p;
  }

  apply(event: LedgerEvent): void {
    if (event.kind === "split") this.applySplit(event.split);
    else this.applyTransaction(event.tx);
  }

  applySplit(split: Split): void {
    const p = this.positions.get(split.instrumentId);
    if (!p) return;
    const from = d(split.ratioFrom);
    const to = d(split.ratioTo);
    if (from.lte(0) || to.lte(0)) return;
    const factor = to.div(from);
    p.quantity = p.quantity.times(factor);
    if (p.lastPriceEUR) p.lastPriceEUR = p.lastPriceEUR.div(factor);
    if (p.lastPriceLocal) p.lastPriceLocal = p.lastPriceLocal.div(factor);
  }

  applyTransaction(tx: Transaction): void {
    const ts = normalizeTimestamp(tx.executedAt);
    const year = this.year(ts);
    const fee = d(tx.fee);
    const tax = d(tx.tax);
    const feeEUR = toEUR(fee, tx.fxRate);
    const taxEUR = toEUR(tax, tx.fxRate);
    let delta = ZERO;
    let external = ZERO;

    switch (tx.type) {
      case "BUY":
      case "SAVINGS_PLAN":
      case "SELL": {
        if (tx.instrumentId === null) {
          this.issues.push({ kind: "MISSING_INSTRUMENT", transactionId: tx.id, executedAt: ts });
          return;
        }
        const qty = d(tx.quantity).abs();
        if (qty.isZero()) {
          this.issues.push({ kind: "MISSING_QUANTITY", transactionId: tx.id, executedAt: ts });
          return;
        }
        const p = this.position(tx.instrumentId);
        const gross = grossAmount(tx);
        const grossEUR = toEUR(gross, tx.fxRate);
        const unitLocal = gross.div(qty);
        p.lastPriceLocal = unitLocal;
        p.lastPriceEUR = grossEUR.div(qty);
        p.lastTradeAt = ts;

        if (isBuyLike(tx.type)) {
          const costEUR = grossEUR.plus(feeEUR).plus(taxEUR);
          p.quantity = p.quantity.plus(qty);
          p.costEUR = p.costEUR.plus(costEUR);
          p.totalBoughtEUR = p.totalBoughtEUR.plus(costEUR);
          if (p.localCurrency === null) p.localCurrency = tx.currency;
          else if (p.localCurrency !== tx.currency) p.mixedCurrencies = true;
          p.costLocal = p.costLocal.plus(gross).plus(fee).plus(tax);
          if (!p.firstBuyAt) p.firstBuyAt = ts;
          delta = costEUR.neg();
        } else {
          let sellQty = qty;
          if (sellQty.gt(p.quantity) && !isZeroQty(sellQty.minus(p.quantity))) {
            this.issues.push({
              kind: "OVERSELL",
              transactionId: tx.id,
              instrumentId: tx.instrumentId,
              held: p.quantity.toString(),
              requested: qty.toString(),
              executedAt: ts,
            });
            sellQty = p.quantity;
          }
          const closesPosition = isZeroQty(p.quantity.minus(sellQty));
          const share = p.quantity.isZero() ? ZERO : sellQty.div(p.quantity);
          const costOfSold = closesPosition ? p.costEUR : p.costEUR.times(share);
          const costLocalOfSold = closesPosition ? p.costLocal : p.costLocal.times(share);
          // Erlös: Verkaufswert der tatsächlich gehaltenen Stücke abzüglich Gebühr
          const soldGrossEUR = sellQty.eq(qty) ? grossEUR : grossEUR.times(sellQty).div(qty);
          const proceedsEUR = soldGrossEUR.minus(feeEUR);
          const realized = proceedsEUR.minus(costOfSold);
          p.realizedEUR = p.realizedEUR.plus(realized);
          this.realizedEUR = this.realizedEUR.plus(realized);
          year.realizedEUR = year.realizedEUR.plus(realized);
          p.totalSoldEUR = p.totalSoldEUR.plus(proceedsEUR);
          p.costEUR = p.costEUR.minus(costOfSold);
          p.costLocal = p.costLocal.minus(costLocalOfSold);
          p.quantity = closesPosition ? ZERO : p.quantity.minus(sellQty);
          if (closesPosition) {
            p.costEUR = ZERO;
            p.costLocal = ZERO;
          }
          delta = grossEUR.minus(feeEUR).minus(taxEUR);
        }
        p.feesEUR = p.feesEUR.plus(feeEUR);
        p.taxesEUR = p.taxesEUR.plus(taxEUR);
        break;
      }
      case "DIVIDEND":
      case "INTEREST": {
        const grossEUR = toEUR(d(tx.amount).abs(), tx.fxRate);
        const netEUR = grossEUR.minus(taxEUR).minus(feeEUR);
        if (tx.type === "DIVIDEND") {
          this.dividendsGrossEUR = this.dividendsGrossEUR.plus(grossEUR);
          this.dividendsNetEUR = this.dividendsNetEUR.plus(netEUR);
          year.dividendsGrossEUR = year.dividendsGrossEUR.plus(grossEUR);
          year.dividendsNetEUR = year.dividendsNetEUR.plus(netEUR);
          if (tx.instrumentId !== null) {
            const p = this.position(tx.instrumentId);
            p.dividendsGrossEUR = p.dividendsGrossEUR.plus(grossEUR);
            p.dividendsNetEUR = p.dividendsNetEUR.plus(netEUR);
            p.taxesEUR = p.taxesEUR.plus(taxEUR);
            p.feesEUR = p.feesEUR.plus(feeEUR);
          } else {
            this.issues.push({ kind: "MISSING_INSTRUMENT", transactionId: tx.id, executedAt: ts });
          }
        } else {
          this.interestEUR = this.interestEUR.plus(netEUR);
          year.interestEUR = year.interestEUR.plus(netEUR);
        }
        delta = netEUR;
        break;
      }
      case "DEPOSIT": {
        const amountEUR = toEUR(d(tx.amount).abs(), tx.fxRate);
        this.depositsEUR = this.depositsEUR.plus(amountEUR);
        year.depositsEUR = year.depositsEUR.plus(amountEUR);
        delta = amountEUR.minus(feeEUR);
        external = amountEUR;
        break;
      }
      case "WITHDRAWAL": {
        const amountEUR = toEUR(d(tx.amount).abs(), tx.fxRate);
        this.withdrawalsEUR = this.withdrawalsEUR.plus(amountEUR);
        year.withdrawalsEUR = year.withdrawalsEUR.plus(amountEUR);
        delta = amountEUR.plus(feeEUR).neg();
        external = amountEUR.neg();
        break;
      }
      case "FEE": {
        const amountEUR = toEUR(d(tx.amount).abs(), tx.fxRate);
        this.feesEUR = this.feesEUR.plus(amountEUR);
        year.feesEUR = year.feesEUR.plus(amountEUR);
        delta = amountEUR.neg();
        break;
      }
      case "TAX": {
        // Negativer Betrag = Steuererstattung
        const amountEUR = toEUR(d(tx.amount), tx.fxRate);
        this.taxesEUR = this.taxesEUR.plus(amountEUR);
        year.taxesEUR = year.taxesEUR.plus(amountEUR);
        delta = amountEUR.neg();
        break;
      }
    }

    if (tx.type !== "FEE" && tx.type !== "TAX") {
      this.feesEUR = this.feesEUR.plus(feeEUR);
      this.taxesEUR = this.taxesEUR.plus(taxEUR);
      year.feesEUR = year.feesEUR.plus(feeEUR);
      year.taxesEUR = year.taxesEUR.plus(taxEUR);
    }

    const before = this.cashEUR;
    this.cashEUR = this.cashEUR.plus(delta);
    this.cashEffects.push({ transactionId: tx.id, executedAt: ts, deltaEUR: delta, externalEUR: external });
    if (this.cashEUR.lt(0) && !before.lt(0)) {
      this.issues.push({
        kind: "NEGATIVE_CASH",
        transactionId: tx.id,
        executedAt: ts,
        cash: this.cashEUR.toString(),
      });
    }
  }

  /** Aktuell gehaltene Positionen (Stückzahl > 0). */
  openPositions(): PositionState[] {
    return [...this.positions.values()].filter((p) => !isZeroQty(p.quantity));
  }
}

export interface ComputeLedgerOptions {
  /** Nur Ereignisse bis einschließlich dieses Zeitpunkts ("YYYY-MM-DD" = Tagesende). */
  asOf?: string;
}

export function computeLedger(
  transactions: readonly Transaction[],
  splits: readonly Split[] = [],
  options: ComputeLedgerOptions = {},
): Ledger {
  const ledger = new Ledger();
  const limit = options.asOf ? endOfKey(options.asOf) : null;
  for (const event of buildEvents(transactions, splits)) {
    if (limit && event.key > limit) break;
    ledger.apply(event);
  }
  return ledger;
}

/** "2024-05-01" → "2024-05-01T23:59", sonst unverändert (auf Minuten). */
export function endOfKey(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return `${ts}T23:59`;
  return ts.slice(0, 16);
}

/** Durchschnittlicher Einstandskurs je Stück in EUR. */
export function averageCostEUR(p: PositionState): Dec | null {
  if (isZeroQty(p.quantity)) return null;
  return p.costEUR.div(p.quantity);
}

/** Durchschnittlicher Einstandskurs je Stück in Kaufwährung (null bei gemischten Währungen). */
export function averageCostLocal(p: PositionState): Dec | null {
  if (isZeroQty(p.quantity) || p.mixedCurrencies) return null;
  return p.costLocal.div(p.quantity);
}
