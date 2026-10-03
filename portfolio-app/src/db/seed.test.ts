import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Das Beispieldepot muss in sich stimmig sein (kein Minus auf dem Konto, keine Überverkäufe). */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
});

afterAll(async () => {
  const { closeDb } = await import("./client");
  closeDb();
});

describe("Beispieldaten", () => {
  it("erzeugt ein stimmiges Depot und lässt sich rückstandslos entfernen", async () => {
    const { seedDemoData, removeDemoData } = await import("./seed");
    const { listTransactions, listSplits, listSavingsPlans, listWatchlist, listInstruments } = await import("@/server/repo");
    const { computeLedger } = await import("@/domain/ledger");
    const { createTransaction } = await import("@/server/transactions");

    const { transactions } = await seedDemoData({ today: "2026-10-02" });
    expect(transactions).toBeGreaterThan(100);
    const ledger = computeLedger(listTransactions(), listSplits());
    expect(ledger.issues).toEqual([]);
    expect(ledger.cashEUR.gt(0)).toBe(true);
    expect(listSavingsPlans()).toHaveLength(2);
    expect(listWatchlist()).toHaveLength(2);
    // Jede Buchung hat einen Duplikat-Schlüssel
    expect(listTransactions().length).toBe(transactions);

    // Eigene Buchung bleibt beim Entfernen erhalten
    createTransaction({ type: "DEPOSIT", date: "2026-10-01", amount: "100" });
    removeDemoData();
    expect(listTransactions()).toHaveLength(1);
    expect(listSavingsPlans()).toHaveLength(0);
    expect(listWatchlist()).toHaveLength(0);
    expect(listInstruments()).toHaveLength(0);
  });
});
