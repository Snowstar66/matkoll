import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoteView } from "../domain/note";
import { NoteCard, OwnNoteLine } from "./note-card";

const note = (id: string, text: string, extra: Partial<NoteView> = {}): NoteView => ({
  id,
  text,
  mood: null,
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
    expect(screen.getByText("Först")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2 lappar till" }));
    expect(screen.getByText("Sen")).toBeTruthy();
  });
});

describe("OwnNoteLine", () => {
  it("shows the author's own note quietly, waiting", () => {
    render(<OwnNoteLine note={note("a", "Kan du handla?", { mine: true })} />);
    expect(screen.getByTestId("own-note").textContent).toBe("Din lapp: Kan du handla?Väntar");
  });
});
