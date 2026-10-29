import type { Metadata } from "next";
import { Suspense } from "react";
import { errorMessages } from "@/lib/errors";
import { resumeDevAutoLogin } from "@/features/auth/server";
import { devAutoLoginApplies } from "@/lib/supabase/dev-auto-login-server";
import { LoginForm } from "@/features/auth/ui/login-form";
import { AppLogo } from "@/components/app-logo";

export const metadata: Metadata = { title: "Logga in" };

export default function LoginPage({ searchParams }: PageProps<"/logga-in">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <p aria-hidden="true" className="flex items-center gap-2 text-row-title text-accent">
        <AppLogo size={36} />
        Matkoll
      </p>
      <h1 className="text-page-title text-ink">Logga in</h1>
      <p className="text-body text-ink-2">Skriv din e-postadress så skickar vi en inloggningslänk och en kod.</p>
      {/* No form as fallback: a form typed into would be replaced when the real one streams in. */}
      <Suspense fallback={null}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-meta text-ink-3">Matkoll · av Snowstar</p>
    </main>
  );
}

async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/logga-in">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notices: Record<string, string> = {
    lank: errorMessages.auth_link_invalid,
    atkomst: errorMessages.auth_not_allowed,
  };
  const notice = typeof params.fel === "string" ? notices[params.fel] : undefined;
  const showResume = await devAutoLoginApplies();
  return (
    <>
      <LoginForm next={next} notice={notice} />
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
