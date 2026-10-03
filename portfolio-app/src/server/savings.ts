import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { savingsPlanExecutions, savingsPlans } from "@/db/schema";
import { d, parseLocaleNumber, roundQty } from "@/domain/decimal";
import { todayInBerlin } from "@/domain/market-hours";
import type { SavingsInterval } from "@/domain/types";
import { getDailyHistory, getFxHistory } from "./market";
import { getInstrument, upsertInstrument } from "./repo";
import { type ActionResult, createTransaction } from "./transactions";

/** Sparpläne: Verwaltung und Bestätigung vorgeschlagener Ausführungen. */

export interface SavingsPlanInput {
  instrumentId?: number | null;
  instrument?: { isin?: string | null; symbol: string; name: string; kind?: "STOCK" | "ETF" | "OTHER"; currency?: string | null; sector?: string | null; country?: string | null; wkn?: string | null } | null;
  amount: string;
  interval: SavingsInterval;
  executionDay: number;
  startDate: string;
  fee?: string;
}

const INTERVALS: SavingsInterval[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY"];

function validatePlan(input: SavingsPlanInput): { errors: Record<string, string>; amount: string | null } {
  const errors: Record<string, string> = {};
  const amount = parseLocaleNumber(input.amount, "auto");
  if (!amount || amount.lte(0)) errors.amount = "Betrag muss größer als 0 sein.";
  if (!INTERVALS.includes(input.interval)) errors.interval = "Ungültiger Rhythmus.";
  const weekly = input.interval === "WEEKLY" || input.interval === "BIWEEKLY";
  if (weekly ? input.executionDay < 1 || input.executionDay > 5 : input.executionDay < 1 || input.executionDay > 28) {
    errors.executionDay = weekly ? "Wochentag Mo–Fr wählen." : "Tag zwischen 1 und 28 wählen.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) errors.startDate = "Bitte ein Startdatum angeben.";
  if (!input.instrumentId && !input.instrument) errors.instrumentId = "Bitte ein Wertpapier auswählen.";
  return { errors, amount: amount?.toString() ?? null };
}

function resolveInstrumentId(input: SavingsPlanInput): number | null {
  if (input.instrumentId) return getInstrument(input.instrumentId)?.id ?? null;
  const i = input.instrument;
  if (!i) return null;
  return upsertInstrument({
    isin: (i.isin ?? `X-${i.symbol}`).toUpperCase(),
    symbol: i.symbol,
    name: i.name,
    kind: i.kind === "ETF" ? "ETF" : "STOCK",
    currency: i.currency ?? (i.symbol.includes(".") ? "EUR" : "USD"),
    sector: i.sector ?? null,
    country: i.country ?? null,
    wkn: i.wkn ?? null,
  }).id;
}

export function saveSavingsPlan(id: number | null, input: SavingsPlanInput): ActionResult<{ id: number }> {
  const { errors, amount } = validatePlan(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const instrumentId = resolveInstrumentId(input);
  if (!instrumentId) return { ok: false, errors: { instrumentId: "Wertpapier nicht gefunden." } };
  const fee = parseLocaleNumber(input.fee ?? "0", "auto")?.toString() ?? "0";
  const values = { instrumentId, amount: amount!, interval: input.interval, executionDay: input.executionDay, startDate: input.startDate, fee };
  const db = getDb();
  if (id) {
    db.update(savingsPlans).set(values).where(eq(savingsPlans.id, id)).run();
    return { ok: true, id };
  }
  const row = db.insert(savingsPlans).values({ ...values, active: true }).returning().get();
  return { ok: true, id: row.id };
}

export function setSavingsPlanActive(id: number, active: boolean): void {
  getDb().update(savingsPlans).set({ active }).where(eq(savingsPlans.id, id)).run();
}

export function deleteSavingsPlan(id: number): void {
  // Bereits gebuchte Ausführungen bleiben als Transaktionen erhalten
  getDb().delete(savingsPlans).where(eq(savingsPlans.id, id)).run();
}

/** Kurs (Schluss) und Wechselkurs zum Ausführungstag. */
async function priceOn(symbol: string, currency: string, date: string): Promise<{ price: string | null; fx: string | null }> {
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 10);
  const fromIso = from.toISOString().slice(0, 10);
  const history = await getDailyHistory(symbol, fromIso, date > todayInBerlin() ? todayInBerlin() : date);
  const close = history.filter((p) => p.key <= date).at(-1)?.close ?? null;
  let fx: string | null = "1";
  if (currency !== "EUR") {
    const series = (await getFxHistory([currency], fromIso, date)).get(currency === "GBp" ? "GBP" : currency) ?? [];
    fx = series.filter((p) => p.key <= date).at(-1)?.close ?? null;
    if (fx && currency === "GBp") fx = d(fx).times(100).toString();
  }
  return { price: close, fx };
}

export async function confirmExecution(planId: number, dueDate: string, overridePrice?: string): Promise<ActionResult<{ id: number }>> {
  const db = getDb();
  const plan = db.select().from(savingsPlans).where(eq(savingsPlans.id, planId)).get();
  if (!plan) return { ok: false, errors: {}, message: "Sparplan nicht gefunden." };
  const handled = db
    .select()
    .from(savingsPlanExecutions)
    .where(and(eq(savingsPlanExecutions.planId, planId), eq(savingsPlanExecutions.dueDate, dueDate)))
    .get();
  if (handled) return { ok: false, errors: {}, message: "Diese Ausführung wurde bereits bearbeitet." };
  const instrument = getInstrument(plan.instrumentId);
  if (!instrument) return { ok: false, errors: {}, message: "Wertpapier nicht gefunden." };

  // Ausführung in EUR (wie bei Trade Republic): Kurs in EUR umrechnen
  const quote = await priceOn(instrument.symbol, instrument.currency, dueDate);
  let priceEUR: string | null = null;
  if (overridePrice) priceEUR = parseLocaleNumber(overridePrice, "auto")?.toString() ?? null;
  else if (quote.price && quote.fx) priceEUR = d(quote.price).div(quote.fx).toDecimalPlaces(4).toString();
  if (!priceEUR || d(priceEUR).lte(0)) return { ok: false, errors: { price: "Kein Kurs für diesen Tag – bitte manuell angeben." }, message: "Kein Kurs verfügbar." };

  const qty = roundQty(d(plan.amount).div(priceEUR));
  const result = createTransaction(
    {
      type: "SAVINGS_PLAN",
      date: dueDate,
      time: "09:00",
      instrumentId: plan.instrumentId,
      quantity: qty.toString(),
      price: priceEUR,
      amount: plan.amount,
      entryMode: "amount",
      currency: "EUR",
      fee: plan.fee,
      tax: "0",
      note: "Sparplan",
    },
    "savings_plan",
    { savingsPlanId: plan.id },
  );
  if (!result.ok) return result;
  db.insert(savingsPlanExecutions).values({ planId, dueDate, status: "CONFIRMED", transactionId: result.id }).run();
  return result;
}

export function skipExecution(planId: number, dueDate: string): void {
  getDb().insert(savingsPlanExecutions).values({ planId, dueDate, status: "SKIPPED" }).onConflictDoNothing().run();
}
