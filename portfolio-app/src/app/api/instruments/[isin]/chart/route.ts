import { NextResponse } from "next/server";
import { getInstrumentChart, type InstrumentRange } from "@/server/position";

const RANGES: InstrumentRange[] = ["1D", "1W", "1M", "1Y", "5Y", "MAX"];

export async function GET(request: Request, ctx: RouteContext<"/api/instruments/[isin]/chart">) {
  const { isin } = await ctx.params;
  const range = (new URL(request.url).searchParams.get("range") ?? "1Y") as InstrumentRange;
  if (!RANGES.includes(range)) return NextResponse.json({ error: "Unbekannter Zeitraum" }, { status: 400 });
  const chart = await getInstrumentChart(decodeURIComponent(isin), range);
  if (!chart) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json(chart);
}
