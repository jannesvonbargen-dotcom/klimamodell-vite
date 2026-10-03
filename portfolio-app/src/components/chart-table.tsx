import { cn } from "@/lib/utils";

/**
 * Ausklappbare Tabellenansicht zu einem Diagramm – für Screenreader,
 * Tastatur und alle, die exakte Werte lesen wollen.
 */
export function ChartTable({
  caption,
  columns,
  rows,
  className,
}: {
  caption: string;
  columns: Array<{ label: string; align?: "left" | "right" }>;
  rows: Array<Array<React.ReactNode>>;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <details className={cn("group text-[13px]", className)}>
      <summary className="w-fit cursor-pointer rounded-sm text-[12px] font-medium text-subtle select-none hover:text-foreground">
        Werte als Tabelle
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-[12px] text-subtle">
              {columns.map((c) => (
                <th key={c.label} scope="col" className={cn("px-3 py-2 font-medium", c.align === "right" ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={cn("tnum px-3 py-1.5", columns[j]?.align === "right" ? "text-right" : "text-left", j === 0 && "text-muted")}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Höchstens `max` Zeilen: gleichmäßig ausdünnen, erster und letzter Punkt bleiben. */
export function sampleRows<T>(items: readonly T[], max = 60): T[] {
  if (items.length <= max) return [...items];
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}
