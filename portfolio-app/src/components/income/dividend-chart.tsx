"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";

/**
 * Dividenden je Monat: 12 Monate erhalten (gefüllt) und 12 Monate erwartet
 * (umrandet, Schätzung). Eine Farbe – erhalten und erwartet unterscheiden
 * sich durch Füllung und Legende, nicht nur durch Farbe.
 */

const COLOR = "var(--series-1)";
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export interface MonthDatum {
  month: string;
  received: number;
  receivedNet: number;
  expected: number;
}

function monthLabel(month: string, withYear = false): string {
  const m = Number(month.slice(5, 7));
  return withYear || m === 1 ? `${MONTHS[m - 1]} ${month.slice(2, 4)}` : MONTHS[m - 1];
}

function longMonth(month: string): string {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export function DividendChart({ months, currentMonth }: { months: MonthDatum[]; currentMonth: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const shown = active !== null ? months[active] : null;
  const total = months.reduce((a, m) => a + m.received + m.expected, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Legende">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: COLOR }} aria-hidden /> Erhalten (brutto)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-dashed" style={{ borderColor: COLOR }} aria-hidden /> Erwartet (Schätzung,
          brutto)
        </span>
      </div>
      <div
        className="h-[220px]"
        role="img"
        aria-label={`Dividenden je Monat. ${months
          .filter((m) => m.received || m.expected)
          .map(
            (m) =>
              `${longMonth(m.month)}: ${m.received ? `erhalten ${formatMoney(String(m.received))}` : ""}${m.expected ? ` erwartet ${formatMoney(String(m.expected))}` : ""}`,
          )
          .join("; ")}`}
      >
        {total === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-strong text-[13px] text-subtle">
            Noch keine Dividenden
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={months}
              margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
              barCategoryGap="18%"
              onMouseMove={(s: { activeTooltipIndex?: unknown }) => {
                const i = Number(s?.activeTooltipIndex);
                setActive(s?.activeTooltipIndex === undefined || s?.activeTooltipIndex === null || Number.isNaN(i) ? null : i);
              }}
              onMouseLeave={() => setActive(null)}
            >
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                interval={1}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(m: string) => monthLabel(m)}
              />
              <YAxis
                orientation="right"
                width={56}
                axisLine={false}
                tickLine={false}
                tickCount={4}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatMoney(String(Math.round(v)), "EUR", { compact: true })}
              />
              <Tooltip content={() => null} cursor={{ fill: "var(--surface-2)", radius: 6 }} isAnimationActive={false} />
              <ReferenceLine x={currentMonth} stroke="var(--border-strong)" strokeDasharray="2 3" />
              <Bar dataKey="received" stackId="m" fill={COLOR} isAnimationActive={false} maxBarSize={22} />
              <Bar dataKey="expected" stackId="m" isAnimationActive={false} maxBarSize={22} radius={[4, 4, 0, 0]}>
                {months.map((m) => (
                  <Cell key={m.month} fill="transparent" stroke={m.expected ? COLOR : "none"} strokeDasharray="3 3" strokeWidth={1.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="tnum min-h-5 text-[13px] text-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-foreground">{longMonth(shown.month)}</span>
            {shown.received > 0 && (
              <>
                {" · "}erhalten {formatMoney(String(shown.received))} brutto, {formatMoney(String(shown.receivedNet))} netto
              </>
            )}
            {shown.expected > 0 && <> · erwartet {formatMoney(String(shown.expected))} brutto</>}
            {shown.received === 0 && shown.expected === 0 && " · keine Zahlung"}
          </>
        ) : (
          <span className="text-subtle">
            Balken überfahren oder antippen für Details. Die gestrichelte Linie markiert den laufenden Monat.
          </span>
        )}
      </p>
    </div>
  );
}
