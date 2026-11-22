"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useToast } from "@/components/toast";
import { choicePath, type TourExit } from "@/features/welcome";
import { handOverPlacePhoto } from "@/features/pantry/ui/photo-handover";
import { requestImportSheet } from "@/features/recipes/ui/import-sheet";

/**
 * Where the welcome tour leads when it closes (Story 20.1), shared by the tour after login and its
 * replay at /valkomst. The modules do not import each other's ui (AD-1), so the route wires the
 * choices to Recept and Matvaror: Lägg till ett recept opens Importera recept on Recept, Fota
 * kylen hands the photo to Matvaror's Kyl, and Titta runt själv opens Recept. Hoppa över and Esc
 * go to `skipTo`, or stay where the tour was when it is null.
 */
export function useWelcomeExit(skipTo: string | null): (exit: TourExit, photo?: File) => void {
  const router = useRouter();
  return (exit, photo) => {
    if (exit === "skip") {
      if (skipTo) router.replace(skipTo);
      return;
    }
    if (exit === "add-recipe") requestImportSheet();
    if (exit === "photo-fridge" && photo) handOverPlacePhoto(photo, "Kyl");
    router.push(choicePath(exit));
  };
}

/**
 * The message of the tour's question ("Planera veckan och Laga mat på. Ändra under Tillval."): the tour hands it over
 * at Klar (`choose`), and it is shown with a way to Tillval when the tour has closed (`announce`), since the tour
 * covers the page while it is open. Nothing is shown when Hoppa över or nothing was ticked.
 */
export function useAreasMessage(): { choose: (message: string) => void; announce: () => void } {
  const router = useRouter();
  const { showToast } = useToast();
  const message = useRef<string | null>(null);
  return {
    choose: (text) => {
      message.current = text;
    },
    announce: () => {
      const text = message.current;
      message.current = null;
      if (text) showToast(text, { show: { label: "Ändra", onShow: () => router.push("/installningar/tillval") } });
    },
  };
}
