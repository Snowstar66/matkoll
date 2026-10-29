import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiBadge } from "@/components/badges";
import { RecipeCard, type RecipeCardProps } from "./recipe-card";
import { RecipeStatusBadge } from "./recipe-status-badge";

// Receptkort (Story 11.5): the image on top with the status and the heart on
// the light plate, the title and the time under it, the link over the card.

const image = "https://www.koket.se/korv-stroganoff.jpg";

function renderCard(props: Partial<Extract<RecipeCardProps, { href: string }>> = {}) {
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

/** The badge's plate: the element with the colours, around the text. */
const plate = (text: HTMLElement) => text.closest("span.text-badge") ?? text;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecipeCard", () => {
  it("shows the image, the status on the plate, the heart, the title link and the time", () => {
    const { card } = renderCard();
    const link = within(card).getByRole("link", { name: "Korv stroganoff" });
    expect(link).toHaveAttribute("href", "/recept/1");
    // Stretched over the whole card, under the heart.
    expect(link).toHaveClass("after:absolute", "after:inset-0", "after:z-1");
    expect(within(card).getByText("15 min · 4 portioner")).toBeInTheDocument();
    expect(plate(within(card).getByText("Kan lagas nu"))).toHaveClass("bg-overlay", "text-mint-ink");
    const heart = within(card).getByRole("button", { name: "Favorit, Korv stroganoff", pressed: false });
    expect(heart).toHaveClass("bg-overlay", "z-10", "size-tap");
    expect(heart.closest("a")).toBeNull();
  });

  it("never cuts the title short", () => {
    const long = "Långkokt högrevsgryta med rotfrukter, svamp och potatismos från grunden";
    const { card } = renderCard({ title: long });
    expect(within(card).getByRole("link", { name: long }).className).not.toMatch(/line-clamp|truncate/);
  });

  it("keeps the badge clear of the heart, on at most two lines", () => {
    const { card } = renderCard({ badge: <RecipeStatusBadge missingCount={12} onImage /> });
    const text = within(card).getByText("Saknar 12 varor");
    expect(text).toHaveClass("line-clamp-2");
    expect(plate(text).parentElement).toHaveClass("max-w-[calc(100%-3.5rem)]", "min-w-0");
  });

  it("draws the heart's focus ring inside its plate, so it shows on any photo", () => {
    const { card } = renderCard();
    expect(within(card).getByRole("button")).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-4",
      "focus-visible:outline-accent",
    );
  });

  it("loads the recipe's own image without a referrer, lazily, as decoration, cropped to the card's width", () => {
    const { card } = renderCard();
    const img = card.querySelector("img")!;
    expect(img).toHaveAttribute("src", image);
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    // The title is the link's name; the picture adds nothing to read.
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveClass("object-cover");
    expect(img.parentElement).toHaveClass("h-card-image", "w-full");
    // The image is on top, though the text comes first for a screen reader.
    expect(img.parentElement?.parentElement).toHaveClass("order-first");
  });

  it("shows a short mint strip with the badge when the recipe has no image", () => {
    const { card } = renderCard({ imageUrl: null });
    const placeholder = within(card).getByTestId("recipe-image-placeholder").parentElement!;
    expect(placeholder).toHaveClass("bg-mint", "h-16");
    expect(placeholder).not.toHaveClass("h-card-image");
    expect(within(card).getByText("Kan lagas nu")).toBeInTheDocument();
  });

  it("shows the placeholder when the recipe site answers 404", () => {
    const { card } = renderCard();
    fireEvent.error(card.querySelector("img")!);
    expect(within(card).getByTestId("recipe-image-placeholder")).toBeInTheDocument();
    expect(card.querySelector("img")).toBeNull();
  });

  it("shows the placeholder for an image that failed before hydration, which never fires onError", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    const { card } = renderCard();
    await waitFor(() => expect(within(card).getByTestId("recipe-image-placeholder")).toBeInTheDocument());
    expect(card.querySelector("img")).toBeNull();
  });

  it("keeps the short text on the badge and lists the missing items in its accessible text and title (Story 4.3)", () => {
    const { card } = renderCard({
      badge: <RecipeStatusBadge missingCount={3} missingNames={["Tryffelolja", "Persilja", "Salt"]} onImage />,
    });
    const badge = within(card).getByText("Saknar 3 varor").closest("span[title]");
    expect(badge).toHaveAttribute("title", "Saknar: tryffelolja, persilja +1");
    expect(badge).toHaveTextContent("Saknar 3 varor: tryffelolja, persilja +1");
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
    expect(plate(within(card).getByText("Saknar 2 varor"))).toHaveClass("bg-overlay", "text-sky-ink");
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

  it("as an AI suggestion: the AI label read before its own controls, no heart, a heading and no link", () => {
    render(
      <ul>
        <RecipeCard data-testid="ai-suggestion" title="Korv stroganoff" imageUrl={null} meta="15 min" badge={<AiBadge />}>
          <p>Med: lök</p>
          <button type="button">Spara</button>
        </RecipeCard>
      </ul>,
    );
    const card = screen.getByTestId("ai-suggestion");
    const label = within(card).getByText("AI-förslag");
    expect(label).toHaveClass("bg-sand", "text-sand-ink");
    expect(within(card).getByRole("heading", { level: 3, name: "Korv stroganoff" })).toBeInTheDocument();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).queryByRole("button", { name: /Favorit/ })).toBeNull();
    const save = within(card).getByRole("button", { name: "Spara" });
    expect(label.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByTestId("recipe-image-placeholder").parentElement).toHaveClass("h-16");
  });
});

// Type checks: a card with a link takes no children, and only a card with a link has a heart.
// @ts-expect-error -- children under the stretched link could not be tapped.
const withChildren = <RecipeCard title="T" imageUrl={null} meta="M" href="/recept/1"><button type="button">X</button></RecipeCard>;
// @ts-expect-error -- a card without a recipe view has no heart.
const heartless = <RecipeCard title="T" imageUrl={null} meta="M" favorite={{ pressed: false, onPressedChange: () => {} }} />;
void withChildren;
void heartless;
