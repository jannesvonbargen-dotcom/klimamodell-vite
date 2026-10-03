import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Sicherung (JSON) und CSV-Export als Rundreise über den eigenen Import. */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
});

async function setup() {
  const { createTransaction } = await import("./transactions");
  const { addToWatchlist, updateWatchlistItem } = await import("./watchlist");
  const { addSplit, getInstrumentByIsin } = await import("./repo");
  createTransaction({ type: "DEPOSIT", date: "2025-01-02", amount: "10.000,00", note: 'Start; mit "Zitat"' });
  createTransaction({
    type: "BUY",
    date: "2025-01-06",
    time: "10:15",
    instrument: { isin: "US67066G1040", symbol: "NVDA", name: "NVIDIA Corp.", kind: "STOCK", currency: "USD" },
    quantity: "2,5",
    price: "140,12",
    currency: "USD",
    fxRate: "1,0412",
    fee: "1",
  });
  createTransaction({ type: "TAX", date: "2025-03-01", amount: "-12,34", note: "=SUMME(A1)" });
  createTransaction({ type: "INTEREST", date: "2025-03-31", amount: "8,10", tax: "2,14" });
  const nvda = getInstrumentByIsin("US67066G1040")!;
  addSplit(nvda.id, "2025-06-10", "1", "10");
  const w = addToWatchlist({ symbol: "SAP.DE", name: "SAP SE" });
  if (w.ok) updateWatchlistItem(w.id, { alertBelow: "150" });
}

describe("Sicherung", () => {
  it("stellt eine JSON-Sicherung vollständig wieder her", async () => {
    await setup();
    const { exportBackup, restoreBackup, wipeAllData } = await import("./backup");
    const { getOverview } = await import("./portfolio");
    const before = await getOverview();
    const backup = exportBackup();
    expect(backup.data.transactions).toHaveLength(4);
    expect(backup.data.splits).toHaveLength(1);

    await wipeAllData();
    expect((await getOverview()).transactionCount).toBe(0);

    const result = await restoreBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    const after = await getOverview();
    expect(after.transactionCount).toBe(before.transactionCount);
    expect(after.totals.cashEUR).toBe(before.totals.cashEUR);
    expect(after.positions[0].quantity).toBe("25"); // nach Split 1:10
    expect({ ...exportBackup().data, settings: [] }).toEqual({ ...backup.data, settings: [] });
  });

  it("lehnt fremde oder kaputte Dateien ab, ohne Daten zu verändern", async () => {
    const { exportBackup, restoreBackup } = await import("./backup");
    const count = exportBackup().data.transactions.length;
    expect((await restoreBackup("{ kaputt")).ok).toBe(false);
    expect((await restoreBackup(JSON.stringify({ hello: "world" }))).message).toMatch(/keine Sicherung/);
    const broken = exportBackup();
    broken.data.transactions[0].amount = "1,5";
    expect((await restoreBackup(JSON.stringify(broken))).message).toMatch(/transactions\.0\.amount/);
    const orphan = exportBackup();
    orphan.data.instruments = [];
    const r = await restoreBackup(JSON.stringify(orphan));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/fehlende Wertpapiere/);
    expect(exportBackup().data.transactions).toHaveLength(count);
  });

  it("exportiert Transaktionen als CSV, die der eigene Import erkennt", async () => {
    const { exportTransactionsCsv } = await import("./backup");
    const { parseCsv } = await import("@/import/csv");
    const { detectPreset, normalizeGeneric, suggestMapping } = await import("@/import/generic");
    const csv = exportTransactionsCsv();
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=SUMME(A1)");
    const table = parseCsv(csv.replace(/^﻿/, ""));
    const preset = detectPreset(table.headers);
    expect(preset).toBe("app_backup");
    const { candidates, skipped } = normalizeGeneric(table, suggestMapping(table, preset));
    expect(skipped).toEqual([]);
    expect(candidates).toHaveLength(4);
    const buy = candidates.find((c) => c.type === "BUY")!;
    expect(buy).toMatchObject({
      executedAt: "2025-01-06T10:15",
      isin: "US67066G1040",
      quantity: "2.5",
      price: "140.12",
      currency: "USD",
      fxRate: "1.0412",
      fee: "1",
    });
    expect(buy.amount).toBe("350.3");
    expect(candidates.find((c) => c.type === "TAX")!.amount).toBe("-12.34");
    expect(candidates.find((c) => c.type === "INTEREST")).toMatchObject({ amount: "8.1", tax: "2.14" });
    expect(candidates.find((c) => c.type === "DEPOSIT")!.note).toBe('Start; mit "Zitat"');
  });

  it("erkennt beim Re-Import alles als Duplikat", async () => {
    const { exportTransactionsCsv } = await import("./backup");
    const { parseCsv } = await import("@/import/csv");
    const { normalizeGeneric, suggestMapping } = await import("@/import/generic");
    const { previewImport } = await import("./import");
    const table = parseCsv(exportTransactionsCsv().replace(/^﻿/, ""));
    const { candidates } = normalizeGeneric(table, suggestMapping(table, "app_backup"));
    const preview = await previewImport(candidates);
    expect(preview.rows.every((r) => r.status === "duplicate")).toBe(true);
  });
});
