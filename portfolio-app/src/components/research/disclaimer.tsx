import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const DISCLAIMER = "Keine Anlageberatung. Informationen ohne Gewähr. Auch als solide geltende Aktien können stark fallen.";

/** Pflichthinweis der Rubrik „Solide Wachstumswerte“. */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <div role="note" className={cn("flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-foreground", className)}>
      <InfoIcon className="mt-px size-4 shrink-0 text-warn" aria-hidden />
      <p>
        <strong className="font-semibold">Keine Anlageberatung.</strong> Informationen ohne Gewähr. Auch als solide geltende Aktien können
        stark fallen.
      </p>
    </div>
  );
}
