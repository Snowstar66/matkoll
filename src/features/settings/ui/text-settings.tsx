"use client";

import { useSyncExternalStore } from "react";
import { cx } from "@/components/cx";
import { SwitchRow } from "@/components/switch-row";
import { defaultTextChoice, readTextChoice, saveTextChoice, type TextChoice, textSizes } from "@/lib/text-size";

// Utseende: Textstorlek (three choices) and Fetare text (a switch). A change applies at once
// (data-text / data-bold on <html>) and is remembered on this device only (src/lib/text-size.ts).

const listeners = new Set<() => void>();
let cached: TextChoice | null = null;

function read(): TextChoice {
  const next = readTextChoice();
  if (cached && cached.size === next.size && cached.bold === next.bold) return cached;
  cached = next;
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function choose(choice: TextChoice) {
  saveTextChoice(choice);
  cached = null;
  for (const listener of listeners) listener();
}

export function TextSettings() {
  const choice = useSyncExternalStore(subscribe, read, () => defaultTextChoice);

  return (
    <section aria-label="Text" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <h2 className="text-section-label uppercase text-ink-2">Textstorlek</h2>
        <p className="text-body text-ink-2">Gör texten i hela appen större. Valet gäller bara den här enheten.</p>
        <div role="radiogroup" aria-label="Textstorlek" className="grid grid-cols-3 gap-2">
          {textSizes.map((size) => {
            const on = choice.size === size.id;
            return (
              <button
                key={size.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`text-${size.id}`}
                onClick={() => choose({ ...choice, size: size.id })}
                className={cx(
                  "flex min-h-tap items-center justify-center rounded-md border-2 px-2 text-control",
                  on ? "border-accent font-semibold text-ink" : "border-transparent bg-fill text-ink-2",
                )}
              >
                {size.label}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="overflow-hidden rounded-lg bg-surface">
        <SwitchRow
          label="Fetare text"
          hint="Gör vanlig text lite tjockare så den är lättare att läsa. Gäller bara den här enheten."
          on={choice.bold}
          onToggle={() => choose({ ...choice, bold: !choice.bold })}
        />
      </ul>
    </section>
  );
}
