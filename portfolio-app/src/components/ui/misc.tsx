"use client";

import {
  DropdownMenu as MenuPrimitive,
  Popover as PopoverPrimitive,
  Switch as SwitchPrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

// Tooltip ------------------------------------------------------------------

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  // Nach dem ersten Tooltip öffnen weitere sofort (skipDelay)
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={400}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="anim-pop z-[70] max-w-72 rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] leading-snug text-background shadow-[var(--shadow-pop)]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// Popover ------------------------------------------------------------------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "anim-pop z-[60] rounded-xl border border-border-strong bg-surface p-1 shadow-[var(--shadow-pop)] outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// Dropdown-Menü ------------------------------------------------------------

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "anim-pop z-[60] min-w-44 rounded-xl border border-border-strong bg-surface p-1 shadow-[var(--shadow-pop)]",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-subtle",
        destructive && "text-down data-[highlighted]:bg-down-soft [&_svg]:text-down",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}

// Switch -------------------------------------------------------------------

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-surface-3 transition-colors duration-150 data-[state=checked]:bg-up",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-out-strong)] data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

// Card / Skeleton / Badge --------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "up" | "down" | "warn" | "accent" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    up: "bg-up-soft text-up",
    down: "bg-down-soft text-down",
    warn: "bg-warn-soft text-warn",
    accent: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent",
  } as const;
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}
