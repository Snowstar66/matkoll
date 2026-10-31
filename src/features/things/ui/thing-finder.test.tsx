import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { IndexedPlace } from "../domain/thing-search";
import { ThingFinder } from "./thing-finder";

const askAboutThings = vi.fn();
vi.mock("../actions/ask-things", () => ({ askAboutThings: (question: string) => askAboutThings(question) }));

const places: IndexedPlace[] = [
  {
    id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
    siteId: "s1",
    siteName: "Hemma",
    room: "Skräpförrådet",
    part: null,
    isBox: false,
    cardTakenAt: new Date("2026-10-31T10:00:00Z"),
    hidden: 0,
    things: [{ id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Hammare", category: "Verktyg", whereHint: "väggen" }],
  },
  {
    id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
    siteId: "s2",
    siteName: "Stugan",
    room: "Garaget",
    part: "Hyllan",
    isBox: false,
    cardTakenAt: new Date("2026-09-02T10:00:00Z"),
    hidden: 0,
    things: [{ id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Spade", category: "Trädgård", whereHint: null }],
  },
];

beforeEach(() => askAboutThings.mockReset());

function renderIt(props: Partial<ComponentProps<typeof ThingFinder>> = {}) {
  render(
    <ThingFinder places={places} {...props}>
      <p>Platserna</p>
    </ThingFinder>,
  );
}

describe("search", () => {
  it("shows matching things from every boende as a line with place, boende and date, instead of the places", async () => {
    renderIt();
    await userEvent.type(screen.getByRole("searchbox", { name: "Sök bland prylar" }), "hamm");
    const hits = screen.getAllByTestId("thing-hit");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toHaveTextContent("Hammare Skräpförrådet, väggen · Hemma · 31 okt");
    expect(hits[0]).toHaveAttribute("href", `/prylar/${places[0].id}`);
    expect(screen.getByText("Platserna").parentElement).toHaveClass("hidden");
    expect(askAboutThings).not.toHaveBeenCalled();
  });

  it("says when nothing matches, and brings the places back when cleared", async () => {
    renderIt();
    const field = screen.getByRole("searchbox", { name: "Sök bland prylar" });
    await userEvent.type(field, "borrmaskin");
    expect(screen.getByText('Inga prylar matchar "borrmaskin".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rensa sökning" }));
    expect(screen.queryByText(/Inga prylar matchar/)).toBeNull();
    expect(screen.getByText("Platserna").parentElement).not.toHaveClass("hidden");
  });
});

describe("Fråga om dina prylar", () => {
  const ask = async (question: string) => {
    const box = screen.getByTestId("ask-box");
    await userEvent.type(within(box).getByLabelText("Fråga om dina prylar"), question);
    await userEvent.click(within(box).getByRole("button", { name: "Fråga" }));
  };

  it("sends only the question and shows the answer with tappable places", async () => {
    askAboutThings.mockResolvedValue(
      ok({ answer: "Hammare finns i Skräpförrådet.", refs: [{ placeId: places[0].id, label: "Skräpförrådet · Hemma · 31 okt" }] }),
    );
    renderIt();
    await ask("Var är hammaren?");
    await waitFor(() => expect(screen.getByTestId("ask-answer")).toHaveTextContent("Hammare finns i Skräpförrådet."));
    expect(askAboutThings).toHaveBeenCalledWith("Var är hammaren?");
    const ref = screen.getByTestId("ask-ref");
    expect(ref).toHaveTextContent("Skräpförrådet · Hemma · 31 okt");
    expect(ref).toHaveAttribute("href", `/prylar/${places[0].id}`);
  });

  it("says that it is thinking, and shows the AI's error calmly", async () => {
    let finish: (value: unknown) => void = () => {};
    askAboutThings.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderIt();
    await ask("Finns spade?");
    expect(screen.getByText("Tänker …")).toBeInTheDocument();
    finish(fail("ai_unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI-tjänsten svarar inte just nu");
    expect(screen.queryByText("Tänker …")).toBeNull();
  });

  it("does not send an empty question", async () => {
    renderIt();
    await userEvent.click(within(screen.getByTestId("ask-box")).getByRole("button", { name: "Fråga" }));
    expect(askAboutThings).not.toHaveBeenCalled();
  });
});
