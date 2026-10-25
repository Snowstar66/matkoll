import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Recept – Matkoll" };

// Placeholder until the recipe library (Story 1.10); the app shell arrives in Story 1.3.
export default function RecipesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 px-4 py-8">
      <Suspense fallback={null}>
        <RecipesPlaceholder />
      </Suspense>
    </main>
  );
}

async function RecipesPlaceholder() {
  const user = await requireUserOrRedirect("/recept");
  return (
    <>
      <h1 className="text-3xl font-semibold">Recept</h1>
      <p>Inloggad som {user.email}</p>
    </>
  );
}
