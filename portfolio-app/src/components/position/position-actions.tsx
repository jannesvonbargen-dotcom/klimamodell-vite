"use client";

import { MoreHorizontalIcon, PencilIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { addSplitAction, deleteSplitAction, updateInstrumentAction } from "@/app/actions";
import type { Instrument } from "@/domain/types";
import { formatDate } from "@/lib/format";
import type { PickedInstrument } from "../instrument-picker";
import { useTransactionDialog } from "../transaction-dialog";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Field, Input } from "../ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/misc";
import { Select } from "../ui/select";

export function PositionActions({
  instrument,
  holds,
  splits,
}: {
  instrument: Instrument;
  holds: boolean;
  splits: Array<{ id: number; effectiveDate: string; ratioFrom: string; ratioTo: string }>;
}) {
  const { openCreate } = useTransactionDialog();
  const [editOpen, setEditOpen] = React.useState(false);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const picked: PickedInstrument & { id: number } = {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    isin: instrument.isin,
    wkn: instrument.wkn,
    kind: instrument.kind,
    currency: instrument.currency,
    sector: instrument.sector,
    country: instrument.country,
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" onClick={() => openCreate({ type: "BUY", instrument: picked })}>
        Kauf erfassen
      </Button>
      {holds && (
        <Button variant="secondary" onClick={() => openCreate({ type: "SELL", instrument: picked })}>
          Verkauf
        </Button>
      )}
      <Button variant="secondary" onClick={() => openCreate({ type: "DIVIDEND", instrument: picked })}>
        Dividende
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
            <MoreHorizontalIcon />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon /> Stammdaten & Kurssymbol
          </MenuItem>
          <MenuItem onSelect={() => setSplitOpen(true)}>
            <ScissorsIcon /> Aktiensplit erfassen
          </MenuItem>
        </MenuContent>
      </Menu>
      <EditInstrumentDialog open={editOpen} onOpenChange={setEditOpen} instrument={instrument} />
      <SplitDialog open={splitOpen} onOpenChange={setSplitOpen} instrument={instrument} splits={splits} />
    </div>
  );
}

function EditInstrumentDialog({
  open,
  onOpenChange,
  instrument,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instrument: Instrument;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = React.useState(instrument.symbol);
  const [name, setName] = React.useState(instrument.name);
  const [currency, setCurrency] = React.useState(instrument.currency);
  const [sector, setSector] = React.useState(instrument.sector ?? "");
  const [country, setCountry] = React.useState(instrument.country ?? "");
  const [kind, setKind] = React.useState<"STOCK" | "ETF">(instrument.kind);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateInstrumentAction(instrument.id, {
        symbol,
        name,
        currency,
        sector: sector || null,
        country: country || null,
        kind,
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.success("Stammdaten gespeichert");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Stammdaten</DialogTitle>
            <DialogDescription>
              Das Kurssymbol bestimmt, welche Kurse geladen werden (z. B. „SAP.DE“ für Xetra, „AAPL“ für Nasdaq).
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4 pb-4">
            <Field label="Name" htmlFor="inst-name" error={errors.name}>
              <Input id="inst-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kurssymbol" htmlFor="inst-symbol" error={errors.symbol}>
                <Input id="inst-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" />
              </Field>
              <Field label="Notierungswährung" htmlFor="inst-ccy" error={errors.currency}>
                <Input id="inst-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Art" htmlFor="inst-kind">
                <Select
                  id="inst-kind"
                  value={kind}
                  onValueChange={(v) => setKind(v as "STOCK" | "ETF")}
                  options={[
                    { value: "STOCK", label: "Aktie" },
                    { value: "ETF", label: "ETF" },
                  ]}
                  ariaLabel="Art"
                />
              </Field>
              <Field label="Sektor" htmlFor="inst-sector">
                <Input id="inst-sector" value={sector} onChange={(e) => setSector(e.target.value)} />
              </Field>
              <Field label="Land / Region" htmlFor="inst-country">
                <Input id="inst-country" value={country} onChange={(e) => setCountry(e.target.value)} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({
  open,
  onOpenChange,
  instrument,
  splits,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instrument: Instrument;
  splits: Array<{ id: number; effectiveDate: string; ratioFrom: string; ratioTo: string }>;
}) {
  const router = useRouter();
  const [date, setDate] = React.useState("");
  const [from, setFrom] = React.useState("1");
  const [to, setTo] = React.useState("2");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addSplitAction(instrument.id, date, from, to);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.success("Split gespeichert – Stückzahlen wurden angepasst");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Aktiensplit</DialogTitle>
            <DialogDescription>Ab dem Stichtag werden die Stücke im Verhältnis umgerechnet. Der Einstand bleibt gleich.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4 pb-4">
            <Field label="Stichtag (erster Handelstag nach dem Split)" htmlFor="split-date" error={errors.effectiveDate}>
              <Input id="split-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field
              label="Verhältnis alt : neu"
              htmlFor="split-from"
              error={errors.ratio}
              hint="Beispiel: 1 : 10 – aus einer Aktie werden zehn."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="split-from"
                  inputMode="decimal"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-24"
                  aria-label="Alt"
                />
                <span className="text-muted">:</span>
                <Input inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} className="w-24" aria-label="Neu" />
              </div>
            </Field>
            {splits.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-muted">Erfasste Splits</span>
                {splits.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                    <span className="tnum">
                      {formatDate(s.effectiveDate)} · {s.ratioFrom} : {s.ratioTo}
                    </span>
                    <button
                      type="button"
                      className="pressable rounded p-1 text-subtle hover:text-down"
                      aria-label="Split löschen"
                      onClick={async () => {
                        await deleteSplitAction(s.id);
                        router.refresh();
                      }}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Split speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
