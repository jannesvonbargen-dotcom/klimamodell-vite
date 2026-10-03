import type { TransactionType } from "@/domain/types";

/** Eine aus einer CSV-Zeile gewonnene, noch nicht gespeicherte Transaktion. */
export interface ImportCandidate {
  /** Zeilennummer in der Datei (1 = Kopfzeile). */
  row: number;
  type: TransactionType;
  /** Lokale Berliner Zeit "YYYY-MM-DDTHH:mm" oder Datum "YYYY-MM-DD". */
  executedAt: string;
  isin: string | null;
  wkn: string | null;
  symbol: string | null;
  name: string | null;
  /** Kryptowerte haben keine ISIN. */
  assetClass: "STOCK" | "ETF" | "CRYPTO" | "BOND" | null;
  quantity: string | null;
  price: string | null;
  /** Bruttobetrag (Kurswert bzw. Dividende brutto, Ein-/Auszahlungsbetrag), positiv; bei TAX mit Vorzeichen. */
  amount: string | null;
  currency: string;
  fxRate: string;
  fee: string;
  tax: string;
  note: string | null;
  externalId: string | null;
  warnings: string[];
}

export interface SkippedRow {
  row: number;
  reason: string;
  raw: string;
  /** Folgeaktion, die die App anbieten kann (z. B. Split auf der Positionsseite erfassen). */
  action?: { kind: "split"; isin: string; date: string };
}

/** Gegenprobe über den laufenden Saldo eines Kontoauszugs. */
export interface StatementBalance {
  from: string;
  to: string;
  /** Saldo vor der ersten Buchung der Datei (0 = Auszug beginnt bei Kontoeröffnung). */
  opening: string;
  /** Saldo nach der letzten Buchung. */
  closing: string;
  /** Jede Zeile ergibt sich aus Vorzeile + Betrag. */
  consistent: boolean;
}

export interface ParseResult {
  candidates: ImportCandidate[];
  skipped: SkippedRow[];
  statement?: StatementBalance;
  /** Hinweise zu Annahmen beim Einlesen (z. B. angenommene Gebühren). */
  notes?: string[];
}

export const IMPORT_FIELDS = [
  "date",
  "time",
  "type",
  "isin",
  "wkn",
  "symbol",
  "name",
  "shares",
  "price",
  "amount",
  "fee",
  "tax",
  "currency",
  "fxRate",
  "note",
  "externalId",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  date: "Datum",
  time: "Uhrzeit",
  type: "Typ",
  isin: "ISIN",
  wkn: "WKN",
  symbol: "Ticker",
  name: "Name",
  shares: "Stück",
  price: "Kurs",
  amount: "Betrag",
  fee: "Gebühren",
  tax: "Steuern",
  currency: "Währung",
  fxRate: "Wechselkurs",
  note: "Notiz",
  externalId: "Transaktions-ID",
};

export const REQUIRED_FIELDS: readonly ImportField[] = ["date", "type", "amount"];

/** Spaltenzuordnung eines generischen Imports. */
export interface ColumnMapping {
  columns: Partial<Record<ImportField, string>>;
  /** "net" = Betrag ist die Kassenwirkung inkl. Gebühren/Steuern (Portfolio Performance, pytr); "gross" = Kurswert. */
  amountMode: "net" | "gross";
  numberFormat: "auto" | "de" | "en";
  /** Wert der Typ-Spalte → Transaktionstyp (oder "IGNORE"). */
  typeMap: Record<string, TransactionType | "IGNORE">;
  /** Datumsformat der Datei. */
  dateFormat: "auto" | "iso" | "de" | "us";
  defaultCurrency: string;
}

export type PresetId = "trade_republic" | "trade_republic_statement" | "pytr" | "portfolio_performance" | "app_backup" | "custom";

export const PRESET_LABELS: Record<PresetId, string> = {
  trade_republic: "Trade Republic – Transaktionsexport",
  trade_republic_statement: "Trade Republic – Kontoauszug",
  pytr: "pytr – export_transactions",
  portfolio_performance: "Portfolio Performance – CSV-Export",
  app_backup: "CSV-Sicherung dieser App",
  custom: "Eigenes Format",
};
