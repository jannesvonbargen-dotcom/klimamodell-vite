import { d, type Dec, parseLocaleNumber, ZERO } from "@/domain/decimal";
import type { CsvTable } from "./csv";
import { parseDateValue } from "./generic";
import type { ImportCandidate, ParseResult, SkippedRow, StatementBalance } from "./types";

/**
 * Kontoauszug der Trade-Republic-App als CSV (Profil → Kontoauszüge →
 * Kontoauszug). Spalten: Datum; Typ; Beschreibung; ISIN; Stück;
 * Zahlungseingang (EUR); Zahlungsausgang (EUR); Betrag (EUR); Saldo (EUR).
 *
 * Der Kontoauszug nennt je Buchung nur die Kassenwirkung. Daraus folgt:
 * - Order-Gebühr: Trade Republic berechnet 1 € je Kauf/Verkauf (Sparpläne
 *   kostenlos). Sie steht nicht einzeln im Auszug und wird so angenommen;
 *   Einstand, Gewinne und Cash stimmen unabhängig davon.
 * - Beim Verkauf einbehaltene Steuern stecken im Erlös, Dividenden sind netto.
 * - Der laufende Saldo dient als Gegenprobe (Anfangs- und Endsaldo).
 */

const ORDER_FEE = d(1);

export function isTradeRepublicStatement(headers: string[]): boolean {
  const h = new Set(headers.map((x) => x.toLowerCase()));
  return ["datum", "typ", "beschreibung", "betrag (eur)"].every((c) => h.has(c)) && (h.has("saldo (eur)") || h.has("isin"));
}

const ISIN_IN_TEXT = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;

/** „RUBRIK INC. A DL-,001“ → „RUBRIK INC.“ (Nennwert- und Gattungskürzel der Börsennamen entfernen). */
export function cleanTrName(raw: string): string {
  return raw
    .replace(/\s+(?:[A-Z]\s+)?(?:DL|EO|SF|LS|YN|DK|NK|SK|HD|CD|AD|ZY)\s?-?,?[\d,.]*$/, "")
    .replace(/\s+O\.N\.?$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Name und Stückzahl aus „Buy trade US78… RUBRIK INC. A DL-,001, quantity: 1“. */
function describeTrade(description: string): { name: string | null; quantity: Dec | null } {
  const qty = description.match(/,\s*(?:quantity|anzahl|stück):\s*([\d.,]+)\s*$/i);
  let rest = qty ? description.slice(0, qty.index) : description;
  rest = rest.replace(/^(?:buy|sell|kauf|verkauf)(?:\s+trade|\s+order)?\s+/i, "").replace(/^savings plan execution\s+/i, "");
  // Der Name steht hinter der ISIN („Buy trade <ISIN> <Name>“, „Cash Dividend for <ISIN> <Name>“)
  const isin = rest.match(ISIN_IN_TEXT);
  if (isin) rest = rest.slice(isin.index! + isin[0].length);
  const name = rest.trim();
  return { name: name ? cleanTrName(name) : null, quantity: qty ? parseLocaleNumber(qty[1], "en") : null };
}

/** Steuerbuchungen lesbar machen: „Tax Recalculation US30… Meta Platforms (A) (Invoice No.: …)“ → „Steuerkorrektur Meta Platforms (A)“. */
function taxNote(description: string): string {
  const text = description
    .replace(/\(Invoice No\.?:[^)]*\)/i, "")
    .replace(ISIN_IN_TEXT, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text
    .replace(/^Tax Recalculation/i, "Steuerkorrektur")
    .replace(/^Tax Optimi[sz]ation/i, "Steueroptimierung")
    .replace(/^Withholding tax/i, "Quellensteuer");
}

export function parseTradeRepublicStatement(table: CsvTable): ParseResult {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedRow[] = [];
  const lower = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v ?? ""]));
  const balances: Array<{ date: string; amount: Dec; saldo: Dec | null }> = [];
  let assumedFees = 0;

  table.rows.forEach((raw, index) => {
    const rowNo = index + 2;
    const r = lower(raw);
    const rawText = Object.values(raw).join(" · ");
    const date = parseDateValue(r["datum"] ?? "", "de");
    if (!date) {
      skipped.push({ row: rowNo, reason: "Datum nicht lesbar", raw: rawText });
      return;
    }
    const typ = (r["typ"] ?? "").trim();
    const description = (r["beschreibung"] ?? "").trim();
    let amount = parseLocaleNumber(r["betrag (eur)"], "de");
    if (amount === null) {
      const inflow = parseLocaleNumber(r["zahlungseingang (eur)"], "de") ?? ZERO;
      const outflow = parseLocaleNumber(r["zahlungsausgang (eur)"], "de") ?? ZERO;
      amount = inflow.minus(outflow.abs());
    }
    balances.push({ date, amount, saldo: parseLocaleNumber(r["saldo (eur)"], "de") });
    if (amount.isZero()) return;

    const isin = (r["isin"] ?? "").trim().toUpperCase() || description.match(ISIN_IN_TEXT)?.[0] || null;
    const trade = describeTrade(description);
    const quantity = parseLocaleNumber(r["stück"], "de")?.abs() ?? trade.quantity?.abs() ?? null;
    const base = {
      row: rowNo,
      executedAt: date,
      isin,
      wkn: null,
      symbol: null,
      name: isin ? trade.name : null,
      assetClass: null,
      currency: "EUR",
      fxRate: "1",
      externalId: null,
      warnings: [],
    } satisfies Partial<ImportCandidate>;
    const cash = (type: ImportCandidate["type"], value: Dec, note: string | null, extra: Partial<ImportCandidate> = {}) => {
      candidates.push({ ...base, type, quantity: null, price: null, amount: value.toString(), fee: "0", tax: "0", note, ...extra });
    };

    const t = typ.toLowerCase();
    const isSavingsPlan = /sparplan|savings plan/i.test(`${typ} ${description}`);
    const isTrade =
      /^(handel|trade|trading|sparplan|savings plan)/i.test(typ) || /^(buy|sell|kauf|verkauf)\b/i.test(description) || isSavingsPlan;

    if (isTrade && isin && quantity && !quantity.isZero()) {
      const sell = /^(sell|verkauf)\b/i.test(description) || (!/^(buy|kauf)\b/i.test(description) && amount.gt(0));
      const fee = isSavingsPlan || amount.abs().lte(ORDER_FEE) ? ZERO : ORDER_FEE;
      if (fee.gt(0)) assumedFees++;
      // Kassenwirkung = Kurswert − Gebühr (Verkauf) bzw. −(Kurswert + Gebühr) (Kauf)
      const gross = sell ? amount.plus(fee) : amount.abs().minus(fee);
      candidates.push({
        ...base,
        type: sell ? "SELL" : isSavingsPlan ? "SAVINGS_PLAN" : "BUY",
        quantity: quantity.toString(),
        price: gross.div(quantity).toDecimalPlaces(6).toString(),
        amount: gross.toString(),
        fee: fee.toString(),
        tax: "0",
        note: null,
      });
      return;
    }
    if (isTrade) {
      skipped.push({ row: rowNo, reason: "Handel ohne ISIN oder Stückzahl – bitte von Hand erfassen", raw: rawText });
      return;
    }

    if (/zins|interest/i.test(t)) {
      return amount.gt(0) ? cash("INTEREST", amount, null) : cash("FEE", amount.abs(), "Negativzinsen");
    }
    if (/steuer|tax/i.test(t)) {
      // Kontoauszug: negativ = gezahlt, positiv = Erstattung → Steuerbuchung mit umgekehrtem Vorzeichen
      return cash("TAX", amount.neg(), taxNote(description) || "Steuer", { name: null });
    }
    if (/gebühr|fee/i.test(t)) {
      return amount.lt(0)
        ? cash("FEE", amount.abs(), description || null)
        : cash("DEPOSIT", amount, `Gebührenerstattung ${description}`.trim());
    }
    if (/dividend|ertr|ausschüttung|distribution/i.test(t) || /^(cash dividend|dividend|distribution|ausschüttung)/i.test(description)) {
      if (amount.lt(0)) return cash("TAX", amount.abs(), `Vorabpauschale/Steuer ${trade.name ?? isin ?? ""}`.trim());
      if (!isin) return cash("DEPOSIT", amount, `${typ}: ${description}`);
      return cash("DIVIDEND", amount, "Netto laut Kontoauszug", { quantity: quantity?.toString() ?? null });
    }
    // Überweisungen, Kartenzahlungen, Gutschriften …: Richtung aus dem Vorzeichen
    const note = /überweisung|transfer/i.test(t)
      ? description.replace(/^Incoming transfer from/i, "Überweisung von").replace(/^Outgoing transfer (?:for|to)/i, "Überweisung an") ||
        typ
      : [/karte|card/i.test(t) ? "Kartenzahlung" : typ, description].filter(Boolean).join(": ") || null;
    return cash(amount.gt(0) ? "DEPOSIT" : "WITHDRAWAL", amount.abs(), note);
  });

  return { candidates, skipped, statement: statementBalance(balances), notes: assumedFees ? [feeNote(assumedFees)] : [] };
}

function feeNote(count: number): string {
  return `Order-Gebühr: Für ${count} Käufe/Verkäufe ist je 1 € angenommen (Trade-Republic-Standard, im Kontoauszug nicht einzeln ausgewiesen). Einstand, Gewinne und Cash ändern sich dadurch nicht.`;
}

/** Anfangs- und Endsaldo aus der Saldo-Spalte – egal ob die Datei auf- oder absteigend sortiert ist. */
function statementBalance(rows: Array<{ date: string; amount: Dec; saldo: Dec | null }>): StatementBalance | undefined {
  if (rows.length === 0 || rows.some((r) => r.saldo === null)) return undefined;
  const ordered = rows[0].date > rows[rows.length - 1].date ? [...rows].reverse() : rows;
  let consistent = true;
  for (let i = 1; i < ordered.length; i++) {
    if (!ordered[i - 1].saldo!.plus(ordered[i].amount).minus(ordered[i].saldo!).abs().lt(0.005)) consistent = false;
  }
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    from: first.date,
    to: last.date,
    opening: first.saldo!.minus(first.amount).toFixed(2),
    closing: last.saldo!.toFixed(2),
    consistent,
  };
}
