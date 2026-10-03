import { todayInBerlin } from "@/domain/market-hours";
import { exportBackup, exportTransactionsCsv } from "@/server/backup";

/** Download der Sicherung: /api/export?format=json (vollständig) oder csv (Transaktionen). */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const day = todayInBerlin();
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (format === "csv") {
    return new Response(exportTransactionsCsv(), {
      headers: {
        ...headers,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="depot-transaktionen-${day}.csv"`,
      },
    });
  }
  if (format !== "json") return Response.json({ error: "format muss json oder csv sein" }, { status: 400 });
  return new Response(JSON.stringify(exportBackup(), null, 2), {
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="depot-sicherung-${day}.json"`,
    },
  });
}
