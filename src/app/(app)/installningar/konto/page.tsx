import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { ChangePassword } from "@/features/auth/ui/change-password";
import { getMe } from "@/features/household/server";
import { MyName } from "@/features/household/ui/my-name";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Konto" };

// Konto (Story 14.7): the name the household sees (Story 21.2b), the address the
// person is signed in with, and "Byt lösenord", the same flow as "Välj lösenord"
// on the login page (Story 17.2).
export default function AccountPage() {
  return (
    <>
      <SettingsPageHeader title="Konto" />
      <Suspense fallback={null}>
        <AccountContent />
      </Suspense>
    </>
  );
}

async function AccountContent() {
  const user = await requireUserOrRedirect("/installningar/konto");
  const me = await getMe();
  return (
    <div className="flex flex-col gap-4">
      {me ? <MyName me={me} /> : null}
      <div className="flex flex-col gap-0.5 rounded-lg bg-surface px-4 py-3">
        <span className="text-meta text-ink-3">E-post</span>
        <span className="text-body break-all text-ink" data-testid="account-email">
          {user.email}
        </span>
      </div>
      <ChangePassword email={user.email} />
    </div>
  );
}
