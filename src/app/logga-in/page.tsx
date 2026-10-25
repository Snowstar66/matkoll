import type { Metadata } from "next";
import { Suspense } from "react";
import { errorMessages } from "@/lib/errors";
import { LoginForm } from "@/features/auth/ui/login-form";

export const metadata: Metadata = { title: "Logga in – Matkoll" };

export default function LoginPage({ searchParams }: PageProps<"/logga-in">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-3xl font-semibold">Logga in</h1>
      <p>Skriv din e-postadress så skickar vi en inloggningslänk.</p>
      {/* No form as fallback: a form typed into would be replaced when the real one streams in. */}
      <Suspense fallback={null}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
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
  return <LoginForm next={next} notice={notice} />;
}
