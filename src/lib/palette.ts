// Färgtema (Inställningar → Utseende): which colour theme this device uses. Kept in
// localStorage (wrapped, since storage can be blocked) and applied as `data-palette`
// (and `--hue` for "Egen") on <html>; the colours themselves live in globals.css.
// Green is the default and sets nothing on <html>. paletteBootScript() runs before the
// first paint so a chosen theme never flashes green. No colour values here (AD-17).

export const palettes = [
  { id: "gron", label: "Grön" },
  { id: "bla", label: "Blå" },
  { id: "lavendel", label: "Lavendel" },
  { id: "persika", label: "Persika" },
  { id: "sand", label: "Sand" },
  { id: "rosa", label: "Rosa" },
  { id: "custom", label: "Egen" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];

export const defaultPalette: PaletteId = "gron";
export const defaultHue = 150;
export const paletteStorageKey = "livskoll-palette";
export const hueStorageKey = "livskoll-hue";

export type PaletteChoice = { palette: PaletteId; hue: number };

export function isPaletteId(value: unknown): value is PaletteId {
  return palettes.some((palette) => palette.id === value);
}

/** A hue as a whole number 0–360; anything else is the default hue. */
export function clampHue(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return defaultHue;
  return Math.min(360, Math.max(0, Math.round(number)));
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The device's choice; green when nothing (valid) is stored or storage is blocked. */
export function readPalette(): PaletteChoice {
  try {
    const store = storage();
    const id = store?.getItem(paletteStorageKey);
    return { palette: isPaletteId(id) ? id : defaultPalette, hue: clampHue(store?.getItem(hueStorageKey)) };
  } catch {
    return { palette: defaultPalette, hue: defaultHue };
  }
}

/** Puts the choice on <html>: green clears both, so the default needs no attribute. */
export function applyPalette(choice: PaletteChoice, root: HTMLElement = document.documentElement): void {
  if (choice.palette === defaultPalette) {
    root.removeAttribute("data-palette");
    root.style.removeProperty("--hue");
    return;
  }
  root.setAttribute("data-palette", choice.palette);
  if (choice.palette === "custom") root.style.setProperty("--hue", String(clampHue(choice.hue)));
  else root.style.removeProperty("--hue");
}

/** Remembers the choice on this device and applies it at once. Never throws. */
export function savePalette(choice: PaletteChoice): void {
  try {
    const store = storage();
    if (store) {
      if (choice.palette === defaultPalette) store.removeItem(paletteStorageKey);
      else store.setItem(paletteStorageKey, choice.palette);
      store.setItem(hueStorageKey, String(clampHue(choice.hue)));
    }
  } catch {
    // Storage blocked: the choice holds until the page is closed.
  }
  applyPalette(choice);
}

/** Back to green and the default hue; forgets what was stored. */
export function resetPalette(): void {
  try {
    const store = storage();
    store?.removeItem(paletteStorageKey);
    store?.removeItem(hueStorageKey);
  } catch {
    // Nothing stored that can be removed.
  }
  applyPalette({ palette: defaultPalette, hue: defaultHue });
}

/**
 * The inline script for <head>: the same reading as readPalette/applyPalette, as plain
 * text, static (no request data), so prerender is unaffected.
 */
export function paletteBootScript(): string {
  const ids = JSON.stringify(palettes.filter((palette) => palette.id !== defaultPalette).map((palette) => palette.id));
  return (
    `try{var s=localStorage,p=s.getItem(${JSON.stringify(paletteStorageKey)}),r=document.documentElement;` +
    `if(${ids}.indexOf(p)>-1){r.setAttribute("data-palette",p);` +
    `if(p==="custom"){var v=s.getItem(${JSON.stringify(hueStorageKey)}),h=v===null?NaN:Math.round(Number(v));` +
    `if(!isFinite(h))h=${defaultHue};r.style.setProperty("--hue",String(Math.min(360,Math.max(0,h))))}}}catch(e){}`
  );
}
