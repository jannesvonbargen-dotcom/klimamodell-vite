/**
 * Minimaler, sicherer Markdown-Parser für die redaktionellen Texte
 * (content/theses/*.md). Erzeugt einen einfachen Baum statt HTML –
 * gerendert wird ausschließlich über React, es wird nie HTML eingeschleust.
 *
 * Unterstützt: Frontmatter (key: value), ## / ### Überschriften, Absätze,
 * Aufzählungen (- / *), **fett**, *kursiv* und [Links](https://…).
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block = { type: "h3"; children: Inline[] } | { type: "p"; children: Inline[] } | { type: "ul"; items: Inline[][] };

export interface Section {
  title: string;
  blocks: Block[];
}

export interface MarkdownDoc {
  meta: Record<string, string>;
  /** Text vor der ersten ##-Überschrift. */
  intro: Block[];
  sections: Section[];
}

export function parseFrontmatter(source: string): { meta: Record<string, string>; body: string } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    meta[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(match[0].length) };
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("**")) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (rest[0] === "*" || rest[0] === "_") {
      const marker = rest[0];
      const end = text.indexOf(marker, i + 1);
      // Nur als Hervorhebung werten, wenn direkt Text folgt (kein "2 * 3")
      if (end > i + 1 && text[i + 1] !== " " && text[end - 1] !== " ") {
        flush();
        out.push({ type: "em", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (rest[0] === "[") {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        flush();
        if (SAFE_URL.test(link[2])) out.push({ type: "link", href: link[2], children: parseInline(link[1]) });
        else out.push(...parseInline(link[1]));
        i += link[0].length;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): MarkdownDoc {
  const { meta, body } = parseFrontmatter(source);
  const intro: Block[] = [];
  const sections: Section[] = [];
  let target = intro;
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) target.push({ type: "p", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.length) target.push({ type: "ul", items: list.map(parseInline) });
    list = null;
  };

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph();
      flushList();
      if (h[1].length <= 2) {
        const section: Section = { title: h[2].trim(), blocks: [] };
        sections.push(section);
        target = section.blocks;
      } else {
        target.push({ type: "h3", children: parseInline(h[2].trim()) });
      }
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      list ??= [];
      list.push(item[1]);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      // Fortsetzungszeile eines Listenpunkts
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return { meta, intro, sections };
}

/** Abschnitt anhand des Titelanfangs finden (Groß-/Kleinschreibung egal). */
export function findSection(doc: MarkdownDoc, prefix: string): Section | null {
  const p = prefix.toLowerCase();
  return doc.sections.find((s) => s.title.toLowerCase().startsWith(p)) ?? null;
}

/** Reiner Text eines Inline-Baums (z. B. für Vorschauen). */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : plainText(n.children))).join("");
}

/** Kurzfassung für Karten: erster Absatz der These und die Stichworte der Risiken. */
export function thesisSummary(doc: MarkdownDoc): { reasoning: Inline[] | null; risks: string[] } {
  const thesis = findSection(doc, "investment-these");
  const reasoning = thesis?.blocks.find((b) => b.type === "p");
  const riskList = findSection(doc, "risiken")?.blocks.find((b) => b.type === "ul");
  const risks =
    riskList?.type === "ul"
      ? riskList.items.map((item) => {
          const first = item[0];
          const label = first?.type === "strong" ? plainText(first.children) : plainText(item).split(/[.:]/)[0];
          return label.replace(/:\s*$/, "").trim();
        })
      : [];
  return { reasoning: reasoning?.type === "p" ? reasoning.children : null, risks };
}
