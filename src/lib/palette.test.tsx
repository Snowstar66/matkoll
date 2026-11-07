import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPalette, clampHue, paletteBootScript, readPalette, resetPalette, savePalette } from "./palette";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.style.removeProperty("--hue");
});

describe("palette storage", () => {
  it("is green with the default hue when nothing is stored", () => {
    expect(readPalette()).toEqual({ palette: "gron", hue: 150 });
  });

  it("stores a choice per device and applies it to <html>", () => {
    savePalette({ palette: "bla", hue: 150 });
    expect(localStorage.getItem("livskoll-palette")).toBe("bla");
    expect(document.documentElement.getAttribute("data-palette")).toBe("bla");
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("");
    expect(readPalette().palette).toBe("bla");
  });

  it("sets --hue only for Egen, and keeps the hue", () => {
    savePalette({ palette: "custom", hue: 200 });
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("200");
    expect(localStorage.getItem("livskoll-hue")).toBe("200");
    expect(readPalette()).toEqual({ palette: "custom", hue: 200 });
  });

  it("green clears the attribute and the stored palette", () => {
    savePalette({ palette: "rosa", hue: 150 });
    savePalette({ palette: "gron", hue: 150 });
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    expect(localStorage.getItem("livskoll-palette")).toBeNull();
  });

  it("resetPalette forgets both keys and goes back to green", () => {
    savePalette({ palette: "custom", hue: 10 });
    resetPalette();
    expect(localStorage.getItem("livskoll-palette")).toBeNull();
    expect(localStorage.getItem("livskoll-hue")).toBeNull();
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("");
  });

  it("ignores an unknown palette and a bad hue", () => {
    localStorage.setItem("livskoll-palette", "neon");
    localStorage.setItem("livskoll-hue", "abc");
    expect(readPalette()).toEqual({ palette: "gron", hue: 150 });
    expect(clampHue("999")).toBe(360);
    expect(clampHue(-5)).toBe(0);
    expect(clampHue(12.6)).toBe(13);
    expect(clampHue(undefined)).toBe(150);
  });

  it("works, and still applies the choice, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPalette()).toEqual({ palette: "gron", hue: 150 });
    expect(() => savePalette({ palette: "sand", hue: 150 })).not.toThrow();
    expect(document.documentElement.getAttribute("data-palette")).toBe("sand");
    expect(() => resetPalette()).not.toThrow();
  });

  it("applyPalette on another element leaves <html> alone", () => {
    const el = document.createElement("div");
    applyPalette({ palette: "persika", hue: 150 }, el);
    expect(el.getAttribute("data-palette")).toBe("persika");
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
  });
});

describe("paletteBootScript", () => {
  function run() {
    // eslint-disable-next-line no-new-func -- the boot script is plain text for <head>; run it as the browser would
    new Function(paletteBootScript())();
  }

  it("does nothing for green and when nothing is stored", () => {
    run();
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    localStorage.setItem("livskoll-palette", "gron");
    run();
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
  });

  it("sets data-palette for a stored preset and --hue for Egen", () => {
    localStorage.setItem("livskoll-palette", "lavendel");
    run();
    expect(document.documentElement.getAttribute("data-palette")).toBe("lavendel");
    localStorage.setItem("livskoll-palette", "custom");
    localStorage.setItem("livskoll-hue", "300");
    run();
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("300");
  });

  it("uses the default hue when none is stored, ignores an unknown palette, and never throws", () => {
    localStorage.setItem("livskoll-palette", "custom");
    run();
    expect(document.documentElement.style.getPropertyValue("--hue")).toBe("150");
    document.documentElement.removeAttribute("data-palette");
    localStorage.setItem("livskoll-palette", "neon");
    run();
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });
});
