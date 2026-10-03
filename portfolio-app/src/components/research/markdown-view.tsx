import type * as React from "react";
import type { Block, Inline } from "@/research/markdown";
import { cn } from "@/lib/utils";

/** Rendert den Markdown-Baum ausschließlich über React-Elemente (kein dangerouslySetInnerHTML). */

export function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <span key={i}>{n.text}</span>;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-foreground">
                <InlineView nodes={n.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineView nodes={n.children} />
              </em>
            );
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">
                <InlineView nodes={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

export function BlocksView({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-[15px] leading-relaxed text-muted", className)}>
      {blocks.map((b, i): React.ReactNode => {
        switch (b.type) {
          case "h3":
            return (
              <h4 key={i} className="mt-2 text-[14px] font-semibold text-foreground first:mt-0">
                <InlineView nodes={b.children} />
              </h4>
            );
          case "p":
            return (
              <p key={i} className="text-pretty">
                <InlineView nodes={b.children} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="flex flex-col gap-2">
                {b.items.map((item, j) => (
                  <li
                    key={j}
                    className="relative pl-4 text-pretty before:absolute before:top-[0.7em] before:left-0 before:size-1.5 before:rounded-full before:bg-border-strong"
                  >
                    <InlineView nodes={item} />
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
