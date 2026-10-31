import { act, fireEvent, render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, type ReactElement, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Store } from "@/features/settings";
import { ok } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import { basketEndMarker, basketExportHeader, basketInstruction } from "../domain/export-basket";
import type { ProductChoice } from "../domain/product-choice";
import { ShoppingList, type ShoppingListProps } from "./shopping-list";

// "Kopiera till ICA-varukorgen" (Story 7.3): the export is built in the browser from the
// list as shown and written to the clipboard in the same tap, with no fetch
// and no Server Action; a refused clipboard opens the sheet Inköpslistan
// with the text selected and "Kopiera".

const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: ToastProvider, ...options });

// Every Server Action the list can reach: none of them runs for the export.
const actions = vi.hoisted(() => ({
  setChecked: vi.fn(),
  putCheckedInPantry: vi.fn(),
  other: vi.fn(),
}));
vi.mock("../actions/set-checked", () => ({ setChecked: actions.setChecked }));
vi.mock("../actions/put-checked-in-pantry", () => ({ putCheckedInPantry: actions.putCheckedInPantry }));
vi.mock("../actions/add-custom-item", () => ({ addCustomItem: actions.other }));
vi.mock("../actions/clear-line-amount", () => ({ clearLineAmount: actions.other }));
vi.mock("../actions/hide-line", () => ({ hideLine: actions.other }));
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: actions.other }));
vi.mock("../actions/remove-product-choice", () => ({ removeProductChoice: actions.other }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: actions.other }));
vi.mock("../actions/restore-line", () => ({ restoreLine: actions.other }));
vi.mock("../actions/restore-product-choice", () => ({ restoreProductChoice: actions.other }));
vi.mock("../actions/save-product-choice", () => ({ saveProductChoice: actions.other }));
vi.mock("../actions/set-line-amount", () => ({ setLineAmount: actions.other }));
vi.mock("../actions/show-line", () => ({ showLine: actions.other }));
vi.mock("../actions/update-custom-item", () => ({ updateCustomItem: actions.other }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const gradde = "22222222-2222-4222-8222-222222222201";
const lok = "22222222-2222-4222-8222-222222222202";
const salt = "22222222-2222-4222-8222-222222222203";

const line = (overrides: Partial<ShoppingLine> & Pick<ShoppingLine, "key" | "label">): ShoppingLine => ({
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "missing" },
  section: "Övrigt",
  origins: ["d1"],
  checked: false,
  isCustom: false,
  ...overrides,
});

const plan: NonNullable<ShoppingListProps["plan"]> = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Vecka 44",
  dishCount: 1,
  skippedCount: 0,
  dishTitles: { d1: "Krämig kycklinggryta" },
};
const graddeLine = line({ key: `r:${gradde}:dl`, ingredientId: gradde, label: "Grädde", section: "Mejeri", amount: 3, unit: "dl" });
const lokLine = line({ key: `r:${lok}:st`, ingredientId: lok, label: "Gul lök", section: "Frukt och grönt", amount: 2, unit: "st" });
const saltLine = line({
  key: `r:${salt}:-`,
  ingredientId: salt,
  label: "Salt",
  section: "Skafferi",
  isVague: true,
  coverage: { kind: "vague-missing" },
});
const lines = [lokLine, graddeLine, saltLine];

const maxi: Store = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: "https://handlaprivatkund.ica.se/stores/1003733",
  offersUrl: null,
  isSelected: true,
};
const choices: Record<string, ProductChoice> = {
  [gradde]: {
    id: "44444444-4444-4444-8444-444444444444",
    ingredientId: gradde,
    storeId: maxi.id,
    productName: "Arla Matlagningsgrädde 15 %",
    packageSize: "5 dl",
    url: null,
    updatedAt: "2026-10-26T10:00:00+00:00",
  },
};

const props = (changes: Partial<ShoppingListProps> = {}): ShoppingListProps => ({
  plan,
  lines,
  pantryUnavailable: false,
  store: maxi,
  productChoices: choices,
  ...changes,
});

/** The list as the server gives it: a saved check shows, as the server's revalidation would. */
function ServerList() {
  const [shown, setShown] = useState(lines);
  useEffect(() => {
    actions.setChecked.mockImplementation(async (change: { key: string; checked: boolean }) => {
      setShown((before) => before.map((item) => (item.key === change.key ? { ...item, checked: change.checked } : item)));
      return ok(change);
    });
  }, []);
  return <ShoppingList {...props({ lines: shown })} />;
}

const copied = "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla.";
const sendButton = (name = "Kopiera till ICA-varukorgen") => screen.queryByRole("button", { name });

/** A clipboard whose writeText answers with `answers` in turn, then the last again. */
function stubClipboard(...answers: ("ok" | "refuse")[]) {
  let call = 0;
  const writeText = vi.fn<(text: string) => Promise<void>>(() => {
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    return answer === "ok" ? Promise.resolve() : Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  // After userEvent.setup(), which puts a clipboard of its own on navigator.
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

const fetchSpy = vi.fn();
beforeEach(() => {
  // These tests start from I korgen folded; Story 3.9 opens it by default.
  window.localStorage.setItem("matkoll:basket-open", "0");
  actions.setChecked.mockReset().mockImplementation(async (change: unknown) => ok(change));
  actions.putCheckedInPantry.mockReset();
  actions.other.mockReset();
  refresh.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
});

function expectNoServer() {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(actions.setChecked).not.toHaveBeenCalled();
  expect(actions.putCheckedInPantry).not.toHaveBeenCalled();
  expect(actions.other).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
}

describe("Kopiera till ICA-varukorgen", () => {
  it("writes the export to the clipboard in the tap itself, with no fetch or action, and confirms", async () => {
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...props()} />);
    // fireEvent runs the handler synchronously: writeText must already have been called when it returns.
    fireEvent.click(sendButton()!);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0];
    expect(text.startsWith(`${basketExportHeader}\n`)).toBe(true);
    expect(text).toContain("\nButik: Maxi ICA Stormarknad Östersund\nKedja: ICA\n");
    expect(text).toContain("\nURL: https://handlaprivatkund.ica.se/stores/1003733\n");
    expect(text).toContain("Mejeri\n- Grädde\n  Mängd: 3 dl\n  Önskad produkt: Arla Matlagningsgrädde 15 %\n  Förpackning: 5 dl\n");
    expect(text).toContain("Frukt och grönt\n- Gul lök\n  Mängd: 2 st\n");
    // The vague line is sent too, with no amount (Story 16.5).
    expect(text).toContain("- Salt\n  Mängd: ingen angiven – välj en vanlig förpackning\n");
    expect(text).toContain("Antal varor: 3\n");
    expect(text.endsWith(`${basketEndMarker}\n\n${basketInstruction}\n`)).toBe(true);
    expect(await screen.findByTestId("toast")).toHaveTextContent(`3 varor kopierade. ${copied}`);
    expectNoServer();
  });

  it("is the secondary button alone, in the list's FixedAction (Story 11.4)", () => {
    stubClipboard("ok");
    render(<ShoppingList {...props()} />);
    expect(sendButton()).toHaveClass("bg-sky");
    expect(screen.queryByRole("button", { name: "Lägg till i Matvaror" })).not.toBeInTheDocument();
  });

  it("is off while a check is being saved, so a check that goes back cannot leave an item out", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard("ok");
    let answer: (result: unknown) => void = () => {};
    actions.setChecked.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(<ShoppingList {...props()} />);
    await user.click(screen.getByRole("checkbox", { name: "Gul lök, 2 st" }));
    expect(sendButton()).toBeDisabled();
    fireEvent.click(sendButton()!);
    expect(writeText).not.toHaveBeenCalled();
    // The save fails: the check goes back, and the button is on again.
    await act(async () => answer({ ok: false, error: { code: "shopping_check_failed", message: "Det gick inte att spara bocken." } }));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: "Gul lök, 2 st" })).not.toBeChecked();
  });

  it("leaves out a line checked off, as shown, and sits beside Lägg till i Matvaror as the secondary button", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard("ok");
    render(<ServerList />);
    await user.click(screen.getByRole("checkbox", { name: "Gul lök, 2 st" }));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /^Visa I korgen/ }));
    expect(screen.getByRole("checkbox", { name: "Gul lök, 2 st" })).toBeChecked();

    const put = screen.getByRole("button", { name: "Lägg till i Matvaror" });
    const send = sendButton()!;
    expect(put).toHaveClass("bg-accent");
    expect(send).toHaveClass("bg-sky");
    // One FixedAction: "Kopiera till ICA-varukorgen" first in the row, "Lägg till i Matvaror" after it (on top when they wrap).
    expect(put.parentElement).toBe(send.parentElement);
    expect(send.compareDocumentPosition(put) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(send);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0];
    expect(text).not.toContain("Gul lök");
    expect(text).toContain("Antal varor: 2\n");
    // The copy replaces the "Gul lök i korgen" toast (Story 3.9).
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent(`2 varor kopierade. ${copied}`));
  });

  it.each([
    ["every line checked off", props({ lines: [{ ...lokLine, checked: true }, { ...saltLine, checked: true }] })],
    ["an empty list", props({ lines: [] })],
    ["no meal plan", props({ plan: null, lines: [] })],
  ])("is not shown for %s", (_, list) => {
    render(<ShoppingList {...list} />);
    expect(screen.queryByRole("button", { name: /^Kopiera till/ })).not.toBeInTheDocument();
  });

  it("takes every line when the checks could not be read, and says to check the basket", async () => {
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...props({ checksUnavailable: true })} />);
    fireEvent.click(sendButton()!);
    const text = writeText.mock.calls[0]![0];
    expect(text).toContain("Antal varor: 3\n");
    expect(await screen.findByTestId("toast")).toHaveTextContent(
      "Inköpslistan är kopierad, men bockarna gick inte att läsa. Kontrollera varukorgen.",
    );
  });

  it("says utan alla produktval when an exported item's choice cannot be read", async () => {
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...props({ productChoices: {}, unreadableChoices: [lok] })} />);
    fireEvent.click(sendButton()!);
    expect(writeText.mock.calls[0]![0]).toContain("- Gul lök\n");
    expect(await screen.findByTestId("toast")).toHaveTextContent(
      "Inköpslistan är kopierad utan alla produktval. Klistra in den i Claude i Chrome på ICA Handla.",
    );
  });

  it("does not say so when the unreadable choice is for an item not sent", async () => {
    stubClipboard("ok");
    render(<ShoppingList {...props({ lines: [{ ...lokLine, checked: true }, graddeLine], unreadableChoices: [lok] })} />);
    fireEvent.click(sendButton()!);
    expect(await screen.findByTestId("toast")).toHaveTextContent(copied);
  });

  it("only confirms the latest tap: an earlier writeText that settles later is ignored", async () => {
    const answers: { resolve: () => void; reject: (error: unknown) => void }[] = [];
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () => new Promise<void>((resolve, reject) => answers.push({ resolve, reject })),
    );
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShoppingList {...props()} />);
    fireEvent.click(sendButton()!);
    fireEvent.click(sendButton()!);
    expect(writeText).toHaveBeenCalledTimes(2);
    // The second tap's copy works; the first's refusal comes later and opens no sheet.
    await act(async () => answers[1]!.resolve());
    expect(await screen.findByTestId("toast")).toHaveTextContent(copied);
    await act(async () => answers[0]!.reject(new DOMException("Denied", "NotAllowedError")));
    expect(screen.queryByRole("dialog", { name: "Inköpslistan" })).not.toBeInTheDocument();
  });

  it.each([
    ["Willys", "Kopiera till Willys-varukorgen", "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på butikens webbplats."],
    ["Annan", "Kopiera till varukorgen", "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på butikens webbplats."],
  ] as const)("names the button after the chain %s, and confirms with the store's site", async (chain, name, text) => {
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...props({ store: { ...maxi, chain, name: "Butiken" } })} />);
    expect(sendButton("Kopiera till ICA-varukorgen")).not.toBeInTheDocument();
    fireEvent.click(sendButton(name)!);
    expect(writeText.mock.calls[0]![0]).toContain(`Kedja: ${chain}\n`);
    expect(await screen.findByTestId("toast")).toHaveTextContent(text);
  });

  it("copies without product choices when they could not be read, and says so", async () => {
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...props({ productChoicesUnavailable: true })} />);
    fireEvent.click(sendButton()!);
    expect(writeText.mock.calls[0]![0]).not.toContain("Önskad produkt:");
    expect(await screen.findByTestId("toast")).toHaveTextContent(
      "Inköpslistan är kopierad utan produktval. Klistra in den i Claude i Chrome på ICA Handla.",
    );
  });

  it.each([
    ["could not be read", props({ store: null, storeUnavailable: true })],
    ["is not selected", props({ store: null, productChoices: {} })],
  ])("copies nothing when the store %s, and shows a notice with Öppna inställningar", async (_, list) => {
    const user = userEvent.setup();
    const writeText = stubClipboard("ok");
    render(<ShoppingList {...list} />);
    await user.click(sendButton("Kopiera till varukorgen")!);
    expect(writeText).not.toHaveBeenCalled();
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Det gick inte att läsa butiken. Öppna inställningarna och försök igen.");
    expect(screen.getByRole("link", { name: "Öppna inställningar" })).toHaveAttribute("href", "/installningar/butiker");
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
    expectNoServer();
  });

  it("takes the store notice away when the list is hidden, and does not bring it back when shown", async () => {
    const user = userEvent.setup();
    stubClipboard("ok");
    const missing = props({ store: null, storeUnavailable: true });
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ShoppingList {...missing} />
      </Activity>
    );
    const { rerender } = render(view("visible"));
    await user.click(sendButton("Kopiera till varukorgen")!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await act(async () => rerender(view("hidden")));
    await act(async () => rerender(view("visible")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("takes the store notice away once the store can be read again, and keeps it away if it goes again", async () => {
    const user = userEvent.setup();
    stubClipboard("ok");
    const { rerender } = render(<ShoppingList {...props({ store: null, storeUnavailable: true })} />);
    await user.click(sendButton("Kopiera till varukorgen")!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    rerender(<ShoppingList {...props()} />);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    // The state was reset, not only hidden: the store missing again shows no old notice.
    rerender(<ShoppingList {...props({ store: null, storeUnavailable: true })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Inköpslistan, when the clipboard is refused", () => {
  const sheet = () => screen.getByRole("dialog", { name: "Inköpslistan" });
  const field = () => within(sheet()).getByRole("textbox", { name: "Exporttext" }) as HTMLTextAreaElement;

  function expectSelected(element: HTMLTextAreaElement) {
    expect(element).toHaveFocus();
    expect(element.selectionStart).toBe(0);
    expect(element.selectionEnd).toBe(element.value.length);
  }

  it("opens the sheet with the text read-only, all selected and focused, with Kopiera and Klar", async () => {
    const writeText = stubClipboard("refuse");
    render(<ShoppingList {...props()} />);
    fireEvent.click(sendButton()!);
    expect(writeText).toHaveBeenCalledTimes(1);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    expect(field()).toHaveAttribute("readonly");
    expect(field().value).toBe(writeText.mock.calls[0]![0]);
    await waitFor(() => expectSelected(field()));
    expect(within(sheet()).getByRole("button", { name: "Kopiera" })).toHaveClass("bg-accent");
    expect(within(sheet()).getByRole("button", { name: "Klar" })).toBeInTheDocument();
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
    expectNoServer();
  });

  it("opens the sheet at once when the browser has no clipboard", async () => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    render(<ShoppingList {...props()} />);
    fireEvent.click(sendButton()!);
    expect(await screen.findByRole("dialog", { name: "Inköpslistan" })).toBeInTheDocument();
    await waitFor(() => expectSelected(field()));
    expect(field().value.startsWith(basketExportHeader)).toBe(true);
  });

  it("closes the sheet and confirms when Kopiera works the second time", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard("refuse", "ok");
    render(<ShoppingList {...props()} />);
    await user.click(sendButton()!);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    const text = field().value;
    fireEvent.click(within(sheet()).getByRole("button", { name: "Kopiera" }));
    // Again in the tap itself.
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[1]![0]).toBe(text);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Inköpslistan" })).not.toBeInTheDocument());
    expect(await screen.findByTestId("toast")).toHaveTextContent(copied);
    expectNoServer();
  });

  it("selects the text again and says to copy it by hand when Kopiera is refused again", async () => {
    const user = userEvent.setup();
    stubClipboard("refuse");
    render(<ShoppingList {...props()} />);
    await user.click(sendButton()!);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    // Pontus moves the selection; a refused Kopiera selects all of it again.
    act(() => field().setSelectionRange(2, 4));
    await user.click(within(sheet()).getByRole("button", { name: "Kopiera" }));
    const failed = await within(sheet()).findByRole("alert");
    expect(failed).toHaveTextContent("Det gick inte att kopiera. Markera texten och kopiera den själv.");
    expect(field()).toHaveAttribute("aria-describedby", failed.id);
    await waitFor(() => expectSelected(field()));
    expect(screen.getByRole("dialog", { name: "Inköpslistan" })).toBeInTheDocument();
  });

  it("shows no confirmation for a Kopiera that settles after the sheet was closed", async () => {
    const user = userEvent.setup();
    let answer: () => void = () => {};
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(() => Promise.reject(new DOMException("Denied", "NotAllowedError")))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShoppingList {...props()} />);
    await user.click(sendButton()!);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Kopiera" }));
    await user.click(within(sheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Inköpslistan" })).not.toBeInTheDocument());
    await act(async () => answer());
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("selects all of the text again when the field is tapped (iOS may ignore select() from code)", async () => {
    const user = userEvent.setup();
    stubClipboard("refuse");
    render(<ShoppingList {...props()} />);
    await user.click(sendButton()!);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    act(() => field().setSelectionRange(3, 3));
    fireEvent.click(field());
    expectSelected(field());
  });

  it("closes with Klar", async () => {
    const user = userEvent.setup();
    stubClipboard("refuse");
    render(<ShoppingList {...props()} />);
    await user.click(sendButton()!);
    await screen.findByRole("dialog", { name: "Inköpslistan" });
    await user.click(within(sheet()).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Inköpslistan" })).not.toBeInTheDocument());
  });
});
