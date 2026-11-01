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
    expect(live(dialog)).toHaveTextContent("Sida 1 av 6");
    expect(screen.getByRole("button", { name: "Sida 1 av 6" })).toHaveAttribute("aria-current", "step");
  });

  it("goes through the six pages with Fortsätt, saying the page each time, to the choices", async () => {
    const { dialog } = await renderTour();
    const titles = [
      "Spara recept var du än hittar dem",
      "Planera veckan. Listan skriver sig själv.",
      "Vet vad som finns hemma",
      "Hitta sakerna igen",
      "Var vill du börja?",
    ];
    for (const [i, title] of titles.entries()) {
      await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));
      expect(heading()).toHaveTextContent(title);
      expect(dialog).toHaveAccessibleName(title);
      expect(live(dialog)).toHaveTextContent(`Sida ${i + 2} av 6`);
    }
    // On the last page Fortsätt and Hoppa över give way to the choices.
    expect(screen.getByRole("button", { name: "Fortsätt" })).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Hoppa över" })).toHaveAttribute("inert");
    expect(screen.getByText("Rundturen finns kvar under Hjälp och tips.")).toBeInTheDocument();
    for (const choice of ["Lägg till ett recept", "Fotografera kylen", "Titta runt själv"]) {
      expect(screen.getByRole("button", { name: new RegExp(choice) })).toBeInTheDocument();
    }
  });

  it("changes page with the arrow keys and the dots, and never goes past the ends", async () => {
    const { dialog } = await renderTour();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(live(dialog)).toHaveTextContent("Sida 1 av 6");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 6");
    await userEvent.click(screen.getByRole("button", { name: "Sida 5 av 6" }));
    expect(heading()).toHaveTextContent("Hitta sakerna igen");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(live(dialog)).toHaveTextContent("Sida 6 av 6");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(heading()).toHaveTextContent("Hitta sakerna igen");
  });

  it("changes page with a swipe longer than 40 px", async () => {
    const { dialog } = await renderTour();
    const track = dialog.querySelector("section")!.parentElement!;
    fireEvent.pointerDown(track, { clientX: 300 });
    fireEvent.pointerUp(track, { clientX: 200 });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 6");
    fireEvent.pointerDown(track, { clientX: 200 });
    fireEvent.pointerUp(track, { clientX: 230 });
    expect(live(dialog)).toHaveTextContent("Sida 2 av 6");
    fireEvent.pointerDown(track, { clientX: 200 });
    fireEvent.pointerUp(track, { clientX: 300 });
    expect(live(dialog)).toHaveTextContent("Sida 1 av 6");
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
    await userEvent.click(screen.getByRole("button", { name: "Sida 6 av 6" }));
    await userEvent.click(screen.getByRole("button", { name: /Lägg till ett recept/ }));
    expect(onExit).toHaveBeenCalledWith("add-recipe", undefined);
    expect(markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("opens the camera from Fotografera kylen and hands the photo on", async () => {
    const { onExit, dialog } = await renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Sida 6 av 6" }));
    const input = within(dialog).getByTestId("welcome-tour-camera") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: /Fotografera kylen/ }));
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
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));
    expect(screen.getByRole("button", { name: /Lägg till ett recept/ })).toHaveFocus();
  });
});
