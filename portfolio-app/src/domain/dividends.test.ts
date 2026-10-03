import { beforeEach, describe, expect, it } from "vitest";
import { d } from "./decimal";
import { dividendPayments, forecastDividends, monthlyBuckets } from "./dividends";
import { buy, deposit, instrument, resetIds, split, tx } from "./test-helpers";

describe("Dividenden", () => {
  beforeEach(() => resetIds());

  it("ermittelt Stücke und split-bereinigte Beträge je Aktie", () => {
    const txs = [
      deposit("2025-01-01", "5000"),
      buy("2025-01-10", 1, "10", "100"),
      // Ohne Stückzahl in der Buchung → Bestand am Tag (10)
      tx("DIVIDEND", "2025-03-15", { instrumentId: 1, amount: "5", tax: "1.32" }),
      // Nach dem 1:2-Split am 01.06.2025: 20 Stück
      tx("DIVIDEND", "2025-09-15", { instrumentId: 1, amount: "6", quantity: "20" }),
    ];
    const payments = dividendPayments(txs, [split(1, "2025-06-01", "2")]);
    expect(payments).toHaveLength(2);
    expect(payments[0].shares?.toString()).toBe("10");
    // 0,50 je alter Aktie = 0,25 je heutiger Aktie
    expect(payments[0].perShareAdjusted?.toString()).toBe("0.25");
    expect(payments[0].netEUR.toString()).toBe("3.68");
    expect(payments[1].perShareAdjusted?.toString()).toBe("0.3");
  });

  it("rechnet Zahlungen der letzten 12 Monate für den heutigen Bestand hoch", () => {
    const txs = [
      deposit("2025-01-01", "50000"),
      buy("2025-01-10", 1, "10", "100"),
      buy("2025-02-10", 2, "4", "200", "1", { currency: "USD", fxRate: "1.1" }),
      tx("DIVIDEND", "2025-03-15", { instrumentId: 1, amount: "5", quantity: "10" }), // älter als 12 Monate → keine Prognose
      tx("DIVIDEND", "2025-11-20", { instrumentId: 1, amount: "7", quantity: "10" }),
      tx("DIVIDEND", "2026-02-15", { instrumentId: 2, amount: "2", quantity: "4", currency: "USD", fxRate: "1.1" }),
      buy("2026-04-01", 1, "5", "110"), // Bestand wächst auf 15
    ];
    const payments = dividendPayments(txs);
    const expected = forecastDividends({
      payments,
      holdings: new Map([
        [1, d(15)],
        [2, d(4)],
      ]),
      instruments: new Map([
        [1, instrument(1, "SAP.DE")],
        [2, instrument(2, "AAPL", "USD")],
      ]),
      fx: new Map([["USD", "1.25"]]),
      today: "2026-04-10",
    });
    expect(expected.map((e) => [e.instrumentId, e.date, e.grossLocal.toString(), e.grossEUR?.toString()])).toEqual([
      [1, "2026-11-20", "10.5", "10.5"], // 0,70 × 15
      [2, "2027-02-15", "2", "1.6"], // 0,50 $ × 4 = 2 $ / 1,25
    ]);

    const buckets = monthlyBuckets(payments, expected, "2026-04-10");
    expect(buckets).toHaveLength(24);
    expect(buckets[0].month).toBe("2025-05");
    expect(buckets[11].month).toBe("2026-04");
    expect(buckets.find((b) => b.month === "2025-11")?.receivedGrossEUR.toString()).toBe("7");
    expect(buckets.find((b) => b.month === "2026-11")?.expectedGrossEUR.toString()).toBe("10.5");
  });

  it("prognostiziert nichts für verkaufte Positionen", () => {
    const txs = [
      deposit("2025-01-01", "5000"),
      buy("2025-01-10", 1, "10", "100"),
      tx("DIVIDEND", "2026-01-15", { instrumentId: 1, amount: "5", quantity: "10" }),
    ];
    const expected = forecastDividends({
      payments: dividendPayments(txs),
      holdings: new Map(),
      instruments: new Map([[1, instrument(1, "X")]]),
      fx: new Map(),
      today: "2026-04-10",
    });
    expect(expected).toEqual([]);
  });
});
