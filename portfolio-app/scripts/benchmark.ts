/**
 * Lastprobe: legt im Speicher ein Depot mit ~2.900 Buchungen über zehn Jahre
 * an (Demo-Kurse) und misst die wichtigsten Serverfunktionen.
 *
 *   npm run benchmark
 */
import { loadEnv } from "./env";
loadEnv();
process.env.DATABASE_PATH = ":memory:";
process.env.MARKET_DATA_PROVIDER = "mock";

async function main() {
  const { getDb } = await import("../src/db/client");
  const { transactions } = await import("../src/db/schema");
  const { upsertInstrument, recomputeDedupeKeys } = await import("../src/server/repo");
  const { catalogBySymbol } = await import("../src/market/catalog");
  const db = getDb();
  const syms = ["EUNL.DE", "IS3N.DE", "SAP.DE", "ALV.DE", "AAPL", "MSFT", "NVDA", "SIE.DE"];
  const ids = syms.map((s) => {
    const c = catalogBySymbol(s)!;
    return upsertInstrument({
      isin: c.isin,
      wkn: c.wkn,
      symbol: c.symbol,
      name: c.name,
      kind: c.kind,
      currency: c.currency,
      sector: c.sector,
      country: c.country,
    }).id;
  });
  const rows = [];
  const start = new Date("2016-01-04T00:00:00Z");
  for (let w = 0; w < 52 * 10; w++) {
    const dt = new Date(start.getTime() + w * 7 * 86400000).toISOString().slice(0, 10);
    rows.push({
      type: "DEPOSIT" as const,
      executedAt: `${dt}T08:00`,
      amount: "500",
      currency: "EUR",
      fxRate: "1",
      fee: "0",
      tax: "0",
      source: "manual" as const,
    });
    for (let i = 0; i < 4; i++) {
      rows.push({
        type: "SAVINGS_PLAN" as const,
        executedAt: `${dt}T09:15`,
        instrumentId: ids[i],
        quantity: "1.234567",
        price: "50",
        currency: "EUR",
        fxRate: "1",
        fee: "0",
        tax: "0",
        source: "manual" as const,
      });
    }
    if (w % 13 === 0)
      for (let i = 0; i < 8; i++)
        rows.push({
          type: "DIVIDEND" as const,
          executedAt: `${dt}T10:00`,
          instrumentId: ids[i],
          amount: "12.5",
          currency: "EUR",
          fxRate: "1",
          fee: "0",
          tax: "3.3",
          source: "manual" as const,
        });
  }
  for (let i = 0; i < rows.length; i += 500)
    db.insert(transactions)
      .values(rows.slice(i, i + 500))
      .run();
  recomputeDedupeKeys();
  console.log("transactions", rows.length);
  const { getOverview, getPerformance } = await import("../src/server/portfolio");
  const { getIncomeOverview } = await import("../src/server/income");
  for (const [label, fn] of [
    ["overview (kalt)", () => getOverview()],
    ["overview (warm)", () => getOverview()],
    ["performance MAX", () => getPerformance("MAX")],
    ["performance 1D", () => getPerformance("1D")],
    ["income", () => getIncomeOverview()],
  ] as const) {
    const t = Date.now();
    await fn();
    console.log(label, Date.now() - t, "ms");
  }

  // Großer CSV-Import (Trade-Republic-ähnlich): 3.000 Zeilen
  const { previewImport, commitImport } = await import("../src/server/import");
  const candidates = Array.from({ length: 3000 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 10) * 86400000).toISOString().slice(0, 10);
    const isBuy = i % 3 !== 0;
    const c = catalogBySymbol(syms[i % syms.length])!;
    return {
      row: i + 2,
      type: (isBuy ? "BUY" : "DEPOSIT") as "BUY" | "DEPOSIT",
      executedAt: `${day}T${String(8 + (i % 10)).padStart(2, "0")}:00`,
      isin: isBuy ? c.isin : null,
      wkn: null,
      symbol: null,
      name: isBuy ? c.name : null,
      assetClass: null,
      quantity: isBuy ? "0.5" : null,
      price: isBuy ? "40" : null,
      amount: isBuy ? "20" : "100",
      currency: "EUR",
      fxRate: "1",
      fee: isBuy ? "1" : "0",
      tax: "0",
      note: null,
      externalId: `bench-${i}`,
      warnings: [],
    };
  });
  let t = Date.now();
  const preview = previewImport(candidates);
  console.log("import preview 3000", Date.now() - t, "ms", preview.counts);
  t = Date.now();
  const res = await commitImport(candidates, "bench.csv", "trade_republic");
  console.log("import commit 3000", Date.now() - t, "ms", res.imported);
  t = Date.now();
  previewImport(candidates);
  console.log("import preview erneut (alles Duplikate)", Date.now() - t, "ms");
}
main();
