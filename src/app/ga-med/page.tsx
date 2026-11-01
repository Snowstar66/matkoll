import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { appName, appTagline } from "@/app/app-info";
import { Avatar } from "@/components/app-shell/avatar";
import { AppLogo } from "@/components/app-logo";
import { buttonClasses } from "@/components/button";
import { Notice } from "@/components/notice";
import { getCurrentUser } from "@/features/auth/server";
import { JoinForm } from "@/features/auth/ui/join-form";
import { inviteValidUntil, isInviteCodeShape, memberCountText, normalizeInviteCode } from "@/features/household";
import { HouseholdDataError, type InvitePreview, previewInvite } from "@/features/household/server";
import { CodeEntry } from "@/features/household/ui/code-entry";
import { errorMessages } from "@/lib/errors";

type OpenPreview = Extract<InvitePreview, { household: string }>;

const isOpen = (preview: InvitePreview): preview is OpenPreview => preview.status === "ok" || preview.status === "gone";

export const metadata: Metadata = { title: "Gå med" };

// Gå med (Story 21.2b; the mockup hushallet.html, section 2): an invitation's
// link (/ga-med?kod=K7Q4MP) looks like the login page. It shows which household
// and who invited, then lets the person make an account (or sign in) and join.
// Public: the proxy lets it through without a session.
export default function JoinPage({ searchParams }: PageProps<"/ga-med">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <p aria-hidden="true" className="flex items-center gap-2 text-row-title text-accent">
        <AppLogo size={36} />
        {appName}
      </p>
      <p className="-mt-3 text-meta text-ink-3">{appTagline}</p>
      <Suspense fallback={<h1 className="text-page-title text-ink">Gå med i ett hushåll</h1>}>
        <JoinContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-meta text-ink-3">{appName} · av Snowstar</p>
    </main>
  );
}

async function JoinContent({ searchParams }: Pick<PageProps<"/ga-med">, "searchParams">) {
  const params = await searchParams;
  const raw = typeof params.kod === "string" ? params.kod : "";
  if (!isInviteCodeShape(raw)) {
    return (
      <>
        <h1 className="text-page-title text-ink">Gå med i ett hushåll</h1>
        <p className="text-body text-ink-2">Skriv koden från inbjudan. Den har 6 tecken, till exempel K7Q 4MP.</p>
        {raw ? <Notice role="alert">Koden finns inte. Kontrollera den och försök igen.</Notice> : null}
        <CodeEntry />
      </>
    );
  }
  const code = normalizeInviteCode(raw);
  let found: InvitePreview;
  try {
    found = await previewInvite(code);
  } catch (error) {
    if (!(error instanceof HouseholdDataError)) throw error;
    console.error("household_unavailable", { reason: error.detail });
    return (
      <>
        <h1 className="text-page-title text-ink">Gå med i ett hushåll</h1>
        <Notice role="alert">{errorMessages.household_unavailable}</Notice>
      </>
    );
  }

  if (found.status === "locked") {
    // The preview is locked for a while after many wrong codes from anyone; joining still works
    // (the sign-up hook and accept_household_invite check the code themselves).
    const signedIn = (await getCurrentUser()) !== null;
    return (
      <>
        <h1 className="text-page-title text-ink">Gå med i ett hushåll</h1>
        <p className="text-body text-ink-2">Välj e-post och lösenord, så får du en egen inloggning i hushållet.</p>
        <JoinForm code={code} signedIn={signedIn} />
      </>
    );
  }
  if (!isOpen(found)) {
    return (
      <>
        <h1 className="text-page-title text-ink">Gå med i ett hushåll</h1>
        <Notice role="alert">Koden finns inte. Kontrollera den och försök igen.</Notice>
        <CodeEntry />
      </>
    );
  }

  const preview = found;
  const inviter = preview.invitedBy ?? "den som bjöd in dig";
  if (preview.status === "gone") {
    return (
      <>
        <h1 className="text-page-title text-ink">Gå med i {preview.household}</h1>
        <p className="text-body text-ink-2" data-testid="invite-gone">
          Inbjudan gäller inte längre. Be {inviter} om en ny.
        </p>
      </>
    );
  }

  const user = await getCurrentUser();
  return (
    <>
      <h1 className="text-page-title text-ink">Gå med i {preview.household}</h1>
      <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3" data-testid="invite-card">
        <span className="flex">
          {preview.members.slice(0, 4).map((member, index) => (
            <Avatar key={index} initial={member.initial} size={40} tone={member.color} className={index > 0 ? "-ml-2 ring-2 ring-surface" : undefined} />
          ))}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-row-title font-medium text-ink">{preview.invitedBy ? `${preview.invitedBy} bjöd in dig` : "Du är inbjuden"}</span>
          <span className="text-meta text-ink-2">
            {memberCountText(preview.members.length)} · gäller till {inviteValidUntil(preview.expiresAt)}
          </span>
        </span>
      </div>
      {preview.alreadyMember ? (
        <>
          <p className="text-body text-ink-2">Du är redan med i {preview.household}.</p>
          <Link href="/recept" className={buttonClasses("primary", true)}>
            Öppna {appName}
          </Link>
        </>
      ) : preview.ownData ? (
        <Notice role="alert">{errorMessages.household_has_data}</Notice>
      ) : (
        <>
          <p className="text-body text-ink-2">
            {user
              ? `Du går med i ${preview.household} och ser samma recept, matsedel, lista, matvaror och förråd som de andra.`
              : "Välj e-post och lösenord, så får du en egen inloggning i hushållet."}
          </p>
          <JoinForm code={code} signedIn={user !== null} />
        </>
      )}
    </>
  );
}
