import { NextResponse } from "next/server";
import { searchInstruments } from "@/server/market";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchInstruments(q.slice(0, 80));
  return NextResponse.json({ results });
}
