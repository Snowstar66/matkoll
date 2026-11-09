import { CameraIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { BigButton, Headline, StickyFooter, TextLink } from "./journey-parts";

/** A reading with no dishes: says so plainly, with tips for a better photo. */
export function EmptyReading({ error, canReadCarefully, onCareful, onPhoto }: { error: string | null; canReadCarefully: boolean; onCareful: () => void; onPhoto: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="menu-empty">
      <Headline sub="Det gick inte att hitta några rätter på fotot. Några tips:">Jag kunde inte läsa menyn</Headline>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <ul className="list-disc rounded-xl bg-surface py-4 pr-4 pl-9 text-body text-ink-2">
        <li>Håll kameran rakt framför menyn</li>
        <li>Undvik blänk från lampor och glas</li>
        <li>Är menyn lång? Fota ett stycke i taget, en sida per foto</li>
      </ul>
      <StickyFooter>
        <BigButton onClick={onPhoto}>
          <CameraIcon size={22} />
          Fota om
        </BigButton>
        {canReadCarefully ? <TextLink onClick={onCareful}>Läs noggrannare</TextLink> : null}
      </StickyFooter>
    </div>
  );
}
