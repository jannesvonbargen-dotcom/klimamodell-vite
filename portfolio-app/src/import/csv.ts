import Papa from "papaparse";

export interface CsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
  delimiter: string;
}

/** Dekodiert Dateiinhalt: UTF-8 (mit/ohne BOM), sonst Windows-1252. */
export function decodeBytes(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return new TextDecoder("windows-1252").decode(buffer);
}

/** Parst CSV-Text; Trennzeichen (Komma, Semikolon, Tab) wird erkannt. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [";", ",", "\t", "|"],
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (result.meta.fields ?? []).filter((h) => h !== "");
  return { headers, rows: result.data, delimiter: result.meta.delimiter };
}
