import { beforeEach, describe, expect, it } from "vitest";
import { averageCostEUR, averageCostLocal, computeLedger } from "./ledger";
import { buy, deposit, resetIds, sell, split, tx } from "./test-helpers";

const str = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : v.toString());

describe("Ledger – Durchschnittskostenmethode", () => {
  beforeEach(() => resetIds());

  it("berechnet Einstand, Teilverkauf und Cash korrekt", () => {
    const ledger = computeLedger([
      deposit("2026-01-02", "3000"),
      buy("2026-01-05", 1, "10", "100"),
      buy("2026-02-05", 1, "10", "120"),
      sell("2026-03-05", 1, "5", "130"),
    ]);
    const p = ledger.positions.get(1)!;
    expect(str(p.quantity)).toBe("15");
    // Einstand 2202 € für 20 Stück → 5 Stück = 550,50 € ausgebucht
    expect(str(p.costEUR)).toBe("1651.5");
    expect(str(averageCostEUR(p))).toBe("110.1");
    // Erlös 650 − 1 = 649 → realisiert 98,50 €
    expect(str(p.realizedEUR)).toBe("98.5");
    expect(str(ledger.realizedEUR)).toBe("98.5");
    expect(str(ledger.cashEUR)).toBe("1447");
    expect(str(ledger.feesEUR)).toBe("3");
    expect(ledger.issues).toHaveLength(0);
  });

  it("rechnet mit Bruchstücken (Sparplan) ohne Rundungsfehler", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "100"),
      tx("SAVINGS_PLAN", "2026-01-02", { instrumentId: 7, quantity: "0.405022", price: "123.45", amount: "50" }),
      tx("SAVINGS_PLAN", "2026-02-02", { instrumentId: 7, quantity: "0.384615", price: "130", amount: "50" }),
    ]);
    const p = ledger.positions.get(7)!;
    expect(str(p.quantity)).toBe("0.789637");
    expect(str(p.costEUR)).toBe("100");
    expect(str(ledger.cashEUR)).toBe("0");

    const sold = computeLedger([
      deposit("2026-01-01", "100"),
      tx("SAVINGS_PLAN", "2026-01-02", { instrumentId: 7, quantity: "0.405022", price: "123.45", amount: "50" }),
      tx("SAVINGS_PLAN", "2026-02-02", { instrumentId: 7, quantity: "0.384615", price: "130", amount: "50" }),
      sell("2026-03-02", 7, "0.789637", "140"),
    ]);
    const q = sold.positions.get(7)!;
    // Kurswert 0,789637 × 140 = 110,54918 → 110,55 €; minus 1 € Gebühr
    expect(str(q.quantity)).toBe("0");
    expect(str(q.costEUR)).toBe("0");
    expect(str(q.realizedEUR)).toBe("9.55");
    expect(str(sold.cashEUR)).toBe("109.55");
    expect(sold.openPositions()).toHaveLength(0);
  });

  it("rechnet Fremdwährung mit dem Wechselkurs des Handelstages um", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "5000"),
      buy("2026-01-05", 2, "10", "200", "0", { currency: "USD", fxRate: "1.25" }),
    ]);
    const p = ledger.positions.get(2)!;
    expect(str(p.costEUR)).toBe("1600");
    expect(str(averageCostLocal(p))).toBe("200");
    expect(p.localCurrency).toBe("USD");

    const after = computeLedger([
      deposit("2026-01-01", "5000"),
      buy("2026-01-05", 2, "10", "200", "0", { currency: "USD", fxRate: "1.25" }),
      sell("2026-06-05", 2, "10", "220", "0", { currency: "USD", fxRate: "1.1" }),
    ]);
    // 2.200 USD / 1,10 = 2.000 € → realisiert 400 € (inkl. Währungseffekt)
    expect(str(after.realizedEUR)).toBe("400");
    expect(str(after.cashEUR)).toBe("5400");
  });

  it("passt Stückzahl bei einem Aktiensplit an, Einstand bleibt gleich", () => {
    const ledger = computeLedger(
      [
        deposit("2026-01-01", "10000"),
        buy("2026-01-05", 3, "10", "400", "0"),
        buy("2026-06-10", 3, "1", "105", "0"),
        sell("2026-07-01", 3, "21", "110", "0"),
      ],
      [split(3, "2026-06-10", "4")],
    );
    const p = ledger.positions.get(3)!;
    // 10 × 4 = 40 Stück + 1 Kauf am Split-Tag (nach dem Split) = 41
    // Einstand 4000 + 105 = 4105 → 21 Stück = 4105 × 21/41 = 2102,56…
    expect(str(p.quantity)).toBe("20");
    expect(p.costEUR.toDecimalPlaces(2).toString()).toBe("2002.44");
    expect(p.realizedEUR.toDecimalPlaces(2).toString()).toBe("207.44");
  });

  it("verbucht Dividenden brutto, Steuern und netto in EUR", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "1000"),
      buy("2026-01-05", 2, "5", "100", "0", { currency: "USD", fxRate: "1.25" }),
      tx("DIVIDEND", "2026-03-01", { instrumentId: 2, amount: "10", tax: "1.5", currency: "USD", fxRate: "1.25" }),
    ]);
    expect(str(ledger.dividendsGrossEUR)).toBe("8");
    expect(str(ledger.taxesEUR)).toBe("1.2");
    expect(str(ledger.dividendsNetEUR)).toBe("6.8");
    expect(str(ledger.positions.get(2)!.dividendsNetEUR)).toBe("6.8");
    // 1000 − 400 + 6,80
    expect(str(ledger.cashEUR)).toBe("606.8");
    expect(str(ledger.byYear.get(2026)!.dividendsNetEUR)).toBe("6.8");
  });

  it("meldet Verkäufe von mehr Stücken als gehalten", () => {
    const ledger = computeLedger([deposit("2026-01-01", "1000"), buy("2026-01-05", 1, "2", "100"), sell("2026-01-06", 1, "3", "100")]);
    expect(ledger.issues.some((i) => i.kind === "OVERSELL")).toBe(true);
    expect(str(ledger.positions.get(1)!.quantity)).toBe("0");
  });

  it("behandelt Gebühren, Steuern, Erstattungen, Zinsen und Auszahlungen", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "1000"),
      tx("FEE", "2026-01-02", { amount: "5" }),
      tx("TAX", "2026-01-03", { amount: "20" }),
      tx("TAX", "2026-01-04", { amount: "-7.5" }),
      tx("INTEREST", "2026-01-31", { amount: "2.5", tax: "0.66" }),
      tx("WITHDRAWAL", "2026-02-01", { amount: "100" }),
    ]);
    expect(str(ledger.cashEUR)).toBe("884.34");
    expect(str(ledger.feesEUR)).toBe("5");
    expect(str(ledger.taxesEUR)).toBe("13.16");
    expect(str(ledger.interestEUR)).toBe("1.84");
    expect(str(ledger.withdrawalsEUR)).toBe("100");
  });

  it("berechnet einen Stand zu einem Stichtag", () => {
    const txs = [deposit("2026-01-01", "1000"), buy("2026-01-05", 1, "2", "100"), buy("2026-02-05", 1, "3", "100")];
    expect(str(computeLedger(txs, [], { asOf: "2026-01-31" }).positions.get(1)!.quantity)).toBe("2");
    expect(str(computeLedger(txs, [], { asOf: "2026-02-05" }).positions.get(1)!.quantity)).toBe("5");
  });

  it("sortiert Transaktionen am selben Tag sinnvoll (Einzahlung vor Kauf)", () => {
    const ledger = computeLedger([buy("2026-01-05", 1, "1", "100", "0"), deposit("2026-01-05", "100")]);
    expect(ledger.issues).toHaveLength(0);
    expect(str(ledger.cashEUR)).toBe("0");
  });

  it("nutzt den gebuchten Betrag statt Stück × Kurs, falls angegeben", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "25"),
      tx("BUY", "2026-01-02", { instrumentId: 1, quantity: "0.333333", price: "75", amount: "25", fee: "0" }),
    ]);
    expect(str(ledger.positions.get(1)!.costEUR)).toBe("25");
    expect(str(ledger.cashEUR)).toBe("0");
  });

  it("schließt eine Position ohne Rundungsreste", () => {
    const ledger = computeLedger([
      deposit("2026-01-01", "1000"),
      buy("2026-01-02", 1, "3", "33.33", "1"),
      sell("2026-01-03", 1, "1", "34", "1"),
      sell("2026-01-04", 1, "2", "35", "1"),
    ]);
    const p = ledger.positions.get(1)!;
    expect(str(p.quantity)).toBe("0");
    expect(str(p.costEUR)).toBe("0");
    // Einstand 100,99; Erlöse 33 + 69 = 102 → 1,01
    expect(p.realizedEUR.toDecimalPlaces(2).toString()).toBe("1.01");
  });
});
