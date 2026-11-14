import { useId, useState } from "react";
import { cx } from "@/components/cx";
import { ChevronDownIcon } from "@/components/icons";
import type { Totals } from "../domain/drinks";
import type { Choices } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Menu } from "../domain/types";
import { approxKr, receiptLines } from "./journey";
import { BigButton } from "./journey-parts";

/**
 * The nota at the bottom of the answer: "Ni landar på ca N kr" and Klart. A tap on the sum unfolds what it is made of,
 * per person, every dish and drink with its price, so you see it grow with each addition. Folded it is two lines.
 */
export function Receipt({
  menu,
  company,
  choices,
  totals,
  note,
  onDone,
}: {
  menu: Menu;
  company: readonly Person[];
  choices: Choices;
  totals: Totals;
  note: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <>
      {open ? (
        <div id={bodyId} data-testid="menu-receipt" className="max-h-[40dvh] overflow-y-auto overscroll-contain rounded-xl bg-surface px-4 py-2">
          {company.map((person) => {
            const lines = receiptLines(menu, person, choices);
            const sum = totals.perPerson.find((entry) => entry.personId === person.id)?.totalSek ?? 0;
            return (
              <section key={person.id} aria-label={`Nota ${person.name}`} className="flex flex-col border-t border-hairline py-2 first:border-t-0">
                <p className="flex items-baseline justify-between gap-3 text-body font-semibold text-ink">
                  <span>{person.name}</span>
                  <span>{approxKr(sum)}</span>
                </p>
                {lines.length === 0 ? <p className="text-meta text-ink-3">Inget valt</p> : null}
                {lines.map((line) => (
                  <p key={line.key} data-testid="menu-receipt-line" className="flex items-baseline justify-between gap-3 text-meta text-ink-2">
                    <span className="min-w-0 wrap-break-word">{line.label}</span>
                    <span className="shrink-0">{line.sek === null ? "Pris saknas" : line.sek > 0 ? approxKr(line.sek) : "0 kr"}</span>
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        data-testid="menu-receipt-toggle"
        onClick={() => setOpen((value) => !value)}
        className="-mx-1 flex min-h-tap items-center justify-between gap-3 rounded-md px-1 text-left"
      >
        <span className="flex items-center gap-1 text-body text-ink-2">
          Ni landar på
          <ChevronDownIcon size={18} className={cx("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </span>
        <b data-testid="menu-total" className="text-[1.75rem] leading-8 font-bold text-ink">{`ca ${Math.round(totals.totalSek)} kr`}</b>
      </button>
      {note ? <span className="-mt-1 text-right text-meta text-ink-3">{note}</span> : null}
      <BigButton onClick={onDone}>Klart</BigButton>
    </>
  );
}
