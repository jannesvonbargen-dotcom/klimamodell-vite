import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integrationstest über DB, Server-Logik und Rechenkern mit In-Memory-SQLite
 * und dem Demo-Kursanbieter.
 */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
});

describe("Server-Integration", () => {
  it("legt Transaktionen an, validiert und bewertet konsistent", async () => {
    const { createTransaction, deleteTransaction, undoDeleteTransaction } = await import("./transactions");
    const { getOverview, getPerformance } = await import("./portfolio");

    expect(createTransaction({ type: "DEPOSIT", date: "2025-01-02", amount: "10.000,00" }).ok).toBe(true);
    const buy = createTransaction({
      type: "BUY",
      date: "2025-01-06",
      time: "10:00",
      instrument: {
        isin: "IE00B4L5Y983",
        symbol: "EUNL.DE",
        name: "iShares Core MSCI World UCITS ETF (Acc)",
        kind: "ETF",
        currency: "EUR",
      },
      quantity: "20",
      price: "95,50",
      fee: "1",
    });
    expect(buy.ok).toBe(true);
    const usd = createTransaction({
      type: "BUY",
      date: "2025-02-03",
      instrument: { isin: "US5949181045", symbol: "MSFT", name: "Microsoft Corp.", kind: "STOCK", currency: "USD" },
      quantity: "4",
      price: "410",
      currency: "USD",
      fxRate: "1,04",
      fee: "1,04",
    });
    expect(usd.ok).toBe(true);

    // Überverkauf wird abgelehnt
    const oversell = createTransaction({ type: "SELL", date: "2025-03-01", instrumentId: 1, quantity: "25", price: "100" });
    expect(oversell.ok).toBe(false);

    // Teilverkauf
    expect(createTransaction({ type: "SELL", date: "2025-06-02", instrumentId: 1, quantity: "5", price: "100", fee: "1" }).ok).toBe(true);

    // Löschen eines Kaufs, der für den Verkauf nötig ist, wird verhindert
    const blocked = deleteTransaction(buy.ok ? buy.id : 0);
    expect(blocked.ok).toBe(false);

    // Löschen + Rückgängig
    const deposit2 = createTransaction({ type: "DEPOSIT", date: "2025-07-01", amount: "50" });
    expect(deposit2.ok).toBe(true);
    if (deposit2.ok) {
      expect(deleteTransaction(deposit2.id).ok).toBe(true);
      undoDeleteTransaction(deposit2.id);
    }

    const overview = await getOverview();
    // Cash: 10.000 − 1.911 (20 × 95,50 + 1) − 1.577,92 (1.641,04 USD / 1,04) + 499 + 50
    expect(overview.totals.cashEUR).toBe("7060.08");
    expect(overview.positions).toHaveLength(2);
    const world = overview.positions.find((p) => p.instrument.symbol === "EUNL.DE")!;
    expect(world.quantity).toBe("15");
    // Einstand 1.911 × 15/20
    expect(world.costEUR).toBe("1433.25");
    expect(overview.totals.realizedEUR).toBe("21.25");

    // Alle Zeiträume enden beim aktuellen Gesamtvermögen
    for (const range of ["1D", "1M", "YTD", "MAX"] as const) {
      const perf = await getPerformance(range);
      expect(perf.points.length).toBeGreaterThan(0);
      expect(perf.points.at(-1)!.value, range).toBe(Number(overview.totals.totalEUR));
    }
  }, 30_000);
});
