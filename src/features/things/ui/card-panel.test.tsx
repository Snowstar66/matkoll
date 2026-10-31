import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Thing } from "../domain/thing";
import type { ThingCard } from "../domain/thing-photo";
import { CardPanel as Panel } from "./card-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/remove-card", () => ({ removeThingCard: vi.fn(), restoreThingCard: vi.fn(), finishCardRemoval: vi.fn() }));
vi.mock("../actions/create-box", () => ({ createThingBox: vi.fn() }));
vi.mock("../actions/thing-item", () => ({ removeThing: vi.fn(), renameThing: vi.fn(), restoreThing: vi.fn() }));

function CardPanel(props: Omit<Parameters<typeof Panel>[0], "placeId" | "canAddBox"> & { canAddBox?: boolean }) {
  return (
    <ToastProvider>
      <Panel placeId="0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02" canAddBox {...props} />
    </ToastProvider>
  );
}

const card: ThingCard = {
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
  takenAt: new Date("2026-10-31T10:00:00Z"),
  createdAt: new Date("2026-10-31T10:00:00Z"),
  status: "done",
  errorCode: null,
  unseenNote: null,
  unseenCount: 0,
};
const thing = (name: string, overrides: Partial<Thing> = {}): Thing => ({
  id: crypto.randomUUID(),
  name,
  category: "Verktyg",
  whereHint: null,
  confidence: "high",
  ...overrides,
});

describe("CardPanel", () => {
  it("shows the thumbnail from the private route with the card's date and the things under their categories", () => {
    render(
      <CardPanel
        card={card}
        things={[
          thing("Spade", { category: "Trädgård", whereHint: "golvet, höger" }),
          thing("Hammare", { whereHint: "på väggen, mitten" }),
          thing("Presenning", { category: "Hushåll", confidence: "low", whereHint: "överst, höger" }),
        ]}
      />,
    );
    expect(screen.getByAltText("Kortet av platsen")).toHaveAttribute("src", `/api/things/photo/${card.id}`);
    expect(screen.getByText("Kort från 31 okt")).toBeInTheDocument();
    expect(screen.getByText("3 saker")).toBeInTheDocument();

    const groups = screen.getAllByTestId("thing-group");
    expect(groups.map((group) => within(group).getByRole("heading").textContent)).toEqual(["Verktyg", "Trädgård", "Hushåll"]);
    // The tile is decoration; the category's name stands beside it.
    expect(groups[0].querySelector("[aria-hidden]")).toHaveTextContent("🔨");
    expect(within(groups[0]).getByText("Hammare")).toBeInTheDocument();
    expect(within(groups[0]).getByText("på väggen, mitten")).toBeInTheDocument();
    // A guess says kanske.
    expect(within(groups[2]).getByText("kanske · överst, höger")).toBeInTheDocument();
    expect(within(groups[1]).queryByText(/kanske/)).toBeNull();
  });

  it("says what is not visible, with how many closed containers", () => {
    render(<CardPanel card={{ ...card, unseenCount: 3 }} things={[thing("Hammare")]} />);
    expect(screen.getByTestId("unseen-note")).toHaveTextContent("Innehållet i 3 lådor syns inte – fota insidan");
  });

  it("makes the line a button that adds a box on a place, and plain text in a box", async () => {
    const { rerender } = render(<CardPanel card={{ ...card, unseenCount: 3 }} things={[thing("Hammare")]} />);
    expect(screen.getByRole("button", { name: /Innehållet i 3 lådor syns inte/ })).toBeInTheDocument();
    rerender(<CardPanel card={{ ...card, unseenCount: 3 }} things={[thing("Hammare")]} canAddBox={false} />);
    expect(screen.queryByRole("button", { name: /syns inte/ })).toBeNull();
    expect(screen.getByTestId("unseen-note")).toHaveTextContent("syns inte");
  });

  it("falls back on the model's sentence, and shows no line when everything is visible", () => {
    const { rerender } = render(<CardPanel card={{ ...card, unseenNote: "Innehållet i en påse syns inte." }} things={[thing("Hammare")]} />);
    expect(screen.getByTestId("unseen-note")).toHaveTextContent("Innehållet i en påse syns inte.");
    rerender(<CardPanel card={card} things={[thing("Hammare")]} />);
    expect(screen.queryByTestId("unseen-note")).toBeNull();
  });

  it("says calmly when the card has no things", () => {
    render(<CardPanel card={card} things={[]} />);
    expect(screen.getByText(/Inga prylar hittades/)).toBeInTheDocument();
    expect(screen.queryByTestId("thing-group")).toBeNull();
  });
});
