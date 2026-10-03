import { describe, expect, it } from "vitest";
import { findSection, parseInline, parseMarkdown, plainText } from "./markdown";

describe("Markdown", () => {
  it("liest Frontmatter, Abschnitte, Listen und Hervorhebungen", () => {
    const doc = parseMarkdown(
      [
        "---",
        "name: Test AG",
        "updated: 2026-10-03",
        "---",
        "",
        "## Kurzprofil",
        "",
        "Erste Zeile",
        "zweite Zeile mit **fett**.",
        "",
        "### Unterpunkt",
        "Text",
        "",
        "## Risiken",
        "",
        "- **Zinsen:** steigen",
        "- Wettbewerb",
        "  mit Fortsetzung",
      ].join("\n"),
    );
    expect(doc.meta).toEqual({ name: "Test AG", updated: "2026-10-03" });
    expect(doc.sections.map((s) => s.title)).toEqual(["Kurzprofil", "Risiken"]);
    const profile = doc.sections[0].blocks;
    expect(profile[0]).toEqual({
      type: "p",
      children: [
        { type: "text", text: "Erste Zeile zweite Zeile mit " },
        { type: "strong", children: [{ type: "text", text: "fett" }] },
        { type: "text", text: "." },
      ],
    });
    expect(profile[1].type).toBe("h3");
    const risks = findSection(doc, "risiken")!.blocks[0];
    expect(risks.type).toBe("ul");
    if (risks.type === "ul") {
      expect(risks.items).toHaveLength(2);
      expect(plainText(risks.items[1])).toBe("Wettbewerb mit Fortsetzung");
    }
  });

  it("lässt nur sichere Links zu und behandelt HTML als Text", () => {
    expect(parseInline("[ok](https://example.com)")).toEqual([
      { type: "link", href: "https://example.com", children: [{ type: "text", text: "ok" }] },
    ]);
    expect(parseInline("[böse](javascript:alert(1))")[0]).toEqual({ type: "text", text: "böse" });
    expect(parseInline("<script>x</script>")).toEqual([{ type: "text", text: "<script>x</script>" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ type: "text", text: "2 * 3 * 4" }]);
  });
});
