import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { SettingsIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { ImportRecipeButton, ImportRecipeProvider } from "@/features/recipes/ui/import-sheet";

export const metadata: Metadata = { title: "Recept" };

// The library arrives in Story 1.10; until then the page shows the empty state.
// "+" in the header and "Importera recept" in the empty state open the same sheet.
export default function RecipesPage() {
  return (
    <ImportRecipeProvider searchIngredients={searchIngredients}>
      <PageHeader
        title="Recept"
        action={
          <>
            <ImportRecipeButton variant="icon" />
            {/* On desktop, Inställningar is at the bottom of the side menu instead. */}
            <Link
              href="/installningar"
              scroll={false}
              aria-label="Inställningar"
              className="flex size-tap items-center justify-center rounded-full text-ink-2 desktop:hidden"
            >
              <SettingsIcon size={24} />
            </Link>
          </>
        }
      />
      <Suspense fallback={<Skeleton />}>
        <RecipesContent />
      </Suspense>
    </ImportRecipeProvider>
  );
}

async function RecipesContent() {
  await requireUserOrRedirect("/recept");
  return (
    <EmptyState action={<ImportRecipeButton variant="primary" />}>
      Inga recept än. Klistra in en länk till ett recept du gillar.
    </EmptyState>
  );
}
