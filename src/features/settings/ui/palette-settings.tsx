"use client";

import { type CSSProperties, useSyncExternalStore } from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { DishArt } from "@/components/dish-art";
import {
  clampHue,
  defaultHue,
  defaultPalette,
  type PaletteChoice,
  type PaletteId,
  palettes,
  readPalette,
  resetPalette,
  savePalette,
} from "@/lib/palette";

// Utseende: a row of round swatches (an accessible radio group), the "Ton" slider for
// "Egen", a live preview and "Återställ till Grön". A change applies at once (data-palette
// on <html>) and is remembered on this device only (src/lib/palette.ts). The colours are
// globals.css's `[data-palette]` blocks: a swatch is an element carrying the same attribute.

const listeners = new Set<() => void>();
const serverChoice: PaletteChoice = { palette: defaultPalette, hue: defaultHue };
let cached: PaletteChoice | null = null;

function read(): PaletteChoice {
  const next = readPalette();
  if (cached && cached.palette === next.palette && cached.hue === next.hue) return cached;
  cached = next;
  return next;
}

function changed() {
  cached = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function choose(choice: PaletteChoice) {
  savePalette(choice);
  changed();
}

export function PaletteSettings() {
  const choice = useSyncExternalStore(subscribe, read, () => serverChoice);
  const isDefault = choice.palette === defaultPalette;

  function pick(palette: PaletteId) {
    choose({ palette, hue: choice.hue });
  }

  function reset() {
    resetPalette();
    changed();
  }

  return (
    <section aria-label="Utseende" className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg bg-surface p-4">
        <p className="text-body text-ink-2">Välj en färg för appen. Valet gäller bara den här enheten.</p>
        <div role="radiogroup" aria-label="Färgtema" className="grid grid-cols-4 gap-x-2 gap-y-4">
          {palettes.map((palette) => {
            const on = choice.palette === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={palette.label}
                data-testid={`palette-${palette.id}`}
                onClick={() => pick(palette.id)}
                className="flex min-h-tap flex-col items-center gap-1.5 rounded-md px-1 py-1"
              >
                <span
                  aria-hidden="true"
                  data-palette={palette.id}
                  style={palette.id === "custom" ? ({ "--hue": choice.hue } as CSSProperties) : undefined}
                  className={cx(
                    "flex size-11 items-center justify-center rounded-full border-2 bg-mint",
                    on ? "border-accent" : "border-transparent",
                  )}
                >
                  <span className="size-6 rounded-full bg-accent" />
                </span>
                <span className={cx("text-meta", on ? "font-semibold text-ink" : "text-ink-2")}>{palette.label}</span>
              </button>
            );
          })}
        </div>

        {choice.palette === "custom" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="palette-hue" className="text-control text-ink">
              Ton
            </label>
            <input
              id="palette-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              value={choice.hue}
              onChange={(event) => choose({ palette: "custom", hue: clampHue(event.target.value) })}
              className="hue-slider"
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="palette-preview">
        <h2 className="text-section-label uppercase text-ink-2">Förhandsvisning</h2>
        <div aria-hidden="true" inert className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-illus-bg">
              <DishArt dish="sallad" size={44} />
            </span>
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <Badge tone="mint">Kan lagas nu</Badge>
              <span className="text-accent">Grönsakssallad</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip selected tabIndex={-1}>
              Middag
            </Chip>
            <Chip selected={false} tabIndex={-1}>
              Lunch
            </Chip>
          </div>
          <Button type="button" tabIndex={-1} fullWidth>
            Spara recept
          </Button>
        </div>
      </div>

      <Button type="button" variant="secondary" disabled={isDefault} onClick={reset}>
        Återställ till Grön
      </Button>
    </section>
  );
}
