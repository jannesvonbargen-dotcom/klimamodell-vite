"use client";

import { Command } from "cmdk";
import { SearchIcon, XIcon } from "lucide-react";
import * as React from "react";
import type { SearchResult } from "@/market/types";
import { cn } from "@/lib/utils";
import { InstrumentAvatar } from "./numbers";
import { inputClass } from "./ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/misc";

export interface PickedInstrument {
  id?: number;
  symbol: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  kind: "STOCK" | "ETF" | "OTHER";
  currency: string | null;
  sector: string | null;
  country: string | null;
}

export function fromSearchResult(r: SearchResult): PickedInstrument {
  return { symbol: r.symbol, name: r.name, isin: r.isin, wkn: r.wkn, kind: r.kind, currency: r.currency, sector: r.sector, country: r.country };
}

const ORIGIN_LABEL: Record<SearchResult["origin"], string> = {
  portfolio: "Im Depot",
  catalog: "Katalog",
  provider: "Online",
};

/** Suche nach Name, Ticker, ISIN oder WKN mit Autovervollständigung. */
export function InstrumentPicker({
  value,
  onChange,
  id,
  autoFocus,
  invalid,
  placeholder = "Name, Ticker, ISIN oder WKN",
}: {
  value: PickedInstrument | null;
  onChange: (value: PickedInstrument | null) => void;
  id?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const hasQuery = query.trim().length > 0;
  const visibleResults = hasQuery ? results : [];

  React.useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
      } catch {
        // abgebrochen oder offline – vorhandene Treffer behalten
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  if (value) {
    return (
      <div className={cn(inputClass, "flex h-12 items-center gap-3 pr-1.5")} id={id}>
        <InstrumentAvatar name={value.name} symbol={value.symbol} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-medium">{value.name}</div>
          <div className="truncate text-[12px] text-subtle">
            {value.symbol}
            {value.isin && !value.isin.startsWith("X-") ? ` · ${value.isin}` : ""}
            {value.currency ? ` · ${value.currency}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="pressable rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
          aria-label="Auswahl entfernen"
          onClick={() => {
            onChange(null);
            setQuery("");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <Command shouldFilter={false} loop className="relative">
      <Popover open={open && query.trim().length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Command.Input
              ref={inputRef}
              id={id}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && open) {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              autoFocus={autoFocus}
              placeholder={placeholder}
              aria-invalid={invalid || undefined}
              className={cn(inputClass, "pl-9")}
              autoComplete="off"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target instanceof Node && inputRef.current?.parentElement?.contains(e.target)) e.preventDefault();
          }}
        >
          <Command.List className="max-h-72 overflow-y-auto">
            {loading && visibleResults.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-subtle">Suche …</div>}
            {!loading && visibleResults.length === 0 && (
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-subtle">Keine Treffer. Ticker oder ISIN probieren.</Command.Empty>
            )}
            {visibleResults.map((r) => (
              <Command.Item
                key={`${r.symbol}-${r.isin ?? ""}`}
                value={`${r.symbol}-${r.isin ?? ""}`}
                onSelect={() => {
                  onChange(fromSearchResult(r));
                  setOpen(false);
                  setQuery("");
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 outline-none data-[selected=true]:bg-surface-2"
              >
                <InstrumentAvatar name={r.name} symbol={r.symbol} size={28} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[14px]">{r.name}</div>
                  <div className="truncate text-[12px] text-subtle">
                    {r.symbol}
                    {r.isin ? ` · ${r.isin}` : ""}
                    {r.exchange ? ` · ${r.exchange}` : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 text-[11px]", r.origin === "portfolio" ? "text-up" : "text-subtle")}>{ORIGIN_LABEL[r.origin]}</span>
              </Command.Item>
            ))}
          </Command.List>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
