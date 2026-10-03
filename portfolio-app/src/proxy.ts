import { type NextRequest, NextResponse } from "next/server";

/**
 * Schutz für eine lokal laufende App ohne Login:
 * - nur Anfragen an localhost/127.0.0.1 (plus ALLOWED_HOSTS, z. B. für das
 *   Handy im lokalen Netz) – verhindert DNS-Rebinding,
 * - schreibende Anfragen nur von derselben Herkunft – verhindert, dass eine
 *   fremde Webseite im Browser Daten ändert (CSRF).
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function allowedHosts(): string[] {
  const extra = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...LOCAL_HOSTS, ...extra];
}

function hostname(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function proxy(request: NextRequest) {
  const host = hostname(request.headers.get("host"));
  if (!host || !allowedHosts().includes(host)) {
    return new NextResponse("Host nicht erlaubt", { status: 403 });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      const originHost = hostname(new URL(origin).host);
      if (!originHost || !allowedHosts().includes(originHost)) {
        return new NextResponse("Herkunft nicht erlaubt", { status: 403 });
      }
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
