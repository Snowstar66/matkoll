import { act, fireEvent, render as renderElement, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot, type PantrySnapshot } from "@/features/pantry";
import { ok } from "@/lib/errors";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import type { AddToPlan } from "./add-to-plan-button";
import { otherLinesHeading, stepSwipeDistancePx, wakeLockUnavailableText } from "./cook-mode";
import { RecipeView } from "./recipe-view";

// Stegläge (Story 4.2), opened with "Laga nu" from the recipe view, with a
// fake navigator.wakeLock (jsdom has none).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/set-favorite", () => ({ setFavorite: vi.fn() }));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

const ids = {
  cream: "22222222-2222-4222-8222-222222222222",
  onion: "33333333-3333-4333-8333-333333333333",
  salt: "44444444-4444-4444-8444-444444444444",
};

let position = 0;
const line = (overrides: Partial<SavedRecipeLine> & Pick<SavedRecipeLine, "id" | "originalText">): SavedRecipeLine => ({
  position: position++,
  amount: null,
  unit: null,
  isVague: false,
  ingredientId: null,
  ingredientName: null,
  stepId: null,
  ...overrides,
});

const recipe: SavedRecipe = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Krämig kycklinggryta",
  servings: 4,
  totalMinutes: 35,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  isFavorite: false,
  updatedAt: "2026-10-26T10:00:00+00:00",
  steps: [
    { id: "s1", position: 0, text: "Fräs löken och saltet." },
    { id: "s2", position: 1, text: "Häll i grädden och låt puttra." },
    { id: "s3", position: 2, text: "Servera med ris." },
  ],
  lines: [
    line({
      id: "cream",
      originalText: "2 dl grädde",
      amount: 2,
      unit: "dl",
      ingredientId: ids.cream,
      ingredientName: "Grädde",
      stepId: "s2",
    }),
    line({
      id: "onion",
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      ingredientId: ids.onion,
      ingredientName: "Gul lök",
      stepId: "s1",
    }),
    line({
      id: "salt",
      originalText: "salt efter smak",
      isVague: true,
      ingredientId: ids.salt,
      ingredientName: "Salt",
      stepId: "s1",
    }),
    line({ id: "lemons", originalText: "2 citroner", amount: 2, stepId: "s2" }),
    // No step: on step 1, under Övriga ingredienser.
    line({ id: "parsley", originalText: "persilja till servering", amount: null, stepId: null }),
  ],
};

/** 2 dl cream and 5 onions at home: 6 portions need 3 dl cream. */
const snapshot: PantrySnapshot = toSnapshot([
  { ingredientId: ids.cream, amount: 2, unit: "dl" },
  { ingredientId: ids.onion, amount: 5, unit: "st" },
  { ingredientId: ids.salt, amount: null, unit: null },
]);

class FakeSentinel extends EventTarget {
  readonly type = "screen";
  released = false;
  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

function installWakeLock(answer: "grant" | "refuse" | "wait" = "grant") {
  const sentinels: FakeSentinel[] = [];
  const pending: ((sentinel: FakeSentinel) => void)[] = [];
  const request = vi.fn(() => {
    if (answer === "refuse") return Promise.reject(new DOMException("Not allowed", "NotAllowedError"));
    return new Promise<FakeSentinel>((resolve) => {
      const grant = (sentinel: FakeSentinel) => {
        sentinels.push(sentinel);
        resolve(sentinel);
      };
      if (answer === "wait") pending.push(grant);
      else grant(new FakeSentinel());
    });
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels, pending };
}

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (document as { visibilityState?: unknown }).visibilityState;
});

const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish" }));
const cookButton = () => screen.getByRole("button", { name: "Laga nu" });
const dialog = () => screen.getByRole("dialog", { name: "Stegläge: Krämig kycklinggryta" }) as HTMLDialogElement;
const queryDialog = () => screen.queryByRole("dialog", { hidden: true });
const inDialog = () => within(dialog());
const heading = () => inDialog().getByRole("heading", { level: 2 });
const rows = () => inDialog().queryAllByTestId("recipe-view-line");
const previous = () => inDialog().getByRole("button", { name: "Föregående" });
const next = () => inDialog().getByRole("button", { name: "Nästa" });

/** Renders the recipe view, picks `servings`, and opens the step mode. */
async function openCookMode({
  servings = 6,
  pantry = snapshot as PantrySnapshot | null,
  of = recipe,
}: { servings?: number; pantry?: PantrySnapshot | null; of?: SavedRecipe } = {}) {
  const user = userEvent.setup();
  const view = render(<RecipeView recipe={of} snapshot={pantry} addToPlan={addToPlan} />);
  for (let i = of.servings; i < servings; i++) {
    await user.click(screen.getByRole("button", { name: "Fler portioner" }));
  }
  await user.click(cookButton());
  // Let the wake lock request settle.
  await act(async () => {});
  return { user, view };
}

const announcement = () => inDialog().getByTestId("cook-step-announcement");
const stepArea = () => inDialog().getByTestId("cook-step");

/** Drags over the step by (dx, dy) in steps, as a finger would, then lifts. */
function swipe(dx: number, dy = 0, { pointerId = 1, pointerType = "touch" } = {}) {
  const target = stepArea();
  const start = { clientX: 200, clientY: 300, pointerId, pointerType, button: 0, buttons: 1, isPrimary: true };
  fireEvent.pointerDown(target, start);
  for (const share of [0.25, 0.5, 1]) {
    fireEvent.pointerMove(target, { ...start, clientX: start.clientX + dx * share, clientY: start.clientY + dy * share });
  }
  fireEvent.pointerUp(target, { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy });
}

describe("Laga nu", () => {
  it("is a secondary button beside Lägg på matsedeln, which stays the primary one", () => {
    render(<RecipeView recipe={recipe} snapshot={snapshot} addToPlan={addToPlan} />);
    expect(cookButton()).toHaveClass("bg-sky", "text-sky-ink");
    expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toHaveClass("bg-accent");
    expect(cookButton().parentElement).toBe(screen.getByRole("button", { name: "Lägg på matsedeln" }).parentElement);
    expect(cookButton().parentElement).toHaveClass("flex-wrap");
  });

  it("is there without Lägg på matsedeln, and not for a recipe without steps", () => {
    const { unmount } = render(<RecipeView recipe={recipe} snapshot={snapshot} />);
    expect(cookButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lägg på matsedeln" })).not.toBeInTheDocument();
    unmount();
    render(<RecipeView recipe={{ ...recipe, steps: [] }} snapshot={snapshot} addToPlan={addToPlan} />);
    expect(screen.queryByRole("button", { name: "Laga nu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeInTheDocument();
  });

  it("opens nothing before it is pressed", () => {
    render(<RecipeView recipe={recipe} snapshot={snapshot} />);
    expect(queryDialog()).not.toBeInTheDocument();
  });
});

describe("CookMode", () => {
  it("opens as a modal at step 1 with the chosen servings, the step's scaled lines above its text, and focus on the step", async () => {
    installWakeLock();
    await openCookMode();
    expect(dialog().open).toBe(true);
    expect(heading()).toHaveTextContent(/^Steg 1 av 3$/);
    expect(heading()).toHaveFocus();
    // The change of step is announced in its own region; nothing is announced on opening.
    expect(heading()).not.toHaveAttribute("aria-live");
    expect(announcement()).toHaveAttribute("aria-live", "polite");
    expect(announcement()).toHaveClass("sr-only");
    expect(announcement()).toHaveTextContent(/^$/);
    expect(inDialog().getByText("Krämig kycklinggryta")).toBeInTheDocument();
    expect(inDialog().getByText("6 portioner")).toBeInTheDocument();
    // Step 1: the onion (×1,5) and the salt, in the recipe's order, with their marks, then the line of no step.
    expect(rows().map((row) => row.textContent)).toEqual(["Gul lök1,5 st", "salt efter smak", "persilja till servering"]);
    expect(rows().map((row) => within(row).getByRole("img").getAttribute("aria-label"))).toEqual([
      "finns hemma",
      "finns hemma",
      "jämförs inte med förrådet",
    ]);
    const other = inDialog().getByRole("heading", { level: 3, name: otherLinesHeading });
    expect(rows()[1].compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(other.compareDocumentPosition(rows()[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const text = inDialog().getByTestId("cook-step-text");
    expect(text).toHaveTextContent("Fräs löken och saltet.");
    expect(text).toHaveClass("text-step");
    expect(rows()[2].compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No line about the screen when the lock is granted.
    expect(inDialog().queryByText(wakeLockUnavailableText)).not.toBeInTheDocument();
  });

  it("shows a short amount in sky-ink with a ring and what is at home, as the recipe view does", async () => {
    installWakeLock();
    await openCookMode();
    fireEvent.click(next());
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    const [cream, lemons] = rows();
    expect(within(cream).getByRole("img")).toHaveAccessibleName("saknas");
    expect(within(cream).getByText("3 dl")).toHaveClass("text-sky-ink");
    expect(within(cream).getByText("hemma: 2 dl")).toBeInTheDocument();
    // No catalog ingredient: the text unscaled, with the factor.
    expect(lemons).toHaveTextContent(/^2 citroner×1,5$/);
    expect(within(lemons).getByRole("img")).toHaveAccessibleName("jämförs inte med förrådet");
  });

  it("shows only the text for a step without lines, and the lines of no step only on step 1", async () => {
    installWakeLock();
    await openCookMode();
    fireEvent.click(next());
    expect(inDialog().queryByText(/persilja/)).not.toBeInTheDocument();
    expect(inDialog().queryByText(otherLinesHeading)).not.toBeInTheDocument();
    fireEvent.click(next());
    expect(heading()).toHaveTextContent("Steg 3 av 3");
    expect(rows()).toHaveLength(0);
    expect(inDialog().queryByRole("list")).not.toBeInTheDocument();
    expect(inDialog().getByTestId("cook-step-text")).toHaveTextContent("Servera med ris.");
  });

  it("shows every line on step 1, without Övriga ingredienser, when no line has a step", async () => {
    installWakeLock();
    const unlinked = { ...recipe, lines: recipe.lines.map((l) => ({ ...l, stepId: null })) };
    await openCookMode({ of: unlinked });
    expect(rows()).toHaveLength(5);
    expect(inDialog().queryByText(otherLinesHeading)).not.toBeInTheDocument();
    fireEvent.click(next());
    expect(rows()).toHaveLength(0);
  });

  it("shows the steps in position order, whatever order they come in", async () => {
    installWakeLock();
    await openCookMode({ of: { ...recipe, steps: [recipe.steps[2], recipe.steps[0], recipe.steps[1]] } });
    expect(inDialog().getByTestId("cook-step-text")).toHaveTextContent("Fräs löken och saltet.");
  });

  it("shows the lines scaled but unmarked when the pantry could not be read", async () => {
    installWakeLock();
    await openCookMode({ pantry: null });
    expect(rows().map((row) => row.textContent)).toEqual(["Gul lök1,5 st", "salt efter smak", "persilja till servering"]);
    expect(inDialog().queryByRole("img")).not.toBeInTheDocument();
  });

  it("goes back and forth with Nästa and Föregående, which are aria-disabled at the ends and do nothing there", async () => {
    installWakeLock();
    const { user } = await openCookMode();
    expect(previous()).toHaveAttribute("aria-disabled", "true");
    expect(next()).not.toHaveAttribute("aria-disabled");
    await user.click(previous());
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    await user.click(next());
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    expect(previous()).not.toHaveAttribute("aria-disabled");
    await user.click(previous());
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    await user.click(next());
    await user.click(next());
    expect(heading()).toHaveTextContent("Steg 3 av 3");
    expect(next()).toHaveAttribute("aria-disabled", "true");
    // Still in the tab order, and focused.
    expect(next()).toHaveFocus();
    expect(next()).not.toBeDisabled();
    await user.click(next());
    expect(heading()).toHaveTextContent("Steg 3 av 3");
  });

  it("has buttons of at least 44 px in the thumb zone, the primary being Nästa", async () => {
    installWakeLock();
    await openCookMode();
    expect(previous()).toHaveClass("h-button", "bg-sky");
    expect(next()).toHaveClass("h-button", "bg-accent");
    expect(previous().closest("div.shrink-0")).toHaveClass(
      "pb-[calc(env(safe-area-inset-bottom)+var(--gutter-mobile))]",
    );
  });

  it("changes step with ArrowRight and ArrowLeft, but not with a modifier", async () => {
    installWakeLock();
    const { user } = await openCookMode();
    await user.keyboard("{ArrowRight}");
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(heading()).toHaveTextContent("Steg 3 av 3");
    await user.keyboard("{ArrowLeft}");
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(heading()).toHaveTextContent("Steg 1 av 3");
  });

  it("goes to the next step on a swipe to the left and back on one to the right; a short or vertical drag does not", async () => {
    installWakeLock();
    await openCookMode();
    swipe(-(stepSwipeDistancePx + 10));
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    swipe(stepSwipeDistancePx + 10);
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    swipe(-(stepSwipeDistancePx - 10));
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    // Mostly downwards: a scroll of the step, however far it goes sideways after.
    swipe(-(stepSwipeDistancePx + 10), 200);
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    expect(inDialog().getByTestId("cook-step")).toHaveClass("touch-pan-y", "overflow-y-auto");
  });

  it("animates the change of step only without Minska rörelse", async () => {
    installWakeLock();
    await openCookMode();
    const animated = inDialog().getByTestId("cook-step-text").parentElement!;
    expect(animated.className).toContain("motion-safe:animate-step-in");
    expect(animated.className).not.toMatch(/(^|\s)animate-/);
  });

  it("closes with Stäng, releases the lock, and leaves the recipe view as it was with focus on Laga nu", async () => {
    const { sentinels } = installWakeLock();
    const { user } = await openCookMode();
    expect(sentinels).toHaveLength(1);
    await user.click(inDialog().getByRole("button", { name: "Stäng" }));
    expect(queryDialog()).not.toBeInTheDocument();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(cookButton()).toHaveFocus();
    expect(screen.getByText("6 portioner")).toBeInTheDocument();
  });

  it("closes with Esc and with a close the browser starts, and opens again at step 1", async () => {
    const { sentinels } = installWakeLock();
    const { user } = await openCookMode();
    await user.click(next());
    await user.keyboard("{Escape}");
    expect(queryDialog()).not.toBeInTheDocument();
    expect(cookButton()).toHaveFocus();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);

    await user.click(cookButton());
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    act(() => dialog().requestClose());
    expect(queryDialog()).not.toBeInTheDocument();
  });

  it("requests the lock again when the page shows again while open", async () => {
    const { request, sentinels } = installWakeLock();
    await openCookMode();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await sentinels[0].release();
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("releases a lock that comes after Stäng at once, and shows no line", async () => {
    const { pending } = installWakeLock("wait");
    const { user } = await openCookMode();
    await user.click(inDialog().getByRole("button", { name: "Stäng" }));
    const late = new FakeSentinel();
    await act(async () => pending[0](late));
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(wakeLockUnavailableText)).not.toBeInTheDocument();
  });

  it("says the screen may dim when the browser has no Wake Lock, not as an error, and still works", async () => {
    const { user } = await openCookMode();
    const note = inDialog().getByText(wakeLockUnavailableText);
    expect(note).toHaveClass("text-meta", "text-ink-2");
    expect(inDialog().queryByRole("alert")).not.toBeInTheDocument();
    // At the top, before Stäng and the step.
    const close = inDialog().getByRole("button", { name: "Stäng" });
    expect(note.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(next());
    expect(heading()).toHaveTextContent("Steg 2 av 3");
  });

  it("says the same when the request is refused", async () => {
    installWakeLock("refuse");
    await openCookMode();
    // The refusal arrives after the request's promise has settled.
    expect(await inDialog().findByText(wakeLockUnavailableText)).toBeInTheDocument();
    expect(inDialog().queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes, and releases the lock, when a client navigation hides the page", async () => {
    const { sentinels } = installWakeLock();
    const user = userEvent.setup();
    const view = (mode: "visible" | "hidden") => (
      <ToastProvider>
        <Activity mode={mode}>
          <RecipeView recipe={recipe} snapshot={snapshot} addToPlan={addToPlan} />
        </Activity>
      </ToastProvider>
    );
    const { rerender } = renderElement(view("visible"));
    await user.click(cookButton());
    await act(async () => {});
    expect(dialog().open).toBe(true);
    rerender(view("hidden"));
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    // Not closed by Pontus: focus is not moved back to the hidden page.
    expect(screen.getByRole("button", { name: "Laga nu", hidden: true })).not.toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
    rerender(view("visible"));
    await act(async () => {});
    expect(queryDialog()).not.toBeInTheDocument();
    expect(sentinels).toHaveLength(1);
  });

  it("changes step with the arrow keys after a tap on the step's text, which takes focus off the controls", async () => {
    installWakeLock();
    const { user } = await openCookMode();
    await user.click(inDialog().getByTestId("cook-step-text"));
    await user.keyboard("{ArrowRight}");
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    // Also from the page's body, where focus goes in some browsers.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(heading()).toHaveTextContent("Steg 1 av 3");
  });

  it("moves one step for a held arrow key", async () => {
    installWakeLock();
    await openCookMode();
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowRight", repeat: true });
    fireEvent.keyDown(document.body, { key: "ArrowRight", repeat: true });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
  });

  it("forgets a drag whose end never came: a new pointer, a move without buttons, or the pointer leaving", async () => {
    installWakeLock();
    await openCookMode();
    const start = { clientX: 200, clientY: 300, pointerType: "touch", button: 0, buttons: 1, isPrimary: true };
    // A drag that never ends, then a new swipe with another pointer.
    fireEvent.pointerDown(stepArea(), { ...start, pointerId: 7 });
    swipe(-(stepSwipeDistancePx + 10), 0, { pointerId: 8 });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    // A move without any button down ends the drag, so its pointerup does nothing.
    fireEvent.pointerDown(stepArea(), { ...start, pointerId: 9 });
    fireEvent.pointerMove(stepArea(), { ...start, pointerId: 9, clientX: 120, buttons: 0 });
    fireEvent.pointerUp(stepArea(), { ...start, pointerId: 9, clientX: 120, buttons: 0 });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    // Leaving the step ends it too.
    fireEvent.pointerDown(stepArea(), { ...start, pointerId: 10 });
    fireEvent.pointerMove(stepArea(), { ...start, pointerId: 10, clientX: 180 });
    fireEvent.pointerLeave(stepArea(), { ...start, pointerId: 10 });
    fireEvent.pointerUp(stepArea(), { ...start, pointerId: 10, clientX: 100 });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
  });

  it("changes step on a mouse drag, but not when the drag selected text", async () => {
    installWakeLock();
    await openCookMode();
    swipe(-(stepSwipeDistancePx + 10), 0, { pointerType: "mouse" });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "grädden" } as Selection);
    swipe(stepSwipeDistancePx + 10, 0, { pointerType: "mouse" });
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    // A finger's swipe is a swipe, whatever is selected.
    swipe(stepSwipeDistancePx + 10);
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    selection.mockRestore();
  });

  it("announces the new step and its text, and leaves focus where it was", async () => {
    installWakeLock();
    const { user } = await openCookMode();
    await user.click(next());
    expect(announcement()).toHaveTextContent(/^Steg 2 av 3: Häll i grädden och låt puttra\.$/);
    expect(next()).toHaveFocus();
  });

  it("scrolls a new step to its top", async () => {
    installWakeLock();
    const { user } = await openCookMode();
    stepArea().scrollTop = 240;
    await user.click(next());
    expect(stepArea().scrollTop).toBe(0);
  });

  it("keeps the page behind from scrolling while open, and gives it back on close", async () => {
    installWakeLock();
    document.documentElement.style.overflow = "clip";
    const { user } = await openCookMode();
    expect(document.documentElement.style.overflow).toBe("hidden");
    await user.click(inDialog().getByRole("button", { name: "Stäng" }));
    expect(document.documentElement.style.overflow).toBe("clip");
    document.documentElement.style.overflow = "";
  });

  it("closes, releases the lock and returns focus on the dialog's close event, and Laga nu opens it again", async () => {
    const { sentinels } = installWakeLock();
    const { user } = await openCookMode();
    act(() => dialog().close());
    expect(queryDialog()).not.toBeInTheDocument();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(cookButton()).toHaveFocus();
    await user.click(cookButton());
    await act(async () => {});
    expect(heading()).toHaveTextContent("Steg 1 av 3");
    expect(sentinels).toHaveLength(2);
  });

  it("stays on the same step when the recipe is read again with a step added before it, and on the place when the step goes", async () => {
    installWakeLock();
    const user = userEvent.setup();
    const { rerender } = render(<RecipeView recipe={recipe} snapshot={snapshot} />);
    await user.click(cookButton());
    await user.click(next());
    expect(heading()).toHaveTextContent("Steg 2 av 3");
    const added = { id: "s0", position: -1, text: "Koka riset." };
    const withAdded = { ...recipe, steps: [added, ...recipe.steps] };
    rerender(
      <ToastProvider>
        <RecipeView recipe={withAdded} snapshot={snapshot} />
      </ToastProvider>,
    );
    expect(heading()).toHaveTextContent("Steg 3 av 4");
    expect(inDialog().getByTestId("cook-step-text")).toHaveTextContent("Häll i grädden och låt puttra.");
    const withoutIt = { ...withAdded, steps: withAdded.steps.filter((step) => step.id !== "s2") };
    rerender(
      <ToastProvider>
        <RecipeView recipe={withoutIt} snapshot={snapshot} />
      </ToastProvider>,
    );
    expect(heading()).toHaveTextContent("Steg 3 av 3");
    expect(inDialog().getByTestId("cook-step-text")).toHaveTextContent("Servera med ris.");
  });

  it("closes when the recipe loses its steps while open, and does not open again by itself when they come back", async () => {
    installWakeLock();
    const user = userEvent.setup();
    const { rerender } = render(<RecipeView recipe={recipe} snapshot={snapshot} />);
    await user.click(cookButton());
    const shown = (of: SavedRecipe) => (
      <ToastProvider>
        <RecipeView recipe={of} snapshot={snapshot} />
      </ToastProvider>
    );
    rerender(shown({ ...recipe, steps: [] }));
    expect(queryDialog()).not.toBeInTheDocument();
    rerender(shown(recipe));
    expect(queryDialog()).not.toBeInTheDocument();
    expect(cookButton()).toBeInTheDocument();
  });

  it("waits with Laga nu while a dish is being added, so the confirmation is seen", async () => {
    installWakeLock();
    const user = userEvent.setup();
    let answer: (result: Awaited<ReturnType<AddToPlan>>) => void = () => {};
    const slow = vi.fn<AddToPlan>(() => new Promise((resolve) => (answer = resolve)));
    render(<RecipeView recipe={recipe} snapshot={snapshot} addToPlan={slow} />);
    const add = screen.getByRole("button", { name: "Lägg på matsedeln" });
    await user.click(add);
    expect(cookButton()).toBeDisabled();
    // The button keeps its width: both labels are there, only one is read.
    expect(screen.getByRole("button", { name: "Lägger på matsedeln …" })).toBe(add);
    await act(async () => answer(ok({ id: "dish" })));
    expect(cookButton()).toBeEnabled();
    expect(screen.getByTestId("toast")).toHaveTextContent("Lagt på matsedeln.");
  });
});
