import type { Metadata } from "next";
import { Suspense } from "react";
import { appName, appTagline } from "@/app/app-info";
import { AppLogo } from "@/components/app-logo";
import { Notice } from "@/components/notice";
import { appInviteCodeLength, isAppInviteCodeShape } from "@/features/app-invites";
import { AppInviteDataError, previewAppInvite } from "@/features/app-invites/server";
import { getCurrentUser } from "@/features/auth/server";
import { JoinAppForm } from "@/features/auth/ui/join-app-form";
import { CodeEntry } from "@/features/household/ui/code-entry";
import { inviteValidUntil, normalizeInviteCode } from "@/features/household";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Inbjudan" };

// Inbjudan (Story 21.1): the link the app's owner shares (/inbjudan?kod=K7Q4MP2X). It looks like
// the login page and lets the invited person make an account, with the address the owner
// invited, or sign in. Public: the proxy lets it through without a session.
export default function InvitationPage({ searchParams }: PageProps<"/inbjudan">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <p aria-hidden="true" className="flex items-center gap-2 text-row-title text-accent">
        <AppLogo size={36} />
        {appName}
      </p>
      <p className="-mt-3 text-meta text-ink-3">{appTagline}</p>
      <Suspense fallback={<h1 className="text-page-title text-ink">Välkommen till {appName}</h1>}>
        <InvitationContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-meta text-ink-3">{appName} · av Snowstar</p>
    </main>
  );
}

async function InvitationContent({ searchParams }: Pick<PageProps<"/inbjudan">, "searchParams">) {
  const params = await searchParams;
  const raw = typeof params.kod === "string" ? params.kod : "";
  const title = <h1 className="text-page-title text-ink">Välkommen till {appName}</h1>;
  if (!isAppInviteCodeShape(raw)) {
    return (
      <>
        {title}
        <p className="text-body text-ink-2">Skriv koden från inbjudan. Den har {appInviteCodeLength} tecken, till exempel K7Q4 MP2X.</p>
        {raw ? <Notice role="alert">Koden finns inte. Kontrollera den och försök igen.</Notice> : null}
        <CodeEntry />
      </>
    );
  }
  const code = normalizeInviteCode(raw);
  let found;
  try {
    found = await previewAppInvite(code);
  } catch (error) {
    if (!(error instanceof AppInviteDataError)) throw error;
    console.error("app_invite_unavailable", { reason: error.detail });
    return (
      <>
        {title}
        <Notice role="alert">{errorMessages.app_invite_unavailable}</Notice>
      </>
    );
  }

  if (found.status === "unknown") {
    return (
      <>
        {title}
        <Notice role="alert">Koden finns inte. Kontrollera den och försök igen.</Notice>
        <CodeEntry />
      </>
    );
  }
  if (found.status === "gone") {
    return (
      <>
        {title}
        <p className="text-body text-ink-2" data-testid="invite-gone">
          Inbjudan gäller inte längre. Be den som bjöd in dig om en ny.
        </p>
      </>
    );
  }

  // "locked" (many wrong codes from anyone): signing up still works, the hook checks the code itself.
  const user = await getCurrentUser();
  return (
    <>
      {title}
      <p className="text-body text-ink-2" data-testid="invite-open">
        {user
          ? `Du är inloggad. Tryck för att koppla inbjudan till ditt konto.`
          : `Välj e-post och lösenord, så får du en egen inloggning. Skriv samma e-postadress som inbjudan skickades till.`}
        {found.status === "ok" ? ` Gäller till ${inviteValidUntil(found.expiresAt)}.` : ""}
      </p>
      <JoinAppForm code={code} signedIn={user !== null} />
    </>
  );
}
