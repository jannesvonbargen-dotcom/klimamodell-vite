import type { Metadata } from "next";
import { ImportHistory } from "@/components/import/import-history";
import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/page-header";
import { listImportBatches } from "@/server/import";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  const batches = listImportBatches();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Import"
        description="Buchungen aus Trade Republic übernehmen. Bereits vorhandene Buchungen werden erkannt und übersprungen."
      />
      <ImportWizard />
      {batches.length > 0 && <ImportHistory batches={batches} />}
    </div>
  );
}
