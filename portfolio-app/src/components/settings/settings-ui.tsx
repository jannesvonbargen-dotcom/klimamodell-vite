"use client";

import { DatabaseBackupIcon, DownloadIcon, FileJsonIcon, FileSpreadsheetIcon, RotateCcwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { clearMarketCacheAction, loadDemoDataAction, removeDemoDataAction, restoreBackupAction, wipeAllDataAction } from "@/app/actions";
import { formatDateTime } from "@/lib/format";
import { Segmented } from "../transaction-dialog";
import { Button, buttonVariants } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, Input } from "../ui/input";

export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  return (
    <Segmented
      value={mounted ? ((theme as "dark" | "light" | "system") ?? "dark") : "dark"}
      onChange={setTheme}
      ariaLabel="Farbschema"
      size="md"
      options={[
        { value: "dark", label: "Dunkel" },
        { value: "light", label: "Hell" },
        { value: "system", label: "Wie System" },
      ]}
    />
  );
}

export function ExportButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/api/export?format=json" download className={buttonVariants({ variant: "secondary" })}>
        <FileJsonIcon /> Vollständige Sicherung (JSON)
      </a>
      <a href="/api/export?format=csv" download className={buttonVariants({ variant: "outline" })}>
        <FileSpreadsheetIcon /> Transaktionen (CSV)
      </a>
    </div>
  );
}

interface PendingRestore {
  fileName: string;
  json: string;
  exportedAt: string | null;
  transactions: number;
  instruments: number;
}

export function RestoreBackup() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingRestore | null>(null);
  const [busy, startTransition] = React.useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";
    if (file.size > 24 * 1024 * 1024) {
      toast.error("Die Datei ist größer als 24 MB.");
      return;
    }
    const json = await file.text();
    try {
      const parsed = JSON.parse(json) as {
        format?: string;
        exportedAt?: string;
        data?: { transactions?: unknown[]; instruments?: unknown[] };
      };
      if (parsed.format !== "portfolio-app-backup") {
        toast.error("Das ist keine JSON-Sicherung dieser App. CSV-Dateien bitte über „Import“ einlesen.");
        return;
      }
      setPending({
        fileName: file.name,
        json,
        exportedAt: parsed.exportedAt ?? null,
        transactions: parsed.data?.transactions?.length ?? 0,
        instruments: parsed.data?.instruments?.length ?? 0,
      });
    } catch {
      toast.error("Die Datei ist kein gültiges JSON.");
    }
  }

  function confirm() {
    if (!pending) return;
    startTransition(async () => {
      const result = await restoreBackupAction(pending.json);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPending(null);
      router.refresh();
      toast.success(`Wiederhergestellt: ${result.counts?.transactions ?? 0} Transaktionen`, {
        description: result.backupFile ? "Der vorherige Stand wurde unter data/backups/ gesichert." : undefined,
      });
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <UploadIcon /> Sicherung wiederherstellen …
      </Button>
      <Dialog open={!!pending} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sicherung wiederherstellen?</DialogTitle>
            <DialogDescription>
              Alle aktuellen Transaktionen, Sparpläne und Watchlist-Einträge werden durch die Sicherung ersetzt.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-4">
            {pending && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px]">
                <dt className="text-subtle">Datei</dt>
                <dd className="truncate">{pending.fileName}</dd>
                <dt className="text-subtle">Erstellt</dt>
                <dd className="tnum">{pending.exportedAt ? formatDateTime(pending.exportedAt) : "unbekannt"}</dd>
                <dt className="text-subtle">Inhalt</dt>
                <dd className="tnum">
                  {pending.transactions} Transaktionen · {pending.instruments} Wertpapiere
                </dd>
              </dl>
            )}
            <p className="mt-3 text-[13px] text-muted">
              Der jetzige Stand wird vorher automatisch als Datenbankdatei unter data/backups/ gesichert.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={confirm} disabled={busy}>
              <DatabaseBackupIcon /> Wiederherstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DemoDataButton({ hasDemo, hasOther }: { hasDemo: boolean; hasOther: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  if (hasDemo) {
    return (
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            await removeDemoDataAction();
            router.refresh();
            toast.success("Beispieldaten entfernt", { description: "Deine eigenen Transaktionen bleiben erhalten." });
          })
        }
      >
        <Trash2Icon /> Beispieldaten entfernen
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          if (
            hasOther &&
            !window.confirm("Beispieldaten werden zu deinen eigenen Daten hinzugefügt und lassen sich später wieder entfernen. Fortfahren?")
          )
            return;
          const result = await loadDemoDataAction();
          router.refresh();
          toast.success(`${result.transactions} Beispiel-Transaktionen geladen`);
        })
      }
    >
      <DownloadIcon /> Beispieldaten laden
    </Button>
  );
}

export function ClearCacheButton() {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          await clearMarketCacheAction();
          router.refresh();
          toast.success("Kurs-Cache geleert – Kurse werden neu geladen");
        })
      }
    >
      <RotateCcwIcon /> Kurs-Cache leeren
    </Button>
  );
}

const CONFIRM_WORD = "LÖSCHEN";

export function WipeDataButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [word, setWord] = React.useState("");
  const [busy, startTransition] = React.useTransition();
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2Icon /> Alle Daten löschen …
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
          if (!o) setWord("");
        }}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (word !== CONFIRM_WORD) return;
              startTransition(async () => {
                await wipeAllDataAction();
                setOpen(false);
                setWord("");
                router.refresh();
                toast.success("Alle Daten gelöscht", { description: "Eine Sicherung des vorherigen Stands liegt unter data/backups/." });
              });
            }}
            className="flex min-h-0 flex-col"
          >
            <DialogHeader>
              <DialogTitle>Wirklich alle Daten löschen?</DialogTitle>
              <DialogDescription>
                Transaktionen, Wertpapiere, Sparpläne, Watchlist und Einstellungen werden entfernt. Vorher wird automatisch eine Sicherung
                unter data/backups/ angelegt.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="pb-4">
              <Field label={`Zur Bestätigung „${CONFIRM_WORD}“ eingeben`} htmlFor="wipe-confirm">
                <Input id="wipe-confirm" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoFocus />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Abbrechen
              </Button>
              <Button variant="destructive" type="submit" disabled={busy || word !== CONFIRM_WORD}>
                Endgültig löschen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
