import type { Metadata } from "next";
import { Suspense } from "react";
import { errorMessages } from "@/lib/errors";
import { resumeDevAutoLogin } from "@/features/auth/server";
import { devAutoLoginApplies } from "@/lib/supabase/dev-auto-login-server";
import { LoginForm } from "@/features/auth/ui/login-form";
import { CodeEntry } from "@/features/household/ui/code-entry";
import { AppLogo } from "@/components/app-logo";
import { appName, appTagline } from "@/app/app-info";

export const metadata: Metadata = { title: "Logga in" };

export default function LoginPage({ searchParams }: PageProps<"/logga-in">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <p aria-hidden="true" className="flex items-center gap-2 text-row-title text-accent">
        <AppLogo size={36} />
        {appName}
      </p>
      <p className="-mt-3 text-meta text-ink-3">{appTagline}</p>
      <h1 className="text-page-title text-ink">Logga in</h1>
      <p className="text-body text-ink-2">Logga in med e-post och lösenord. Första gången eller glömt lösenordet? Välj lösenord via länken nedanför.</p>
      {/* No form as fallback: a form typed into would be replaced when the real one streams in. */}
      <Suspense fallback={null}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-meta text-ink-3">{appName} · av Snowstar</p>
    </main>
  );
}

async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/logga-in">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notices: Record<string, string> = {
    lank: errorMessages.auth_link_invalid,
    atkomst: errorMessages.auth_not_allowed,
    // Story 21.2b: after Lämna hushållet, for someone let in only through the household.
    lamnat: "Du har lämnat hushållet. Tillbaka kommer du med en ny inbjudan.",
  };
  const notice = typeof params.fel === "string" ? notices[params.fel] : undefined;
  const showResume = await devAutoLoginApplies();
  return (
    <>
      <LoginForm next={next} notice={notice} />
      {/* Story 21.2b: someone invited without the link types the code here and goes on to /ga-med. */}
      <CodeEntry collapsed />
      {showResume ? (
        <form action={resumeDevAutoLogin}>
          <button type="submit" className="text-body text-accent underline">
            Logga in automatiskt igen
          </button>
        </form>
      ) : null}
    </>
  );
}
