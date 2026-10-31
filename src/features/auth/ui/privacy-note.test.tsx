import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyNote } from "./privacy-note";
import { privacyNoteStorageKey, resetPrivacyNoteStore } from "./privacy-note-store";

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetPrivacyNoteStore();
});

const text = "Den som driver Livskoll kan tekniskt se kontots data.";

describe("PrivacyNote", () => {
  it("shows the line once, and Okej keeps it away on this device", async () => {
    const { unmount } = render(<PrivacyNote />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Okej" }));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(privacyNoteStorageKey)).toBe("1");
    unmount();
    render(<PrivacyNote />);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
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
