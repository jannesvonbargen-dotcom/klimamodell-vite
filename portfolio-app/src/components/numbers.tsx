"use client";

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import * as React from "react";
import { formatMoney, formatPercent, signOf } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Gewinn/Verlust: Farbe + Vorzeichen + Pfeil, damit die Richtung auch ohne
 * Farbwahrnehmung erkennbar ist.
 */
export function Delta({
  value,
  percent,
  currency = "EUR",
  className,
  size = "md",
  showArrow = true,
  muted = false,
}: {
  value?: string | number | null;
  percent?: string | number | null;
  currency?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showArrow?: boolean;
  muted?: boolean;
}) {
  const sign = signOf(value ?? percent ?? null);
  const color = muted ? "text-muted" : sign > 0 ? "text-up" : sign < 0 ? "text-down" : "text-muted";
  const Icon = sign > 0 ? ArrowUpRightIcon : sign < 0 ? ArrowDownRightIcon : MinusIcon;
  const hasValue = value !== null && value !== undefined && value !== "";
  const hasPercent = percent !== null && percent !== undefined && percent !== "";
  const label = [
    sign > 0 ? "Gewinn" : sign < 0 ? "Verlust" : "Unverändert",
    hasValue ? formatMoney(String(value), currency, { signed: true }) : null,
    hasPercent ? formatPercent(String(percent)) : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (!hasValue && !hasPercent) return <span className={cn("text-subtle", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tnum font-medium whitespace-nowrap",
        size === "sm" && "text-[13px]",
        size === "lg" && "text-[15px]",
        color,
        className,
      )}
      aria-label={label}
    >
      {showArrow && <Icon aria-hidden className={cn("shrink-0", size === "sm" ? "size-3.5" : "size-4")} strokeWidth={2.25} />}
      {hasValue && <span>{formatMoney(String(value), currency, { signed: true })}</span>}
      {hasValue && hasPercent && <span aria-hidden className="opacity-60">·</span>}
      {hasPercent && <span>{formatPercent(String(percent))}</span>}
    </span>
  );
}

/** Spielt eine dezente Einblendung ab, sobald sich der angezeigte Wert ändert. */
export function AnimatedText({ value, className, animate = true }: { value: string; className?: string; animate?: boolean }) {
  const first = React.useRef(true);
  const [tick, setTick] = React.useState(0);
  const previous = React.useRef(value);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (animate && previous.current !== value) setTick((t) => t + 1);
    previous.current = value;
  }, [value, animate]);
  return (
    <span key={tick} className={cn(tick > 0 && "num-enter", "inline-block", className)}>
      {value}
    </span>
  );
}

const AVATAR_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-7)", "var(--series-5)", "var(--series-6)", "var(--series-4)", "var(--series-8)"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Monogramm statt externer Logos: Logos von Drittanbietern würden verraten,
 * welche Werte im Depot liegen. Ein eigenes Logo kann pro Instrument
 * hinterlegt werden.
 */
export function InstrumentAvatar({ name, symbol, logoUrl, size = 36, className }: { name: string; symbol: string; logoUrl?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const initials = name
    .replace(/\b(Inc|Corp|AG|SE|N\.V|S\.A|plc|Co|Ltd|UCITS|ETF|Holding|Group)\.?\b/gi, "")
    .split(/[\s\-&.()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const color = AVATAR_COLORS[hash(symbol) % AVATAR_COLORS.length];
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full bg-surface-2 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${color} 88%, black)` }}
    >
      {initials || symbol.slice(0, 2)}
    </span>
  );
}
