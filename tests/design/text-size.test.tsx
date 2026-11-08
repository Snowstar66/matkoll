import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTextChoice, defaultTextChoice, textBootScript } from "@/lib/text-size";

// Textstorlek / Fetare text: the default (the former Större, 106.25 %) sets nothing is set on
// <html> and every size/weight change lives behind html[data-text] / html[data-bold].

const css = readFileSync("src/app/globals.css", "utf8");
const marker = "Textstorlek and Fetare text (Inställningar";
const feature = css.slice(css.indexOf(marker));
const base = css.slice(0, css.indexOf(marker));

describe("Textstorlek and Fetare text", () => {
  it("sets nothing on <html> at the default", () => {
    const root = document.createElement("html");
    applyTextChoice(defaultTextChoice, root);
    expect(root.hasAttribute("data-text")).toBe(false);
    expect(root.hasAttribute("data-bold")).toBe(false);
    applyTextChoice({ size: "xl", bold: true }, root);
    expect(root.getAttribute("data-text")).toBe("xl");
    expect(root.hasAttribute("data-bold")).toBe(true);
    applyTextChoice(defaultTextChoice, root);
    expect(root.hasAttribute("data-text")).toBe(false);
    expect(root.hasAttribute("data-bold")).toBe(false);
  });

  it("boot script sets nothing with empty storage, and applies stored choices", () => {
    localStorage.clear();
    new Function(textBootScript())();
    expect(document.documentElement.hasAttribute("data-text")).toBe(false);
    expect(document.documentElement.hasAttribute("data-bold")).toBe(false);
    localStorage.setItem("livskoll-text", "s");
    localStorage.setItem("livskoll-bold", "1");
    new Function(textBootScript())();
    expect(document.documentElement.getAttribute("data-text")).toBe("s");
    expect(document.documentElement.hasAttribute("data-bold")).toBe(true);
    document.documentElement.removeAttribute("data-text");
    document.documentElement.removeAttribute("data-bold");
    localStorage.clear();
  });

  it("keeps the default tokens and sets new ones only behind the attributes", () => {
    expect(base).toContain("--body-size: 1rem;");
    expect(base).toContain("--body-weight: 400;");
    expect(base).toContain("--step-size: 24px;");
    expect(base).toContain("--tab-label-size: 11px;");
    expect(base).not.toMatch(/html\s*\{[^}]*font-size/);
    const selectors = [...feature.matchAll(/^(html\[[^{]*)\{/gm)].map((m) => m[1].trim());
    expect(selectors).toEqual(['html[data-text="s"]', 'html[data-text="xl"]', "html[data-bold]"]);
  });
});
