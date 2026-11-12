import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { isAppOwner } from "@/features/feedback/server";
import { recipeFits } from "@/features/menu-advisor";
import { getFoodFitPeople } from "@/features/menu-advisor/server";
import { asNewHousehold, starterRecipeHouseholdCap, toStarterItems, type StarterItem, type StarterRoom } from "@/features/recipes";
import { getStarterPicker } from "@/features/recipes/server";
import { StarterPicker } from "@/features/recipes/ui/starter-picker";

export const metadata: Metadata = { title: "Startrecept" };

// Kom igång med recept: the household chooses among the app owner's starter recipes and they are
// copied into its own list (the sketch of 2026-11-11). Behind Tillval "Startrecept", which the
// browser knows: the picker says so when it is off. "?forhandsvisning=1" is the owner's preview:
// the pack as a new household sees it (nothing added, no preferences, room for all), and nothing
// is copied; for anyone else it is "Sidan finns inte."
export default function StarterPage({ searchParams }: PageProps<"/recept/startrecept">) {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <StarterContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StarterContent({ searchParams }: Pick<PageProps<"/recept/startrecept">, "searchParams">) {
  await requireUserOrRedirect("/recept/startrecept");
  const preview = (await searchParams).forhandsvisning === "1";
  if (preview && !(await isAppOwner().catch(() => false))) notFound();
  let items: StarterItem[] | null = null;
  let room: StarterRoom = { count: 0, cap: starterRecipeHouseholdCap };
  let untouched = 0;
  try {
    const [picker, people] = await Promise.all([getStarterPicker(), preview ? Promise.resolve([]) : getFoodFitPeople()]);
    const rows = preview ? asNewHousehold(picker.rows) : picker.rows;
    // The household's allergies and tastes held against each pack recipe's lines, as on Recept.
    const fits = recipeFits(
      rows.map((row) => ({ id: row.itemId, title: row.title, lines: row.lineTexts.map((text) => ({ originalText: text })) })),
      people,
    );
    items = toStarterItems(rows, fits);
    room = preview ? { count: 0, cap: picker.room.cap } : picker.room;
    untouched = preview ? 0 : picker.copies.untouched;
  } catch (error) {
    console.error("recipe_starter_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
  }
  return <StarterPicker items={items} room={room} untouchedCopies={untouched} preview={preview} />;
}
