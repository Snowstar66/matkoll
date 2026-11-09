import { Sheet } from "@/components/sheet";
import { drinkIcons, drinkLabels } from "../domain/people";
import type { DrinkOption } from "../domain/drinks";
import type { DrinkKind } from "../domain/profile";
import { RadioCard } from "./journey-parts";

/**
 * "Byt dryck": a small sheet with every drink kind and what it costs (the menu's own price before an estimate).
 * One tap picks it and closes the sheet.
 */
export function DrinkSheet({
  open,
  personName,
  current,
  options,
  onPick,
  onClose,
}: {
  open: boolean;
  personName: string;
  current: DrinkKind | null;
  options: readonly DrinkOption[];
  onPick: (kind: DrinkKind) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Dryck åt ${personName}`} subtitle="Priset är det som står på menyn, annars en uppskattning." closeLabel="Klar">
      <div role="radiogroup" aria-label={`Dryck åt ${personName}`} data-testid="menu-drink-options" className="flex flex-col gap-2 pb-2">
        {options.map((option) => (
          <RadioCard
            key={option.kind}
            name="drink"
            value={option.kind}
            checked={current === option.kind}
            onSelect={() => onPick(option.kind)}
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
