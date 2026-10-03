import type { Metadata } from "next";
import Link from "next/link";
import { ImportHistory } from "@/components/import/import-history";
import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/misc";
import { listImportBatches } from "@/server/import";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  const batches = listImportBatches();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Import"
        description="Transaktionen aus einer CSV-Datei übernehmen. Bereits vorhandene Buchungen werden erkannt und übersprungen."
      />
      <ImportWizard />
      <div className="grid gap-4 lg:grid-cols-3">
        <HelpCard title="Trade Republic">
          In der App unter <strong>Profil → Kontoauszüge → Transaktionsexport</strong> eine CSV-Datei erstellen und hier hineinziehen. Das
          Format wird automatisch erkannt (Käufe, Sparpläne, Dividenden, Zinsen, Steuern, Ein- und Auszahlungen).
        </HelpCard>
        <HelpCard title="pytr">
          <code className="rounded bg-surface-2 px-1">pytr export_transactions</code> erzeugt eine Semikolon-CSV im
          Portfolio-Performance-Format. Spalten und Typen werden vorgeschlagen.
        </HelpCard>
        <HelpCard title="Andere Broker">
          Jede CSV mit Kopfzeile funktioniert: Spalten zuordnen, Typen zuordnen, Vorschau prüfen. Duplikate werden über Datum, ISIN,
          Stückzahl und Betrag erkannt. Die CSV-Sicherung aus den{" "}
          <Link
            href="/einstellungen"
            className="text-accent underline decoration-accent/40 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-accent"
          >
            Einstellungen
          </Link>{" "}
          wird automatisch erkannt.
        </HelpCard>
      </div>
      {batches.length > 0 && <ImportHistory batches={batches} />}
    </div>
  );
}

function HelpCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{children}</p>
    </Card>
  );
}
