import Link from "next/link";
import { CameraIcon, CoinIcon, InfoIcon } from "@/components/icons";
import { BigButton, StickyFooter, StopBody, TextLink, TopBack } from "./journey-parts";

/** Where the app's owner raises the daily AI cap. */
export const aiCapHref = "/installningar/ai-kostnad";

/** Why a reading stopped: the household's AI cap for today, or anything else (the network, the service, the photo). */
export type MenuStop = { kind: "cap" } | { kind: "error"; message: string; canRetry: boolean };

/**
 * A reading that could not be done, as a screen of its own: one title, one sentence on what happened, one way on.
 * The AI cap has no green button (nothing can be done in the app right now); "Höj taket" is only for the app's owner.
 * Anything else offers "Försök igen" on the same photo (it is still in memory) and "Fota om".
 */
export function StopScreen({ stop, canRaiseCap, onBack, onRetry, onPhoto }: { stop: MenuStop; canRaiseCap: boolean; onBack: () => void; onRetry: () => void; onPhoto: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid="menu-stop" data-kind={stop.kind}>
      <TopBack onClick={onBack}>Tolka menyn</TopBack>
      {stop.kind === "cap" ? (
        <>
          <StopBody icon={<CoinIcon size={34} />} title="Dagens AI-tak är nått">
            Hushållet har använt dagens AI-pengar. Det nollställs i natt.
          </StopBody>
          <StickyFooter>
            {canRaiseCap ? (
              <Link href={aiCapHref} className="inline-flex min-h-13 w-full items-center justify-center rounded-pill border border-border bg-surface px-6 text-headline font-semibold text-accent">

                Höj taket
              </Link>
            ) : null}
            <TextLink onClick={onBack}>Tillbaka</TextLink>
          </StickyFooter>
        </>
      ) : (
        <>
          <StopBody icon={<InfoIcon size={34} />} title="Det gick inte just nu">
            {stop.message}
          </StopBody>
          <StickyFooter>
            {stop.canRetry ? (
              <>
                <BigButton onClick={onRetry}>Försök igen</BigButton>
                <TextLink onClick={onPhoto}>Fota om</TextLink>
              </>
            ) : (
              <BigButton onClick={onPhoto}>
                <CameraIcon size={22} />
                Fota om
              </BigButton>
            )}
          </StickyFooter>
        </>
      )}
    </div>
  );
}
