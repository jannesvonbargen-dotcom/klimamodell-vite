"use client";

import { Command } from "cmdk";
import {
  ArrowLeftRightIcon,
  CoinsIcon,
  CommandIcon,
  EyeIcon,
  LayoutGridIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  RepeatIcon,
  SettingsIcon,
  SproutIcon,
  SunIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { Toaster } from "sonner";
import { formatTimeBerlin } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertNotifier } from "./watchlist/alert-notifier";
import { TransactionDialogProvider, useTransactionDialog } from "./transaction-dialog";
import { Button } from "./ui/button";
import { Kbd, Tooltip, TooltipProvider } from "./ui/misc";

export interface ShellMarket {
  exchange: string;
  name: string;
  open: boolean;
  nextChange: string;
}

export interface ShellProps {
  children: React.ReactNode;
  today: string;
  markets: ShellMarket[];
  provider: { label: string; isDemo: boolean };
  pendingSavings: number;
  alertCount: number;
}

const NAV = [
  { href: "/", label: "Übersicht", icon: LayoutGridIcon },
  { href: "/transaktionen", label: "Transaktionen", icon: ArrowLeftRightIcon },
  { href: "/sparplaene", label: "Sparpläne", icon: RepeatIcon },
  { href: "/ertraege", label: "Erträge", icon: CoinsIcon },
  { href: "/import", label: "Import", icon: UploadIcon },
  { href: "/wachstumswerte", label: "Wachstumswerte", icon: SproutIcon },
  { href: "/watchlist", label: "Watchlist", icon: EyeIcon },
  { href: "/einstellungen", label: "Einstellungen", icon: SettingsIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/position");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell(props: ShellProps) {
  return (
    <TooltipProvider>
      <TransactionDialogProvider today={props.today}>
        <ShellInner {...props} />
      </TransactionDialogProvider>
      <Toaster
        position="bottom-right"
        theme="system"
        toastOptions={{
          classNames: {
            toast: "!rounded-xl !border-border-strong !bg-surface !text-foreground !shadow-[var(--shadow-pop)] !font-sans",
            description: "!text-muted",
            actionButton: "!bg-foreground !text-background !rounded-md !font-medium",
          },
        }}
      />
    </TooltipProvider>
  );
}

function ShellInner({ children, markets, provider, pendingSavings, alertCount }: ShellProps) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const { openCreate } = useTransactionDialog();

  // Tastenkürzel: N = neue Transaktion, Cmd/Ctrl+K = Befehlspalette
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreate]);

  // Navigation schließen, sobald sich die Seite ändert (Anpassung während des Renderns)
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  const nav = (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] font-medium transition-colors duration-150",
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-[18px]", active ? "text-foreground" : "text-subtle group-hover:text-foreground")}
              strokeWidth={1.75}
            />
            <span className="flex-1">{item.label}</span>
            {item.href === "/sparplaene" && pendingSavings > 0 && (
              <span
                className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white"
                aria-label={`${pendingSavings} offene Ausführungen`}
              >
                {pendingSavings}
              </span>
            )}
            {item.href === "/watchlist" && alertCount > 0 && (
              <span
                className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[11px] font-semibold text-black"
                aria-label={`${alertCount} ausgelöste Kursalarme`}
              >
                {alertCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="flex flex-col gap-3">
      <MarketStatusList markets={markets} />
      {provider.isDemo && (
        <Tooltip content="Kurse sind simuliert (MARKET_DATA_PROVIDER=mock). Für echte Kurse in .env.local auf yahoo umstellen.">
          <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-2.5 py-2 text-[12px] font-medium text-warn">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            Demo-Kurse (simuliert)
          </div>
        </Tooltip>
      )}
      <div className="flex items-center justify-between">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="pressable flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-subtle hover:bg-surface-2 hover:text-foreground"
        >
          <CommandIcon className="size-3.5" />
          <span>Befehle</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Seitenleiste (Desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-border px-3 py-4 lg:flex">
        <div className="flex flex-col gap-5">
          <Brand />
          <Button variant="primary" className="w-full justify-between" onClick={() => openCreate()}>
            <span className="flex items-center gap-2">
              <PlusIcon className="size-4" />
              Transaktion
            </span>
            <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground/80">N</Kbd>
          </Button>
          {nav}
        </div>
        {footer}
      </aside>

      {/* Kopfzeile (Mobil) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
        <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menü öffnen" className="-ml-2">
              <MenuIcon className="size-5" />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-[var(--overlay)]" />
            <DialogPrimitive.Content className="anim-sheet fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col justify-between border-r border-border bg-background px-3 py-4 outline-none">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Seiten der App</DialogPrimitive.Description>
              <div className="flex flex-col gap-5">
                <Brand />
                {nav}
              </div>
              {footer}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <Brand compact />
        <Button variant="primary" size="icon-sm" aria-label="Transaktion erfassen" onClick={() => openCreate()}>
          <PlusIcon className="size-4" />
        </Button>
      </header>

      <main id="main" className="min-w-0">
        <div className="mx-auto w-full max-w-[1160px] px-4 pt-6 pb-10 sm:px-6 lg:px-10 lg:pt-10">
          {children}
          <footer className="mt-16 border-t border-border pt-4 text-[12px] text-subtle">
            Keine Anlageberatung. Informationen ohne Gewähr. Auch als solide geltende Aktien können stark fallen. · Alle Daten bleiben auf
            diesem Rechner.
          </footer>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AlertNotifier enabled />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1.5" aria-label="Depot – zur Übersicht">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="7" fill="var(--foreground)" />
        <path
          d="M6 15.5l3.5-4 3 2.5L18 7.5"
          fill="none"
          stroke="var(--background)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.01em]">Depot</span>}
      {compact && <span className="text-[15px] font-semibold tracking-[-0.01em]">Depot</span>}
    </Link>
  );
}

function MarketStatusList({ markets }: { markets: ShellMarket[] }) {
  return (
    <div className="flex flex-col gap-1 px-1" aria-label="Börsenstatus">
      {markets.map((m) => (
        <div key={m.exchange} className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 text-muted">
            <span className={cn("size-1.5 rounded-full", m.open ? "bg-up" : "bg-subtle/60")} aria-hidden />
            {m.name}
          </span>
          <span className="tnum text-subtle">
            {m.open ? `offen bis ${formatTimeBerlin(m.nextChange)}` : `öffnet ${nextOpenLabel(m.nextChange)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function nextOpenLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const fmtDay = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short" });
  const sameDay = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short" });
  const time = formatTimeBerlin(date);
  if (sameDay.format(date) === sameDay.format(now)) return time;
  return `${fmtDay.format(date)} ${time}`;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const options = [
    { value: "dark", label: "Dunkel", icon: MoonIcon },
    { value: "light", label: "Hell", icon: SunIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ];
  return (
    <div role="radiogroup" aria-label="Farbschema" className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = mounted && theme === o.value;
        const Icon = o.icon;
        return (
          <Tooltip key={o.value} content={o.label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.label}
              onClick={() => setTheme(o.value)}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md transition-[background-color,color] duration-150",
                active ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.15)]" : "text-subtle hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Befehlspalette (Cmd+K) – ohne Animation, weil sie sehr oft genutzt wird. */
function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { openCreate } = useTransactionDialog();
  const { setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Array<{ symbol: string; name: string; isin: string | null; origin: string }>>([]);
  const [selected, setSelected] = React.useState("");
  const resultValue = (r: { name: string; symbol: string }) => `${r.name} ${r.symbol} position`;

  const visibleResults = query.trim().length >= 2 ? results : [];

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          const list = d.results.filter((r: { origin: string }) => r.origin === "portfolio").slice(0, 6);
          setResults(list);
          // Treffer im Depot sind am spezifischsten → zuerst auswählen
          if (list[0]) setSelected(resultValue(list[0]));
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  const run = (fn: () => void) => {
    handleOpenChange(false);
    fn();
  };

  const itemClass =
    "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[14px] outline-none data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-subtle";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <DialogPrimitive.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[var(--shadow-pop)] outline-none">
          <DialogPrimitive.Title className="sr-only">Befehlspalette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Seiten öffnen, Aktionen ausführen, Positionen finden
          </DialogPrimitive.Description>
          <Command loop label="Befehlspalette" value={selected} onValueChange={setSelected}>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Suchen oder Befehl eingeben …"
              className="h-13 w-full border-b border-border bg-transparent px-4 text-[15px] outline-none placeholder:text-subtle"
            />
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-subtle">Nichts gefunden.</Command.Empty>
              {visibleResults.length > 0 && (
                <Command.Group
                  heading="Positionen"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-subtle"
                >
                  {visibleResults.map((r) => (
                    <Command.Item
                      key={r.symbol}
                      value={resultValue(r)}
                      onSelect={() => run(() => router.push(`/position/${encodeURIComponent(r.isin ?? r.symbol)}`))}
                      className={itemClass}
                    >
                      <LayoutGridIcon />
                      {r.name}
                      <span className="ml-auto text-[12px] text-subtle">{r.symbol}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group
                heading="Aktionen"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-subtle"
              >
                <Command.Item value="neue transaktion kauf erfassen" onSelect={() => run(() => openCreate())} className={itemClass}>
                  <PlusIcon /> Transaktion erfassen <Kbd className="ml-auto">N</Kbd>
                </Command.Item>
                <Command.Item value="einzahlung erfassen" onSelect={() => run(() => openCreate({ type: "DEPOSIT" }))} className={itemClass}>
                  <PlusIcon /> Einzahlung erfassen
                </Command.Item>
                <Command.Item value="dividende erfassen" onSelect={() => run(() => openCreate({ type: "DIVIDEND" }))} className={itemClass}>
                  <PlusIcon /> Dividende erfassen
                </Command.Item>
                <Command.Item value="csv import" onSelect={() => run(() => router.push("/import"))} className={itemClass}>
                  <UploadIcon /> CSV importieren
                </Command.Item>
                <Command.Item value="dunkles design dark" onSelect={() => run(() => setTheme("dark"))} className={itemClass}>
                  <MoonIcon /> Dunkles Design
                </Command.Item>
                <Command.Item value="helles design light" onSelect={() => run(() => setTheme("light"))} className={itemClass}>
                  <SunIcon /> Helles Design
                </Command.Item>
              </Command.Group>
              <Command.Group
                heading="Seiten"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-subtle"
              >
                {NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.href}
                      value={`seite ${item.label}`}
                      onSelect={() => run(() => router.push(item.href))}
                      className={itemClass}
                    >
                      <Icon /> {item.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
