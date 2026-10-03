"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { restoreImportAction, undoImportAction } from "@/app/actions";
import { formatDateTimeBerlin } from "@/lib/format";
import { Button } from "../ui/button";
import { Card } from "../ui/misc";

export interface BatchRow {
  id: number;
  fileName: string;
  preset: string;
  rowCount: number;
  importedCount: number;
  activeCount: number;
  createdAt: string;
}

export function ImportHistory({ batches }: { batches: BatchRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
        Bisherige Importe
      </h2>
      <Card className="divide-y divide-border">
        {batches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[14px] font-medium">{b.fileName}</div>
              <div className="tnum text-[12px] text-subtle">
                {formatDateTimeBerlin(b.createdAt)} · {b.importedCount} importiert von {b.rowCount} Zeilen
                {b.activeCount !== b.importedCount && ` · ${b.activeCount} aktiv`}
              </div>
            </div>
            {b.activeCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const count = await undoImportAction(b.id);
                    router.refresh();
                    toast(`${count} Transaktionen entfernt`, {
                      action: { label: "Wiederherstellen", onClick: () => restoreImportAction(b.id).then(() => router.refresh()) },
                    });
                  })
                }
              >
                Import rückgängig machen
              </Button>
            ) : (
              <span className="text-[12px] text-subtle">rückgängig gemacht</span>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
