import { ListSkeleton, PageTitleSkeleton } from "@/components/skeletons";
import { Card, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <PageTitleSkeleton />
      <Card className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[220px] w-full rounded-xl" />
      </Card>
      <ListSkeleton rows={5} />
    </div>
  );
}
