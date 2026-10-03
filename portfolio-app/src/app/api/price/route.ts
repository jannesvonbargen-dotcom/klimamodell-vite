import { NextResponse } from "next/server";
import { todayInBerlin } from "@/domain/market-hours";
import { getDailyHistory, getFxHistory, getQuotes } from "@/server/market";

/**
 * Kurs eines Symbols zu einem Datum (Schlusskurs des Tages oder davor) –
 * zum Vorausfüllen des Formulars. Für heute wird der aktuelle Kurs genutzt.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol");
  const date = params.get("date") ?? todayInBerlin();
  const currency = params.get("currency");
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });

  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 10);
  const fromIso = from.toISOString().slice(0, 10);
  let close: string | null = null;
  let priceDate: string | null = null;
  let kind: "close" | "live" = "close";
  if (date >= todayInBerlin()) {
    const q = (await getQuotes([symbol])).quotes.get(symbol);
    if (q) {
      close = q.price;
      priceDate = q.asOf;
      kind = "live";
    }
  }
  if (!close) {
    const history = await getDailyHistory(symbol, fromIso, date);
    const last = history.filter((p) => p.key <= date).at(-1);
    if (last) {
      close = last.close;
      priceDate = last.key;
    }
  }
  let fx: { rate: string; date: string } | null = null;
  if (currency && currency !== "EUR") {
    const series = (await getFxHistory([currency], fromIso, date)).get(currency === "GBp" ? "GBP" : currency) ?? [];
    const last = series.filter((p) => p.key <= date).at(-1);
    if (last) fx = { rate: last.close, date: last.key };
  }
  return NextResponse.json({ symbol, close, priceDate, kind, fx });
}
