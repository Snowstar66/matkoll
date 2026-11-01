import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrivacyNoteStore } from "@/features/auth/ui/privacy-note-store";

let pathname = "/recept";
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push, replace }) }));
vi.mock("@/features/welcome/actions/mark-tour-seen", () => ({ markTourSeen: async () => ({ ok: true, data: null }) }));
const requestImportSheet = vi.fn();
vi.mock("@/features/recipes/ui/import-sheet", () => ({ requestImportSheet: () => requestImportSheet() }));
const handOverPlacePhoto = vi.fn();
vi.mock("@/features/pantry/ui/photo-handover", () => ({
  handOverPlacePhoto: (...args: unknown[]) => handOverPlacePhoto(...args),
}));

const { WelcomeGate } = await import("./welcome-gate");

const note = "Det du sparar i Livskoll syns bara för ditt hushåll och lagras i EU. Som i de flesta appar kan den som driver tjänsten tekniskt komma åt datan.";

beforeEach(() => {
  pathname = "/recept";
  push.mockReset();
  replace.mockReset();
  requestImportSheet.mockReset();
  handOverPlacePhoto.mockReset();
  window.localStorage.clear();
  resetPrivacyNoteStore();
});

async function renderGate(seen: boolean) {
  const promise = Promise.resolve(seen);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <WelcomeGate seen={promise} />
      </Suspense>,
    );
  });
}

describe("WelcomeGate", () => {
  it("shows no tour to someone who has seen it, only the privacy note", async () => {
    await renderGate(true);
    expect(screen.queryByTestId("welcome-tour")).not.toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("shows the tour first, and the privacy note only once it is closed, where the user was", async () => {
    await renderGate(false);
    expect(screen.getByTestId("welcome-tour")).toBeInTheDocument();
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(screen.queryByTestId("welcome-tour")).not.toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("opens Importera recept on Recept for Lägg till ett recept", async () => {
    await renderGate(false);
    await userEvent.click(screen.getByRole("button", { name: "Sida 6 av 6" }));
    await userEvent.click(screen.getByRole("button", { name: /Lägg till ett recept/ }));
    expect(requestImportSheet).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/recept");
  });

  it("hands the photo to Matvaror's Kyl for Fotografera kylen", async () => {
    await renderGate(false);
    await userEvent.click(screen.getByRole("button", { name: "Sida 6 av 6" }));
    const photo = new File(["x"], "kylen.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("welcome-tour-camera"), photo);
    expect(handOverPlacePhoto).toHaveBeenCalledWith(photo, "Kyl");
    expect(push).toHaveBeenCalledWith("/hemma?plats=kyl");
  });

  it("opens Recept for Titta runt själv", async () => {
    await renderGate(false);
    await userEvent.click(screen.getByRole("button", { name: "Sida 6 av 6" }));
    await userEvent.click(screen.getByRole("button", { name: /Titta runt själv/ }));
    expect(push).toHaveBeenCalledWith("/recept");
    expect(requestImportSheet).not.toHaveBeenCalled();
  });

  it("leaves the replay route to its own tour, without the note", async () => {
    pathname = "/valkomst";
    await renderGate(false);
    expect(screen.queryByTestId("welcome-tour")).not.toBeInTheDocument();
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });
});
