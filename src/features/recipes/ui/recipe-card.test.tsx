import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiBadge } from "@/components/badges";
import { RecipeCard } from "./recipe-card";
import { RecipeStatusBadge } from "./recipe-status-badge";

// Receptkort (Story 11.5): the image on top with the status and the heart on
// the light plate, the title and the time under it, the link over the card.

const image = "https://www.koket.se/korv-stroganoff.jpg";

function renderCard(props: Partial<Parameters<typeof RecipeCard>[0]> = {}) {
  const onPressedChange = vi.fn();
  render(
    <ul>
      <RecipeCard
        title="Korv stroganoff"
        imageUrl={image}
        meta="15 min · 4 portioner"
        href="/recept/1"
        badge={<RecipeStatusBadge missingCount={0} onImage />}
        favorite={{ pressed: false, onPressedChange }}
        {...props}
      />
    </ul>,
  );
  return { card: screen.getByRole("listitem"), onPressedChange };
}

describe("RecipeCard", () => {
  it("shows the image, the status on the plate, the heart, the title link and the time", () => {
    const { card } = renderCard();
    const link = within(card).getByRole("link", { name: "Korv stroganoff" });
    expect(link).toHaveAttribute("href", "/recept/1");
    // Stretched over the whole card, under the heart.
    expect(link).toHaveClass("after:absolute", "after:inset-0", "after:z-1");
    expect(within(card).getByText("15 min · 4 portioner")).toBeInTheDocument();
    expect(within(card).getByText("Kan lagas nu")).toHaveClass("bg-overlay", "text-mint-ink");
    const heart = within(card).getByRole("button", { name: "Favorit, Korv stroganoff", pressed: false });
    expect(heart).toHaveClass("bg-overlay", "z-10", "size-tap");
    expect(heart.closest("a")).toBeNull();
  });

  it("loads the recipe's own image without a referrer, cropped to fill the card's width", () => {
    const { card } = renderCard();
    const img = card.querySelector("img")!;
    expect(img).toHaveAttribute("src", image);
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveClass("object-cover");
    expect(img.parentElement).toHaveClass("h-card-image", "w-full");
    // The image is on top, though the text comes first for a screen reader.
    expect(img.parentElement?.parentElement).toHaveClass("order-first");
  });

  it("shows the mint placeholder without an image, and when the image does not load", () => {
    renderCard({ imageUrl: null });
    expect(screen.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("bg-mint", "h-card-image");
  });

  it("shows the placeholder when the recipe site answers 404", () => {
    const { card } = renderCard();
    fireEvent.error(card.querySelector("img")!);
    expect(within(card).getByTestId("recipe-image-placeholder")).toBeInTheDocument();
    expect(card.querySelector("img")).toBeNull();
  });

  it("reads title, time, status and then the heart", () => {
    const { card } = renderCard({ badge: <RecipeStatusBadge missingCount={2} onImage /> });
    const order = [
      within(card).getByRole("link"),
      within(card).getByText("15 min · 4 portioner"),
      within(card).getByText("Saknar 2 varor"),
      within(card).getByRole("button"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(card).getByText("Saknar 2 varor")).toHaveClass("bg-overlay", "text-sky-ink");
  });

  it("toggles the favourite with the heart, which is a button outside the link", async () => {
    const user = userEvent.setup();
    const { card, onPressedChange } = renderCard();
    await user.click(within(card).getByRole("button", { name: "Favorit, Korv stroganoff" }));
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("shows no status without one (the pantry could not be read)", () => {
    const { card } = renderCard({ badge: undefined });
    expect(within(card).queryByText(/Kan lagas nu|Saknar/)).toBeNull();
    expect(within(card).getByRole("button", { name: "Favorit, Korv stroganoff" })).toBeInTheDocument();
  });

  it("as an AI suggestion: the AI label, no heart, a heading and no link", () => {
    renderCard({
      "data-testid": "ai-suggestion",
      href: undefined,
      favorite: undefined,
      badge: <AiBadge />,
      imageUrl: null,
      children: <p>Med: lök</p>,
    });
    const card = screen.getByTestId("ai-suggestion");
    expect(within(card).getByText("AI-förslag")).toHaveClass("bg-sand", "text-sand-ink");
    expect(within(card).getByRole("heading", { level: 3, name: "Korv stroganoff" })).toBeInTheDocument();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).getByText("Med: lök")).toBeInTheDocument();
  });
});
