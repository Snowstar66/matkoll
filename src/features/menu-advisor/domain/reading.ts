// The live reading of a menu: what POST /api/menu/read?stream=1 sends, one JSON object per line (NDJSON), and who read it.
// Pure and client-safe. The server builds the lines (formatMenuStreamLine), the client reads them (parseMenuStreamLine).
import type { ErrorCode } from "@/lib/errors";
import type { Menu, MenuDish } from "./types";

export type MenuQualityName = "standard" | "careful";

/** Who read the menu: the model's name for people, and its effort in Swedish. */
export type MenuReader = { model: "Haiku 5.5" | "Sonnet 5.5"; effort: "låg" | "medel" };

/** The model and effort behind each quality, as the server's menuModels have them (a test keeps them together). */
export function menuReaderOf(quality: MenuQualityName): MenuReader {
  return quality === "careful" ? { model: "Sonnet 5.5", effort: "medel" } : { model: "Haiku 5.5", effort: "låg" };
}

/** "Läst av Haiku 5.5 · låg". */
export function menuReaderText(reader: MenuReader): string {
  return `Läst av ${reader.model} · ${reader.effort}`;
}

/** The finished reading, in the last line and as the plain JSON route's answer (plus the reader there). */
export type MenuReading = {
  menu: Menu;
  quality: MenuQualityName;
  /** True when a standard reading was redone as careful by the server (no prices, or not valid). */
  escalated: boolean;
  model: MenuReader["model"];
  effort: MenuReader["effort"];
};

/**
 * The lines, in the order they come:
 * - `reading`: a reading starts, with who reads. Comes first; comes again with `restart: true` when the server redoes a
 *   standard reading as careful: drop the dishes you have, the new reading sends them all again.
 * - `language`: the menu's language is known ("Översätter från spanska ..." when it is not sv).
 * - `dish`: one more dish, already normalised (currency from the menu's symbol), `index` = its place in the list
 *   (0, 1, 2 ...), which is also its dishIndex in the final menu.ratter when nothing is dropped. Only from a model that
 *   streams; others send all dishes in a row at the end of the reading.
 * - `done`: the whole menu (normalizeMenu applied; the authoritative list: replace what you have) and who read it.
 * - `error`: the reading failed after it started. A failure before the first line is a plain JSON answer with an HTTP
 *   status instead (401, 429 for the daily cap, 502, 503), as the non-streaming route gives.
 */
export type MenuStreamEvent =
  | { type: "reading"; quality: MenuQualityName; restart: boolean; model: MenuReader["model"]; effort: MenuReader["effort"] }
  | { type: "language"; sprak: Menu["sprak"] }
  | { type: "dish"; index: number; dish: MenuDish }
  | ({ type: "done" } & MenuReading)
  | { type: "error"; code: ErrorCode };

export const menuStreamContentType = "application/x-ndjson";

/** One line of the stream, newline included. */
export function formatMenuStreamLine(event: MenuStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** One line read back; null for an empty, broken or unknown line (skip it). */
export function parseMenuStreamLine(line: string): MenuStreamEvent | null {
  const text = line.trim();
  if (text === "") return null;
  try {
    const value = JSON.parse(text) as { type?: unknown };
    switch (value.type) {
      case "reading":
      case "language":
      case "dish":
      case "done":
      case "error":
        return value as MenuStreamEvent;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Cuts a stream of text pieces into lines: feed each decoded chunk to `push` and it hands back the complete
 * events so far; `end` gives the last line when the stream stops without a final newline.
 */
export function createMenuStreamParser(): { push: (chunk: string) => MenuStreamEvent[]; end: () => MenuStreamEvent[] } {
  let rest = "";
  const read = (lines: string[]) => lines.flatMap((line) => parseMenuStreamLine(line) ?? []);
  return {
    push(chunk) {
      const parts = (rest + chunk).split("\n");
      rest = parts.pop() ?? "";
      return read(parts);
    },
    end() {
      const last = rest;
      rest = "";
      return read([last]);
    },
  };
}
