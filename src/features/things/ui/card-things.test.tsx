import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { Thing } from "../domain/thing";
import type { ThingSnapshot } from "../domain/thing-edit";
import { CardThings } from "./card-things";

const updateThing = vi.fn();
const removeThing = vi.fn();
const restoreThing = vi.fn();
vi.mock("../actions/thing-item", () => ({
  updateThing: (input: unknown) => updateThing(input),
  removeThing: (id: string) => removeThing(id),
  restoreThing: (snapshot: ThingSnapshot) => restoreThing(snapshot),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const hammer: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Hammare", category: "Verktyg", whereHint: "på väggen", confidence: "high", seenOn: 1 };
const spade: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Spade", category: "Trädgård", whereHint: null, confidence: "low", seenOn: 1 };
const snapshot: ThingSnapshot = {
  id: hammer.id,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
  name: "Hammare",
  category: "Verktyg",
  whereHint: "på väggen",
  confidence: "high",
  position: 0,
  createdAt: "2026-10-31T10:00:00.000Z",
  sameAs: null,
  source: "photo",
  pointedBy: [],
};

beforeEach(() => {
  for (const mock of [updateThing, removeThing, restoreThing, refresh]) mock.mockReset();
});

async function openHammer() {
  render(
    <ToastProvider>
      <CardThings things={[hammer, spade]} />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Hammare/ }));
  return screen.getByRole("dialog", { name: "Föremål" });
}

describe("the things of a card", () => {
  it("opens a sheet with the thing's name to change, or to remove, when a thing is tapped", async () => {
    const dialog = await openHammer();
    expect(within(dialog).getByLabelText("Byt namn")).toHaveValue("Hammare");
    expect(within(dialog).getByRole("button", { name: "Spara" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Ta bort föremål" })).toBeInTheDocument();
  });

  it("renames just that thing and reads the page again", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    const field = within(dialog).getByLabelText("Byt namn");
    await userEvent.clear(field);
    await userEvent.type(field, "Klohammare");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Klohammare", category: "Verktyg", whereHint: "på väggen" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("changes the category with the chips and where on the picture, and keeps the thing on its card", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    expect(within(dialog).getByRole("radio", { name: /Verktyg/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("radio", { name: /Trädgård/ }));
    const where = within(dialog).getByLabelText("Var på bilden");
    expect(where).toHaveValue("på väggen");
    await userEvent.clear(where);
    await userEvent.type(where, "översta hyllan");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Hammare", category: "Trädgård", whereHint: "översta hyllan" }));
  });

  it("clears the where with an empty field and saves a changed category alone", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.clear(within(dialog).getByLabelText("Var på bilden"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Hammare", category: "Verktyg", whereHint: "" }));
  });

  it("asks for a name when it is emptied, and sends nothing when it is unchanged", async () => {
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(updateThing).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Hammare/ }));
    await userEvent.clear(within(dialog).getByLabelText("Byt namn"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(screen.getByText("Ange ett namn.")).toBeInTheDocument();
    expect(updateThing).not.toHaveBeenCalled();
  });

  it("shows the server's text under the field when the name is refused", async () => {
    updateThing.mockResolvedValue(fail("validation", { name: "Namnet får vara högst 80 tecken." }));
    const dialog = await openHammer();
    await userEvent.type(within(dialog).getByLabelText("Byt namn"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(await screen.findByText("Namnet får vara högst 80 tecken.")).toBeInTheDocument();
  });

  it("removes just the thing with Ångra, which puts it back", async () => {
    removeThing.mockResolvedValue(ok(snapshot));
    restoreThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort föremål" }));
    expect((await screen.findAllByText("Tog bort Hammare.")).length).toBeGreaterThan(0);
    expect(removeThing).toHaveBeenCalledWith(hammer.id);
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThing).toHaveBeenCalledWith(snapshot));
  });

  it("says so and keeps the thing when it cannot be removed", async () => {
    removeThing.mockResolvedValue(fail("things_item_failed"));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort föremål" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara föremålet.");
  });
});
