import { d, parseLocaleNumber, roundQty } from "@/domain/decimal";
import { TRADE_TYPES, TRANSACTION_TYPES, type TransactionType } from "@/domain/types";
import { type FieldErrors, type TransactionDraft, validateDeletion, validateFields, validateTimeline } from "@/domain/validation";
import { catalogByIsin } from "@/market/catalog";
import {
  transactionDedupeKey,
  getInstrument,
  getTransaction,
  insertTransaction,
  listSplits,
  listTransactions,
  restoreTransaction,
  softDeleteTransaction,
  updateTransactionRow,
  upsertInstrument,
} from "./repo";

/** Formulardaten einer Transaktion (alles Strings, deutsche Zahlenformate erlaubt). */
export interface TransactionInput {
  type: string;
  date: string;
  time?: string;
  instrumentId?: number | null;
  /** Neues Instrument aus der Suche (wird bei Bedarf angelegt). */
  instrument?: {
    isin?: string | null;
    wkn?: string | null;
    symbol: string;
    name: string;
    kind?: "STOCK" | "ETF" | "OTHER";
    currency?: string | null;
    sector?: string | null;
    country?: string | null;
  } | null;
  quantity?: string;
  price?: string;
  amount?: string;
  /** "quantity" = Stückzahl eingegeben, "amount" = Betrag eingegeben (Stücke werden berechnet). */
  entryMode?: "quantity" | "amount";
  currency?: string;
  fxRate?: string;
  fee?: string;
  tax?: string;
  note?: string;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; errors: FieldErrors; message?: string };

function num(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const v = parseLocaleNumber(raw, "auto");
  return v ? v.toString() : null;
}

function resolveInstrumentId(input: TransactionInput): number | null {
  if (input.instrumentId) return getInstrument(input.instrumentId) ? input.instrumentId : null;
  const i = input.instrument;
  if (!i?.symbol) return null;
  const catalog = i.isin ? catalogByIsin(i.isin) : undefined;
  const created = upsertInstrument({
    isin: (i.isin ?? `X-${i.symbol}`).toUpperCase(),
    wkn: i.wkn ?? catalog?.wkn ?? null,
    symbol: i.symbol,
    name: i.name,
    kind: i.kind === "ETF" ? "ETF" : "STOCK",
    currency: i.currency ?? catalog?.currency ?? (i.symbol.includes(".") ? "EUR" : "USD"),
    sector: i.sector ?? catalog?.sector ?? null,
    country: i.country ?? catalog?.country ?? null,
  });
  return created.id;
}

/** Wandelt Formulardaten in einen Entwurf um (ohne Instrument anzulegen). */
export function toDraft(input: TransactionInput, instrumentId: number | null): { draft: TransactionDraft; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const type = (TRANSACTION_TYPES as readonly string[]).includes(input.type) ? (input.type as TransactionType) : null;
  if (!type) errors.type = "Unbekannter Transaktionstyp.";
  const date = (input.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.executedAt = "Bitte ein gültiges Datum angeben.";
  const time = (input.time ?? "").trim();
  const executedAt = /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date;

  let quantity = num(input.quantity);
  const price = num(input.price);
  let amount = num(input.amount);
  const isTrade = type ? TRADE_TYPES.includes(type) : false;

  if (isTrade && input.entryMode === "amount") {
    // Betrag eingegeben: Stücke = Betrag / Kurs, auf 6 Stellen abgerundet
    if (!amount || d(amount).lte(0)) errors.amount = "Bitte einen Betrag angeben.";
    else if (!price || d(price).lte(0)) errors.price = "Kurs muss größer als 0 sein.";
    else quantity = roundQty(d(amount).div(price)).toString();
    if (quantity && d(quantity).lte(0)) errors.amount = "Betrag ist zu klein für ein Bruchstück.";
  } else if (isTrade) {
    amount = null;
  }

  const draft: TransactionDraft = {
    type: type ?? "BUY",
    executedAt,
    instrumentId,
    quantity: isTrade || type === "DIVIDEND" ? quantity : null,
    price: isTrade || type === "DIVIDEND" ? price : null,
    amount: isTrade ? amount : num(input.amount),
    currency: (input.currency ?? "EUR").trim().toUpperCase() || "EUR",
    fxRate: (input.currency ?? "EUR").toUpperCase() === "EUR" ? "1" : (num(input.fxRate) ?? ""),
    fee: num(input.fee) ?? "0",
    tax: num(input.tax) ?? "0",
    note: input.note?.trim() ? input.note.trim() : null,
  };
  return { draft, errors };
}

function validate(draft: TransactionDraft, id?: number): FieldErrors {
  const fieldErrors = validateFields(draft);
  if (Object.keys(fieldErrors).length) return fieldErrors;
  return validateTimeline({ ...draft, id }, listTransactions(), listSplits());
}

export function createTransaction(
  input: TransactionInput,
  source: "manual" | "savings_plan" = "manual",
  extra: { savingsPlanId?: number } = {},
): ActionResult<{ id: number }> {
  const needsInstrument = ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"].includes(input.type);
  const instrumentId = needsInstrument ? resolveInstrumentId(input) : null;
  const { draft, errors } = toDraft(input, instrumentId);
  if (Object.keys(errors).length) return { ok: false, errors };
  const validation = validate(draft);
  if (Object.keys(validation).length) return { ok: false, errors: validation };
  const instrument = instrumentId ? getInstrument(instrumentId) : null;
  const row = insertTransaction({
    ...draft,
    source,
    savingsPlanId: extra.savingsPlanId ?? null,
    dedupeKey: transactionDedupeKey(draft, instrument?.isin ?? null),
  });
  return { ok: true, id: row.id };
}

export function updateTransaction(id: number, input: TransactionInput): ActionResult<{ id: number }> {
  const existing = getTransaction(id);
  if (!existing || existing.deletedAt) return { ok: false, errors: {}, message: "Transaktion nicht gefunden." };
  const needsInstrument = ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"].includes(input.type);
  const instrumentId = needsInstrument ? resolveInstrumentId(input) : null;
  const { draft, errors } = toDraft(input, instrumentId);
  if (Object.keys(errors).length) return { ok: false, errors };
  const validation = validate(draft, id);
  if (Object.keys(validation).length) return { ok: false, errors: validation };
  const instrument = instrumentId ? getInstrument(instrumentId) : null;
  updateTransactionRow(id, {
    ...draft,
    dedupeKey: transactionDedupeKey(draft, instrument?.isin ?? null),
  });
  return { ok: true, id };
}

export function deleteTransaction(id: number): ActionResult {
  const existing = getTransaction(id);
  if (!existing || existing.deletedAt) return { ok: false, errors: {}, message: "Transaktion nicht gefunden." };
  const problem = validateDeletion(id, listTransactions(), listSplits());
  if (problem) return { ok: false, errors: {}, message: problem };
  softDeleteTransaction(id);
  return { ok: true };
}

export function undoDeleteTransaction(id: number): ActionResult {
  restoreTransaction(id);
  return { ok: true };
}
