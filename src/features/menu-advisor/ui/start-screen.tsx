import Link from "next/link";
import { Chip } from "@/components/chip";
import { CameraIcon, ChevronRightIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { profilesHref } from "../domain/people";
import type { Person } from "../domain/profile";
import { BigButton, Headline, StickyFooter, TextLink } from "./journey-parts";
import { companyLine } from "./journey";
import { AvatarStack } from "./person-avatar";

/**
 * Step 1: a question, a row with who is with, and one button. Nothing else above the photo button; an error from
 * the last reading stands right under the question, so it is seen without scrolling.
 */
export function StartScreen({
  company,
  error,
  firstTime,
  onSkipFirstTime,
  tonightCount,
  onCompany,
  onPhoto,
  onExplain,
  onTonight,
}: {
  company: readonly Person[];
  error: string | null;
  /** Nobody has anything filled in: a skippable row about what you do not eat. */
  firstTime: boolean;
  onSkipFirstTime: () => void;
  tonightCount: number;
  onCompany: () => void;
  onPhoto: () => void;
  onExplain: () => void;
  onTonight: () => void;
}) {
  const names = company.map((person) => person.name);
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="menu-start">
      <Headline sub="Ta en bild, så hittar jag något åt alla.">Vad står det på menyn?</Headline>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <button
        type="button"
        data-testid="menu-company-row"
        onClick={onCompany}
        className="mt-2 flex min-h-tap items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left"
      >
        <AvatarStack names={names} />
        <span data-testid="menu-company-line" className="min-w-0 flex-1 text-headline font-medium text-ink">
          {companyLine(company)}
        </span>
        <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
      </button>
      {firstTime ? (
        <div className="flex items-center gap-2 rounded-xl bg-mint py-1 pr-1 pl-4 text-mint-ink" data-testid="menu-first-time">
          <Link href={profilesHref} className="flex min-h-tap min-w-0 flex-1 flex-col justify-center py-2">
            <b className="text-headline font-semibold">Berätta kort vad ni inte äter</b>
            <span className="text-body">Då sorterar jag bort det som inte passar.</span>
          </Link>
          <button type="button" onClick={onSkipFirstTime} className="min-h-tap shrink-0 rounded-md px-3 text-body font-medium">
            Hoppa över
          </button>
        </div>
      ) : null}
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
        <TextLink data-testid="menu-explain" onClick={onExplain}>
          Bara förklara menyn
        </TextLink>
      </StickyFooter>
    </div>
  );
}
