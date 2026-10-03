import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { todayInBerlin } from "@/domain/market-hours";
import { providerInfo } from "@/server/market";
import { marketInfos, pendingSavingsSuggestions } from "@/server/portfolio";
import "./globals.css";

// Alle Seiten lesen die lokale Datenbank → immer zur Anfragezeit rendern
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Depot", template: "%s · Depot" },
  description: "Lokale Portfolio- und Trading-App – Tracking und Analyse, keine Orders.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const provider = providerInfo();
  return (
    <html lang="de" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
          Zum Inhalt springen
        </a>
        <ThemeProvider>
          <AppShell
            today={todayInBerlin()}
            markets={marketInfos()}
            provider={{ label: provider.label, isDemo: provider.isDemo }}
            pendingSavings={pendingSavingsSuggestions().length}
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
