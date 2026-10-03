import { d, type NumberFormatHint, parseLocaleNumber, ZERO } from "@/domain/decimal";
import type { TransactionType } from "@/domain/types";
import type { CsvTable } from "./csv";
import type { ColumnMapping, ImportCandidate, ImportField, ParseResult, PresetId, SkippedRow } from "./types";

/**
 * Generischer CSV-Import mit Spaltenzuordnung. Vorlagen für pytr
 * (export_transactions, Semikolon, lokalisierte Spalten) und den
 * CSV-Export von Portfolio Performance.
 */

/** Spaltennamen-Synonyme (klein geschrieben) je Feld. */
const SYNONYMS: Record<ImportField, string[]> = {
  date: ["datum", "date", "buchungstag", "handelstag", "valuta", "datetime", "zeitpunkt", "ausführungsdatum"],
  time: ["uhrzeit", "time", "zeit"],
  type: ["typ", "type", "transaktionstyp", "art", "vorgang", "buchungsart", "transaction type"],
  isin: ["isin"],
  wkn: ["wkn"],
  symbol: ["ticker-symbol", "ticker", "symbol", "tickersymbol"],
  name: ["wertpapiername", "name", "wertpapier", "bezeichnung", "security", "titel"],
  shares: ["stück", "stueck", "anzahl", "shares", "quantity", "menge", "stückzahl"],
  price: ["kurs", "price", "preis", "ausführungskurs", "kurs je stück"],
  amount: ["wert", "value", "betrag", "amount", "gesamtbetrag", "total"],
  fee: ["gebühren", "gebuehren", "gebühr", "fees", "fee", "provision"],
  tax: ["steuern", "steuer", "taxes", "tax"],
  currency: ["buchungswährung", "währung", "currency", "waehrung"],
  fxRate: ["wechselkurs", "exchange rate", "fx rate", "devisenkurs"],
  note: ["notiz", "note", "beschreibung", "description", "verwendungszweck", "kommentar"],
  externalId: ["transaktions-id", "transaction_id", "id", "referenz", "auftragsnummer"],
};

/** Werte der Typ-Spalte (Deutsch/Englisch, PP/pytr) → Transaktionstyp. */
const TYPE_SYNONYMS: Record<string, TransactionType> = {
  kauf: "BUY",
  buy: "BUY",
  einlieferung: "BUY",
  "delivery (inbound)": "BUY",
  verkauf: "SELL",
  sell: "SELL",
  auslieferung: "SELL",
  "delivery (outbound)": "SELL",
  dividende: "DIVIDEND",
  dividend: "DIVIDEND",
  ausschüttung: "DIVIDEND",
  ertrag: "DIVIDEND",
  einlage: "DEPOSIT",
  einzahlung: "DEPOSIT",
  deposit: "DEPOSIT",
  entnahme: "WITHDRAWAL",
  auszahlung: "WITHDRAWAL",
  removal: "WITHDRAWAL",
  withdrawal: "WITHDRAWAL",
  gebühren: "FEE",
  gebühr: "FEE",
  fees: "FEE",
  fee: "FEE",
  steuern: "TAX",
  steuer: "TAX",
  taxes: "TAX",
  tax: "TAX",
  zinsen: "INTEREST",
  interest: "INTEREST",
  sparplan: "SAVINGS_PLAN",
  "savings plan": "SAVINGS_PLAN",
  sparplanausführung: "SAVINGS_PLAN",
};

/** Typen, die als Erstattung (negative Steuer/Gebühr) gelten. */
const REFUND_SYNONYMS = new Set([
  "steuerrückerstattung",
  "steuererstattung",
  "tax refund",
  "gebührenerstattung",
  "fees refund",
  "zinsbelastung",
  "interest charge",
]);

export function suggestTypeMapping(value: string): TransactionType | "IGNORE" | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (TYPE_SYNONYMS[v]) return TYPE_SYNONYMS[v];
  if (v === "steuerrückerstattung" || v === "steuererstattung" || v === "tax refund") return "TAX";
  if (v === "gebührenerstattung" || v === "fees refund") return "FEE";
  for (const [key, type] of Object.entries(TYPE_SYNONYMS)) if (v.includes(key)) return type;
  return null;
}

export function detectPreset(headers: string[]): PresetId {
  const h = headers.map((x) => x.toLowerCase());
  const has = (...names: string[]) => names.every((n) => h.includes(n));
  if (has("datetime", "category", "type", "amount", "currency")) return "trade_republic";
  if (has("datum", "uhrzeit", "typ", "betrag", "wechselkurs", "transaktions-id", "quelle")) return "app_backup";
  if (has("buchungswährung") || has("wertpapiername") || has("ticker-symbol")) return "portfolio_performance";
  if ((has("datum", "typ", "wert") || has("date", "type", "value")) && (h.includes("isin") || h.includes("notiz") || h.includes("note")))
    return "pytr";
  return "custom";
}

/** Schlägt eine Spaltenzuordnung anhand der Kopfzeile vor. */
export function suggestMapping(table: CsvTable, preset: PresetId): ColumnMapping {
  const columns: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();
  for (const [field, names] of Object.entries(SYNONYMS) as Array<[ImportField, string[]]>) {
    const header = table.headers.find((h) => !used.has(h) && names.includes(h.toLowerCase()));
    if (header) {
      columns[field] = header;
      used.add(header);
    }
  }
  const typeMap: ColumnMapping["typeMap"] = {};
  if (columns.type) {
    for (const value of distinctValues(table, columns.type)) {
      const suggestion = suggestTypeMapping(value);
      typeMap[value] = suggestion ?? "IGNORE";
    }
  }
  return {
    columns,
    // PP und pytr: „Wert“ ist die Kassenwirkung inklusive Gebühren und Steuern
    amountMode: preset === "custom" || preset === "app_backup" ? "gross" : "net",
    numberFormat: preset === "app_backup" ? "de" : detectNumberFormat(table, columns),
    typeMap,
    dateFormat: "auto",
    defaultCurrency: "EUR",
  };
}

export function distinctValues(table: CsvTable, column: string, limit = 50): string[] {
  const values = new Set<string>();
  for (const row of table.rows) {
    const v = (row[column] ?? "").trim();
    if (v) values.add(v);
    if (values.size >= limit) break;
  }
  return [...values];
}

/** Erkennt das Zahlenformat an typischen Mustern wie "1.234,56" oder "12,5". */
export function detectNumberFormat(table: CsvTable, columns: Partial<Record<ImportField, string>>): NumberFormatHint {
  let de = 0;
  let en = 0;
  const cols = (["amount", "shares", "price", "fee", "tax"] as ImportField[]).map((f) => columns[f]).filter((c): c is string => !!c);
  for (const row of table.rows.slice(0, 200)) {
    for (const c of cols) {
      const v = (row[c] ?? "").replace(/[^\d.,]/g, "");
      if (/,\d{1,2}$/.test(v) || /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) de++;
      else if (/\.\d{1,2}$/.test(v) || /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v) || /\.\d{3,}$/.test(v)) en++;
    }
  }
  if (de === 0 && en === 0) return "auto";
  return de >= en ? "de" : "en";
}

/** Datum in verschiedenen Formaten → "YYYY-MM-DD" bzw. "YYYY-MM-DDTHH:mm". */
export function parseDateValue(raw: string, format: ColumnMapping["dateFormat"] = "auto", time?: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let date: string | null = null;
  let clock: string | null = null;
  let m: RegExpMatchArray | null;
  if ((format === "auto" || format === "iso") && (m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/))) {
    date = `${m[1]}-${m[2]}-${m[3]}`;
    if (m[4]) clock = `${m[4]}:${m[5]}`;
  } else if ((format === "auto" || format === "de") && (m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/))) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    date = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (m[4]) clock = `${m[4].padStart(2, "0")}:${m[5]}`;
  } else if ((format === "auto" || format === "us") && (m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
    date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (!date) return null;
  const [y, mo, da] = date.split("-").map(Number);
  const check = new Date(Date.UTC(y, mo - 1, da));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null;
  const t = time?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (t) clock = `${t[1].padStart(2, "0")}:${t[2]}`;
  if (clock && clock !== "00:00") return `${date}T${clock}`;
  return date;
}

export function normalizeGeneric(table: CsvTable, mapping: ColumnMapping): ParseResult {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedRow[] = [];
  const col = mapping.columns;
  const get = (row: Record<string, string>, field: ImportField) => (col[field] ? (row[col[field]!] ?? "").trim() : "");
  const n = (value: string) => (value ? parseLocaleNumber(value, mapping.numberFormat) : null);

  table.rows.forEach((row, index) => {
    const rowNo = index + 2;
    const rawText = Object.values(row).join(" · ");
    const executedAt = parseDateValue(get(row, "date"), mapping.dateFormat, get(row, "time"));
    if (!executedAt) {
      skipped.push({ row: rowNo, reason: "Datum nicht lesbar", raw: rawText });
      return;
    }
    const typeValue = get(row, "type");
    const lowerType = typeValue.toLowerCase();
    const mapped = mapping.typeMap[typeValue] ?? suggestTypeMapping(typeValue);
    if (!mapped || mapped === "IGNORE") {
      skipped.push({ row: rowNo, reason: typeValue ? `Typ „${typeValue}“ wird ignoriert` : "Kein Typ", raw: rawText });
      return;
    }
    const isRefund = REFUND_SYNONYMS.has(lowerType);
    const amountRaw = n(get(row, "amount"));
    const shares = n(get(row, "shares"))?.abs() ?? null;
    const priceRaw = n(get(row, "price"))?.abs() ?? null;
    const fee = n(get(row, "fee"))?.abs() ?? ZERO;
    const tax = n(get(row, "tax"))?.abs() ?? ZERO;
    const fx = n(get(row, "fxRate"));
    const currency = (get(row, "currency") || mapping.defaultCurrency || "EUR").toUpperCase();
    const isinRaw = get(row, "isin").toUpperCase();
    const base = {
      row: rowNo,
      executedAt,
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isinRaw) ? isinRaw : null,
      wkn: get(row, "wkn").toUpperCase() || null,
      symbol: get(row, "symbol") || null,
      name: get(row, "name") || null,
      assetClass: null,
      currency,
      // PP-Wechselkurse sind „Buchungswährung je Fremdwährung“; hier nur übernehmen, wenn Buchung in Fremdwährung
      fxRate: currency !== "EUR" && fx && fx.gt(0) ? fx.toString() : "1",
      note: get(row, "note") || null,
      externalId: get(row, "externalId") || null,
      warnings: [] as string[],
    };
    if (!amountRaw && !(shares && priceRaw)) {
      skipped.push({ row: rowNo, reason: "Kein Betrag", raw: rawText });
      return;
    }
    const absAmount = amountRaw?.abs() ?? ZERO;

    if (mapped === "BUY" || mapped === "SELL" || mapped === "SAVINGS_PLAN") {
      if (!shares || shares.isZero()) {
        skipped.push({ row: rowNo, reason: "Trade ohne Stückzahl", raw: rawText });
        return;
      }
      // Bruttokurswert aus dem Betrag herausrechnen, falls er die Kassenwirkung ist
      let gross: ReturnType<typeof d>;
      if (amountRaw && mapping.amountMode === "net")
        gross = mapped === "SELL" ? absAmount.plus(fee).plus(tax) : absAmount.minus(fee).minus(tax);
      else if (amountRaw) gross = absAmount;
      else gross = shares.times(priceRaw!).toDecimalPlaces(2);
      if (gross.lte(0)) {
        skipped.push({ row: rowNo, reason: "Kurswert ≤ 0", raw: rawText });
        return;
      }
      const price = priceRaw && priceRaw.gt(0) ? priceRaw : gross.div(shares).toDecimalPlaces(6);
      candidates.push({
        ...base,
        type: mapped,
        quantity: shares.toString(),
        price: price.toString(),
        amount: gross.toString(),
        fee: fee.toString(),
        tax: tax.toString(),
      });
      return;
    }

    if (mapped === "DIVIDEND" || mapped === "INTEREST") {
      const gross = mapping.amountMode === "net" ? absAmount.plus(fee).plus(tax) : absAmount;
      candidates.push({
        ...base,
        type: mapped,
        quantity: mapped === "DIVIDEND" && shares && !shares.isZero() ? shares.toString() : null,
        price: null,
        amount: gross.toString(),
        fee: fee.toString(),
        tax: tax.toString(),
      });
      return;
    }

    if (mapped === "TAX") {
      const signed = isRefund ? absAmount.neg() : absAmount;
      candidates.push({ ...base, type: "TAX", quantity: null, price: null, amount: signed.toString(), fee: "0", tax: "0" });
      return;
    }

    if (mapped === "FEE" && isRefund) {
      candidates.push({
        ...base,
        type: "DEPOSIT",
        quantity: null,
        price: null,
        amount: absAmount.toString(),
        fee: "0",
        tax: "0",
        note: base.note ?? "Gebührenerstattung",
      });
      return;
    }

    candidates.push({ ...base, type: mapped, quantity: null, price: null, amount: absAmount.toString(), fee: "0", tax: "0" });
  });

  return { candidates, skipped };
}
