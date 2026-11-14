import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { drinkIcons, drinkLabels } from "../domain/people";
import type { DrinkOption } from "../domain/drinks";
import type { DrinkKind } from "../domain/profile";
import { BigButton } from "./journey-parts";

/**
 * "Lägg till dryck åt Anna": every drink kind with what it costs (the menu's own price before an estimate), and "Utan
 * dryck" last. A tap adds the drink and the sheet stays open for more; a drink the person has says "Redan med" and
 * answers a tap with a line, never silence. Every addition shows a check and a short line.
 */
export function DrinkSheet({
  personName,
  has,
  options,
  onPick,
  onNone,
  onClose,
}: {
  personName: string;
  /** Whether the person already has this drink (the usual one or one added), or for "ingen": has no drink at all. */
  has: (kind: DrinkKind) => boolean;
  options: readonly DrinkOption[];
  onPick: (kind: DrinkKind) => void;
  /** "Utan dryck": takes the person's drinks away. */
  onNone: () => void;
  onClose: () => void;
}) {
  // The drinks added while the sheet is open say "Tillagd"; the ones from before say "Redan med".
  const [just, setJust] = useState<DrinkKind[]>([]);
  const [line, setLine] = useState<string | null>(null);
  const label = (kind: DrinkKind) => (kind === "ingen" ? "utan dryck" : drinkLabels[kind].toLocaleLowerCase("sv-SE"));

  function tap(kind: DrinkKind) {
    if (has(kind) || just.includes(kind)) {
      setLine(kind === "ingen" ? `${personName} är redan utan dryck.` : `${personName} har redan ${label(kind)}.`);
      return;
    }
    if (kind === "ingen") {
      onNone();
      setJust([kind]);
      setLine(`${personName} är utan dryck.`);
      return;
    }
    onPick(kind);
    setJust((current) => [...current.filter((entry) => entry !== "ingen"), kind]);
    setLine(`${drinkLabels[kind]} lades till åt ${personName}.`);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Lägg till dryck åt ${personName}`}
      subtitle="Priset är det som står på menyn, annars en uppskattning."
      closeLabel="Klar"
      footer={
        <div className="flex flex-col gap-2 border-t border-hairline pt-2">
          <p role="status" data-testid="menu-drink-line" className="min-h-5 text-center text-meta text-ink-2">
            {line ?? "Tryck på en dryck för att lägga till den"}
          </p>
          <BigButton onClick={onClose}>Klar</BigButton>
        </div>
      }
    >
      <ul data-testid="menu-drink-options" aria-label={`Dryck åt ${personName}`} className="flex flex-col rounded-xl bg-surface px-4 py-1">
        {options.map((option) => {
          const done = just.includes(option.kind);
          const had = !done && has(option.kind);
          const price = option.sek > 0 ? `${option.estimated ? "ca " : ""}${option.sek} kr` : option.kind === "ingen" ? "" : "0 kr";
          return (
            <li key={option.kind} className="border-t border-hairline first:border-t-0">
              <button
                type="button"
                data-testid="menu-drink-option"
                aria-label={done ? `${drinkLabels[option.kind]}, tillagd` : had ? `${drinkLabels[option.kind]}, redan med` : `Lägg till ${label(option.kind)}`}
                onClick={() => tap(option.kind)}
                className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-row-title font-semibold text-ink">
                  <span aria-hidden="true">{drinkIcons[option.kind]}</span>
                  {option.kind === "ingen" ? "Utan dryck" : drinkLabels[option.kind]}
                </span>
                {price ? <span className="shrink-0 text-body text-ink-2">{price}</span> : null}
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-pill bg-accent px-2.5 py-1.5 text-meta font-semibold text-on-accent">
                    <CheckIcon size={14} />
                    {option.kind === "ingen" ? "Vald" : "Tillagd"}
                  </span>
                ) : had ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-pill bg-fill px-2.5 py-1.5 text-meta font-semibold text-ink-2">
                    <CheckIcon size={14} />
                    {option.kind === "ingen" ? "Vald" : "Redan med"}
                  </span>
                ) : (
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-fill text-ink">
                    <PlusIcon size={18} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
