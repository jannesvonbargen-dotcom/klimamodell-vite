import { d, parseLocaleNumber, ZERO } from "@/domain/decimal";
import { wallTime } from "@/domain/market-hours";
import type { CsvTable } from "./csv";
import type { ImportCandidate, ParseResult, SkippedRow } from "./types";

/**
 * Transaktionsexport der Trade-Republic-App (seit April 2026; Profil →
 * Kontoauszüge → Transaktionsexport). Spalten u. a.: datetime, category,
 * type, name, symbol (= ISIN), shares, price, amount, fee, tax, currency,
 * description, transaction_id, optional asset_class, original_amount,
 * original_currency, fx_rate.
 *
 * Semantik nach dem TradeRepublicCSVExtractor von Portfolio Performance:
 * Kassenwirkung = amount + fee + tax (alle mit Vorzeichen, Kosten negativ),
 * Zeiten in UTC, Zahlen mit Punkt als Dezimaltrenner.
 */

export function isTradeRepublicExport(headers: string[]): boolean {
  const h = new Set(headers.map((x) => x.toLowerCase()));
  return ["datetime", "category", "type", "amount", "currency"].every((c) => h.has(c));
}

const DEPOSIT_TYPES = new Set(["CUSTOMER_INBOUND", "CUSTOMER_INPAYMENT", "TRANSFER_INBOUND", "TRANSFER_INSTANT_INBOUND"]);
const WITHDRAWAL_TYPES = new Set(["CUSTOMER_OUTBOUND_REQUEST"]);
const DIVIDEND_TYPES = new Set(["DIVIDEND", "DISTRIBUTION", "DIVIDEND_EQUIVALENT_PAYMENT"]);
/** Geldbewegungen, deren Richtung sich aus dem Vorzeichen ergibt (Karte, Prämien, Überweisungen …). */
const BY_SIGN_TYPES = new Set([
  "ADDITIONAL_INCOME",
  "BENEFITS_SAVEBACK",
  "BOND_ACCRUED_INTEREST",
  "BONUS",
  "CAPITAL_INC_CASH",
  "CARD_ORDERING_FEE",
  "CARD_TRANSACTION",
  "CARD_TRANSACTION_INTERNATIONAL",
  "CARD_TRANSACTION_REFUND",
  "CARD_TRANSACTION_REFUND_REVERSAL",
  "CFD_ORDER",
  "CITI_TRADING",
  "COMPENSATION",
  "CRYPTO_TRADING",
  "CUSTOMER_INPAYMENT_REVERSAL",
  "EARLY_REDEMPTION",
  "EXCHANGE",
  "FEE",
  "GENERAL_INBOUND",
  "GIFT",
  "INSTRUCTION",
  "KINDERGELD_BONUS",
  "LIQUIDATION_PROCEEDS",
  "MANUAL",
  "MANUAL_CASH_TRANSFER",
  "MERGER",
  "OFFER",
  "OTHER_EXECUTION",
  "PAYMENT",
  "PEA_MARKETING",
  "REFERRAL",
  "STOCKPERK",
  "TAX",
  "TRADING_CITI",
  "TRANSFER_DIRECT_DEBIT_INBOUND",
  "TRANSFER_IN",
  "TRANSFER_INSTANT_OUTBOUND",
  "TRANSFER_OUT",
  "TRANSFER_OUTBOUND",
  "VIBAN_TRANSFER_INBOUND",
  "VIBAN_TRANSFER_OUTBOUND",
]);

const BY_SIGN_LABELS: Record<string, string> = {
  CARD_TRANSACTION: "Kartenzahlung",
  CARD_TRANSACTION_INTERNATIONAL: "Kartenzahlung (international)",
  CARD_TRANSACTION_REFUND: "Kartenerstattung",
  BENEFITS_SAVEBACK: "Saveback",
  REFERRAL: "Empfehlungsprämie",
  BONUS: "Bonus",
  FEE: "Gebühr",
  CARD_ORDERING_FEE: "Kartengebühr",
};

/** "2026-03-02T09:15:12.120Z" (UTC) → Berliner Ortszeit; 00:00:00 bedeutet „nur Datum“. */
export function trTimestamp(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const instant = new Date(v);
  if (Number.isNaN(instant.getTime())) return null;
  if (/T00:00:00(\.0+)?Z$/.test(v)) return v.slice(0, 10);
  const wt = wallTime(instant, "Europe/Berlin");
  const hh = String(Math.floor(wt.minutes / 60)).padStart(2, "0");
  const mm = String(wt.minutes % 60).padStart(2, "0");
  return `${wt.date}T${hh}:${mm}`;
}

function num(value: string | undefined): ReturnType<typeof d> {
  if (!value) return ZERO;
  return parseLocaleNumber(value, "en") ?? ZERO;
}

export function parseTradeRepublic(table: CsvTable): ParseResult {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedRow[] = [];
  const lower = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v ?? ""]));

  table.rows.forEach((raw, index) => {
    const rowNo = index + 2;
    const r = lower(raw);
    const category = (r.category ?? "").toUpperCase();
    const type = (r.type ?? "").toUpperCase();
    const executedAt = trTimestamp(r.datetime ?? "");
    const rawText = Object.values(raw).join(" · ");
    if (!executedAt) {
      skipped.push({ row: rowNo, reason: "Datum nicht lesbar", raw: rawText });
      return;
    }
    const amount = num(r.amount);
    const feeRaw = num(r.fee);
    const taxRaw = num(r.tax);
    const shares = num(r.shares).abs();
    const price = num(r.price);
    const currency = (r.currency || "EUR").toUpperCase();
    const assetClass = (r.asset_class ?? "").toUpperCase();
    const isCrypto = assetClass === "CRYPTO";
    const symbol = r.symbol?.trim() || null;
    const description = r.description?.trim() || null;
    const base: Omit<ImportCandidate, "type" | "quantity" | "price" | "amount" | "fee" | "tax"> = {
      row: rowNo,
      executedAt,
      isin: !isCrypto && symbol ? symbol.toUpperCase() : null,
      wkn: null,
      symbol: isCrypto && symbol ? symbol.toUpperCase() : null,
      name: r.name?.trim() || null,
      assetClass: isCrypto ? "CRYPTO" : assetClass === "ETF" || assetClass === "FUND" ? "ETF" : assetClass === "BOND" ? "BOND" : assetClass ? "STOCK" : null,
      currency,
      fxRate: "1",
      note: description,
      externalId: r.transaction_id?.trim() || null,
      warnings: [],
    };

    const trade = (side: "BUY" | "SELL") => {
      if (shares.isZero()) {
        skipped.push({ row: rowNo, reason: "Trade ohne Stückzahl", raw: rawText });
        return;
      }
      const savingsPlan = side === "BUY" && !!description && (/^savings plan/i.test(description) || /sparplan/i.test(description));
      const gross = amount.abs();
      candidates.push({
        ...base,
        type: savingsPlan ? "SAVINGS_PLAN" : side,
        quantity: shares.toString(),
        price: price.gt(0) ? price.toString() : gross.div(shares).toDecimalPlaces(6).toString(),
        amount: gross.toString(),
        fee: feeRaw.abs().toString(),
        tax: taxRaw.abs().toString(),
      });
    };

    const cash = (kind: ImportCandidate["type"], value: ReturnType<typeof d>, extra: Partial<ImportCandidate> = {}) => {
      candidates.push({ ...base, type: kind, quantity: null, price: null, amount: value.toString(), fee: "0", tax: "0", ...extra });
    };

    if (category === "TRADING") {
      if (type === "BUY" || type === "SELL") trade(type);
      else skipped.push({ row: rowNo, reason: `Nicht unterstützt: ${category} ${type}`, raw: rawText });
      return;
    }

    if (category === "CORPORATE_ACTION") {
      if (type === "SPLIT") skipped.push({ row: rowNo, reason: "Aktiensplit – bitte in der Positionsansicht als Split erfassen", raw: rawText });
      else skipped.push({ row: rowNo, reason: `Kapitalmaßnahme ${type} – Geldbetrag steht in einer eigenen Zeile`, raw: rawText });
      return;
    }

    if (category !== "CASH") {
      skipped.push({ row: rowNo, reason: `Unbekannte Kategorie ${category || "–"}`, raw: rawText });
      return;
    }

    if (type === "PRIVATE_MARKET_BUY") return trade("BUY");
    if (type === "PRIVATE_MARKET_SELL" || type === "FINAL_MATURITY" || type === "TILG") {
      if (shares.isZero()) {
        skipped.push({ row: rowNo, reason: `${type} ohne Stückzahl`, raw: rawText });
        return;
      }
      return trade("SELL");
    }

    if (DIVIDEND_TYPES.has(type)) {
      if (amount.lt(0)) {
        skipped.push({ row: rowNo, reason: "Dividendenkorrektur (Storno) – bitte die ursprüngliche Dividende prüfen", raw: rawText });
        return;
      }
      // amount = Brutto, tax/fee negativ → netto = amount + fee + tax
      return cash("DIVIDEND", amount, { quantity: shares.isZero() ? null : shares.toString(), fee: feeRaw.abs().toString(), tax: taxRaw.abs().toString() });
    }

    if (type === "INTEREST_PAYMENT") {
      const hasSecurity = !!base.name && !!symbol;
      return cash(hasSecurity ? "DIVIDEND" : "INTEREST", amount.abs(), { tax: taxRaw.abs().toString(), fee: feeRaw.abs().toString() });
    }

    if (DEPOSIT_TYPES.has(type)) return cash("DEPOSIT", amount.abs(), { fee: feeRaw.abs().toString() });
    if (WITHDRAWAL_TYPES.has(type)) return cash("WITHDRAWAL", amount.abs());

    if (type === "EARNINGS") {
      const total = amount.plus(taxRaw);
      if (total.isZero()) return;
      // Negativ = Vorabpauschale (Steuer), positiv = Ertrag
      if (total.lt(0)) return cash("TAX", total.abs(), { note: description ?? "Vorabpauschale" });
      return cash("DIVIDEND", amount.abs(), { tax: taxRaw.abs().toString() });
    }

    if (type === "TAX_OPTIMIZATION" || type === "PRE_DETERMINED_TAX_BASE" || type === "SEC_ACCOUNT") {
      if (taxRaw.isZero()) return;
      // tax > 0 = Erstattung → als negative Steuer
      return cash("TAX", taxRaw.neg(), { note: description ?? (taxRaw.gt(0) ? "Steuererstattung" : "Steuer") });
    }

    if (BY_SIGN_TYPES.has(type)) {
      if (amount.isZero()) return;
      const label = BY_SIGN_LABELS[type];
      return cash(amount.gt(0) ? "DEPOSIT" : "WITHDRAWAL", amount.abs(), { note: [label, description].filter(Boolean).join(" – ") || null });
    }

    skipped.push({ row: rowNo, reason: `Nicht unterstützt: ${category} ${type}`, raw: rawText });
  });

  return { candidates, skipped };
}
