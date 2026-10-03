"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatDate, formatPrice } from "@/lib/format";
import { ChartTable } from "../chart-table";

/**
 * Umsatz und Jahresüberschuss je Geschäftsjahr (Anbieterdaten) plus die
 * Umsatzschätzungen der Analysten – Schätzungen deutlich abgesetzt.
 */

export interface FinancialYear {
  label: string;
  fiscalYearEnd: string;
  revenue: number;
  netIncome: number | null;
  estimate: boolean;
  analysts?: number;
}

const REVENUE = "var(--series-1)";
const INCOME = "var(--series-2)";

export function FinancialsChart({ years, currency }: { years: FinancialYear[]; currency: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const shown = active !== null ? years[active] : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Legende">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: REVENUE }} aria-hidden /> Umsatz
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: INCOME }} aria-hidden /> Jahresüberschuss
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-dashed" style={{ borderColor: REVENUE }} aria-hidden /> Umsatz-Schätzung
          (Analysten)
        </span>
      </div>
      <div
        className="h-[220px]"
        role="img"
        aria-label={`Umsatz und Jahresüberschuss je Geschäftsjahr: ${years.map((y) => `${y.label} ${formatCompact(y.revenue, currency)}`).join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={years}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="22%"
            onMouseMove={(s: { activeTooltipIndex?: unknown }) => {
              const i = Number(s?.activeTooltipIndex);
              setActive(Number.isNaN(i) || s?.activeTooltipIndex === undefined || s?.activeTooltipIndex === null ? null : i);
            }}
            onMouseLeave={() => setActive(null)}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis
              orientation="right"
              width={64}
              axisLine={false}
              tickLine={false}
              tickCount={4}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              tickFormatter={(v: number) => formatCompact(v, currency)}
            />
            <Tooltip content={() => null} cursor={{ fill: "var(--surface-2)", radius: 6 }} isAnimationActive={false} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28}>
              {years.map((y) => (
                <Cell
                  key={y.label}
                  fill={y.estimate ? "transparent" : REVENUE}
                  stroke={y.estimate ? REVENUE : "none"}
                  strokeDasharray={y.estimate ? "3 3" : undefined}
                  strokeWidth={y.estimate ? 1.5 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="netIncome" fill={INCOME} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="tnum min-h-5 text-[13px] text-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-foreground">
              {shown.estimate ? "Schätzung" : "Geschäftsjahr"} bis {formatDate(shown.fiscalYearEnd)}
            </span>
            {" · "}Umsatz {formatCompact(shown.revenue, currency)}
            {shown.netIncome !== null && <> · Jahresüberschuss {formatCompact(shown.netIncome, currency)}</>}
            {shown.estimate && shown.analysts ? <> · Ø von {shown.analysts} Analysten</> : null}
          </>
        ) : (
          <span className="text-subtle">Balken antippen oder überfahren für Details.</span>
        )}
      </p>
      <ChartTable
        caption="Umsatz und Jahresüberschuss je Geschäftsjahr"
        columns={[{ label: "Geschäftsjahr" }, { label: "Umsatz", align: "right" }, { label: "Jahresüberschuss", align: "right" }]}
        rows={years.map((y) => [
          `${y.estimate ? "Schätzung " : ""}bis ${formatDate(y.fiscalYearEnd)}`,
          formatCompact(y.revenue, currency),
          y.netIncome === null ? "—" : formatCompact(y.netIncome, currency),
        ])}
      />
    </div>
  );
}

/** 12-Monats-Kursverlauf (nur mit echtem Kursanbieter). */
export function PriceHistoryChart({ points, currency }: { points: Array<{ key: string; close: string }>; currency: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const data = points.map((p) => ({ key: p.key, price: Number(p.close) }));
  const values = data.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || 1;
  const shown = active !== null ? data[active] : data[data.length - 1];
  return (
    <div className="flex flex-col gap-2">
      <p className="tnum text-[13px] text-muted">
        <span className="font-medium text-foreground">{formatPrice(String(shown.price), currency)}</span> · Schlusskurs{" "}
        {formatDate(shown.key)}
      </p>
      <div
        className="h-[180px]"
        role="img"
        aria-label={`Kursverlauf der letzten 12 Monate von ${formatPrice(String(data[0].price), currency)} auf ${formatPrice(String(data[data.length - 1].price), currency)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            onMouseMove={(s: { activeTooltipIndex?: unknown }) => {
              const i = Number(s?.activeTooltipIndex);
              if (!Number.isNaN(i) && s?.activeTooltipIndex !== undefined && s?.activeTooltipIndex !== null) setActive(i);
            }}
            onMouseLeave={() => setActive(null)}
          >
            <defs>
              <linearGradient id="researchFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REVENUE} stopOpacity={0.14} />
                <stop offset="100%" stopColor={REVENUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="key" hide />
            <YAxis
              domain={[min - pad, max + pad]}
              orientation="right"
              width={56}
              axisLine={false}
              tickLine={false}
              tickCount={4}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            />
            <Tooltip content={() => null} cursor={{ stroke: "var(--subtle-foreground)", strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="price"
              stroke={REVENUE}
              strokeWidth={2}
              fill="url(#researchFill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
