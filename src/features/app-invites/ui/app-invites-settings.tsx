"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { useConfirmDelete } from "@/components/confirm-delete";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ShareIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { TrashButton } from "@/components/trash-button";
import { inviteValidUntil } from "@/features/household";
import { errorMessages } from "@/lib/errors";
import { inviteByEmail, removeInvite } from "../actions/app-invites";
import {
  type AppInvite,
  appInviteLink,
  appInviteShareText,
  appInviteStatusText,
  formatAppInviteCode,
  isPlausibleEmail,
} from "../domain/app-invite";

const noSubscription = () => () => {};
const browserCanShare = () => typeof navigator.share === "function";

type ShownInvite = { email: string; code: string; expiresAt: string };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inställningar → Appens ägare → Inbjudningar (Story 21.1): the owner types an address and
 * taps "Bjud in", and gets the code and link to share (no mail is sent, the cloud cannot send
 * any yet). The list shows every invited address with its state; the trash asks first, since
 * it cannot be undone: the person, and the members who got in only through them, cannot sign
 * in any more.
 */
export function AppInvitesSettings({
  invites,
  siteUrl,
  appName,
  inviter,
  now,
}: {
  invites: AppInvite[];
  siteUrl: string;
  appName: string;
  inviter: string;
  now: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete();
  const [, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState<ShownInvite | null>(null);
  const [lastShown, setLastShown] = useState<ShownInvite | null>(null);
  const fieldId = useId();
  const errorId = useId();
  const canShare = useSyncExternalStore(noSubscription, browserCanShare, () => true);
  const refresh = () => startTransition(() => router.refresh());

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!isPlausibleEmail(email)) {
      setError("Skriv en giltig e-postadress.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const made = await inviteByEmail({ email });
      if (!made.ok) {
        setError(made.error.fields?.email ?? made.error.message);
        return;
      }
      const next = { email: email.trim().toLowerCase(), code: made.data.code, expiresAt: made.data.expiresAt };
      setShown(next);
      setLastShown(next);
      setEmail("");
      refresh();
    } catch {
      setError(errorMessages.app_invite_failed);
    } finally {
      setPending(false);
    }
  }

  function askRemove(item: AppInvite) {
    requestDelete({
      question: `Ta bort ${item.email}?`,
      detail: item.accepted
        ? `${item.email} och de som kom in via hushållet kan inte längre logga in. Det som är sparat i ${appName} finns kvar, men ingen når det.`
        : `Koden slutar gälla och ${item.email} kan inte skapa något konto med den.`,
      onConfirm: async () => {
        const done = await removeInvite({ inviteId: item.id }).catch(() => null);
        if (!done?.ok) {
          showToast(done?.ok === false ? done.error.message : errorMessages.app_invite_failed, { role: "alert" });
          return;
        }
        showToast(`Tog bort ${item.email}.`);
        refresh();
      },
    });
  }

  const sheetInvite = shown ?? lastShown;
  const link = sheetInvite ? appInviteLink(siteUrl, sheetInvite.code) : "";

  async function share() {
    if (!sheetInvite) return;
    const text = appInviteShareText({ inviter, link, code: sheetInvite.code, app: appName });
    if (canShare) {
      try {
        await navigator.share({ text });
        return;
      } catch (shareError) {
        // Closing the share sheet is no failure.
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    showToast((await copy(text)) ? "Kopierade inbjudan." : "Det gick inte att kopiera.");
  }

  const nowDate = new Date(now);
  return (
    <div className="flex flex-col gap-2">
      <p className="mx-1 mt-2 text-body text-ink-2">
        Bjud in en kompis hushåll utan att röra Vercel. Personen får en kod och en länk av dig, och gör ett eget konto med samma e-postadress. Inget mejl skickas.
      </p>
      <form onSubmit={invite} noValidate className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="app-invite-form">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={fieldId}>E-postadress</FieldLabel>
          <Input
            id={fieldId}
            type="email"
            autoComplete="off"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        </div>
        <Button type="submit" fullWidth disabled={pending} data-testid="app-invite-submit">
          Bjud in
        </Button>
      </form>

      {invites.length > 0 ? (
        <>
          <h2 id="app-invites-heading" className="mt-4 px-4 text-meta font-medium text-ink-2">
            Inbjudna
          </h2>
          <ListGroup labelledBy="app-invites-heading" data-testid="app-invites">
            {invites.map((item) => (
              <li key={item.id} className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4" data-testid="app-invite-row">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-row-title font-normal text-ink">{item.email}</span>
                  <span className="truncate text-meta text-ink-2">{appInviteStatusText(item, nowDate, inviteValidUntil)}</span>
                </span>
                <TrashButton label={`Ta bort ${item.email}`} onPress={() => askRemove(item)} />
              </li>
            ))}
          </ListGroup>
        </>
      ) : null}

      <Sheet open={shown !== null} onClose={() => { setShown(null); setLastShown(null); }} title="Dela inbjudan" closeLabel="Klar" footer={
        <Button fullWidth onClick={() => void share()} data-testid="app-invite-share">
          <ShareIcon size={20} />
          {canShare ? "Dela inbjudan" : "Kopiera inbjudan"}
        </Button>
      }>
        {sheetInvite ? (
          <div className="flex flex-col">
            <p className="text-body text-ink-2">{sheetInvite.email} gör ett eget konto med den adressen. Koden hör bara till den.</p>
            <div className="mt-3 rounded-lg bg-bg px-4 pt-4 pb-3.5 text-center">
              <p className="text-[0.8125rem] leading-[1.125rem] font-medium tracking-[0.5px] text-ink-2 uppercase">Kod</p>
              <p className="mt-0.5 font-mono text-[1.875rem] leading-[2.75rem] font-semibold tracking-[4px] text-ink" data-testid="app-invite-code">
                {formatAppInviteCode(sheetInvite.code)}
              </p>
              <p className="text-meta text-ink-2">Gäller till {inviteValidUntil(sheetInvite.expiresAt)} · för en adress</p>
            </div>
            <div className="mt-2.5 flex min-h-12 items-center gap-2 rounded-md border border-border py-1 pr-1 pl-3.5">
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink-2" data-testid="app-invite-link">
                {link.replace(/^https?:\/\//, "")}
              </span>
              <Chip selected={false} action onClick={async () => showToast((await copy(link)) ? "Kopierade länken." : "Det gick inte att kopiera.")}>
                Kopiera
              </Chip>
            </div>
            <p className="mt-3 text-meta text-ink-2">Inget mejl skickas. Dela länken i ett meddelande. Koden visas bara nu.</p>
          </div>
        ) : null}
      </Sheet>
      {dialog}
    </div>
  );
}
