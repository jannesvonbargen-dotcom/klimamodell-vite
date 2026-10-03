"use client";

import { BellIcon, BellRingIcon, ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { addToWatchlistAction, removeFromWatchlistAction, updateWatchlistItemAction } from "@/app/actions";
import { d } from "@/domain/decimal";
import { formatDate, formatDateTimeBerlin, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WatchlistEntry } from "@/server/watchlist";
import { InstrumentPicker, type PickedInstrument } from "../instrument-picker";
import { Delta, InstrumentAvatar } from "../numbers";
import { Sparkline } from "../sparkline";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, Input, Textarea } from "../ui/input";
import { Badge, Card, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/misc";

export interface WatchlistRowView extends WatchlistEntry {
  researchSymbol: string | null;
  heldIsin: string | null;
}

const toInput = (v: string | null) => (v ? v.replace(".", ",") : "");

export function AddWatchButton({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon /> Wert beobachten
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <AddForm onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [instrument, setInstrument] = React.useState<PickedInstrument | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!instrument) {
      setError("Bitte ein Wertpapier auswählen.");
      return;
    }
    startTransition(async () => {
      const result = await addToWatchlistAction({
        symbol: instrument.symbol,
        name: instrument.name,
        isin: instrument.isin,
        currency: instrument.currency,
      });
      if (!result.ok) {
        setError(Object.values(result.errors)[0] ?? "Hinzufügen fehlgeschlagen.");
        return;
      }
      onDone();
      router.refresh();
      toast.success(`${instrument.name} beobachtest du jetzt`);
    });
  }
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Wert beobachten</DialogTitle>
        <DialogDescription>Suche nach Name, Ticker, ISIN oder WKN. Kursalarme legst du danach fest.</DialogDescription>
      </DialogHeader>
      <DialogBody className="pb-4">
        <Field label="Wertpapier" htmlFor="watch-instrument" error={error ?? undefined}>
          <InstrumentPicker
            id="watch-instrument"
            value={instrument}
            onChange={(v) => {
              setInstrument(v);
              setError(null);
            }}
            autoFocus
            invalid={!!error}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          Hinzufügen
        </Button>
      </DialogFooter>
    </form>
  );
}

export function WatchlistTable({ entries }: { entries: WatchlistRowView[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<WatchlistRowView | null>(null);

  async function remove(e: WatchlistRowView) {
    await removeFromWatchlistAction(e.id);
    router.refresh();
    toast(`${e.name} entfernt`, {
      action: {
        label: "Rückgängig",
        onClick: async () => {
          const result = await addToWatchlistAction({ symbol: e.symbol, name: e.name, isin: e.isin, currency: e.currency });
          if (result.ok && (e.alertAbove || e.alertBelow || e.note)) {
            await updateWatchlistItemAction(result.id, { alertAbove: e.alertAbove, alertBelow: e.alertBelow, note: e.note });
          }
          router.refresh();
        },
      },
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li
              key={e.id}
              className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5", e.alert && "bg-warn-soft/40")}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <InstrumentAvatar name={e.name} symbol={e.symbol} size={36} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{e.name}</span>
                    {e.heldIsin && <Badge tone="accent">Im Depot</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-subtle">
                    {e.symbol}
                    {e.isin && !e.isin.startsWith("X-") ? ` · ${e.isin}` : ""} · seit {formatDate(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                <Sparkline values={e.spark} className="hidden md:block" />
                <div className="flex w-28 flex-col items-end gap-0.5">
                  <span className="tnum text-[15px] font-semibold">{e.quote ? formatPrice(e.quote.price, e.currency) : "—"}</span>
                  {e.dayChange ? (
                    <Delta percent={e.dayChange} size="sm" />
                  ) : (
                    <span className="text-[12px] text-subtle">{e.quote ? "Heute —" : "Kein Kurs"}</span>
                  )}
                </div>
                <div className="hidden w-24 flex-col items-end gap-0.5 lg:flex">
                  <span className="text-[12px] text-subtle">seit Aufnahme</span>
                  {e.sinceAdded ? <Delta percent={e.sinceAdded} size="sm" /> : <span className="text-[13px] text-subtle">—</span>}
                </div>
                <AlertSummary entry={e} onEdit={() => setEditing(e)} />
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${e.name}`}>
                      <MoreHorizontalIcon />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setEditing(e)}>
                      <PencilIcon /> Kursalarm & Notiz
                    </MenuItem>
                    {e.researchSymbol && (
                      <MenuItem asChild>
                        <Link href={`/wachstumswerte/${encodeURIComponent(e.researchSymbol)}`}>
                          <SparklesIcon /> Analyse ansehen
                        </Link>
                      </MenuItem>
                    )}
                    {e.heldIsin && (
                      <MenuItem asChild>
                        <Link href={`/position/${encodeURIComponent(e.heldIsin)}`}>
                          <ExternalLinkIcon /> Position im Depot
                        </Link>
                      </MenuItem>
                    )}
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => remove(e)}>
                      <Trash2Icon /> Entfernen
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing && <AlertForm key={editing.id} entry={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function AlertSummary({ entry: e, onEdit }: { entry: WatchlistRowView; onEdit: () => void }) {
  const has = e.alertAbove || e.alertBelow;
  const label =
    e.alert === "above"
      ? `über ${formatPrice(e.alertAbove!, e.currency)}`
      : e.alert === "below"
        ? `unter ${formatPrice(e.alertBelow!, e.currency)}`
        : null;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "pressable hidden h-8 w-44 items-center justify-end gap-1.5 rounded-lg px-2 text-[12px] sm:inline-flex",
        e.alert ? "font-medium text-warn" : has ? "text-muted hover:bg-surface-2" : "text-subtle hover:bg-surface-2 hover:text-muted",
      )}
      aria-label={`Kursalarm für ${e.name} bearbeiten`}
    >
      {e.alert ? <BellRingIcon className="size-3.5" aria-hidden /> : <BellIcon className="size-3.5" aria-hidden />}
      {e.alert ? (
        <span>Alarm: {label}</span>
      ) : has ? (
        <span className="tnum">
          {e.alertBelow && `≤ ${formatPrice(e.alertBelow, e.currency)}`}
          {e.alertBelow && e.alertAbove && " · "}
          {e.alertAbove && `≥ ${formatPrice(e.alertAbove, e.currency)}`}
        </span>
      ) : (
        <span>Alarm setzen</span>
      )}
    </button>
  );
}

function AlertForm({ entry, onDone }: { entry: WatchlistRowView; onDone: () => void }) {
  const router = useRouter();
  const [above, setAbove] = React.useState(toInput(entry.alertAbove));
  const [below, setBelow] = React.useState(toInput(entry.alertBelow));
  const [note, setNote] = React.useState(entry.note ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const price = entry.quote?.price ?? null;
  const distance = (raw: string) => {
    if (!price || !raw.trim()) return null;
    const v = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!(v > 0)) return null;
    return formatPercent(d(String(v)).div(price).minus(1).toString(), { digits: 1 });
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateWatchlistItemAction(entry.id, { alertAbove: above, alertBelow: below, note });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onDone();
      router.refresh();
      toast.success("Gespeichert");
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Kursalarm · {entry.name}</DialogTitle>
        <DialogDescription>
          {price ? (
            <>
              Aktuell {formatPrice(price, entry.currency)}
              {entry.quote?.asOf ? ` (${formatDateTimeBerlin(entry.quote.asOf)})` : ""}. Der Alarm erscheint in der Watchlist und im Menü,
              solange die App läuft – es werden keine Nachrichten verschickt.
            </>
          ) : (
            "Für diesen Wert liegt kein Kurs vor."
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Kurs fällt unter (${entry.currency})`}
            htmlFor="alert-below"
            error={errors.alertBelow}
            hint={distance(below) ?? undefined}
          >
            <Input
              id="alert-below"
              inputMode="decimal"
              value={below}
              onChange={(e) => setBelow(e.target.value)}
              placeholder="z. B. 300"
              aria-invalid={!!errors.alertBelow}
            />
          </Field>
          <Field
            label={`Kurs steigt über (${entry.currency})`}
            htmlFor="alert-above"
            error={errors.alertAbove}
            hint={distance(above) ?? undefined}
          >
            <Input
              id="alert-above"
              inputMode="decimal"
              value={above}
              onChange={(e) => setAbove(e.target.value)}
              placeholder="z. B. 450"
              aria-invalid={!!errors.alertAbove}
            />
          </Field>
        </div>
        <Field label="Notiz" htmlFor="alert-note">
          <Textarea
            id="alert-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Warum beobachtest du den Wert?"
            maxLength={280}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          Speichern
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Opt-in für Systembenachrichtigungen bei Kursalarmen (nur solange die App geöffnet ist). */
export function NotificationToggle() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported" | null>(null);
  React.useEffect(() => {
    // Erst nach dem Mounten bekannt (im Server-Rendering gibt es kein Notification-Objekt)
    const value = "Notification" in window ? Notification.permission : "unsupported";
    const id = requestAnimationFrame(() => setPermission(value));
    return () => cancelAnimationFrame(id);
  }, []);
  if (permission === null || permission === "unsupported") return null;
  if (permission === "granted")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-subtle">
        <BellRingIcon className="size-3.5" aria-hidden /> Systembenachrichtigungen an
      </span>
    );
  if (permission === "denied") return <span className="text-[12px] text-subtle">Benachrichtigungen im Browser blockiert</span>;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === "granted")
          toast.success("Kursalarme erscheinen jetzt auch als Systembenachrichtigung, solange die App geöffnet ist.");
      }}
    >
      <BellIcon /> Benachrichtigungen erlauben
    </Button>
  );
}
