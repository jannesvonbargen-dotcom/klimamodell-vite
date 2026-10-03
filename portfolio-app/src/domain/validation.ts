import { d, isZeroQty, parseLocaleNumber, QTY_DP } from "./decimal";
import { computeLedger } from "./ledger";
import { INSTRUMENT_TYPES_REQUIRED, TRADE_TYPES, type Split, type Transaction } from "./types";

export interface FieldErrors {
  [field: string]: string;
}

export type TransactionDraft = Omit<Transaction, "id"> & { id?: number };

/** Prüft die Felder einer Transaktion für sich genommen. */
export function validateFields(tx: TransactionDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(tx.executedAt)) errors.executedAt = "Bitte ein gültiges Datum angeben.";
  if (INSTRUMENT_TYPES_REQUIRED.includes(tx.type) && tx.instrumentId === null) {
    errors.instrumentId = "Bitte ein Wertpapier auswählen.";
  }
  if (TRADE_TYPES.includes(tx.type)) {
    const qty = tx.quantity ? d(tx.quantity) : null;
    if (!qty || qty.lte(0)) errors.quantity = "Stückzahl muss größer als 0 sein.";
    else if (qty.decimalPlaces() > QTY_DP) errors.quantity = `Höchstens ${QTY_DP} Nachkommastellen.`;
    const price = tx.price ? d(tx.price) : null;
    const amount = tx.amount ? d(tx.amount) : null;
    if ((!price || price.lte(0)) && (!amount || amount.lte(0))) errors.price = "Kurs muss größer als 0 sein.";
  } else if (tx.type !== "TAX") {
    const amount = tx.amount ? d(tx.amount) : null;
    if (!amount || amount.lte(0)) errors.amount = "Betrag muss größer als 0 sein.";
  } else if (!tx.amount || d(tx.amount).isZero()) {
    errors.amount = "Betrag darf nicht 0 sein.";
  }
  if (d(tx.fee).lt(0)) errors.fee = "Gebühr darf nicht negativ sein.";
  if (d(tx.tax).lt(0)) errors.tax = "Steuer darf nicht negativ sein.";
  if (!tx.fxRate || d(tx.fxRate).lte(0)) errors.fxRate = "Wechselkurs muss größer als 0 sein.";
  return errors;
}

/**
 * Prüft, ob die Transaktion (neu oder geändert) im Gesamtverlauf zu einem
 * Verkauf von mehr Stücken als gehalten führt – auch bei späteren Verkäufen.
 */
export function validateTimeline(
  draft: TransactionDraft,
  existing: readonly Transaction[],
  splits: readonly Split[] = [],
): FieldErrors {
  const candidate: Transaction = { ...draft, id: draft.id ?? Number.MAX_SAFE_INTEGER };
  const others = existing.filter((t) => t.id !== draft.id);
  const before = computeLedger(others, splits).issues.filter((i) => i.kind === "OVERSELL").length;
  const ledger = computeLedger([...others, candidate], splits);
  const oversells = ledger.issues.filter((i) => i.kind === "OVERSELL");
  if (oversells.length > before) {
    const own = oversells.find((i) => i.transactionId === candidate.id);
    if (own && own.kind === "OVERSELL") {
      return {
        quantity: `Zu diesem Zeitpunkt werden nur ${formatQty(own.held)} Stück gehalten.`,
      };
    }
    const later = oversells[oversells.length - 1];
    if (later.kind === "OVERSELL") {
      return {
        quantity: `Dadurch würde ein späterer Verkauf am ${later.executedAt.slice(0, 10).split("-").reverse().join(".")} mehr Stücke verkaufen als vorhanden.`,
      };
    }
  }
  return {};
}

/** Prüft, ob das Löschen einer Transaktion spätere Verkäufe ungültig macht. */
export function validateDeletion(
  id: number,
  existing: readonly Transaction[],
  splits: readonly Split[] = [],
): string | null {
  const before = computeLedger(existing, splits).issues.filter((i) => i.kind === "OVERSELL").length;
  const after = computeLedger(
    existing.filter((t) => t.id !== id),
    splits,
  ).issues.filter((i) => i.kind === "OVERSELL").length;
  return after > before ? "Diese Transaktion wird von einem späteren Verkauf benötigt." : null;
}

function formatQty(qty: string): string {
  const v = d(qty);
  if (isZeroQty(v)) return "0";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: QTY_DP }).format(v.toString() as unknown as number);
}

/** Hilfsfunktion für Formulare: Eingabe → Dezimal-String oder null. */
export function inputToDecimal(raw: string | null | undefined): string | null {
  const v = parseLocaleNumber(raw ?? null, "auto");
  return v ? v.toString() : null;
}
