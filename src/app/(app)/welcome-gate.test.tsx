import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { resetPrivacyNoteStore } from "@/features/auth/ui/privacy-note-store";

let pathname = "/recept";
const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push, replace, refresh: vi.fn() }), useSearchParams: () => searchParams }));
const setMyName = vi.fn();
vi.mock("@/features/household/actions/members", () => ({ setMyName: (...args: unknown[]) => setMyName(...args) }));
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
  searchParams = new URLSearchParams();
  setMyName.mockReset().mockResolvedValue({ ok: true, data: { name: "Martina" } });
  push.mockReset();
  replace.mockReset();
  requestImportSheet.mockReset();
  handOverPlacePhoto.mockReset();
  window.localStorage.clear();
  resetPrivacyNoteStore();
});

async function renderGate(seen: boolean, ask: { suggested: string; tone: "sky" } | null = null) {
  const promise = Promise.resolve(seen);
  const name = Promise.resolve(ask);
  await act(async () => {
    render(
      <ToastProvider>
        <Suspense fallback={null}>
          <WelcomeGate seen={promise} name={name} />
        </Suspense>
      </ToastProvider>,
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

  // Story 21.2b: "Vad heter du?" comes first, once, prefilled; the tour after it.
  it("asks for the name first, prefilled, and shows the tour once it is saved", async () => {
    const user = userEvent.setup();
    await renderGate(false, { suggested: "Martina", tone: "sky" });
    expect(screen.getByRole("dialog", { name: "Vad heter du?" })).toBeTruthy();
    expect(screen.getByLabelText("Förnamn")).toHaveProperty("value", "Martina");
    await user.clear(screen.getByLabelText("Förnamn"));
    await user.click(screen.getByRole("button", { name: "Fortsätt" }));
    expect(setMyName).not.toHaveBeenCalled();
    expect(screen.getByText("Skriv ditt namn.")).toBeTruthy();
    await user.type(screen.getByLabelText("Förnamn"), "Tina");
    await user.click(screen.getByRole("button", { name: "Fortsätt" }));
    expect(setMyName).toHaveBeenCalledWith({ name: "Tina" });
    expect(screen.queryByRole("dialog", { name: "Vad heter du?" })).toBeNull();
  });

  it("says Välkommen till the household after joining, and takes the parameter away", async () => {
    searchParams = new URLSearchParams({ valkommen: "Hushållet Hellgren" });
    await renderGate(true);
    expect(screen.getAllByText("Välkommen till Hushållet Hellgren.").length).toBeGreaterThan(0);
    expect(replace).toHaveBeenCalledWith("/recept", { scroll: false });
  });
});
