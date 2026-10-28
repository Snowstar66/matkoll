import { render as renderBare, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Store } from "@/features/settings";
import { fail, ok, type Result } from "@/lib/errors";
import type { RemovedProductChoice } from "../actions/remove-product-choice";
import type { ProductChoice, ProductChoiceFormInput } from "../domain/product-choice";
import { ProductChoiceSheet } from "./product-choice-sheet";

// Arket Produktval (Story 7.2), opened as the list opens it, with the three
// Server Actions stubbed: "Spara" saves for the sheet's store and closes with
// a confirmation; "Ta bort produktval" closes with "Ångra"; failures keep the
// fields.

const saveProductChoice = vi.fn<(input: ProductChoiceFormInput) => Promise<Result<{ choice: ProductChoice | null }>>>();
const removeProductChoice = vi.fn<(input: { id: string }) => Promise<Result<RemovedProductChoice>>>();
const restoreProductChoice = vi.fn<(row: ProductChoice) => Promise<Result<{ choice: ProductChoice }>>>();
vi.mock("../actions/save-product-choice", () => ({
  saveProductChoice: (input: ProductChoiceFormInput) => saveProductChoice(input),
}));
vi.mock("../actions/remove-product-choice", () => ({
  removeProductChoice: (input: { id: string }) => removeProductChoice(input),
}));
vi.mock("../actions/restore-product-choice", () => ({
  restoreProductChoice: (row: ProductChoice) => restoreProductChoice(row),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const gradde = "11111111-1111-4111-8111-111111111111";
const maxi: Store = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: null,
  offersUrl: null,
  isSelected: true,
};
const choice: ProductChoice = {
  id: "33333333-3333-4333-8333-333333333333",
  ingredientId: gradde,
  storeId: maxi.id,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: null,
  updatedAt: "2026-10-26T11:23:47.123456+00:00",
};

function Harness({ initialChoice }: { initialChoice: ProductChoice | null }) {
  // The choice as the list has it now; the sheet starts from it on opening.
  const [state, setState] = useState({ open: false, session: 0 });
  return (
    <>
      <button type="button" onClick={() => setState((current) => ({ open: true, session: current.session + 1 }))}>
        Ange produktval
      </button>
      <ProductChoiceSheet
        open={state.open}
        session={state.session}
        label="Grädde"
        ingredientId={gradde}
        store={maxi}
        choice={initialChoice}
        onClose={() => setState((current) => ({ ...current, open: false }))}
      />
    </>
  );
}

async function open(initialChoice: ProductChoice | null = null) {
  const user = userEvent.setup();
  const view = renderBare(<Harness initialChoice={initialChoice} />, { wrapper: ToastProvider });
  await user.click(screen.getByRole("button", { name: "Ange produktval" }));
  return Object.assign(user, { rerender: (next: ProductChoice | null) => view.rerender(<Harness initialChoice={next} />) });
}

const sheet = () => screen.getByRole("dialog", { name: "Produktval för grädde" });
const field = (name: "Produkt" | "Förpackning" | "Länk") => within(sheet()).getByLabelText(name);

beforeEach(() => {
  saveProductChoice.mockReset().mockImplementation(async (input) =>
    ok({
      choice: {
        id: choice.id,
        ingredientId: input.ingredientId,
        storeId: input.storeId,
        productName: input.productName.trim(),
        packageSize: input.packageSize.trim() || null,
        url: input.url.trim() || null,
        updatedAt: choice.updatedAt,
      },
    }),
  );
  removeProductChoice.mockReset().mockResolvedValue(ok({ status: "removed", row: choice }));
  restoreProductChoice.mockReset().mockImplementation(async (row) => ok({ choice: row }));
  refresh.mockReset();
});

describe("ProductChoiceSheet", () => {
  it("is titled after the line with the store under it, with Produkt, Förpackning and Länk", async () => {
    await open();
    expect(sheet()).toHaveAccessibleDescription("Maxi ICA Stormarknad Östersund");
    expect(field("Produkt")).toHaveValue("");
    expect(field("Förpackning")).toHaveAttribute("placeholder", "t.ex. 5 dl");
    expect(field("Länk")).toHaveAttribute("type", "url");
    expect(field("Länk")).toHaveAttribute("inputmode", "url");
    expect(within(sheet()).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("button", { name: "Ta bort produktval" })).not.toBeInTheDocument();
  });

  it("saves the choice for the sheet's store, closes and confirms", async () => {
    const user = await open();
    await user.type(field("Produkt"), "Arla Matlagningsgrädde 15 %");
    await user.type(field("Förpackning"), "5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenCalledWith({
      ingredientId: gradde,
      storeId: maxi.id,
      productName: "Arla Matlagningsgrädde 15 %",
      packageSize: "5 dl",
      url: "",
      expected: null,
    });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Produktvalet är sparat.");
  });

  it("shows why at the field, and saves nothing, for an empty product or a link without https://", async () => {
    const user = await open();
    await user.type(field("Produkt"), "   ");
    await user.type(field("Länk"), "arla.se/produkter");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByText("Ange produktens namn.")).toBeInTheDocument();
    expect(within(sheet()).getByText("Ange en adress som börjar med https://.")).toBeInTheDocument();
    expect(field("Produkt")).toHaveAttribute("aria-invalid", "true");
    expect(field("Produkt")).toHaveFocus();
    expect(saveProductChoice).not.toHaveBeenCalled();
  });

  it("shows a too long package size at its field", async () => {
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.type(field("Förpackning"), "a".repeat(41));
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByText("Texten får vara högst 40 tecken.")).toBeInTheDocument();
    expect(saveProductChoice).not.toHaveBeenCalled();
  });

  it("keeps the fields with an alert when saving fails, and saves again with the same values", async () => {
    saveProductChoice.mockResolvedValueOnce(fail("shopping_product_choice_save_failed"));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara produktvalet. Försök igen.");
    expect(field("Produkt")).toHaveValue("Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenCalledTimes(2);
  });

  it("gives an alert when the action gives no answer", async () => {
    saveProductChoice.mockRejectedValueOnce(new Error("offline"));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara produktvalet. Försök igen.");
  });

  it("shows the server's message at its field", async () => {
    saveProductChoice.mockResolvedValueOnce(fail("validation", { url: "Ange en adress som börjar med https://." }));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByText("Ange en adress som börjar med https://.")).toBeInTheDocument();
    expect(field("Länk")).toHaveFocus();
  });

  it("closes, says so and reads the list again when the store or the ingredient is not there any more", async () => {
    saveProductChoice.mockResolvedValueOnce(fail("shopping_product_choice_target_gone"));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent("Butiken eller varan finns inte längre.");
    expect(refresh).toHaveBeenCalled();
  });

  it("sends the choice it started from, and closes when the saved row cannot be read back", async () => {
    saveProductChoice.mockResolvedValueOnce(ok({ choice: null }));
    const user = await open(choice);
    await user.clear(field("Förpackning"));
    await user.type(field("Förpackning"), "2,5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenCalledWith(
      expect.objectContaining({ packageSize: "2,5 dl", expected: { id: choice.id, updatedAt: choice.updatedAt } }),
    );
    expect(await screen.findByTestId("toast")).toHaveTextContent("Produktvalet är sparat.");
  });

  it("takes up the stored choice, with a note, when a save finds it changed elsewhere", async () => {
    saveProductChoice.mockResolvedValueOnce(fail("shopping_product_choice_changed"));
    const user = await open(choice);
    await user.clear(field("Förpackning"));
    await user.type(field("Förpackning"), "2,5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(
      "Produktvalet har ändrats på annat håll. Uppgifterna är uppdaterade.",
    );
    expect(refresh).toHaveBeenCalled();
    // The list is read again: the sheet starts from the choice as it is now, and expects it.
    const now = { ...choice, productName: "Garant Matlagningsgrädde", packageSize: "2 dl", updatedAt: "2026-10-26T12:00:00+00:00" };
    user.rerender(now);
    await waitFor(() => expect(field("Produkt")).toHaveValue("Garant Matlagningsgrädde"));
    expect(field("Förpackning")).toHaveValue("2 dl");
    expect(within(sheet()).getByRole("alert")).toBeInTheDocument();
    await user.clear(field("Förpackning"));
    await user.type(field("Förpackning"), "5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenLastCalledWith(
      expect.objectContaining({ productName: "Garant Matlagningsgrädde", expected: { id: choice.id, updatedAt: now.updatedAt } }),
    );
  });

  it("reads the page again without a session", async () => {
    saveProductChoice.mockResolvedValueOnce(fail("unauthorized"));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("saves once on a double tap", async () => {
    let answer: (result: Result<{ choice: ProductChoice }>) => void = () => {};
    saveProductChoice.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const user = await open();
    await user.type(field("Produkt"), "Arla");
    const save = within(sheet()).getByRole("button", { name: "Spara" });
    await user.click(save);
    expect(await within(sheet()).findByRole("button", { name: "Sparar …" })).toBeDisabled();
    await user.click(within(sheet()).getByRole("button", { name: "Sparar …" }));
    answer(ok({ choice }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).toHaveBeenCalledTimes(1);
  });

  it("starts from the saved choice, and only closes when nothing changed", async () => {
    const user = await open(choice);
    expect(field("Produkt")).toHaveValue("Arla Matlagningsgrädde 15 %");
    expect(field("Förpackning")).toHaveValue("5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).not.toHaveBeenCalled();
  });

  it("asks Släng ändringarna? before closing with changed fields", async () => {
    const user = await open(choice);
    await user.clear(field("Förpackning"));
    await user.type(field("Förpackning"), "2,5 dl");
    await user.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(await within(sheet()).findByText("Släng ändringarna?")).toBeInTheDocument();
    await user.click(within(sheet()).getByRole("button", { name: "Släng ändringarna" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProductChoice).not.toHaveBeenCalled();
  });

  it("removes the choice, closes and offers Ångra, which puts the same row back", async () => {
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removeProductChoice).toHaveBeenCalledWith({ id: choice.id });
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Produktvalet är borttaget.");
    await user.click(within(toast).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreProductChoice).toHaveBeenCalledWith(choice));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says Det gick inte att ångra. when a new choice was saved meanwhile, and reads the list again", async () => {
    restoreProductChoice.mockResolvedValue(fail("shopping_restore_failed"));
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    const toast = await screen.findByTestId("toast");
    await user.click(within(toast).getByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ångra.");
    expect(refresh).toHaveBeenCalled();
  });

  it("confirms without Ångra when the removed choice cannot be put back", async () => {
    removeProductChoice.mockResolvedValue(ok({ status: "removed", row: null }));
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Produktvalet är borttaget.");
    expect(within(toast).queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
  });

  it("says neutrally that the choice was gone already, and reads the list again", async () => {
    removeProductChoice.mockResolvedValue(ok({ status: "gone" }));
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Produktvalet fanns inte längre.");
    expect(toast).not.toHaveTextContent("borttaget");
    expect(within(toast).queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("reads the page again without a session when Ångra answers unauthorized, without an error", async () => {
    restoreProductChoice.mockResolvedValue(fail("unauthorized"));
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    const toast = await screen.findByTestId("toast");
    await user.click(within(toast).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Du behöver logga in.")).not.toBeInTheDocument();
  });

  it("keeps the sheet with an alert when removing fails", async () => {
    removeProductChoice.mockResolvedValue(fail("shopping_product_choice_remove_failed"));
    const user = await open(choice);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort produktval" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att ta bort produktvalet. Försök igen.");
    expect(field("Produkt")).toHaveValue("Arla Matlagningsgrädde 15 %");
  });
});
