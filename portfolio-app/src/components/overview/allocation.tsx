"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { d } from "@/domain/decimal";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AllocationSlice } from "@/server/portfolio";
import { Segmented } from "../transaction-dialog";
import { Card } from "../ui/misc";

/** Feste Reihenfolge der Kategorienfarben (dataviz-Referenzpalette). */
const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
];
const OTHER = "var(--subtle-foreground)";
const MAX_SLICES = 6;

type Dimension = "sector" | "region" | "kind";

/** Mehr als 6 Gruppen werden zu „Sonstige“ zusammengefasst – nie zusätzliche Farben erfinden. */
function fold(slices: AllocationSlice[]): Array<AllocationSlice & { color: string }> {
  const head = slices.slice(0, MAX_SLICES).map((s, i) => ({ ...s, color: SERIES[i] }));
  const tail = slices.slice(MAX_SLICES);
  if (tail.length === 0) return head;
  const value = tail.reduce((acc, s) => acc.plus(s.valueEUR), d(0));
  const share = tail.reduce((acc, s) => acc.plus(s.share), d(0));
  return [...head, { label: "Sonstige", valueEUR: value.toString(), share: share.toString(), color: OTHER }];
}

export function Allocation({ allocation }: { allocation: Record<Dimension, AllocationSlice[]> }) {
  const [dim, setDim] = React.useState<Dimension>("sector");
  const [hover, setHover] = React.useState<number | null>(null);
  const slices = fold(allocation[dim]);
  const focused = hover !== null ? slices[hover] : null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Allokation</h2>
        <Segmented
          value={dim}
          onChange={(v) => {
            setDim(v);
            setHover(null);
          }}
          options={[
            { value: "sector", label: "Sektor" },
            { value: "region", label: "Region" },
            { value: "kind", label: "Klasse" },
          ]}
          ariaLabel="Aufteilung nach"
        />
      </div>
      {slices.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-subtle">Noch keine Positionen.</p>
      ) : (
        <div className="grid items-center gap-5 sm:grid-cols-[160px_1fr]">
          <div
            className="relative mx-auto size-40"
            role="img"
            aria-label={`Allokation nach ${dim === "sector" ? "Sektor" : dim === "region" ? "Region" : "Anlageklasse"}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey={(s: AllocationSlice) => Number(s.valueEUR)}
                  nameKey="label"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={slices.length > 1 ? 1.5 : 0}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {slices.map((s, i) => (
                    <Cell
                      key={s.label}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.35}
                      style={{ transition: "opacity 150ms ease" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="tnum text-[18px] font-semibold">
                {focused ? formatPercent(focused.share, { signed: false, digits: 1 }) : slices.length}
              </span>
              <span className="max-w-24 truncate text-[11px] text-subtle">
                {focused ? focused.label : slices.length === 1 ? "Gruppe" : "Gruppen"}
              </span>
            </div>
          </div>
          <ul className="flex flex-col gap-0.5">
            {slices.map((s, i) => (
              <li
                key={s.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors duration-150",
                  hover === i && "bg-surface-2",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="tnum text-subtle">{formatMoney(s.valueEUR, "EUR", { compact: Number(s.valueEUR) >= 100000 })}</span>
                <span className="tnum w-14 text-right font-medium">{formatPercent(s.share, { signed: false, digits: 1 })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
