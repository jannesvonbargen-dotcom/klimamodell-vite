import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="tnum text-[40px] leading-none font-semibold tracking-[-0.03em] text-subtle">404</span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[18px] font-semibold">Seite nicht gefunden</h1>
        <p className="text-[14px] text-muted">Das Wertpapier oder die Seite gibt es hier nicht (mehr).</p>
      </div>
      <Button variant="primary" asChild>
        <Link href="/">Zur Übersicht</Link>
      </Button>
    </Card>
  );
}
