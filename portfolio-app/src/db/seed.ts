import { eq, inArray } from "drizzle-orm";
import { d, roundMoney, roundQty } from "@/domain/decimal";
import { businessDays } from "@/domain/performance";
import { germanHolidaySet, todayInBerlin } from "@/domain/market-hours";
import { dueExecutionDates, nextTradingDay } from "@/domain/savings-plan";
import { catalogBySymbol } from "@/market/catalog";
import { MockFxProvider, MockProvider } from "@/market/providers/mock";
import type { PricePoint } from "@/market/types";
import { getFxHistory, getDailyHistory } from "@/server/market";
import { setSetting, upsertInstrument } from "@/server/repo";
import { getDb } from "./client";
import { instruments, savingsPlanExecutions, savingsPlans, settings, splits, transactions, watchlist } from "./schema";

/**
 * Beispieldepot zum Ausprobieren. Alle Transaktionen werden mit
 * source = "seed" gespeichert und lassen sich in den Einstellungen mit
 * einem Klick wieder entfernen. Kaufkurse stammen aus der Kurshistorie des
 * aktiven Anbieters (bzw. der Demo-Simulation, wenn offline).
 */

const SEED_START = "2023-01-02";

interface PriceBook {
  close(symbol: string, date: string): Promise<string>;
  fx(ccy: string, date: string): Promise<string>;
}

function lastOnOrBefore(points: PricePoint[], date: string): string | null {
  let found: string | null = null;
  for (const p of points) {
    if (p.key <= date) found = p.close;
    else break;
  }
  return found;
}

function createPriceBook(today: string): PriceBook {
  const histories = new Map<string, PricePoint[]>();
  const fxHistories = new Map<string, PricePoint[]>();
  const mock = new MockProvider();
  const mockFx = new MockFxProvider();
  return {
    async close(symbol, date) {
      if (!histories.has(symbol)) {
        let points = await getDailyHistory(symbol, "2022-12-01", today);
        if (points.length === 0) points = await mock.dailyHistory(symbol, "2022-12-01", today);
        histories.set(symbol, points);
      }
      const value = lastOnOrBefore(histories.get(symbol)!, date);
      if (value) return value;
      const fallback = await mock.dailyHistory(symbol, "2022-12-01", date);
      return fallback[fallback.length - 1]?.close ?? "100";
    },
    async fx(ccy, date) {
      if (ccy === "EUR") return "1";
      if (!fxHistories.has(ccy)) {
        let points = (await getFxHistory([ccy], "2022-12-01", today)).get(ccy) ?? [];
        if (points.length === 0) points = (await mockFx.history("2022-12-01", today)).get(ccy) ?? [];
        fxHistories.set(ccy, points);
      }
      return lastOnOrBefore(fxHistories.get(ccy)!, date) ?? "1";
    },
  };
}

function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, day));
  return dt.toISOString().slice(0, 10);
}

export async function seedDemoData(options: { today?: string } = {}): Promise<{ transactions: number }> {
  const db = getDb();
  const today = options.today ?? todayInBerlin();
  const holidays = germanHolidaySet(2022, Number(today.slice(0, 4)) + 1);
  const book = createPriceBook(today);
  const trade = (date: string) => nextTradingDay(date, holidays);

  const ensure = (symbol: string) => {
    const entry = catalogBySymbol(symbol);
    if (!entry) throw new Error(`Unbekanntes Seed-Symbol ${symbol}`);
    return upsertInstrument({
      isin: entry.isin,
      wkn: entry.wkn,
      symbol: entry.symbol,
      name: entry.name,
      kind: entry.kind,
      currency: entry.currency,
      sector: entry.sector,
      country: entry.country,
    });
  };

  const world = ensure("EUNL.DE");
  const em = ensure("IS3N.DE");
  const apple = ensure("AAPL");
  const msft = ensure("MSFT");
  const nvda = ensure("NVDA");
  const sap = ensure("SAP.DE");
  const allianz = ensure("ALV.DE");
  const asml = ensure("ASML.AS");
  const novo = ensure("NOVO-B.CO");

  type Row = typeof transactions.$inferInsert;
  const rows: Row[] = [];
  const base = { source: "seed" as const, fee: "0", tax: "0", fxRate: "1", currency: "EUR" };

  // Einzahlungen: Startkapital + monatliche Sparrate aufs Verrechnungskonto
  rows.push({ ...base, type: "DEPOSIT", executedAt: `${SEED_START}T09:00`, amount: "12000", note: "Startkapital" });
  for (let date = addMonths("2023-02-01", 0); date <= today; date = addMonths(date, 1)) {
    rows.push({ ...base, type: "DEPOSIT", executedAt: `${date.slice(0, 8)}01T08:00`, amount: "600" });
  }

  // Einzelkäufe und -verkäufe
  const trades: Array<{ type: "BUY" | "SELL"; inst: typeof apple; date: string; qty: string; time: string; multiplier?: string }> = [
    { type: "BUY", inst: apple, date: "2023-02-14", qty: "15", time: "15:42" },
    { type: "BUY", inst: sap, date: "2023-03-15", qty: "12", time: "10:05" },
    { type: "BUY", inst: allianz, date: "2023-06-20", qty: "8", time: "11:30" },
    { type: "BUY", inst: msft, date: "2023-09-12", qty: "6", time: "16:10" },
    { type: "BUY", inst: asml, date: "2024-02-06", qty: "3", time: "09:47" },
    // NVIDIA vor dem 10:1-Split am 10.06.2024 – Kurs unbereinigt (×10)
    { type: "BUY", inst: nvda, date: "2024-03-01", qty: "2", time: "17:20", multiplier: "10" },
    { type: "BUY", inst: novo, date: "2024-05-08", qty: "12", time: "10:15" },
    { type: "BUY", inst: sap, date: "2024-11-19", qty: "4", time: "14:02" },
    { type: "SELL", inst: apple, date: "2025-07-15", qty: "5", time: "15:55" },
    { type: "SELL", inst: novo, date: "2025-08-12", qty: "12", time: "11:11" },
    { type: "BUY", inst: allianz, date: "2026-03-10", qty: "3", time: "10:40" },
  ];
  for (const t of trades) {
    const date = trade(t.date);
    if (date > today) continue;
    const close = d(await book.close(t.inst.symbol, date)).times(t.multiplier ?? "1");
    const fx = await book.fx(t.inst.currency, date);
    rows.push({
      ...base,
      type: t.type,
      executedAt: `${date}T${t.time}`,
      instrumentId: t.inst.id,
      quantity: t.qty,
      price: close.toDecimalPlaces(2).toString(),
      currency: t.inst.currency,
      fxRate: fx,
      fee: d(1).times(fx).toDecimalPlaces(2).toString(),
    });
  }

  // Dividenden (Beispielwerte je Aktie, Steuer pauschal 26,375 %)
  const dividends: Array<{ inst: typeof apple; date: string; perShare: string }> = [];
  for (const year of [2023, 2024, 2025, 2026]) {
    dividends.push({
      inst: sap,
      date: `${year}-05-${year === 2023 ? "16" : "20"}`,
      perShare: ["2.05", "2.20", "2.35", "2.50"][year - 2023],
    });
    dividends.push({
      inst: allianz,
      date: `${year}-05-0${year === 2023 ? 8 : 9}`,
      perShare: ["11.40", "13.80", "15.40", "17.10"][year - 2023],
    });
    for (const [month, day] of [
      [2, 16],
      [5, 18],
      [8, 17],
      [11, 16],
    ]) {
      dividends.push({
        inst: apple,
        date: `${year}-${String(month).padStart(2, "0")}-${day}`,
        perShare: year < 2024 ? "0.24" : year < 2025 ? "0.25" : "0.26",
      });
      dividends.push({
        inst: msft,
        date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day - 2).padStart(2, "0")}`,
        perShare: year < 2024 ? "0.75" : year < 2025 ? "0.83" : "0.91",
      });
    }
  }

  // Sparpläne
  const plans = [
    { inst: world, amount: "250", day: 2 },
    { inst: em, amount: "50", day: 2 },
  ];
  const planIds: number[] = [];
  for (const p of plans) {
    const row = db
      .insert(savingsPlans)
      .values({
        instrumentId: p.inst.id,
        amount: p.amount,
        interval: "MONTHLY",
        executionDay: p.day,
        startDate: SEED_START,
        active: true,
        fee: "0",
      })
      .returning()
      .get();
    planIds.push(row.id);
  }

  // Splits
  db.insert(splits)
    .values({ instrumentId: nvda.id, effectiveDate: "2024-06-10", ratioFrom: "1", ratioTo: "10", note: "Aktiensplit 10:1" })
    .onConflictDoNothing()
    .run();

  // Alles in einer Transaktion schreiben
  let count = 0;
  const insertRow = (row: Row) => {
    count++;
    return db.insert(transactions).values(row).returning({ id: transactions.id }).get().id;
  };

  for (const row of rows.sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1))) insertRow(row);

  // Sparplan-Ausführungen bis einschließlich Vormonat (der aktuelle Termin bleibt als Vorschlag offen)
  const lastConfirmable = addMonths(`${today.slice(0, 8)}01`, 0);
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const dates = dueExecutionDates(
      { interval: "MONTHLY", executionDay: p.day, startDate: SEED_START, active: true },
      today,
      holidays,
    ).filter((date) => date < lastConfirmable);
    for (const date of dates) {
      const price = d(await book.close(p.inst.symbol, date));
      const qty = roundQty(d(p.amount).div(price));
      const id = insertRow({
        ...base,
        type: "SAVINGS_PLAN",
        executedAt: `${date}T09:15`,
        instrumentId: p.inst.id,
        quantity: qty.toString(),
        price: price.toDecimalPlaces(4).toString(),
        amount: p.amount,
        savingsPlanId: planIds[i],
      });
      db.insert(savingsPlanExecutions).values({ planId: planIds[i], dueDate: date, status: "CONFIRMED", transactionId: id }).run();
    }
  }

  // Dividenden nur für gehaltene Stücke buchen
  const { computeLedger } = await import("@/domain/ledger");
  const { listTransactions, listSplits } = await import("@/server/repo");
  for (const div of dividends.sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const date = trade(div.date);
    if (date > today) continue;
    const ledger = computeLedger(listTransactions(), listSplits(), { asOf: date });
    const held = ledger.positions.get(div.inst.id)?.quantity;
    if (!held || held.lte(0)) continue;
    const gross = roundMoney(held.times(div.perShare));
    const fx = await book.fx(div.inst.currency, date);
    insertRow({
      ...base,
      type: "DIVIDEND",
      executedAt: `${date}T08:30`,
      instrumentId: div.inst.id,
      quantity: held.toString(),
      price: div.perShare,
      amount: gross.toString(),
      currency: div.inst.currency,
      fxRate: fx,
      tax: roundMoney(gross.times("0.26375")).toString(),
    });
  }

  // Zinsen aufs Guthaben (Beispiel: monatlich ab 2024)
  for (const date of businessDays("2024-01-01", today).filter((day, i, arr) => arr[i + 1]?.slice(0, 7) !== day.slice(0, 7))) {
    if (date.slice(0, 7) === today.slice(0, 7)) continue;
    const ledger = computeLedger(listTransactions(), listSplits(), { asOf: date });
    if (ledger.cashEUR.lte(0)) continue;
    const gross = roundMoney(ledger.cashEUR.times("0.025").div(12));
    if (gross.lte(0)) continue;
    insertRow({
      ...base,
      type: "INTEREST",
      executedAt: `${date}T23:00`,
      amount: gross.toString(),
      tax: roundMoney(gross.times("0.26375")).toString(),
    });
  }

  // Watchlist-Beispiele (ohne erfundene Kursschwellen: Alarm 10 % unter dem letzten Schlusskurs)
  const watchIds: number[] = [];
  for (const symbol of ["V", "COST"]) {
    const entry = catalogBySymbol(symbol);
    if (!entry) continue;
    const last = await book.close(symbol, today);
    const row = db
      .insert(watchlist)
      .values({
        symbol,
        name: entry.name,
        isin: entry.isin,
        currency: entry.currency,
        alertBelow: roundMoney(d(last).times("0.9")).toString(),
        note: "Beispiel aus „Solide Wachstumswerte“",
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (row) watchIds.push(row.id);
  }

  setSetting("seedPlanIds", planIds);
  setSetting("seedWatchlistIds", watchIds);
  setSetting("seededAt", new Date().toISOString());
  return { transactions: count };
}

/** Entfernt alle Beispieldaten (Transaktionen, Sparpläne, Splits, unbenutzte Instrumente). */
export function removeDemoData(): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.source, "seed")).run();
    const planIdsRow = tx.select().from(settings).where(eq(settings.key, "seedPlanIds")).get();
    const planIds: number[] = planIdsRow ? JSON.parse(planIdsRow.value) : [];
    if (planIds.length) tx.delete(savingsPlans).where(inArray(savingsPlans.id, planIds)).run();
    const watchRow = tx.select().from(settings).where(eq(settings.key, "seedWatchlistIds")).get();
    const watchIds: number[] = watchRow ? JSON.parse(watchRow.value) : [];
    if (watchIds.length) tx.delete(watchlist).where(inArray(watchlist.id, watchIds)).run();
    const used = new Set(
      tx
        .select({ id: transactions.instrumentId })
        .from(transactions)
        .all()
        .map((r) => r.id),
    );
    const planUsed = new Set(
      tx
        .select({ id: savingsPlans.instrumentId })
        .from(savingsPlans)
        .all()
        .map((r) => r.id),
    );
    for (const i of tx.select().from(instruments).all()) {
      if (!used.has(i.id) && !planUsed.has(i.id)) {
        tx.delete(splits).where(eq(splits.instrumentId, i.id)).run();
        tx.delete(instruments).where(eq(instruments.id, i.id)).run();
      }
    }
  });
  setSetting("seedPlanIds", []);
  setSetting("seedWatchlistIds", []);
}
