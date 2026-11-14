import { Sheet } from "@/components/sheet";
import { drinkIcons, drinkLabels } from "../domain/people";
import type { DrinkOption } from "../domain/drinks";
import type { DrinkKind } from "../domain/profile";
import { RadioCard } from "./journey-parts";

/**
 * "Lägg till dryck": a small sheet with every drink kind and what it costs (the menu's own price before an estimate).
 * One tap adds it to the person's drinks and closes the sheet; a drink the person already has is marked.
 */
export function DrinkSheet({
  open,
  personName,
  has,
  options,
  onPick,
  onClose,
}: {
  open: boolean;
  personName: string;
  /** Whether the person already has this drink (the usual one or one added): it is marked and adds nothing. */
  has: (kind: DrinkKind) => boolean;
  options: readonly DrinkOption[];
  onPick: (kind: DrinkKind) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Lägg till dryck åt ${personName}`} subtitle="Priset är det som står på menyn, annars en uppskattning." closeLabel="Klar">
      <div role="radiogroup" aria-label={`Dryck åt ${personName}`} data-testid="menu-drink-options" className="flex flex-col gap-2 pb-2">
        {options.map((option) => (
          <RadioCard
            key={option.kind}
            name="drink"
            value={option.kind}
            checked={has(option.kind)}
            onSelect={() => !has(option.kind) && onPick(option.kind)}
            aside={option.sek > 0 ? `${option.estimated ? "ca " : ""}${option.sek} kr` : option.kind === "ingen" ? "" : "0 kr"}
          >
            <span className="flex items-center gap-2 text-headline font-semibold text-ink">
              <span aria-hidden="true">{drinkIcons[option.kind]}</span>
              {drinkLabels[option.kind]}
            </span>
          </RadioCard>
        ))}
      </div>
    </Sheet>
  );
}
