import { NextResponse } from "next/server";
import type { RangeKey } from "@/domain/performance";
import { getPerformance } from "@/server/portfolio";

const RANGES: RangeKey[] = ["1D", "1W", "1M", "YTD", "1Y", "MAX"];

export async function GET(request: Request) {
  const range = (new URL(request.url).searchParams.get("range") ?? "1M") as RangeKey;
  if (!RANGES.includes(range)) return NextResponse.json({ error: "Unbekannter Zeitraum" }, { status: 400 });
  return NextResponse.json(await getPerformance(range));
}
