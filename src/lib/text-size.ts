// Textstorlek and Fetare text (Inställningar → Utseende): per device, like the colour theme.
// Kept in localStorage (wrapped, storage can be blocked) and applied as `data-text` ("l" | "xl")
// and `data-bold` on <html>; the sizes and weights themselves live in globals.css. Standard and
// "off" set nothing on <html>, so the default renders exactly as before. textBootScript() runs
// before the first paint so a chosen size never flashes the standard one.

export const textSizes = [
  { id: "standard", label: "Standard" },
  { id: "l", label: "Större" },
  { id: "xl", label: "Störst" },
] as const;

export type TextSizeId = (typeof textSizes)[number]["id"];

export const defaultTextSize: TextSizeId = "standard";
export const textSizeStorageKey = "livskoll-text";
export const boldStorageKey = "livskoll-bold";

export type TextChoice = { size: TextSizeId; bold: boolean };
export const defaultTextChoice: TextChoice = { size: defaultTextSize, bold: false };

export function isTextSizeId(value: unknown): value is TextSizeId {
  return textSizes.some((size) => size.id === value);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readTextChoice(): TextChoice {
  try {
    const store = storage();
    const size = store?.getItem(textSizeStorageKey);
    return { size: isTextSizeId(size) ? size : defaultTextSize, bold: store?.getItem(boldStorageKey) === "1" };
  } catch {
    return defaultTextChoice;
  }
}

/** Puts the choice on <html>; the defaults clear both attributes. */
export function applyTextChoice(choice: TextChoice, root: HTMLElement = document.documentElement): void {
  if (choice.size === defaultTextSize) root.removeAttribute("data-text");
  else root.setAttribute("data-text", choice.size);
  if (choice.bold) root.setAttribute("data-bold", "");
  else root.removeAttribute("data-bold");
}

/** Remembers the choice on this device and applies it at once. Never throws. */
export function saveTextChoice(choice: TextChoice): void {
  try {
    const store = storage();
    if (store) {
      if (choice.size === defaultTextSize) store.removeItem(textSizeStorageKey);
      else store.setItem(textSizeStorageKey, choice.size);
      if (choice.bold) store.setItem(boldStorageKey, "1");
      else store.removeItem(boldStorageKey);
    }
  } catch {
    // Storage blocked: the choice holds until the page is closed.
  }
  applyTextChoice(choice);
}

/** The inline script for <head>: the same reading as readTextChoice/applyTextChoice, static. */
export function textBootScript(): string {
  const ids = JSON.stringify(textSizes.filter((size) => size.id !== defaultTextSize).map((size) => size.id));
  return (
    `try{var s=localStorage,t=s.getItem(${JSON.stringify(textSizeStorageKey)}),r=document.documentElement;` +
    `if(${ids}.indexOf(t)>-1)r.setAttribute("data-text",t);` +
    `if(s.getItem(${JSON.stringify(boldStorageKey)})==="1")r.setAttribute("data-bold","")}catch(e){}`
  );
}
