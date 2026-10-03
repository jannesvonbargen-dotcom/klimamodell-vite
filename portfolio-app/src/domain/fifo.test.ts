import { beforeEach, describe, expect, it } from "vitest";
import { fifoRealized } from "./fifo";
import { computeLedger } from "./ledger";
import { buy, deposit, resetIds, sell, split } from "./test-helpers";

describe("FIFO", () => {
  beforeEach(() => resetIds());

  it("verkauft die ältesten Stücke zuerst – anders als die Durchschnittskosten", () => {
    const txs = [
      deposit("2024-01-01", "10000"),
      buy("2024-01-10", 1, "10", "100", "1"),
      buy("2024-06-10", 1, "10", "200", "1"),
      sell("2025-02-01", 1, "10", "150", "1"),
    ];
    const fifo = fifoRealized(txs);
    // Erlös 1500 − 1 = 1499; Kosten der ersten 10 Stück 1000 + 1 = 1001
    expect(fifo.sales[0].realizedEUR.toString()).toBe("498");
    expect(fifo.sales[0].firstLotDate).toBe("2024-01-10");
    expect(fifo.byYear.get(2025)?.toString()).toBe("498");
    // Durchschnittskosten: (1001 + 2001) / 20 × 10 = 1501 → 1499 − 1501 = −2
    const avg = computeLedger(txs).realizedEUR;
    expect(avg.toString()).toBe("-2");
  });

  it("teilt Kaufposten anteilig und gleicht sich beim vollständigen Verkauf mit Ø aus", () => {
    const txs = [
      deposit("2024-01-01", "10000"),
      buy("2024-01-10", 1, "10", "100", "0"),
      buy("2024-03-10", 1, "10", "120", "0"),
      sell("2024-05-01", 1, "15", "130", "0"),
      sell("2025-05-01", 1, "5", "90", "0"),
    ];
    const fifo = fifoRealized(txs);
    // 2024: 15 × 130 = 1950 − (1000 + 5 × 120 = 1600) = 350
    expect(fifo.byYear.get(2024)?.toString()).toBe("350");
    // 2025: 5 × 90 = 450 − 5 × 120 = 600 → −150
    expect(fifo.byYear.get(2025)?.toString()).toBe("-150");
    expect(fifo.totalEUR.toString()).toBe(computeLedger(txs).realizedEUR.toString());
  });

  it("berücksichtigt Aktiensplits", () => {
    const txs = [deposit("2024-01-01", "10000"), buy("2024-01-10", 1, "2", "1000", "0"), sell("2024-07-01", 1, "10", "110", "0")];
    const fifo = fifoRealized(txs, [split(1, "2024-06-10", "10")]);
    // 20 Stück nach Split, 10 verkauft: 1100 − 1000 = 100
    expect(fifo.sales[0].quantity.toString()).toBe("10");
    expect(fifo.sales[0].realizedEUR.toString()).toBe("100");
  });
});
