import { describe, expect, it } from "vitest";
import { computeLedger } from "@/domain/ledger";
import type { Transaction } from "@/domain/types";
import { parseCsv } from "./csv";
import { detectPreset, normalizeGeneric, parseDateValue, suggestMapping } from "./generic";
import { isTradeRepublicExport, parseTradeRepublic, trTimestamp } from "./trade-republic";
import type { ImportCandidate } from "./types";

const TR_CSV = `"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"
"2026-04-01T08:00:00.000Z","2026-04-01","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","1000.00","","","EUR","","","","Einzahlung","t1","","","",""
"2026-04-02T07:31:12.120Z","2026-04-02","DEFAULT","TRADING","BUY","STOCK","Apple Inc.","US0378331005","2","210.50","-421.00","-1.00","","EUR","","","","Kauf Apple","t2","","","",""
"2026-04-02T09:15:00.000Z","2026-04-02","DEFAULT","TRADING","BUY","FUND","iShares Core MSCI World","IE00B4L5Y983","0.452488","110.50","-50.00","","","EUR","","","","Savings plan execution","t3","","","",""
"2026-05-15T00:00:00.000Z","2026-05-15","DEFAULT","CASH","DIVIDEND","STOCK","Apple Inc.","US0378331005","2","","0.44","","-0.12","EUR","0.52","USD","1.18","Dividende","t4","","","",""
"2026-05-20T12:00:00.000Z","2026-05-20","DEFAULT","CASH","CARD_TRANSACTION","","","","","","-23.90","","","EUR","","","","Supermarkt","t5","","","","5411"
"2026-06-01T10:00:00.000Z","2026-06-01","DEFAULT","TRADING","SELL","STOCK","Apple Inc.","US0378331005","1","230.00","230.00","-1.00","-4.50","EUR","","","","Verkauf","t6","","","",""
"2026-06-30T22:00:00.000Z","2026-06-30","DEFAULT","CASH","INTEREST_PAYMENT","","","","","","1.20","","-0.32","EUR","","","","Zinsen","t7","","","",""
"2026-07-01T10:00:00.000Z","2026-07-01","DEFAULT","CASH","TAX_OPTIMIZATION","","","","","","0","","2.10","EUR","","","","Steueroptimierung","t8","","","",""
"2026-07-02T10:00:00.000Z","2026-07-02","DEFAULT","CORPORATE_ACTION","SPLIT","STOCK","Apple Inc.","US0378331005","4","","","","","EUR","","","","Split","t9","","","",""`;

const TR_SEMICOLON = `datetime;category;type;name;symbol;shares;price;amount;fee;tax;currency;description;transaction_id;account_type;value_date
2026-04-01T08:00:00.000Z;CASH;CUSTOMER_INPAYMENT;;;;;500.00;;;EUR;Einzahlung;x1;DEFAULT;2026-04-01
2026-04-03T08:30:00.000Z;TRADING;BUY;SAP SE;DE0007164600;2;230.10;-460.20;-1.00;;EUR;Kauf;x2;DEFAULT;2026-04-07`;

const PYTR_DE = `Datum;Typ;Wert;Notiz;ISIN;Stück;Gebühren;Steuern
2026-01-02T09:00:00;Einlage;1.000,00;Einzahlung;;;;
2026-01-05T10:12:44;Kauf;-501,00;Apple;US0378331005;2,5;-1,00;
2026-02-10T08:00:00;Dividende;0,48;Apple;US0378331005;2,5;;-0,12
2026-03-01T12:00:00;Verkauf;249,00;Apple;US0378331005;1;-1,00;
2026-03-02T12:00:00;Steuerrückerstattung;3,20;Steuer;;;;`;

const PP_DE = `Datum;Typ;Wert;Buchungswährung;Bruttobetrag;Währung Bruttobetrag;Wechselkurs;Gebühren;Steuern;Stück;ISIN;WKN;Ticker-Symbol;Wertpapiername;Notiz
15.03.2025;Kauf;-1.234,56;EUR;;;;1,00;;10;DE0007164600;716460;SAP.DE;SAP SE;
20.05.2025;Dividende;16,20;EUR;;;;;5,80;10;DE0007164600;716460;SAP.DE;SAP SE;`;

function asTransactions(candidates: ImportCandidate[]): Transaction[] {
  const ids = new Map<string, number>();
  return candidates.map((c, i) => {
    const key = c.isin ?? c.symbol ?? "";
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
}

describe("Trade-Republic-Transaktionsexport", () => {
  it("erkennt den Export an der Kopfzeile", () => {
    expect(isTradeRepublicExport(parseCsv(TR_CSV).headers)).toBe(true);
    expect(detectPreset(parseCsv(TR_SEMICOLON).headers)).toBe("trade_republic");
  });

  it("wandelt UTC-Zeiten in Berliner Zeit um", () => {
    expect(trTimestamp("2026-04-02T07:31:12.120Z")).toBe("2026-04-02T09:31");
    expect(trTimestamp("2026-01-15T07:31:00Z")).toBe("2026-01-15T08:31");
    expect(trTimestamp("2026-05-15T00:00:00.000Z")).toBe("2026-05-15");
  });

  it("liest Käufe, Sparpläne, Dividenden, Karte, Verkäufe, Zinsen und Steuern", () => {
    const { candidates, skipped } = parseTradeRepublic(parseCsv(TR_CSV));
    expect(candidates.map((c) => c.type)).toEqual(["DEPOSIT", "BUY", "SAVINGS_PLAN", "DIVIDEND", "WITHDRAWAL", "SELL", "INTEREST", "TAX"]);
    const buy = candidates[1];
    expect(buy).toMatchObject({
      isin: "US0378331005",
      quantity: "2",
      price: "210.5",
      amount: "421",
      fee: "1",
      tax: "0",
      executedAt: "2026-04-02T09:31",
    });
    const div = candidates[3];
    expect(div).toMatchObject({ amount: "0.44", tax: "0.12", quantity: "2" });
    const tax = candidates[7];
    expect(tax.amount).toBe("-2.1");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/Split/);
  });

  it("ergibt dieselbe Kassenwirkung wie amount + fee + tax", () => {
    const { candidates } = parseTradeRepublic(parseCsv(TR_CSV));
    const ledger = computeLedger(asTransactions(candidates));
    // 1000 − 422 − 50 + 0,32 − 23,90 + 224,50 + 0,88 + 2,10
    expect(ledger.cashEUR.toString()).toBe("731.9");
    expect(ledger.positions.get(1)!.quantity.toString()).toBe("1");
  });

  it("unterstützt das ältere Semikolon-Format", () => {
    const { candidates } = parseTradeRepublic(parseCsv(TR_SEMICOLON));
    expect(candidates.map((c) => c.type)).toEqual(["DEPOSIT", "BUY"]);
    expect(candidates[1]).toMatchObject({ isin: "DE0007164600", quantity: "2", amount: "460.2", fee: "1" });
  });
});

describe("Generischer Import", () => {
  it("erkennt pytr und rechnet den Nettobetrag in Kurswert um", () => {
    const table = parseCsv(PYTR_DE);
    expect(detectPreset(table.headers)).toBe("pytr");
    const mapping = suggestMapping(table, "pytr");
    expect(mapping.numberFormat).toBe("de");
    expect(mapping.columns).toMatchObject({
      date: "Datum",
      type: "Typ",
      amount: "Wert",
      isin: "ISIN",
      shares: "Stück",
      fee: "Gebühren",
      tax: "Steuern",
    });
    const { candidates, skipped } = normalizeGeneric(table, mapping);
    expect(skipped).toHaveLength(0);
    expect(candidates.map((c) => c.type)).toEqual(["DEPOSIT", "BUY", "DIVIDEND", "SELL", "TAX"]);
    expect(candidates[1]).toMatchObject({ quantity: "2.5", amount: "500", fee: "1", price: "200" });
    expect(candidates[2]).toMatchObject({ amount: "0.6", tax: "0.12" });
    expect(candidates[3]).toMatchObject({ amount: "250", fee: "1" });
    expect(candidates[4].amount).toBe("-3.2");
    const ledger = computeLedger(asTransactions(candidates));
    // 1000 − 501 + 0,48 + 249 + 3,20
    expect(ledger.cashEUR.toString()).toBe("751.68");
  });

  it("erkennt den CSV-Export von Portfolio Performance", () => {
    const table = parseCsv(PP_DE);
    expect(detectPreset(table.headers)).toBe("portfolio_performance");
    const mapping = suggestMapping(table, "portfolio_performance");
    expect(mapping.columns.name).toBe("Wertpapiername");
    expect(mapping.columns.symbol).toBe("Ticker-Symbol");
    const { candidates } = normalizeGeneric(table, mapping);
    expect(candidates[0]).toMatchObject({
      type: "BUY",
      executedAt: "2025-03-15",
      quantity: "10",
      amount: "1233.56",
      fee: "1",
      wkn: "716460",
    });
    expect(candidates[1]).toMatchObject({ type: "DIVIDEND", amount: "22", tax: "5.8" });
  });

  it("parst verschiedene Datumsformate und lehnt ungültige ab", () => {
    expect(parseDateValue("03.10.2026")).toBe("2026-10-03");
    expect(parseDateValue("3.1.26")).toBe("2026-01-03");
    expect(parseDateValue("2026-10-03 14:05:00")).toBe("2026-10-03T14:05");
    expect(parseDateValue("10/03/2026", "us")).toBe("2026-10-03");
    expect(parseDateValue("31.02.2026")).toBeNull();
    expect(parseDateValue("morgen")).toBeNull();
  });
});
