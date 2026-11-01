import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { helpAreas } from "@/app/(app)/hjalp/help-content";
import { PrivacyNote } from "./privacy-note";
import { privacyNoteStorageKey, resetPrivacyNoteStore } from "./privacy-note-store";

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetPrivacyNoteStore();
});

const text = "Det du sparar i Livskoll syns bara för ditt hushåll och lagras i EU. Som i de flesta appar kan den som driver tjänsten tekniskt komma åt datan.";

describe("Om din data (Story 17.2, Pontus 1 Nov)", () => {
  it("is a calm card with a title, two lines, Läs mer and Okej, never a blue notice", async () => {
    render(<PrivacyNote />);
    const card = await screen.findByRole("region", { name: "Om din data" });
    expect(card).toHaveAccessibleDescription(text);
    expect(card).toHaveClass("bg-surface-2", "rounded-lg");
    expect(card.className).not.toMatch(/bg-sky/);
    expect(screen.getByRole("link", { name: "Läs mer" })).toHaveAttribute("href", "/hjalp#konto");
    expect(screen.getByRole("button", { name: "Okej" })).toBeInTheDocument();
  });

  it("says the same as Hjälp och tips, Konto", () => {
    const konto = helpAreas.find((area) => area.id === "konto")!;
    expect(konto.faq.find((item) => item.question === "Vem kan se min data?")?.answer).toBe(text);
  });

  it("shows once, and Okej keeps it away on this device", async () => {
    const { unmount } = render(<PrivacyNote />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Okej" }));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(privacyNoteStorageKey)).toBe("1");
    unmount();
    render(<PrivacyNote />);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("counts Läs mer as read, so it does not follow to the help page", async () => {
    render(<PrivacyNote />);
    const more = await screen.findByRole("link", { name: "Läs mer" });
    more.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(more);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(privacyNoteStorageKey)).toBe("1");
  });

  it("stays gone for the visit when storage refuses the answer", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PrivacyNote />);
    await userEvent.click(await screen.findByRole("button", { name: "Okej" }));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("follows another tab's answer", async () => {
    render(<PrivacyNote />);
    await screen.findByText(text);
    window.localStorage.setItem(privacyNoteStorageKey, "1");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: privacyNoteStorageKey })));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });
});
