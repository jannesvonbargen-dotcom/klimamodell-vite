import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeLedger } from "@/domain/ledger";
import type { Transaction } from "@/domain/types";
import { parseCsv } from "./csv";
import { detectPreset } from "./generic";
import { cleanTrName, isTradeRepublicStatement, parseTradeRepublicStatement } from "./trade-republic-statement";
import type { ImportCandidate } from "./types";

/** Anonymisierter Kontoauszug im Format der Trade-Republic-App (auch Fixture der E2E-Tests). */
const CSV = fs.readFileSync(path.join(__dirname, "../../e2e/fixtures/trade-republic-kontoauszug.csv"), "utf8");

function ledgerOf(candidates: ImportCandidate[]) {
  const ids = new Map<string, number>();
  const txs: Transaction[] = candidates.map((c, i) => {
    const key = ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"].includes(c.type) ? c.isin : null;
    if (key && !ids.has(key)) ids.set(key, ids.size + 1);
    return {
      id: i + 1,
      type: c.type,
      executedAt: c.executedAt,
      instrumentId: key ? ids.get(key)! : null,
      quantity: c.quantity,
      price: c.price,
      amount: c.amount,
      currency: c.currency,
      fxRate: c.fxRate,
      fee: c.fee,
      tax: c.tax,
      note: c.note,
    };
  });
  return { ledger: computeLedger(txs), ids };
}

describe("Trade-Republic-Kontoauszug", () => {
  const table = parseCsv(CSV);
  const result = parseTradeRepublicStatement(table);

  it("erkennt das Format an der Kopfzeile", () => {
    expect(isTradeRepublicStatement(table.headers)).toBe(true);
    expect(detectPreset(table.headers)).toBe("trade_republic_statement");
  });

  it("liest alle Zeilen und ordnet die Typen zu", () => {
    expect(result.skipped).toEqual([]);
    expect(result.candidates.map((c) => c.type)).toEqual([
      "DEPOSIT",
      "BUY",
      "INTEREST",
      "SAVINGS_PLAN",
      "DIVIDEND",
      "WITHDRAWAL",
      "SELL",
      "TAX",
      "TAX",
      "DEPOSIT",
      "WITHDRAWAL",
    ]);
  });

  it("trennt beim Handel 1 € Gebühr vom Kurswert, Sparpläne sind kostenlos", () => {
    const [buy, plan, sell] = result.candidates.filter((c) => c.quantity && c.type !== "DIVIDEND");
    expect(buy).toMatchObject({
      type: "BUY",
      isin: "US0378331005",
      name: "APPLE INC.",
      quantity: "2",
      amount: "420",
      price: "210",
      fee: "1",
    });
    expect(plan).toMatchObject({ type: "SAVINGS_PLAN", quantity: "0.373134", amount: "50", fee: "0" });
    expect(sell).toMatchObject({ type: "SELL", quantity: "1", amount: "230", fee: "1" });
    expect(result.notes?.[0]).toMatch(/2 Käufe\/Verkäufe/);
  });

  it("bucht Steuern mit Vorzeichen (Erstattung negativ) und lesbarer Notiz", () => {
    const taxes = result.candidates.filter((c) => c.type === "TAX");
    expect(taxes.map((t) => [t.amount, t.note])).toEqual([
      ["0.52", "Steuerkorrektur Apple"],
      ["-2.1", "Steueroptimierung"],
    ]);
  });

  it("ergibt genau den Endsaldo des Kontoauszugs als Cash", () => {
    expect(result.statement).toEqual({ from: "2026-03-02", to: "2026-08-15", opening: "0.00", closing: "1540.16", consistent: true });
    const { ledger, ids } = ledgerOf(result.candidates);
    expect(ledger.cashEUR.toFixed(2)).toBe("1540.16");
    expect(ledger.issues).toEqual([]);
    const apple = ledger.positions.get(ids.get("US0378331005")!)!;
    expect(apple.quantity.toString()).toBe("1");
    expect(apple.costEUR.toFixed(2)).toBe("210.50");
    expect(ledger.realizedEUR.toFixed(2)).toBe("18.50");
    expect(ledger.positions.get(ids.get("IE00BJ0KDQ92")!)!.costEUR.toFixed(2)).toBe("50.00");
    expect(ledger.taxesEUR.toFixed(2)).toBe("-1.58");
    expect(ledger.depositsEUR.toFixed(2)).toBe("2001.00");
    expect(ledger.withdrawalsEUR.toFixed(2)).toBe("223.90");
  });

  it("verträgt absteigend sortierte Dateien und meldet Lücken im Saldo", () => {
    const [header, ...lines] = CSV.trim().split("\n");
    const descending = parseTradeRepublicStatement(parseCsv([header, ...[...lines].reverse()].join("\n")));
    expect(descending.statement).toMatchObject({ opening: "0.00", closing: "1540.16", consistent: true });
    const gap = parseTradeRepublicStatement(parseCsv([header, ...lines.filter((_, i) => i !== 2)].join("\n")));
    expect(gap.statement?.consistent).toBe(false);
  });

  it("erkennt einen Auszug, der nicht bei Kontoeröffnung beginnt", () => {
    const [header, ...lines] = CSV.trim().split("\n");
    const later = parseTradeRepublicStatement(parseCsv([header, ...lines.slice(2)].join("\n")));
    expect(later.statement?.opening).toBe("1579.00");
  });

  it("kürzt Börsennamen auf den Firmennamen", () => {
    expect(cleanTrName("RUBRIK INC. A DL-,001")).toBe("RUBRIK INC.");
    expect(cleanTrName("META PLATF. A DL-,000006")).toBe("META PLATF.");
    expect(cleanTrName("SERVICENOW INC. DL-,001")).toBe("SERVICENOW INC.");
    expect(cleanTrName("Xtrackers MSCI World UCITS ETF 1C")).toBe("Xtrackers MSCI World UCITS ETF 1C");
  });
});
