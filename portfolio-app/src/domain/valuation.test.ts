import { beforeEach, describe, expect, it } from "vitest";
import { buy, deposit, instrument, resetIds, sell } from "./test-helpers";
import { previousDay, type Quote, valuePortfolio } from "./valuation";

function quote(symbol: string, price: string, previousClose: string | null, currency = "EUR"): Quote {
  return { symbol, price, previousClose, currency, asOf: "2026-10-05T14:00:00Z", source: "test" };
}

describe("valuePortfolio", () => {
  beforeEach(() => resetIds());

  it("bewertet Positionen und berechnet die Tagesveränderung trotz Käufen am selben Tag", () => {
    const result = valuePortfolio({
      transactions: [
        deposit("2026-10-01", "2000"),
        buy("2026-10-02", 1, "10", "100"),
        buy("2026-10-05T10:15", 1, "5", "108"),
      ],
      instruments: new Map([[1, instrument(1, "SAP.DE")]]),
      quotes: new Map([["SAP.DE", quote("SAP.DE", "110", "105")]]),
      fx: new Map(),
      today: "2026-10-05",
    });
    const [p] = result.positions;
    expect(p.quantity).toBe("15");
    expect(p.costEUR).toBe("1542");
    expect(p.marketValueEUR).toBe("1650");
    expect(p.unrealizedEUR).toBe("108");
    // 10 Stück × 5 € + 5 Stück × (110 − 108) = 60 €
    expect(p.dayChangeEUR).toBe("60");
    expect(p.weight).toBe("1");

    const t = result.totals;
    expect(t.cashEUR).toBe("458");
    expect(t.totalEUR).toBe("2108");
    expect(t.dayChangeEUR).toBe("60");
    // Basis: 10 × 105 + Cash zu Tagesbeginn 999
    expect(Number(t.dayChangePct)).toBeCloseTo(60 / 2049, 10);
    expect(Number(t.investedShare)).toBeCloseTo(1650 / 2108, 10);
  });

  it("rechnet Kurse in Fremdwährung mit dem aktuellen Wechselkurs um", () => {
    const result = valuePortfolio({
      transactions: [deposit("2026-01-01", "5000"), buy("2026-01-05", 2, "10", "200", "0", { currency: "USD", fxRate: "1.25" })],
      instruments: new Map([[2, instrument(2, "AAPL", "USD")]]),
      quotes: new Map([["AAPL", quote("AAPL", "200", "190", "USD")]]),
      fx: new Map([["USD", "1.25"]]),
      today: "2026-10-05",
    });
    const [p] = result.positions;
    expect(p.priceEUR).toBe("160");
    expect(p.marketValueEUR).toBe("1600");
    expect(p.unrealizedEUR).toBe("0");
    expect(p.dayChangeEUR).toBe("80");
  });

  it("fällt ohne Kurs auf den letzten Transaktionskurs zurück", () => {
    const result = valuePortfolio({
      transactions: [deposit("2026-01-01", "1000"), buy("2026-01-05", 1, "4", "50", "0")],
      instruments: new Map([[1, instrument(1, "XYZ")]]),
      quotes: new Map(),
      fx: new Map(),
      today: "2026-10-05",
    });
    expect(result.positions[0].priceSource).toBe("last-transaction");
    expect(result.positions[0].marketValueEUR).toBe("200");
    expect(result.positions[0].dayChangeEUR).toBeNull();
    expect(result.missingQuotes).toEqual([1]);
  });

  it("berücksichtigt heute komplett verkaufte Positionen in der Tagesveränderung", () => {
    const result = valuePortfolio({
      transactions: [deposit("2026-01-01", "1000"), buy("2026-01-05", 1, "10", "50", "0"), sell("2026-10-05T09:00", 1, "10", "52", "0")],
      instruments: new Map([[1, instrument(1, "XYZ")]]),
      quotes: new Map([["XYZ", quote("XYZ", "53", "51")]]),
      fx: new Map(),
      today: "2026-10-05",
    });
    expect(result.positions).toHaveLength(0);
    // 0 − 510 − (−520) = +10 € (verkauft zu 52 statt Vortagesschluss 51)
    expect(result.totals.dayChangeEUR).toBe("10");
  });

  it("liefert sinnvolle Summen für ein leeres Depot", () => {
    const result = valuePortfolio({
      transactions: [],
      instruments: new Map(),
      quotes: new Map(),
      fx: new Map(),
      today: "2026-10-05",
    });
    expect(result.totals.totalEUR).toBe("0");
    expect(result.totals.dayChangePct).toBeNull();
    expect(result.totals.investedShare).toBeNull();
  });

  it("berechnet den Vortag auch über Monats- und Jahresgrenzen", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});
