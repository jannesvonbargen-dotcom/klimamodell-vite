import { Card, Skeleton } from "./ui/misc";

/** Lade-Skelette, die dem späteren Layout entsprechen (kein Springen beim Einblenden). */

function Status() {
  return (
    <span className="sr-only" role="status">
      Wird geladen …
    </span>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Status />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-56" />
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-[260px] w-full rounded-xl" />
          <Skeleton className="h-8 w-80 max-w-full" />
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </Card>
        ))}
      </div>
      <ListSkeleton rows={6} />
    </div>
  );
}

export function ListSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Status />
      {title && <Skeleton className="h-5 w-40" />}
      <Card className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-48 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function PageTitleSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Status />
      <Skeleton className="h-4 w-28" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-[260px] w-full rounded-xl" />
      </Card>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Status />
      <PageTitleSkeleton />
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i} className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-8" />
              ))}
            </div>
            <Skeleton className="h-2 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
