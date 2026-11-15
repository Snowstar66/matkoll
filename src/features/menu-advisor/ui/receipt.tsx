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
 * The nota at the bottom of the answer: "Se notan i förväg" and the sum, and Klart. A tap on the sum unfolds it as a
 * receipt: the restaurant at the top, per person every dish and drink with its price, a dashed rule, the sum and a torn
 * edge, in a typewriter face, so you see it grow with each addition. Folded it is two lines.
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
  const total = `ca ${Math.round(totals.totalSek)} kr`;
  return (
    <>
      {open ? (
        <div id={bodyId} data-testid="menu-receipt" className="flex flex-col font-mono text-ink">
          <div className="max-h-[40dvh] overflow-y-auto overscroll-contain bg-surface px-4 pt-3 pb-2">
            <p className="text-center text-meta font-bold tracking-widest text-ink uppercase">{menu.restaurang ?? "Nota"}</p>
            <p className="text-center text-meta text-ink-3">Nota i förväg</p>
            <div aria-hidden="true" className="my-2 border-t border-dashed border-ink-3/60" />
            {company.map((person) => {
              const lines = receiptLines(menu, person, choices);
              const sum = totals.perPerson.find((entry) => entry.personId === person.id)?.totalSek ?? 0;
              return (
                <section key={person.id} aria-label={`Nota ${person.name}`} className="flex flex-col py-1.5">
                  <p className="flex items-baseline justify-between gap-3 text-body font-bold text-ink">
                    <span>{person.name}</span>
                    <span>{approxKr(sum)}</span>
                  </p>
                  {lines.length === 0 ? <p className="pl-3 text-meta text-ink-3">Inget valt</p> : null}
                  {lines.map((line) => (
                    <p key={line.key} data-testid="menu-receipt-line" className="flex items-baseline justify-between gap-3 pl-3 text-meta text-ink-2">
                      <span className="min-w-0 wrap-break-word">{line.label}</span>
                      <span className="shrink-0">{line.sek === null ? "Pris saknas" : line.sek > 0 ? approxKr(line.sek) : "0 kr"}</span>
                    </p>
                  ))}
                </section>
              );
            })}
            <div aria-hidden="true" className="my-2 border-t border-dashed border-ink-3/60" />
            <p className="flex items-baseline justify-between gap-3 pb-1 text-headline font-bold text-ink">
              <span>SUMMA</span>
              <span>{total}</span>
            </p>
            {note ? <p className="pb-1 text-meta text-ink-3">{note}</p> : null}
          </div>
          <div aria-hidden="true" className="h-1.5 text-surface" style={{ background: "conic-gradient(from -45deg at 50% 100%, currentColor 90deg, transparent 0) 0 0 / 12px 6px repeat-x" }} />
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
          Se notan i förväg
          <ChevronDownIcon size={18} className={cx("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </span>
        <b data-testid="menu-total" className="font-mono text-[1.75rem] leading-8 font-bold text-ink">{total}</b>
      </button>
      {note && !open ? <span className="-mt-1 text-right text-meta text-ink-3">{note}</span> : null}
      <BigButton onClick={onDone}>Klart</BigButton>
    </>
  );
}
