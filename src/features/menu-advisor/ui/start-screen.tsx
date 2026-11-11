import type { ReactNode } from "react";
import { Chip } from "@/components/chip";
import { CameraIcon } from "@/components/icons";
import type { Person } from "../domain/profile";
import { CompanyRows } from "./company-rows";
import { BigButton, Headline, StickyFooter, TopBack } from "./journey-parts";

/**
 * Steps 1 and 2, "Tolka menyn": the back link to Matsedel, the title and one sentence, who eats (the rows straight on
 * the page), and at the bottom one button, Fota menyn. Errors are not shown here: they have screens of their own.
 */
export function StartScreen({
  people,
  chosenIds,
  tonightOnly,
  onToggle,
  onAddGuest,
  tonightCount,
  onPhoto,
  onTonight,
  slot,
}: {
  people: readonly Person[];
  chosenIds: ReadonlySet<string>;
  tonightOnly: ReadonlySet<string>;
  onToggle: (personId: string) => void;
  onAddGuest: () => void;
  tonightCount: number;
  onPhoto: () => void;
  onTonight: () => void;
  /** A quiet link the route layer puts under the button ("Inte på plats än? Sök restauranger"); features do not import each other (AD-1). */
  slot?: ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid="menu-start">
      <TopBack href="/matsedel">Matsedel</TopBack>
      <Headline sub="Fota menyn, så förklarar jag rätterna och föreslår något åt var och en.">Tolka menyn</Headline>
      <CompanyRows people={people} chosenIds={chosenIds} tonightOnly={tonightOnly} onToggle={onToggle} onAdd={onAddGuest} />
      {tonightCount > 0 ? (
        <Chip selected={false} onClick={onTonight} count={tonightCount} className="self-start">
          Ikväll
        </Chip>
      ) : null}
      <StickyFooter>
        <BigButton data-testid="menu-photo" onClick={onPhoto}>
          <CameraIcon size={22} />
          Fota menyn
        </BigButton>
        {slot}
      </StickyFooter>
    </div>
  );
}
