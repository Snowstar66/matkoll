"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { ShareIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { formatInviteCode, inviteLink, inviteShareText, inviteValidUntil } from "../domain/invite-code";

const noSubscription = () => () => {};
const browserCanShare = () => typeof navigator.share === "function";

export type ShownInvite = { id: string; code: string; expiresAt: string };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Bjud in till hushållet" (Story 21.2b): the code large (3+3, monospace), how
 * long it is valid, the link with Kopiera, and Dela inbjudan (the phone's share
 * sheet; on a computer without one, "Kopiera inbjudan"). Återkalla inbjudan
 * closes it ("Tog bort inbjudan." with Ångra, from the page). Klar closes the sheet.
 */
export function InviteSheet({
  invite,
  onClose,
  onRevoke,
  siteUrl,
  inviter,
  household,
  appName,
}: {
  invite: ShownInvite | null;
  onClose: () => void;
  onRevoke: (invite: ShownInvite) => void;
  siteUrl: string;
  inviter: string;
  household: string;
  appName: string;
}) {
  const { showToast } = useToast();
  const link = invite ? inviteLink(siteUrl, invite.code) : "";
  const canShare = useSyncExternalStore(noSubscription, browserCanShare, () => true);

  async function share() {
    if (!invite) return;
    const text = inviteShareText({ inviter, household, link, code: invite.code, app: appName });
    if (canShare) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // Closing the share sheet is no failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    showToast((await copy(text)) ? "Kopierade inbjudan." : "Det gick inte att kopiera.");
  }

  return (
    <Sheet
      open={invite !== null}
      onClose={onClose}
      title="Bjud in till hushållet"
      closeLabel="Klar"
      footer={
        <div className="flex flex-col gap-1">
          <Button fullWidth onClick={() => void share()} data-testid="invite-share">
            <ShareIcon size={20} />
            {canShare ? "Dela inbjudan" : "Kopiera inbjudan"}
          </Button>
          <Button variant="danger" fullWidth onClick={() => invite && onRevoke(invite)}>
            Återkalla inbjudan
          </Button>
        </div>
      }
    >
      {invite ? (
        <div className="flex flex-col">
          <p className="text-body text-ink-2">Den du bjuder in får en egen inloggning och ser allt som ni har i {appName}.</p>
          <div className="mt-3 rounded-lg bg-bg px-4 pt-4 pb-3.5 text-center">
            <p className="text-[13px] leading-[18px] font-medium tracking-[0.5px] text-ink-2 uppercase">Kod</p>
            <p className="mt-0.5 font-mono text-[34px] leading-[44px] font-semibold tracking-[6px] text-ink" data-testid="invite-code">
              {formatInviteCode(invite.code)}
            </p>
            <p className="text-meta text-ink-2">Gäller till {inviteValidUntil(invite.expiresAt)} · för en person</p>
          </div>
          <div className="mt-2.5 flex min-h-12 items-center gap-2 rounded-md border border-border py-1 pr-1 pl-3.5">
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2" data-testid="invite-link">
              {link.replace(/^https?:\/\//, "")}
            </span>
            <Chip
              selected={false}
              action
              onClick={async () => showToast((await copy(link)) ? "Kopierade länken." : "Det gick inte att kopiera.")}
            >
              Kopiera
            </Chip>
          </div>
          <p className="mt-3 text-meta text-ink-2">Inget mejl skickas. Dela länken i ett meddelande, eller läs upp koden.</p>
        </div>
      ) : null}
    </Sheet>
  );
}
