"use client";

import { CheckCircle2Icon, FileSpreadsheetIcon, UploadCloudIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { commitImportAction, previewImportAction, restoreImportAction, undoImportAction } from "@/app/actions";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES, type TransactionType } from "@/domain/types";
import { type CsvTable, decodeBytes, parseCsv } from "@/import/csv";
import { detectPreset, distinctValues, normalizeGeneric, suggestMapping } from "@/import/generic";
import { parseTradeRepublic } from "@/import/trade-republic";
import {
  type ColumnMapping,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportCandidate,
  type ImportField,
  PRESET_LABELS,
  type PresetId,
  REQUIRED_FIELDS,
  type SkippedRow,
} from "@/import/types";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommitResult, ImportPreview, PreviewRow } from "@/server/import";
import { Segmented } from "../transaction-dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/input";
import { Badge, Card } from "../ui/misc";
import { Select } from "../ui/select";

type Step =
  | { name: "upload" }
  | { name: "mapping" }
  | { name: "preview"; preview: ImportPreview; skipped: SkippedRow[] }
  | { name: "done"; result: CommitResult };

const NONE = "__none__";

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ name: "upload" });
  const [fileName, setFileName] = React.useState("");
  const [table, setTable] = React.useState<CsvTable | null>(null);
  const [preset, setPreset] = React.useState<PresetId>("custom");
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [candidates, setCandidates] = React.useState<ImportCandidate[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Die Datei ist größer als 20 MB.");
      return;
    }
    const text = decodeBytes(await file.arrayBuffer());
    const parsed = parseCsv(text);
    if (parsed.headers.length < 2 || parsed.rows.length === 0) {
      toast.error("Keine Tabelle erkannt. Ist das eine CSV-Datei mit Kopfzeile?");
      return;
    }
    setFileName(file.name);
    setTable(parsed);
    const detected = detectPreset(parsed.headers);
    setPreset(detected);
    if (detected === "trade_republic") {
      const result = parseTradeRepublic(parsed);
      await runPreview(result.candidates, result.skipped);
    } else {
      setMapping(suggestMapping(parsed, detected));
      setStep({ name: "mapping" });
    }
  }

  async function runPreview(list: ImportCandidate[], skipped: SkippedRow[]) {
    setBusy(true);
    try {
      setCandidates(list);
      const preview = await previewImportAction(list);
      setStep({ name: "preview", preview, skipped });
    } catch {
      toast.error("Vorschau fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (step.name !== "preview") return;
    setBusy(true);
    try {
      const result = await commitImportAction(candidates, fileName, preset);
      setStep({ name: "done", result });
      router.refresh();
      toast.success(`${result.imported} Transaktionen importiert`, {
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
    setCandidates([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step.name} />

      {step.name === "upload" && (
        <Card
          className={cn(
            "relative flex flex-col items-center gap-4 border-dashed border-border-strong px-6 py-14 text-center transition-colors duration-150",
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
            <p className="text-[16px] font-semibold">CSV-Datei hierher ziehen</p>
            <p className="text-[13px] text-muted">
              Trade-Republic-Transaktionsexport, pytr, Portfolio Performance, CSV-Sicherung dieser App oder eigenes Format
            </p>
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
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Wird gelesen …" : "Datei auswählen"}
          </Button>
          <p className="text-[12px] text-subtle">Die Datei wird nur lokal verarbeitet und nirgendwohin hochgeladen.</p>
        </Card>
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
          onNext={() => {
            const result = normalizeGeneric(table, mapping);
            void runPreview(result.candidates, result.skipped);
          }}
        />
      )}

      {step.name === "preview" && (
        <PreviewStep
          preview={step.preview}
          skipped={step.skipped}
          fileName={fileName}
          preset={preset}
          busy={busy}
          onBack={() => (preset === "trade_republic" ? reset() : setStep({ name: "mapping" }))}
          onCommit={commit}
        />
      )}

      {step.name === "done" && (
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <CheckCircle2Icon className="size-10 text-up" strokeWidth={1.5} />
          <div className="flex flex-col gap-1">
            <p className="text-[18px] font-semibold">{step.result.imported} Transaktionen importiert</p>
            <p className="text-[13px] text-muted">
              {step.result.skipped > 0 && `${step.result.skipped} übersprungen (Duplikate oder fehlerhaft). `}
              {step.result.instrumentsCreated > 0 && `${step.result.instrumentsCreated} neue Wertpapiere angelegt.`}
            </p>
          </div>
          <div className="flex gap-2">
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

function Stepper({ current }: { current: Step["name"] }) {
  const steps: Array<{ key: Step["name"]; label: string }> = [
    { key: "upload", label: "Datei" },
    { key: "mapping", label: "Zuordnung" },
    { key: "preview", label: "Vorschau" },
    { key: "done", label: "Fertig" },
  ];
  const index = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" aria-label="Fortschritt">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={i === index ? "step" : undefined}>
          <span
            className={cn(
              "tnum inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
              i < index ? "bg-up-soft text-up" : i === index ? "bg-foreground text-background" : "bg-surface-2 text-subtle",
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === index ? "font-medium text-foreground" : "hidden text-subtle sm:inline")}>{s.label}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-border-strong sm:w-6" aria-hidden />}
        </li>
      ))}
    </ol>
  );
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

const STATUS_LABEL: Record<PreviewRow["status"], string> = { new: "Neu", duplicate: "Duplikat", invalid: "Fehler" };
const PAGE = 300;

function PreviewStep({
  preview,
  skipped,
  fileName,
  preset,
  busy,
  onBack,
  onCommit,
}: {
  preview: ImportPreview;
  skipped: SkippedRow[];
  fileName: string;
  preset: PresetId;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const [filter, setFilter] = React.useState<"all" | "new" | "duplicate" | "invalid" | "skipped">("all");
  const [limit, setLimit] = React.useState(PAGE);
  const rows = filter === "all" ? preview.rows : filter === "skipped" ? [] : preview.rows.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <Card className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        <Summary label="Neu" value={preview.counts.new} tone="up" />
        <Summary label="Duplikate" value={preview.counts.duplicate} />
        <Summary label="Fehlerhaft" value={preview.counts.invalid} tone={preview.counts.invalid ? "down" : undefined} />
        <Summary label="Übersprungen" value={skipped.length} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <span className="text-muted">
          {fileName} · {PRESET_LABELS[preset]}
        </span>
        <span>
          Kassenwirkung der neuen Zeilen: <strong className="tnum">{formatMoney(preview.cashEffectEUR, "EUR", { signed: true })}</strong>
        </span>
      </div>

      {preview.warnings.map((w) => (
        <div key={w} className="rounded-xl bg-warn-soft px-4 py-3 text-[13px]" role="status">
          {w}
        </div>
      ))}

      {preview.newInstruments.length > 0 && (
        <Card className="p-4 text-[13px]">
          <span className="font-medium">{preview.newInstruments.length} neue Wertpapiere</span>
          <span className="text-muted">
            {" "}
            werden angelegt; das Kurssymbol wird automatisch gesucht und lässt sich in der Positionsansicht ändern:{" "}
          </span>
          <span className="text-muted">{preview.newInstruments.map((i) => i.name ?? i.isin ?? i.symbol).join(", ")}</span>
        </Card>
      )}

      <Segmented
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(PAGE);
        }}
        options={[
          { value: "all", label: `Alle ${preview.rows.length}` },
          { value: "new", label: `Neu ${preview.counts.new}` },
          { value: "duplicate", label: `Duplikate ${preview.counts.duplicate}` },
          { value: "invalid", label: `Fehler ${preview.counts.invalid}` },
          { value: "skipped", label: `Übersprungen ${skipped.length}` },
        ]}
        ariaLabel="Zeilen filtern"
        className="self-start overflow-x-auto"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {filter === "skipped" ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-subtle">
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
                      Keine Zeilen übersprungen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-subtle">
                  <th className="px-4 py-2.5 font-medium">Datum</th>
                  <th className="px-4 py-2.5 font-medium">Typ</th>
                  <th className="px-4 py-2.5 font-medium">Wertpapier</th>
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
                    <td className="max-w-64 truncate px-4 py-2">
                      {r.name ?? r.isin ?? r.symbol ?? <span className="text-subtle">—</span>}
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
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Zurück
        </Button>
        <Button variant="primary" size="lg" onClick={onCommit} disabled={busy || preview.counts.new === 0}>
          {busy ? "Importiere …" : preview.counts.new === 0 ? "Nichts zu importieren" : `${preview.counts.new} Transaktionen importieren`}
        </Button>
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[12px] font-medium text-subtle">{label}</span>
      <span className={cn("tnum text-[22px] font-semibold", tone === "up" && value > 0 && "text-up", tone === "down" && "text-down")}>
        {value}
      </span>
    </div>
  );
}
