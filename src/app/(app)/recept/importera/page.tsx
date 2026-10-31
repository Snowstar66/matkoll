import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { readSharedLink } from "@/features/recipes";
import { RecipesView } from "../recipes-view";
import { appName } from "@/app/app-info";

export const metadata: Metadata = { title: `Spara i ${appName}` };

// Story 1.13: /recept/importera?url=<address> (the bookmarklet, an iOS Shortcut, Android's
// share menu with url or text). Behind login like the other pages. The server only
// checks the address's shape and renders the import sheet; it fetches nothing. The read
// starts in the browser after mount (see ImportSheet's autoImport), so a prefetch of
// this route, which renders it on the server, never reads a recipe site. Approved
// sites and the SSRF checks are the same as for a pasted link (safeFetch, AD-11).
export default function ImportFromLinkPage({ searchParams }: PageProps<"/recept/importera">) {
  return (
    <Suspense fallback={null}>
      <ImportFromLink searchParams={searchParams} />
    </Suspense>
  );
}

async function ImportFromLink({ searchParams }: Pick<PageProps<"/recept/importera">, "searchParams">) {
  const shared = readSharedLink(await searchParams);
  const next = shared.status === "ok" ? `/recept/importera?url=${encodeURIComponent(shared.url)}` : "/recept/importera";
  await requireUserOrRedirect(next);
  const autoImport =
    shared.status === "ok"
      ? ({ kind: "ok", url: shared.url } as const)
      : ({ kind: "invalid", value: shared.status === "invalid" ? shared.value : "" } as const);
  return <RecipesView autoImport={autoImport} />;
}
