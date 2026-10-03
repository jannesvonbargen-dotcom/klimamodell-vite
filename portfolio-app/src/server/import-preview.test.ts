import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Import-Vorschau „Depot nach dem Import“ und das Ersetzen des Beispieldepots. */

const CSV = fs.readFileSync(path.join(__dirname, "../../e2e/fixtures/trade-republic-kontoauszug.csv"), "utf8");

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
});

async function candidates() {
  const { parseCsv } = await import("@/import/csv");
  const { parseTradeRepublicStatement } = await import("@/import/trade-republic-statement");
  return parseTradeRepublicStatement(parseCsv(CSV)).candidates;
}

describe("Import-Vorschau", () => {
  it("zeigt Cash, Positionen und Summen nach dem Import – ohne Beispieldepot, wenn gewünscht", async () => {
    const { getDb } = await import("@/db/client");
    const { transactions } = await import("@/db/schema");
    const { previewImport } = await import("./import");
    // Eine Beispiel-Buchung wie aus dem Demo-Depot
    getDb()
      .insert(transactions)
      .values({
        type: "DEPOSIT",
        executedAt: "2023-01-02",
        amount: "5000",
        currency: "EUR",
        fxRate: "1",
        fee: "0",
        tax: "0",
        source: "seed",
      })
      .run();

    const list = await candidates();
    const mixed = previewImport(list);
    expect(mixed.demo).toEqual({ transactions: 1, replaced: false });
    expect(mixed.after.cashEUR).toBe("6540.16");

    const clean = previewImport(list, { replaceDemo: true });
    expect(clean.demo).toEqual({ transactions: 1, replaced: true });
    expect(clean.counts).toEqual({ new: 11, duplicate: 0, invalid: 0 });
    expect(clean.after).toMatchObject({
      cashEUR: "1540.16",
      investedCostEUR: "260.50",
      realizedEUR: "18.50",
      interestEUR: "3.10",
      dividendsNetEUR: "0.38",
      taxesEUR: "-1.58",
      feesEUR: "2.00",
      depositsEUR: "2001.00",
      withdrawalsEUR: "223.90",
    });
    expect(clean.after.positions.map((p) => [p.name, p.quantity, p.costEUR])).toEqual([
      ["Apple Inc.", "1", "210.50"],
      ["Xtrackers MSCI World UCITS ETF 1C", "0.373134", "50.00"],
    ]);
    expect(clean.byType.find((t) => t.type === "BUY")).toEqual({ type: "BUY", count: 1, cashEUR: "-421.00" });
  });

  it("entfernt beim Import das Beispieldepot und erkennt die Datei danach als vorhanden", async () => {
    const { commitImport, previewImport } = await import("./import");
    const { getSettingsOverview } = await import("./settings");
    const list = await candidates();
    const result = await commitImport(list, "kontoauszug.csv", "trade_republic_statement", { replaceDemo: true });
    expect(result.imported).toBe(11);
    expect(getSettingsOverview().counts.seedTransactions).toBe(0);
    const again = previewImport(list, { replaceDemo: true });
    expect(again.counts).toEqual({ new: 0, duplicate: 11, invalid: 0 });
    expect(again.after.cashEUR).toBe("1540.16");
  });
});
