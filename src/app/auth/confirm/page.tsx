import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/button";
import { safeNextPath } from "@/features/auth";
import { confirmEmailLinkForm } from "@/features/auth/server";

export const metadata: Metadata = { title: "Logga in", referrer: "no-referrer" };

// The magic link lands here (AD-3): /auth/confirm?token_hash=…&type=email&next=/recept.
// Opening it only shows "Logga in"; the token is used when the button posts
// (confirmEmailLinkForm), so a mail scanner that fetches the link uses nothing
// up (Story 11.6). It works in any browser, since it needs no PKCE verifier.
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <main className="mx-auto flex w-full max-w-96 flex-1 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]">
      <h1 className="text-page-title text-ink">Logga in</h1>
      <p className="text-body text-ink-2">Tryck på knappen för att logga in i Matkoll.</p>
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
  if (!tokenHash || params.type !== "email") {
    redirect(`/logga-in?${new URLSearchParams({ fel: "lank", next })}`);
  }
  return (
    <form action={confirmEmailLinkForm} className="flex w-full flex-col gap-3">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" fullWidth>
        Logga in
      </Button>
    </form>
  );
}
