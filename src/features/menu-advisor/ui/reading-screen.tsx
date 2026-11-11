import { AiOrb, aiHeroOrbSize } from "@/components/ai-working";
import { menuReaderText } from "../domain/reading";
import { listPrice, readingStatus, type ReadingView } from "./journey";
import { StickyFooter, TextLink, TopBack } from "./journey-parts";

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
        <h2 role="status" data-testid="menu-reading-status" className="text-[1.5rem] leading-8 font-semibold text-ink">
          {status}
        </h2>
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
              className="flex items-baseline justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0 motion-safe:animate-step-in"
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
