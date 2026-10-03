import { triggeredAlerts } from "@/server/watchlist";

/** Ausgelöste Kursalarme für die Benachrichtigung im Browser. */
export async function GET() {
  return Response.json({ alerts: await triggeredAlerts() }, { headers: { "cache-control": "no-store" } });
}
