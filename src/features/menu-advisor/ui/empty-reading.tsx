import { CameraIcon, ImageIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { BigButton, StickyFooter, StopBody, TextLink, TopBack } from "./journey-parts";

/** A reading with no dishes: a stop that says so plainly, with tips for a better photo. */
export function EmptyReading({
  error,
  canReadCarefully,
  onCareful,
  onPhoto,
  onBack,
}: {
  error: string | null;
  canReadCarefully: boolean;
  onCareful: () => void;
  onPhoto: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid="menu-empty">
      <TopBack onClick={onBack}>Tolka menyn</TopBack>
      <StopBody icon={<ImageIcon size={34} />} title="Jag kunde inte läsa menyn">
        Det gick inte att hitta några rätter på fotot.
      </StopBody>
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
