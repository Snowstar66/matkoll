import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/button";
import { safeNextPath } from "@/features/auth";
import { confirmEmailLinkForm } from "@/features/auth/server";
import { ResetPasswordForm } from "@/features/auth/ui/reset-password-form";
import { appName } from "@/app/app-info";

export const metadata: Metadata = { title: "Logga in", referrer: "no-referrer" };

// The magic link lands here (AD-3): /auth/confirm?token_hash=…&type=email&next=/recept.
// Opening it only shows "Logga in"; the token is used when the button posts
// (confirmEmailLinkForm), so a mail scanner that fetches the link uses nothing
// up (Story 11.6). It works in any browser, since it needs no PKCE verifier.
// The reset link from "Glömt lösenord" (type=recovery, Story 17.2) lands here
// too and shows the new-password form; its token is used when that posts.
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <Suspense fallback={null}>
        <ConfirmForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ConfirmForm({ searchParams }: Pick<PageProps<"/auth/confirm">, "searchParams">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (!tokenHash || (params.type !== "email" && params.type !== "recovery")) {
    redirect(`/logga-in?${new URLSearchParams({ fel: "lank", next })}`);
  }
  if (params.type === "recovery") {
    return (
      <>
        <h1 className="text-page-title text-ink">Välj nytt lösenord</h1>
        <ResetPasswordForm tokenHash={tokenHash} next={next} />
      </>
    );
  }
  return (
    <>
      <h1 className="text-page-title text-ink">Logga in</h1>
      <p className="text-body text-ink-2">Tryck på knappen för att logga in i {appName}.</p>
      <form action={confirmEmailLinkForm} className="flex w-full flex-col gap-3">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" fullWidth>
          Logga in
        </Button>
      </form>
    </>
  );
}
