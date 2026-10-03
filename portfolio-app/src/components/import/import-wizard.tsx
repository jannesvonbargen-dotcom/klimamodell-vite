"use client";

import { CheckCircle2Icon, FileSpreadsheetIcon, InfoIcon, TriangleAlertIcon, UploadCloudIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { commitImportAction, previewImportAction, restoreImportAction, undoImportAction } from "@/app/actions";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES, type TransactionType } from "@/domain/types";
import { type CsvTable, decodeBytes, parseCsv } from "@/import/csv";
import { detectPreset, distinctValues, normalizeGeneric, suggestMapping } from "@/import/generic";
import { parseTradeRepublic } from "@/import/trade-republic";
import { parseTradeRepublicStatement } from "@/import/trade-republic-statement";
import {
  type ColumnMapping,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type ParseResult,
  PRESET_LABELS,
  type PresetId,
  REQUIRED_FIELDS,
  type StatementBalance,
} from "@/import/types";
import { formatDate, formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommitResult, ImportOutcome, ImportPreview } from "@/server/import";
import { Segmented } from "../transaction-dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/input";
import { Badge, Card, Switch } from "../ui/misc";
import { Select } from "../ui/select";

type Step =
  | { name: "upload" }
  | { name: "mapping" }
  | { name: "preview"; preview: ImportPreview }
  | { name: "done"; result: CommitResult; preview: ImportPreview };

const NONE = "__none__";

/** Formate, die ohne Spaltenzuordnung eingelesen werden. */
const DIRECT: Partial<Record<PresetId, (table: CsvTable) => ParseResult>> = {
  trade_republic: parseTradeRepublic,
  trade_republic_statement: parseTradeRepublicStatement,
};

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ name: "upload" });
  const [fileName, setFileName] = React.useState("");
  const [table, setTable] = React.useState<CsvTable | null>(null);
  const [preset, setPreset] = React.useState<PresetId>("custom");
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [replaceDemo, setReplaceDemo] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Die Datei ist größer als 20 MB.");
      return;
    }
    const text = decodeBytes(await file.arrayBuffer());
    const csv = parseCsv(text);
    if (csv.headers.length < 2 || csv.rows.length === 0) {
      toast.error("Keine Tabelle erkannt. Ist das eine CSV-Datei mit Kopfzeile?");
      return;
    }
    setFileName(file.name);
    setTable(csv);
    const detected = detectPreset(csv.headers);
    setPreset(detected);
    const direct = DIRECT[detected];
    if (direct) {
      await runPreview(direct(csv), replaceDemo);
    } else {
      setMapping(suggestMapping(csv, detected));
      setStep({ name: "mapping" });
    }
  }

  async function runPreview(result: ParseResult, withoutDemo: boolean) {
    setBusy(true);
    try {
      setParsed(result);
      const preview = await previewImportAction(result.candidates, { replaceDemo: withoutDemo });
      setStep({ name: "preview", preview });
    } catch {
      toast.error("Vorschau fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDemo(value: boolean) {
    setReplaceDemo(value);
    if (parsed) await runPreview(parsed, value);
  }

  async function commit() {
    if (step.name !== "preview" || !parsed) return;
    setBusy(true);
    try {
      const result = await commitImportAction(parsed.candidates, fileName, preset, { replaceDemo: step.preview.demo.replaced });
      setStep({ name: "done", result, preview: step.preview });
      router.refresh();
      toast.success(`${result.imported} Buchungen importiert`, {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            await undoImportAction(result.batchId);
            router.refresh();
            toast("Import rückgängig gemacht", {
              action: { label: "Wiederherstellen", onClick: () => restoreImportAction(result.batchId).then(() => router.refresh()) },
            });
          },
        },
      });
    } catch {
      toast.error("Import fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep({ name: "upload" });
    setTable(null);
    setMapping(null);
    setParsed(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-6">
      {step.name === "upload" && (
        <div className="flex flex-col gap-4">
          <Card
            className={cn(
              "relative flex flex-col items-center gap-4 border-dashed border-border-strong px-6 py-12 text-center transition-colors duration-150",
              dragging && "border-accent bg-surface-2",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
          >
            <UploadCloudIcon className="size-9 text-subtle" strokeWidth={1.5} />
            <div className="flex flex-col gap-1">
              <p className="text-[17px] font-semibold">Trade-Republic-Datei hierher ziehen</p>
              <p className="text-[13px] text-muted">Kontoauszug oder Transaktionsexport als CSV – das Format wird automatisch erkannt.</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              id="csv-file"
              aria-label="CSV-Datei auswählen"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button variant="primary" size="lg" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "Wird gelesen …" : "Datei auswählen"}
            </Button>
            <p className="text-[12px] text-subtle">Die Datei bleibt auf diesem Rechner.</p>
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <HowTo n={1} title="Datei in der App holen">
              Trade Republic öffnen → <strong>Profil</strong> → <strong>Kontoauszüge</strong> → Kontoauszug als CSV (oder den
              Transaktionsexport).
            </HowTo>
            <HowTo n={2} title="Hier hineinziehen">
              Die Vorschau zeigt Cash, Positionen und Gewinne nach dem Import und gleicht den Saldo mit dem Kontoauszug ab.
            </HowTo>
            <HowTo n={3} title="Importieren">
              Doppelte Buchungen werden erkannt – neue Auszüge kannst du jederzeit nachladen, auch überlappend.
            </HowTo>
          </Card>
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-muted select-none hover:text-foreground">
              Andere Quellen: pytr, Portfolio Performance, eigene CSV-Dateien
            </summary>
            <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-3">
              <HelpCard title="pytr">
                <code className="rounded bg-surface-2 px-1">pytr export_transactions</code> erzeugt eine Semikolon-CSV im
                Portfolio-Performance-Format. Spalten und Typen werden vorgeschlagen.
              </HelpCard>
              <HelpCard title="Portfolio Performance">
                Den CSV-Export der Buchungen hier hineinziehen. Das Format wird erkannt, die Spaltenzuordnung ist vorausgefüllt.
              </HelpCard>
              <HelpCard title="Andere Broker">
                Jede CSV mit Kopfzeile funktioniert: Spalten und Typen zuordnen, Vorschau prüfen. Die CSV-Sicherung aus den{" "}
                <Link
                  href="/einstellungen"
                  className="text-accent underline decoration-accent/40 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-accent"
                >
                  Einstellungen
                </Link>{" "}
                wird automatisch erkannt.
              </HelpCard>
            </div>
          </details>
        </div>
      )}

      {step.name === "mapping" && table && mapping && (
        <MappingStep
          table={table}
          fileName={fileName}
          preset={preset}
          mapping={mapping}
          onChange={setMapping}
          onBack={reset}
          busy={busy}
          onNext={() => void runPreview(normalizeGeneric(table, mapping), replaceDemo)}
        />
      )}

      {step.name === "preview" && parsed && (
        <PreviewStep
          preview={step.preview}
          parsed={parsed}
          fileName={fileName}
          preset={preset}
          busy={busy}
          onToggleDemo={(v) => void toggleDemo(v)}
          onBack={() => (DIRECT[preset] ? reset() : setStep({ name: "mapping" }))}
          onCommit={commit}
        />
      )}

      {step.name === "done" && (
        <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <CheckCircle2Icon className="size-10 text-up" strokeWidth={1.5} />
          <div className="flex flex-col gap-1">
            <p className="text-[18px] font-semibold">{step.result.imported} Buchungen importiert</p>
            <p className="text-[13px] text-muted">
              Cash {formatMoney(step.preview.after.cashEUR)} · {positionCount(step.preview.after)}
              {step.result.skipped > 0 && ` · ${step.result.skipped} übersprungen (bereits vorhanden oder fehlerhaft)`}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" asChild>
              <Link href="/">Zur Übersicht</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              Weitere Datei
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function HowTo({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="tnum inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted">
        {n}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-medium">{title}</h2>
        <p className="text-[13px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

function HelpCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function positionCount(after: ImportOutcome): string {
  const n = after.positions.length;
  return n === 0 ? "keine offenen Positionen" : n === 1 ? "1 Position" : `${n} Positionen`;
}

function MappingStep({
  table,
  fileName,
  preset,
  mapping,
  onChange,
  onBack,
  onNext,
  busy,
}: {
  table: CsvTable;
  fileName: string;
  preset: PresetId;
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const columnOptions = [{ value: NONE, label: "— nicht vorhanden —" }, ...table.headers.map((h) => ({ value: h, label: h }))];
  const typeValues = mapping.columns.type ? distinctValues(table, mapping.columns.type) : [];
  const missing = REQUIRED_FIELDS.filter((f) => !mapping.columns[f]);
  const sample = table.rows.slice(0, 3);

  function setColumn(field: ImportField, value: string) {
    const columns = { ...mapping.columns, [field]: value === NONE ? undefined : value };
    let typeMap = mapping.typeMap;
    if (field === "type" && value !== NONE) {
      typeMap = {};
      for (const v of distinctValues(table, value)) typeMap[v] = mapping.typeMap[v] ?? "IGNORE";
    }
    onChange({ ...mapping, columns, typeMap });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheetIcon className="size-5 text-subtle" />
          <div className="leading-tight">
            <div className="text-[14px] font-medium">{fileName}</div>
            <div className="tnum text-[12px] text-subtle">
              {table.rows.length} Zeilen · Trennzeichen „{table.delimiter === "\t" ? "Tab" : table.delimiter}“
            </div>
          </div>
        </div>
        <Badge tone={preset === "custom" ? "neutral" : "accent"}>Erkannt: {PRESET_LABELS[preset]}</Badge>
      </Card>

      <Card className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Spalten zuordnen</h2>
          <p className="text-[13px] text-muted">
            Pflicht sind Datum, Typ und Betrag. Für Wertpapiere zusätzlich ISIN oder Ticker und Stückzahl.
          </p>
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {IMPORT_FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`map-${field}`}>
                {IMPORT_FIELD_LABELS[field]}
                {REQUIRED_FIELDS.includes(field) && <span className="text-down"> *</span>}
              </Label>
              <Select
                id={`map-${field}`}
                value={mapping.columns[field] ?? NONE}
                onValueChange={(v) => setColumn(field, v)}
                options={columnOptions}
                ariaLabel={IMPORT_FIELD_LABELS[field]}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Zahlenformat</Label>
            <Segmented
              value={mapping.numberFormat}
              onChange={(v) => onChange({ ...mapping, numberFormat: v })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "de", label: "1.234,56" },
                { value: "en", label: "1,234.56" },
              ]}
              ariaLabel="Zahlenformat"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Betrag ist …</Label>
            <Segmented
              value={mapping.amountMode}
              onChange={(v) => onChange({ ...mapping, amountMode: v })}
              options={[
                { value: "net", label: "Kassenwirkung" },
                { value: "gross", label: "Kurswert" },
              ]}
              ariaLabel="Bedeutung des Betrags"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Datumsformat</Label>
            <Segmented
              value={mapping.dateFormat}
              onChange={(v) => onChange({ ...mapping, dateFormat: v })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "de", label: "TT.MM.JJJJ" },
                { value: "iso", label: "JJJJ-MM-TT" },
              ]}
              ariaLabel="Datumsformat"
            />
          </div>
        </div>
      </Card>

      {typeValues.length > 0 && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">Typen zuordnen</h2>
            <p className="text-[13px] text-muted">
              Welcher Wert in der Spalte „{mapping.columns.type}“ entspricht welchem Transaktionstyp?
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {typeValues.map((value) => (
              <div key={value} className="flex items-center justify-between gap-3">
                <span className="truncate text-[14px]">{value}</span>
                <Select
                  value={mapping.typeMap[value] ?? "IGNORE"}
                  onValueChange={(v) => onChange({ ...mapping, typeMap: { ...mapping.typeMap, [value]: v as TransactionType | "IGNORE" } })}
                  options={[
                    { value: "IGNORE", label: "Ignorieren" },
                    ...TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] })),
                  ]}
                  ariaLabel={`Typ für ${value}`}
                  className="w-48"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-[13px] font-medium text-muted">Erste Zeilen der Datei</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {table.headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {table.headers.map((h) => (
                    <td key={h} className="tnum max-w-48 truncate px-3 py-2 whitespace-nowrap">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Andere Datei
        </Button>
        <div className="flex items-center gap-3">
          {missing.length > 0 && (
            <span className="text-[13px] text-down">Fehlt: {missing.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}</span>
          )}
          <Button variant="primary" onClick={onNext} disabled={missing.length > 0 || busy}>
            {busy ? "Prüfe …" : "Vorschau"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ImportPreview["rows"][number]["status"], string> = {
  new: "Neu",
  duplicate: "Bereits vorhanden",
  invalid: "Fehler",
};
const PAGE = 300;

const PLURAL: Record<TransactionType, string> = {
  BUY: "Käufe",
  SELL: "Verkäufe",
  SAVINGS_PLAN: "Sparplan-Ausführungen",
  DIVIDEND: "Dividenden",
  INTEREST: "Zinszahlungen",
  DEPOSIT: "Einzahlungen & Gutschriften",
  WITHDRAWAL: "Auszahlungen & Kartenzahlungen",
  TAX: "Steuerbuchungen",
  FEE: "Gebühren",
};

function PreviewStep({
  preview,
  parsed,
  fileName,
  preset,
  busy,
  onToggleDemo,
  onBack,
  onCommit,
}: {
  preview: ImportPreview;
  parsed: ParseResult;
  fileName: string;
  preset: PresetId;
  busy: boolean;
  onToggleDemo: (value: boolean) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  const after = preview.after;
  const dates = preview.rows.map((r) => r.executedAt.slice(0, 10)).sort();
  const range = dates.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : "";
  const netDeposits = Number(after.depositsEUR) - Number(after.withdrawalsEUR);
  // Ergebnis ohne Kursveränderung offener Positionen = Cash + Einstand − Eingezahltes
  const result = Number(after.cashEUR) + Number(after.investedCostEUR) - netDeposits;
  const income = Number(after.interestEUR) + Number(after.dividendsNetEUR);
  const taxes = -Number(after.taxesEUR);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheetIcon className="size-5 shrink-0 text-subtle" />
          <div className="min-w-0 leading-tight">
            <div className="text-[14px] font-medium">{PRESET_LABELS[preset]}</div>
            <div className="tnum truncate text-[12px] text-subtle">
              {fileName}
              {range && ` · ${range}`} · {formatNumber(preview.rows.length, 0)} Buchungen
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {DIRECT[preset] ? "Andere Datei" : "Zurück zur Zuordnung"}
        </Button>
      </Card>

      <BalanceCheck statement={parsed.statement} after={after} />

      {preview.demo.transactions > 0 && (
        <Card className="flex items-start justify-between gap-4 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="replace-demo" className="text-[14px] font-medium">
              Beispieldepot vorher entfernen
            </Label>
            <p className="text-[13px] text-muted">
              Die App enthält noch {preview.demo.transactions} Beispiel-Buchungen. Bleiben sie, werden sie mit deinen echten Daten
              zusammengerechnet. Vor dem Entfernen legt die App automatisch eine Sicherung an.
            </p>
          </div>
          <Switch id="replace-demo" checked={preview.demo.replaced} onCheckedChange={onToggleDemo} disabled={busy} />
        </Card>
      )}

      <section aria-labelledby="after-title" className="flex flex-col gap-3">
        <h2 id="after-title" className="text-[15px] font-semibold">
          Dein Depot nach dem Import
        </h2>
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
          <Stat label="Cash" value={formatMoney(after.cashEUR)} />
          <Stat label="Investiert (Einstand)" value={formatMoney(after.investedCostEUR)} sub={positionCount(after)} />
          <Stat
            label="Realisierte Gewinne"
            value={formatMoney(after.realizedEUR, "EUR", { signed: true })}
            tone={Number(after.realizedEUR)}
          />
          <Stat label="Zinsen & Dividenden" value={formatMoney(income, "EUR", { signed: true })} tone={income} />
          <Stat
            label="Eingezahlt (netto)"
            value={formatMoney(netDeposits)}
            sub={`${formatMoney(after.depositsEUR)} ein · ${formatMoney(after.withdrawalsEUR)} aus`}
          />
          <Stat
            label="Steuern"
            value={formatMoney(taxes, "EUR", { signed: true })}
            sub={taxes > 0 ? "mehr erstattet als gezahlt" : taxes < 0 ? "gezahlt" : undefined}
          />
          <Stat
            label="Gebühren"
            value={formatMoney(-Number(after.feesEUR), "EUR", { signed: true })}
            sub={Number(after.feesEUR) > 0 ? "in Gewinnen und Einstand schon abgezogen" : undefined}
          />
          <Stat
            label="Ergebnis bisher"
            value={formatMoney(result, "EUR", { signed: true })}
            tone={result}
            sub="ohne Kursveränderung offener Positionen"
          />
        </Card>
        {after.positions.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <caption className="sr-only">Offene Positionen nach dem Import</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-subtle">
                    <th className="px-4 py-2.5 font-medium">Offene Position</th>
                    <th className="px-4 py-2.5 text-right font-medium">Stück</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ø Kaufkurs</th>
                    <th className="px-4 py-2.5 text-right font-medium">Einstand</th>
                  </tr>
                </thead>
                <tbody>
                  {after.positions.map((p) => (
                    <tr key={p.isin ?? p.name} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{p.name}</div>
                        {p.isin && <div className="tnum text-[12px] text-subtle">{p.isin}</div>}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right">{formatQuantity(p.quantity)}</td>
                      <td className="tnum px-4 py-2.5 text-right">{formatMoney(Number(p.costEUR) / Number(p.quantity))}</td>
                      <td className="tnum px-4 py-2.5 text-right font-medium">{formatMoney(p.costEUR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <p className="text-[12px] text-subtle">Den aktuellen Wert mit Tageskursen zeigt die Übersicht nach dem Import.</p>
      </section>

      <section aria-labelledby="import-title" className="flex flex-col gap-3">
        <h2 id="import-title" className="text-[15px] font-semibold">
          Was übernommen wird
        </h2>
        <Card className="flex flex-col divide-y divide-border px-4">
          {preview.byType.map((t) => (
            <div key={t.type} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
              <span>
                <span className="tnum font-medium">{t.count}</span> {t.count === 1 ? TRANSACTION_TYPE_LABELS[t.type] : PLURAL[t.type]}
              </span>
              <span className="tnum text-muted">{formatMoney(t.cashEUR, "EUR", { signed: true })}</span>
            </div>
          ))}
          {preview.counts.new === 0 && <p className="py-3 text-[13px] text-muted">Keine neuen Buchungen.</p>}
          {preview.counts.duplicate > 0 && (
            <p className="py-2.5 text-[13px] text-muted">
              {preview.counts.duplicate} {preview.counts.duplicate === 1 ? "Buchung ist" : "Buchungen sind"} schon in der App und{" "}
              {preview.counts.duplicate === 1 ? "wird" : "werden"} übersprungen.
            </p>
          )}
          {preview.counts.invalid + parsed.skipped.length > 0 && (
            <p className="py-2.5 text-[13px] text-down">
              {preview.counts.invalid + parsed.skipped.length} Zeilen können nicht übernommen werden – Gründe unter „Alle Buchungen“.
            </p>
          )}
        </Card>
      </section>

      {(parsed.notes ?? []).map((n) => (
        <p key={n} className="flex gap-2 text-[13px] text-muted">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          {n}
        </p>
      ))}
      {preview.warnings.map((w) => (
        <div key={w} className="rounded-xl bg-warn-soft px-4 py-3 text-[13px]" role="status">
          {w}
        </div>
      ))}

      <details className="group rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-muted select-none hover:text-foreground">
          Alle Buchungen anzeigen ({preview.rows.length + parsed.skipped.length})
        </summary>
        <div className="border-t border-border">
          <RowsTable preview={preview} skipped={parsed.skipped} />
        </div>
      </details>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Abbrechen
        </Button>
        <Button variant="primary" size="lg" onClick={onCommit} disabled={busy || preview.counts.new === 0}>
          {busy ? "Importiere …" : preview.counts.new === 0 ? "Nichts zu importieren" : `${preview.counts.new} Buchungen importieren`}
        </Button>
      </div>
    </div>
  );
}

/** Gleicht das Cash nach dem Import mit dem Endsaldo des Kontoauszugs ab. */
function BalanceCheck({ statement, after }: { statement?: StatementBalance; after: ImportOutcome }) {
  if (!statement) return null;
  const diff = Number(after.cashEUR) - Number(statement.closing);
  if (statement.consistent && Math.abs(diff) < 0.005) {
    return (
      <div className="flex gap-3 rounded-xl bg-up-soft px-4 py-3 text-[13px]" role="status">
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-up" aria-hidden />
        <p>
          <strong>Gegenprobe bestanden:</strong> Das Cash nach dem Import ({formatMoney(after.cashEUR)}) entspricht dem Saldo laut
          Kontoauszug am {formatDate(statement.to)}.
        </p>
      </div>
    );
  }
  const opening = Number(statement.opening);
  const reason = !statement.consistent
    ? "Die Saldo-Spalte des Kontoauszugs ist nicht durchgehend stimmig – fehlen Zeilen in der Datei?"
    : Math.abs(opening) >= 0.005
      ? `Der Kontoauszug beginnt mit einem Saldo von ${formatMoney(opening)}. Die Buchungen davor fehlen – am besten den Kontoauszug ab Kontoeröffnung exportieren.`
      : "Die App enthält weitere Buchungen, die nicht in diesem Kontoauszug stehen (z. B. das Beispieldepot oder andere Konten).";
  return (
    <div className="flex gap-3 rounded-xl bg-warn-soft px-4 py-3 text-[13px]" role="status">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p>
        <strong>Saldo weicht ab:</strong> Cash nach dem Import {formatMoney(after.cashEUR)}, laut Kontoauszug{" "}
        {formatMoney(statement.closing)} (Differenz {formatMoney(diff, "EUR", { signed: true })}). {reason}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="text-[12px] font-medium text-subtle">{label}</span>
      <span
        className={cn(
          "tnum text-[18px] font-semibold tracking-[-0.01em]",
          tone !== undefined && tone > 0.004 && "text-up",
          tone !== undefined && tone < -0.004 && "text-down",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[12px] text-subtle">{sub}</span>}
    </div>
  );
}

function RowsTable({ preview, skipped }: { preview: ImportPreview; skipped: ParseResult["skipped"] }) {
  const [filter, setFilter] = React.useState<"all" | "new" | "duplicate" | "invalid" | "skipped">("all");
  const [limit, setLimit] = React.useState(PAGE);
  const rows = filter === "all" ? preview.rows : filter === "skipped" ? [] : preview.rows.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col">
      <div className="p-3">
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "all", label: `Alle ${preview.rows.length}` },
            { value: "new", label: `Neu ${preview.counts.new}` },
            { value: "duplicate", label: `Vorhanden ${preview.counts.duplicate}` },
            { value: "invalid", label: `Fehler ${preview.counts.invalid}` },
            { value: "skipped", label: `Nicht lesbar ${skipped.length}` },
          ]}
          ariaLabel="Zeilen filtern"
          className="max-w-full overflow-x-auto"
        />
      </div>
      <div className="overflow-x-auto">
        {filter === "skipped" ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y border-border text-left text-[12px] text-subtle">
                <th className="px-4 py-2.5 font-medium">Zeile</th>
                <th className="px-4 py-2.5 font-medium">Grund</th>
                <th className="px-4 py-2.5 font-medium">Inhalt</th>
              </tr>
            </thead>
            <tbody>
              {skipped.map((s) => (
                <tr key={s.row} className="border-b border-border last:border-0">
                  <td className="tnum px-4 py-2 text-subtle">{s.row}</td>
                  <td className="px-4 py-2">
                    {s.reason}
                    {s.action?.kind === "split" && (
                      <a
                        href={`/position/${encodeURIComponent(s.action.isin)}?split=${s.action.date}`}
                        target="_blank"
                        rel="noopener"
                        className="ml-2 font-medium whitespace-nowrap text-accent underline decoration-accent/40 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-accent"
                      >
                        Split erfassen
                      </a>
                    )}
                  </td>
                  <td className="max-w-md truncate px-4 py-2 text-subtle">{s.raw}</td>
                </tr>
              ))}
              {skipped.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-subtle">
                    Alle Zeilen konnten gelesen werden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y border-border text-left text-[12px] text-subtle">
                <th className="px-4 py-2.5 font-medium">Datum</th>
                <th className="px-4 py-2.5 font-medium">Typ</th>
                <th className="px-4 py-2.5 font-medium">Wertpapier / Notiz</th>
                <th className="px-4 py-2.5 text-right font-medium">Stück</th>
                <th className="px-4 py-2.5 text-right font-medium">Kassenwirkung</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => (
                <tr key={r.row} className={cn("border-b border-border last:border-0", r.status !== "new" && "text-muted")}>
                  <td className="tnum px-4 py-2 whitespace-nowrap">{formatDate(r.executedAt)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{TRANSACTION_TYPE_LABELS[r.type]}</td>
                  <td className="max-w-72 truncate px-4 py-2">
                    {r.name ?? r.note ?? r.isin ?? r.symbol ?? <span className="text-subtle">—</span>}
                  </td>
                  <td className="tnum px-4 py-2 text-right">{r.quantity ? formatQuantity(r.quantity) : ""}</td>
                  <td className="tnum px-4 py-2 text-right whitespace-nowrap">
                    {r.cashEUR ? formatMoney(r.cashEUR, "EUR", { signed: true }) : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Badge tone={r.status === "new" ? "up" : r.status === "invalid" ? "down" : "neutral"} title={r.message ?? undefined}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.message && r.status === "invalid" && <span className="ml-2 text-[12px] text-down">{r.message}</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-subtle">
                    Keine Zeilen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {filter !== "skipped" && rows.length > limit && (
        <div className="border-t border-border p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Weitere {Math.min(PAGE, rows.length - limit)} anzeigen
          </Button>
        </div>
      )}
    </div>
  );
}
