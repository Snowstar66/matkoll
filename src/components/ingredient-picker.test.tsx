import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { errorMessages, ok, type Result } from "@/lib/errors";
import { IngredientPicker, type IngredientHit, type SearchIngredients } from "./ingredient-picker";

type Pending = { query: string; resolve: (result: Result<IngredientHit[]>) => void; reject: (error: unknown) => void };

/** A searchIngredients whose answers the test hands out, in any order. */
function controlledSearch() {
  const calls: Pending[] = [];
  const search: SearchIngredients = (query) =>
    new Promise((resolve, reject) => {
      calls.push({ query, resolve, reject });
    });
  return { search, calls };
}

/** Keys that reached the element around the picker (in the app, the sheet). */
const outerKeys: string[] = [];

/** Offers the typed text, trimmed, unless a hit has it (in the app, catalog.newIngredientName). */
const newName = (query: string, hits: readonly IngredientHit[]) => {
  const name = query.trim();
  return name && !hits.some((hit) => hit.name.toLowerCase() === name.toLowerCase()) ? name : null;
};

function setup(search: SearchIngredients, { withCancel = true } = {}) {
  const props = { onChoose: vi.fn(), onNew: vi.fn(), onCancel: vi.fn() };
  render(
    <div onKeyDown={(event) => outerKeys.push(event.key)}>
      <IngredientPicker
        searchIngredients={search}
        newName={newName}
        onChoose={props.onChoose}
        onNew={props.onNew}
        onCancel={withCancel ? props.onCancel : undefined}
        header={<h3>Byt ingrediens</h3>}
      />
    </div>,
  );
  return props;
}
/** Types `text` and searches at once (Enter skips the 200 ms wait). */
function type(text: string) {
  const field = screen.getByRole("searchbox", { name: "Sök ingrediens" });
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const gulLok = { id: "1", name: "Gul lök" };
const rodlok = { id: "2", name: "Rödlök" };

describe("IngredientPicker", () => {
  it("focuses the search field and shows the header", async () => {
    await act(async () => {
      setup(controlledSearch().search);
    });
    expect(screen.getByRole("searchbox", { name: "Sök ingrediens" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Byt ingrediens" })).toBeInTheDocument();
  });

  it("shows hits and chooses one", async () => {
    const { search, calls } = controlledSearch();
    const props = setup(search);
    type("lök");
    await act(async () => calls[0].resolve(ok([gulLok, rodlok])));
    fireEvent.click(screen.getByRole("button", { name: "Rödlök" }));
    expect(props.onChoose).toHaveBeenCalledWith(rodlok);
  });

  it("ignores an answer to an older query that arrives last", async () => {
    const { search, calls } = controlledSearch();
    setup(search);
    type("lö");
    type("rödlök");
    await act(async () => calls[1].resolve(ok([rodlok])));
    await act(async () => calls[0].resolve(ok([gulLok])));
    expect(screen.getByRole("button", { name: "Rödlök" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gul lök" })).not.toBeInTheDocument();
  });

  it("shows nothing for a query before its answer arrives", async () => {
    const { search, calls } = controlledSearch();
    setup(search);
    type("palsternacka");
    await act(async () => calls[0].resolve(ok([])));
    expect(screen.getByText("Ingen ingrediens hittades.")).toBeInTheDocument();
    type("palsternackor");
    expect(screen.queryByText("Ingen ingrediens hittades.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /som ny$/ })).not.toBeInTheDocument();
  });

  it("offers the name newName gives as a new ingredient", async () => {
    const { search, calls } = controlledSearch();
    const props = setup(search);
    type(" Schalottenlök ");
    await act(async () => calls[0].resolve(ok([rodlok])));
    expect(screen.queryByText("Ingen ingrediens hittades.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till Schalottenlök som ny" }));
    expect(props.onNew).toHaveBeenCalledWith("Schalottenlök");
  });

  it("does not offer a new ingredient when a hit has the name", async () => {
    const { search, calls } = controlledSearch();
    setup(search);
    type("gul LÖK");
    await act(async () => calls[0].resolve(ok([gulLok])));
    expect(screen.queryByRole("button", { name: /som ny$/ })).not.toBeInTheDocument();
  });

  it("shows the catalog error when the search fails or is rejected", async () => {
    const { search, calls } = controlledSearch();
    setup(search);
    type("lök");
    await act(async () => calls[0].reject(new Error("network")));
    expect(screen.getByRole("alert")).toHaveTextContent(errorMessages.catalog_unavailable);
    expect(screen.queryByRole("button", { name: /som ny$/ })).not.toBeInTheDocument();
  });

  it("goes back on Esc without letting the key reach the sheet", () => {
    const props = setup(controlledSearch().search);
    outerKeys.length = 0;
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(outerKeys).toEqual([]);
  });

  it("leaves Esc to the sheet without onCancel", () => {
    setup(controlledSearch().search, { withCancel: false });
    outerKeys.length = 0;
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(outerKeys).toEqual(["Escape"]);
  });
});
