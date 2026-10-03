import { cn } from "@/lib/utils";

/** Mini-Verlauf (z. B. 30 Tage) – rein dekorativ, die Zahlen stehen daneben. Farbe nach Richtung über den Zeitraum. */
export function Sparkline({
  values,
  width = 88,
  height = 28,
  className,
}: {
  values: Array<string | number>;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return <div className={cn("shrink-0", className)} style={{ width, height }} aria-hidden />;
  const nums = values.map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map(
    (v, i) => `${((i / (nums.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
  );
  const up = nums[nums.length - 1] >= nums[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0", className)} aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={up ? "var(--up)" : "var(--down)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
