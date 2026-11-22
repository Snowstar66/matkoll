import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markTourSeen = vi.fn();
vi.mock("../actions/mark-tour-seen", () => ({ markTourSeen: () => markTourSeen() }));

const { WelcomeTour } = await import("./welcome-tour");

beforeEach(() => {
  markTourSeen.mockReset().mockResolvedValue({ ok: true, data: null });
});

async function renderTour() {
  const onExit = vi.fn();
  render(<WelcomeTour onExit={onExit} />);
  // The first page is drawn out on the next frame.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  return { onExit, dialog: screen.getByTestId("welcome-tour") as HTMLDialogElement };
}

const heading = () => screen.getByRole("heading", { level: 2 });
const live = (dialog: HTMLElement) => dialog.querySelector("[aria-live]");

describe("WelcomeTour", () => {
  it("opens as a modal dialog named by the first page's title, with the trio", async () => {
    const { dialog } = await renderTour();
    expect(dialog).toHaveAttribute("open");
    expect(heading()).toHaveTextContent("Välkommen till Livskoll");
    // Focus starts on the title, not on Hoppa över.
    expect(heading()).toHaveFocus();
    expect(dialog).toHaveAccessibleName("Välkommen till Livskoll");
    expect(screen.getByText("Maten och sakerna hemma, på ett ställe.")).toBeInTheDocument();
    for (const title of ["Recept och matsedel", "Matvaror", "Förråd"]) expect(screen.getByText(title)).toBeInTheDocument();
    expect(live(dialog)).toHaveTextContent("Sida 1 av 8");
    expect(screen.getByRole("button", { name: "Sida 1 av 8" })).toHaveAttribute("aria-current", "step");
  });

  it("goes through the eight pages with Fortsätt, saying the page each time, to the choices", async () => {
    const { dialog } = await renderTour();
    const titles = [
      "Spara recept var du än hittar dem",
      "Planera veckan. Listan skriver sig själv.",
      "Vet vad som finns hemma",
      "Hitta sakerna igen",
      "Äter ni ute?",
      "Vad vill du ha hjälp med?",
    ];
    for (const [i, title] of titles.entries()) {
      await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));
      expect(heading()).toHaveTextContent(title);
      expect(dialog).toHaveAccessibleName(title);
      expect(live(dialog)).toHaveTextContent(`Sida ${i + 2} av 8`);
    }
    // The question: Fortsätt is Klar (off until something is ticked) and Hoppa över skips it.
    expect(screen.queryByRole("button", { name: "Fortsätt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klar" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(heading()).toHaveTextContent("Var vill du börja?");
    // On the last page Fortsätt and Hoppa över give way to the choices.
    expect(screen.getByRole("button", { name: "Fortsätt" })).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Hoppa över" })).toHaveAttribute("inert");
    expect(screen.getByText("Rundturen finns kvar under Hjälp och tips.")).toBeInTheDocument();
    for (const choice of ["Lägg till ett recept", "Fota kylen", "Titta runt själv", "Bjud in någon i hushållet"]) {
      expect(screen.getByRole("button", { name: new RegExp(choice) })).toBeInTheDocument();
    }
  });

  it("changes page with the arrow keys and the dots, and never goes past the ends", async () => {
    const { dialog } = await renderTour();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(live(dialog)).toHaveTextContent("Sida 1 av 8");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 8");
    await userEvent.click(screen.getByRole("button", { name: "Sida 5 av 8" }));
    expect(heading()).toHaveTextContent("Hitta sakerna igen");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(live(dialog)).toHaveTextContent("Sida 7 av 8");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(heading()).toHaveTextContent("Äter ni ute?");
  });

  it("changes page with a swipe longer than 40 px", async () => {
    const { dialog } = await renderTour();
    const track = dialog.querySelector("section")!.parentElement!;
    fireEvent.pointerDown(track, { clientX: 300 });
    fireEvent.pointerUp(track, { clientX: 200 });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 8");
    fireEvent.pointerDown(track, { clientX: 200 });
    fireEvent.pointerUp(track, { clientX: 230 });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 8");
    fireEvent.pointerDown(track, { clientX: 200 });
    fireEvent.pointerUp(track, { clientX: 300 });
    expect(live(dialog)).toHaveTextContent("Sida 1 av 8");
  });

  it("closes with Hoppa över, records it as seen, and closes only once", async () => {
    const { onExit } = await renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith("skip", undefined);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("closes with Esc like Hoppa över", async () => {
    const { onExit, dialog } = await renderTour();
    act(() => dialog.requestClose());
    expect(onExit).toHaveBeenCalledWith("skip", undefined);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("leads Lägg till ett recept and Titta runt själv on, as seen", async () => {
    const { onExit } = await renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Sida 8 av 8" }));
    await userEvent.click(screen.getByRole("button", { name: /Lägg till ett recept/ }));
    expect(onExit).toHaveBeenCalledWith("add-recipe", undefined);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("opens the camera from Fota kylen and hands the photo on", async () => {
    const { onExit, dialog } = await renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Sida 8 av 8" }));
    const input = within(dialog).getByTestId("welcome-tour-camera") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: /Fota kylen/ }));
    expect(click).toHaveBeenCalled();
    // Cancelling the camera keeps the tour open.
    fireEvent.change(input, { target: { files: [] } });
    expect(onExit).not.toHaveBeenCalled();
    const photo = new File(["x"], "kylen.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [photo] } });
    expect(onExit).toHaveBeenCalledWith("photo-fridge", photo);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("closes even when saving that it was seen fails", async () => {
    markTourSeen.mockRejectedValue(new Error("offline"));
    const { onExit } = await renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(onExit).toHaveBeenCalledWith("skip", undefined);
  });

  it("moves focus to the first choice when Fortsätt gives way on the last page", async () => {
    await renderTour();
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(screen.getByRole("button", { name: /Lägg till ett recept/ })).toHaveFocus();
  });

  it("Klar turns on the ticked areas, turns nothing off, and hands the message on; Hoppa över writes nothing", async () => {
    localStorage.clear();
    const onAreasChosen = vi.fn();
    const onExit = vi.fn();
    render(<WelcomeTour onExit={onExit} onAreasChosen={onAreasChosen} />);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    await userEvent.click(screen.getByRole("button", { name: "Sida 7 av 8" }));
    const keys = Object.keys(localStorage).length;
    await userEvent.click(screen.getByTestId("tour-area-plan"));
    await userEvent.click(screen.getByTestId("tour-area-cook"));
    expect(screen.getByRole("button", { name: "Klar" })).toBeEnabled();
    // Nothing is written until Klar.
    expect(Object.keys(localStorage).length).toBe(keys);
    await userEvent.click(screen.getByRole("button", { name: "Klar" }));
    expect(onAreasChosen).toHaveBeenCalledWith("Planera veckan och Laga mat på. Ändra under Tillval.");
    expect(localStorage.getItem("livskoll-option-weekAgent")).toBe("1");
    expect(localStorage.getItem("livskoll-option-starterRecipes")).toBe("1");
    // Nothing is turned off, and an area not ticked is left alone.
    expect(localStorage.getItem("livskoll-option-recipeTimer")).not.toBe("0");
    expect(localStorage.getItem("livskoll-option-showNutrition")).toBeNull();
    expect(heading()).toHaveTextContent("Var vill du börja?");
    expect(onExit).not.toHaveBeenCalled();
    localStorage.clear();
  });
});
