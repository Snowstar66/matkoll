import { AiOrb, aiHeroOrbSize } from "@/components/ai-working";
import { languageName } from "../domain/labels";
import { menuReaderText } from "../domain/reading";
import { listPrice, readingStatus, type ReadingView } from "./journey";
import { StickyFooter, TextLink, TopBack } from "./journey-parts";

type StepState = "done" | "active" | "waiting";

/** The steps a reading goes through, as far as the stream has told: reading, translating (a menu in another language), explaining the dishes. */
export function readingSteps(view: ReadingView): { id: string; label: string; state: StepState }[] {
  const found = view.dishes.length > 0;
  const known = view.language !== null || found;
  const translating = view.language !== null && view.language !== "sv";
  return [
    { id: "read", label: "Läser menyn", state: known ? "done" : "active" },
    ...(translating ? [{ id: "translate", label: `Översätter från ${languageName(view.language!)}`, state: found ? ("done" as const) : ("active" as const) }] : []),
    { id: "explain", label: "Förklarar rätterna", state: found ? "active" : known && !translating ? "active" : "waiting" },
  ];
}

/**
 * Step 2: a ring and one line that changes with what the server has found ("Läser menyn…", "Översätter från
 * spanska…", "Hittade 4 rätter"), and under it the dishes as they come in, a calm list that grows. Who is reading
 * stands once, quietly. "Avbryt" is a text link.
 */
export function ReadingScreen({ view, careful, onCancel }: { view: ReadingView; careful: boolean; onCancel: () => void }) {
  const status = readingStatus(view, careful);
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid="menu-reading">
      <TopBack />
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <AiOrb size={aiHeroOrbSize} />
        <h2 role="status" data-testid="menu-reading-status" className="ai-shimmer text-[1.5rem] leading-8 font-semibold text-ink">
          {status}
        </h2>
        <div aria-hidden="true" className="ai-track" />
        <ol aria-hidden="true" data-testid="menu-reading-steps" className="flex flex-col gap-2 text-left">
          {readingSteps(view).map((step) => (
            <li key={step.id} data-state={step.state} className="flex items-center gap-3 text-body data-[state=waiting]:text-ink-3 data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=done]:text-ink-2">
              <span className="ai-step-dot" data-state={step.state}>
                {step.state === "done" ? "✓" : ""}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
        {careful ? <p className="text-body text-ink-2">Det här tar längre tid, upp till ett par minuter.</p> : null}
        {view.reader ? (
          <p data-testid="menu-reader" className="text-meta text-ink-3">
            {menuReaderText(view.reader)}
          </p>
        ) : null}
      </div>
      {view.dishes.length > 0 ? (
        <ul data-testid="menu-reading-dishes" aria-label="Rätter hittills" className="mx-auto flex w-full max-w-sm flex-col rounded-xl bg-surface px-4 py-1">
          {view.dishes.map((dish, index) => (
            <li
              key={`${index}-${dish.originalnamn}`}
              className={`flex items-baseline justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0 motion-safe:animate-step-in ${index === view.dishes.length - 1 ? "ai-fresh" : ""}`}
            >
              <span className="min-w-0 text-row-title text-ink">{dish.originalnamn}</span>
              <span className="shrink-0 text-body text-ink-2">{listPrice(dish)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <StickyFooter>
        <TextLink onClick={onCancel}>Avbryt</TextLink>
      </StickyFooter>
    </div>
  );
}
