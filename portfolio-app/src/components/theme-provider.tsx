"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/** Dunkel ist Standard; „System“ folgt der Einstellung des Betriebssystems. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange themes={["light", "dark"]}>
      {children}
    </NextThemesProvider>
  );
}
