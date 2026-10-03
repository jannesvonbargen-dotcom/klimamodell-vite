"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { formatMoney, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PositionRow } from "@/server/portfolio";
import { Delta, InstrumentAvatar } from "../numbers";
import { Input } from "../ui/input";
import { Tooltip } from "../ui/misc";

type SortKey = "name" | "quantity" | "cost" | "value" | "pnl" | "pnlPct" | "day" | "weight";

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: "name", label: "Name" },
  { key: "quantity", label: "Stück", className: "text-right" },
  { key: "cost", label: "Einstand", className: "text-right" },
  { key: "value", label: "Wert", className: "text-right" },
  { key: "pnl", label: "G/V", className: "text-right" },
  { key: "day", label: "Heute", className: "text-right" },
  { key: "weight", label: "Gewicht", className: "text-right" },
];

function sortValue(p: PositionRow, key: SortKey): number | string {
  switch (key) {
    case "name":
      return p.instrument.name.toLowerCase();
    case "quantity":
      return Number(p.quantity);
    case "cost":
      return Number(p.costEUR);
    case "value":
      return Number(p.marketValueEUR);
    case "pnl":
      return Number(p.unrealizedEUR);
    case "pnlPct":
      return Number(p.unrealizedPct ?? 0);
    case "day":
      return Number(p.dayChangePct ?? 0);
    case "weight":
      return Number(p.weight ?? 0);
  }
}

export function positionHref(p: { instrument: { isin: string } }): string {
  return `/position/${encodeURIComponent(p.instrument.isin)}`;
}

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "value", dir: "desc" });

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? positions.filter(
          (p) =>
            p.instrument.name.toLowerCase().includes(q) ||
            p.instrument.symbol.toLowerCase().includes(q) ||
            p.instrument.isin.toLowerCase().includes(q) ||
            (p.instrument.wkn ?? "").toLowerCase().includes(q),
        )
      : positions;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string, "de") : (va as number) - (vb as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [positions, query, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  return (
    <section aria-labelledby="positions-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="positions-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
          Positionen <span className="tnum ml-1 text-[14px] font-normal text-subtle">{positions.length}</span>
        </h2>
        <div className="relative w-full max-w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen"
            aria-label="Positionen durchsuchen"
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("h-10 px-4 text-left text-[12px] font-medium text-subtle first:pl-5 last:pr-5", c.className)}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded hover:text-foreground",
                        active && "text-foreground",
                        c.className && "flex-row-reverse",
                      )}
                    >
                      {c.label}
                      {active ? (
                        sort.dir === "asc" ? (
                          <ArrowUpIcon className="size-3" aria-hidden />
                        ) : (
                          <ArrowDownIcon className="size-3" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDownIcon className="size-3 opacity-40" aria-hidden />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.instrumentId}
                className="group relative border-b border-border transition-colors duration-150 last:border-0 hover:bg-surface-2/60"
              >
                <td className="py-3 pr-4 pl-5">
                  <Link
                    href={positionHref(p)}
                    className="flex min-w-0 items-center gap-3 outline-none after:absolute after:inset-0 focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    <InstrumentAvatar name={p.instrument.name} symbol={p.instrument.symbol} logoUrl={p.instrument.logoUrl} size={32} />
                    <span className="min-w-0">
                      <span className="block max-w-[260px] truncate font-medium">{p.instrument.name}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-subtle">
                        {p.instrument.symbol}
                        {p.priceSource !== "quote" && (
                          <Tooltip
                            content={
                              p.priceSource === "last-transaction"
                                ? "Kein aktueller Kurs – bewertet mit letztem Transaktionskurs"
                                : "Kein Kurs verfügbar"
                            }
                          >
                            <span className="relative z-10 rounded bg-warn-soft px-1 text-[11px] text-warn">ohne Kurs</span>
                          </Tooltip>
                        )}
                        {p.quoteStale && (
                          <Tooltip content="Kursanbieter nicht erreichbar – letzter bekannter Kurs">
                            <span className="relative z-10 rounded bg-warn-soft px-1 text-[11px] text-warn">alt</span>
                          </Tooltip>
                        )}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="tnum px-4 text-right text-muted">{formatQuantity(p.quantity)}</td>
                <td className="tnum px-4 text-right">
                  <div>{formatMoney(p.costEUR)}</div>
                  <div className="text-[12px] text-subtle">
                    {p.avgCostLocal ? formatPrice(p.avgCostLocal, p.costCurrency ?? "EUR") : formatPrice(p.avgCostEUR)} Ø
                  </div>
                </td>
                <td className="tnum px-4 text-right">
                  <div className="font-medium">{formatMoney(p.marketValueEUR)}</div>
                  <div className="text-[12px] text-subtle">{formatPrice(p.priceLocal, p.priceCurrency ?? "EUR")}</div>
                </td>
                <td className="px-4 text-right">
                  <Delta value={p.unrealizedEUR} size="sm" showArrow={false} className="justify-end" />
                  <div className="text-[12px]">
                    <Delta percent={p.unrealizedPct} size="sm" className="justify-end text-[12px]" />
                  </div>
                </td>
                <td className="px-4 text-right">
                  <Delta percent={p.dayChangePct} size="sm" className="justify-end" />
                  <div className="tnum text-[12px] text-subtle">
                    {p.dayChangeEUR ? formatMoney(p.dayChangeEUR, "EUR", { signed: true }) : "—"}
                  </div>
                </td>
                <td className="pr-5 pl-4 text-right">
                  <WeightBar weight={p.weight} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-subtle">Keine Position gefunden.</p>}
      </div>

      {/* Mobil: Liste */}
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface md:hidden">
        {rows.map((p) => (
          <li key={p.instrumentId}>
            <Link href={positionHref(p)} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
              <InstrumentAvatar name={p.instrument.name} symbol={p.instrument.symbol} logoUrl={p.instrument.logoUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{p.instrument.name}</div>
                <div className="tnum text-[12px] text-subtle">
                  {formatQuantity(p.quantity)} Stk. · {formatPercent(p.weight, { signed: false, digits: 1 })}
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[14px] font-medium">{formatMoney(p.marketValueEUR)}</div>
                <Delta percent={p.unrealizedPct} size="sm" className="justify-end" />
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-subtle">Keine Position gefunden.</li>}
      </ul>
    </section>
  );
}

function WeightBar({ weight }: { weight: string | null }) {
  const pct = weight ? Math.min(100, Math.max(0, Number(weight) * 100)) : 0;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <span className="tnum">{formatPercent(weight, { signed: false, digits: 1 })}</span>
      <span className="block h-1 w-14 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
