import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteView } from "../domain/note";
import { NoteCard, OwnNoteLine } from "./note-card";

const note = (id: string, text: string, extra: Partial<NoteView> = {}): NoteView => ({
  id,
  text,
  mood: null,
  avatarMood: null,
  actions: [],
  createdAt: new Date().toISOString(),
  mine: false,
  author: { name: "Pontus", initial: "P", tone: "mint" },
  ...extra,
});

const fisksoppa = note("a", "Sugen på fisksoppa idag, kan du handla?", {
  mood: "love",
  actions: [{ kind: "plan", recipeId: "11111111-1111-4111-8111-111111111111", title: "Fisksoppa" }, { kind: "list" }],
});

describe("NoteCard", () => {
  it("shows who wrote it, the text with its mood and the buttons, then Svara and Klar", () => {
    const onAction = vi.fn();
    const onDone = vi.fn();
    const onReply = vi.fn();
    render(<NoteCard notes={[fisksoppa]} onAction={onAction} onDone={onDone} onReply={onReply} />);
    expect(screen.getByRole("region", { name: "Lapp från Pontus" })).toBeTruthy();
    expect(screen.getByText("Sugen på fisksoppa idag, kan du handla? 😍")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lägg Fisksoppa på matsedeln" }));
    expect(onAction).toHaveBeenCalledWith(fisksoppa, fisksoppa.actions[0]);
    fireEvent.click(screen.getByRole("button", { name: "Visa listan" }));
    expect(onAction).toHaveBeenLastCalledWith(fisksoppa, { kind: "list" });
    fireEvent.click(screen.getByRole("button", { name: "Svara" }));
    expect(onReply).toHaveBeenCalledWith(fisksoppa);
    fireEvent.click(screen.getByRole("button", { name: "Klar" }));
    expect(onDone).toHaveBeenCalledWith(fisksoppa);
    expect(screen.queryByTestId("note-more")).toBeNull();
  });

  it("shows the newest of several, with how many more, and the next on a tap", () => {
    render(<NoteCard notes={[note("a", "Först"), note("b", "Sen"), note("c", "Sist")]} onAction={vi.fn()} onDone={vi.fn()} onReply={vi.fn()} />);
    expect(screen.getByText("Först", { selector: ".sr-only" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2 lappar till" }));
    expect(screen.getByText("Sen", { selector: ".sr-only" })).toBeTruthy();
  });
});

describe("NoteCard avatar", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const props = { onAction: vi.fn(), onDone: vi.fn(), onReply: vi.fn() };

  it("shows the avatar in the note's mood, hidden from assistive technology", () => {
    render(<NoteCard notes={[note("a", "Hej", { avatarMood: "arg" })]} {...props} />);
    const avatar = screen.getByTestId("note-avatar");
    expect(avatar.getAttribute("data-mood")).toBe("arg");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
  });

  it("reveals the words one by one while the avatar talks, then points, then rests, with the whole text readable at once", () => {
    vi.useFakeTimers();
    render(<NoteCard notes={[note("a", "Kan du handla")]} {...props} />);
    // Readable for a screen reader from the first moment.
    expect(screen.getByText("Kan du handla").className).toContain("sr-only");
    const hidden = () => screen.getByTestId("note-card").querySelectorAll("p [aria-hidden] > span.opacity-0").length;
    expect(hidden()).toBe(3);
    expect(screen.getByTestId("note-avatar").getAttribute("data-state")).toBe("talking");
    act(() => void vi.advanceTimersByTime(180));
    expect(hidden()).toBe(2);
    act(() => void vi.advanceTimersByTime(400));
    expect(hidden()).toBe(0);
    expect(screen.getByTestId("note-avatar").getAttribute("data-state")).toBe("pointing");
    act(() => void vi.advanceTimersByTime(3_000));
    expect(screen.getByTestId("note-avatar").getAttribute("data-state")).toBe("idle");
  });

  it("with reduced motion shows every word and a still avatar at once", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<NoteCard notes={[note("a", "Kan du handla", { avatarMood: "glad" })]} {...props} />);
    expect(screen.getByTestId("note-card").querySelectorAll("span.opacity-0").length).toBe(0);
    const avatar = screen.getByTestId("note-avatar");
    expect(avatar.getAttribute("data-state")).toBe("idle");
    expect(avatar.getAttribute("data-mood")).toBe("glad");
  });
});

describe("OwnNoteLine", () => {
  it("shows the author's own note quietly, waiting, with Ta bort", () => {
    const onRemove = vi.fn();
    const own = note("a", "Kan du handla?", { mine: true });
    render(<OwnNoteLine note={own} onRemove={onRemove} />);
    expect(screen.getByTestId("own-note").textContent).toBe("Din lapp: Kan du handla?VäntarTa bort");
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(onRemove).toHaveBeenCalledWith(own);
  });
});
