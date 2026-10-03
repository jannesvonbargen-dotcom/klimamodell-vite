"use client";

import * as React from "react";
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { d } from "@/domain/decimal";
import { formatDateLong, formatNumber, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InstrumentChart, InstrumentRange } from "@/server/position";
import { Delta } from "../numbers";
import { Segmented } from "../transaction-dialog";

const RANGES: Array<{ value: InstrumentRange; label: string; long: string }> = [
  { value: "1D", label: "1T", long: "Heute" },
  { value: "1W", label: "1W", long: "1 Woche" },
  { value: "1M", label: "1M", long: "1 Monat" },
  { value: "1Y", label: "1J", long: "1 Jahr" },
  { value: "5Y", label: "5J", long: "5 Jahre" },
  { value: "MAX", label: "Max", long: "Seit Beginn" },
];

const MARKER_COLOR = { BUY: "var(--series-1)", SAVINGS_PLAN: "var(--series-1)", SELL: "var(--series-2)" } as const;
const MARKER_LABEL = { BUY: "Kauf", SAVINGS_PLAN: "Sparplan", SELL: "Verkauf" } as const;

function label(key: string, intraday: boolean) {
  return key.length > 10 && intraday ? `${formatDateLong(key)}, ${key.slice(11, 16)} Uhr` : formatDateLong(key);
}

export function InstrumentChartView({ isin, initial }: { isin: string; initial: InstrumentChart }) {
  const [range, setRange] = React.useState<InstrumentRange>(initial.range);
  const [cache, setCache] = React.useState<Partial<Record<InstrumentRange, InstrumentChart>>>({});
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState<number | null>(null);
  const data = range === initial.range ? initial : (cache[range] ?? initial);

  async function select(next: InstrumentRange) {
    setRange(next);
    setActive(null);
    if (next === initial.range || cache[next]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/instruments/${encodeURIComponent(isin)}/chart?range=${next}`);
      if (res.ok) {
        const json = (await res.json()) as InstrumentChart;
        setCache((c) => ({ ...c, [next]: json }));
      }
    } finally {
      setLoading(false);
    }
  }

  const points = data.points;
  const shown = points.length > 1;
  const base = data.range === "1D" && data.previousClose ? data.previousClose : points[0]?.price;
  const current = active !== null ? points[active] : points[points.length - 1];
  // Veränderung mit Decimal statt Float berechnen
  const change = current && base ? d(current.price).minus(base) : null;
  const changePct = current && base ? d(current.price).minus(base).div(base) : null;
  const up = (points[points.length - 1]?.price ?? 0) >= (base ?? 0);
  const color = up ? "var(--up)" : "var(--down)";
  const markerAtActive = active !== null ? data.markers.filter((m) => m.key === points[active]?.key) : [];
  const values = points.map((p) => p.price);
  const min = values.length ? Math.min(...values, ...data.markers.map((m) => m.price)) : 0;
  const max = values.length ? Math.max(...values, ...data.markers.map((m) => m.price)) : 0;
  const pad = (max - min) * 0.08 || max * 0.01 || 1;
  const rangeInfo = RANGES.find((r) => r.value === range)!;
  const hasMarkers = data.markers.length > 0;

  function handleMove(state: { activeTooltipIndex?: unknown } | undefined) {
    const idx = state?.activeTooltipIndex;
    if (idx !== undefined && idx !== null && !Number.isNaN(Number(idx))) setActive(Number(idx));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="tnum text-[32px] leading-none font-semibold tracking-[-0.02em]">
          {current ? formatPrice(String(current.price), data.currency) : "—"}
        </div>
        <div className="flex min-h-6 flex-wrap items-center gap-x-2">
          {change !== null && changePct !== null && (
            <Delta
              value={change.toDecimalPlaces(4).toString()}
              percent={changePct.toDecimalPlaces(6).toString()}
              currency={data.currency}
            />
          )}
          <span className="text-[13px] text-subtle">{active !== null && current ? label(current.key, data.intraday) : rangeInfo.long}</span>
          {markerAtActive.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-[12px]">
              <span className="size-2 rounded-full" style={{ background: MARKER_COLOR[m.type] }} aria-hidden />
              {MARKER_LABEL[m.type]} {formatQuantity(m.quantity)} Stk. à {formatPrice(String(m.price), data.currency)}
            </span>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "relative h-[260px] rounded-xl transition-opacity duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          loading && "opacity-50",
        )}
        tabIndex={shown ? 0 : -1}
        role="img"
        aria-label={shown ? `Kursverlauf ${rangeInfo.long}. Pfeiltasten zum Durchgehen.` : "Keine Kursdaten"}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setActive((cur) =>
              Math.max(
                0,
                Math.min(points.length - 1, (cur ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1)),
              ),
            );
          } else if (e.key === "Escape") setActive(null);
        }}
        onBlur={() => setActive(null)}
      >
        {shown ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 0, bottom: 4, left: 4 }}
              onMouseMove={handleMove}
              onTouchMove={handleMove}
              onMouseLeave={() => setActive(null)}
            >
              <defs>
                <linearGradient id="instFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="key" hide />
              <YAxis
                domain={[min - pad, max + pad]}
                orientation="right"
                width={56}
                tickCount={4}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatNumber(v, v < 10 ? 2 : 0)}
              />
              <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
              {base && <ReferenceLine y={base} stroke="var(--chart-grid)" strokeWidth={1} />}
              <Area
                type="monotone"
                dataKey="price"
                stroke={color}
                strokeWidth={2}
                fill="url(#instFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
              {data.markers.map((m, i) => (
                <ReferenceDot
                  key={`${m.key}-${i}`}
                  x={m.key}
                  y={m.price}
                  r={5}
                  fill={MARKER_COLOR[m.type]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
              {active !== null && current && (
                <>
                  <ReferenceLine x={current.key} stroke="var(--subtle-foreground)" strokeWidth={1} />
                  <ReferenceDot x={current.key} y={current.price} r={4.5} fill={color} stroke="var(--background)" strokeWidth={2} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-strong text-[13px] text-subtle">
            Keine Kursdaten für diesen Zeitraum
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={range} onChange={select} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} ariaLabel="Zeitraum" />
        {hasMarkers && (
          <div className="flex items-center gap-4 text-[12px] text-muted" aria-label="Legende">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: MARKER_COLOR.BUY }} aria-hidden /> Kauf / Sparplan
            </span>
            {data.markers.some((m) => m.type === "SELL") && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: MARKER_COLOR.SELL }} aria-hidden /> Verkauf
              </span>
            )}
          </div>
        )}
      </div>
      {shown && changePct !== null && active === null && range !== "1D" && (
        <p className="sr-only">Veränderung im Zeitraum: {formatPercent(changePct.toDecimalPlaces(6).toString())}</p>
      )}
    </div>
  );
}
