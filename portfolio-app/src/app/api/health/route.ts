import { ensureInitialized } from "@/server/init";

/** Bereitschaft: richtet beim ersten Start die Datenbank ein (die Mac-App wartet darauf). */
export async function GET() {
  await ensureInitialized();
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
