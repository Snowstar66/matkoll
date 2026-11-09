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
// Story 18.23: the count card in the sheet reads the count; here the föremål are not counted.
vi.mock("../actions/thing-count", () => ({
  loadThingCount: async (itemId: string) => ({ ok: true, data: { itemId, quantity: null, changes: [] } }),
}));
// The photo and place of the föremål in its sheet are read when it opens; here the read fails, which must never block the rest.
const loadThingDetail = vi.fn();
vi.mock("../actions/thing-detail", () => ({ loadThingDetail: (id: string) => loadThingDetail(id) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const hammer: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Hammare", category: "Verktyg", whereHint: "på väggen", confidence: "high", seenOn: 1 };
const spade: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", name: "Spade", category: "Trädgård", whereHint: null, confidence: "low", seenOn: 1 };
const snapshot: ThingSnapshot = {
  quantity: null,
  changes: [],
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
  box: null,
  boxMissed: false,
};

beforeEach(() => {
  for (const mock of [loadThingDetail, updateThing, removeThing, restoreThing, refresh]) mock.mockReset();
});

async function openHammer() {
  render(
    <ToastProvider>
      <CardThings things={[hammer, spade]} />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Hammare/ }));
  return screen.getByRole("dialog", { name: "Hammare" });
}

const photoId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";
const detail = {
  photoId,
  source: "photo",
  box: { left: 0.2, top: 0.1, width: 0.3, height: 0.4 },
  place: { id: placeId, siteId, room: "Garaget", roomKey: "garaget", part: "Hylla 2", kind: "part" },
};

describe("the things of a card", () => {
  it("opens a sheet with the first view's rows, and Ta bort föremålet last in the muted red", async () => {
    const dialog = await openHammer();
    // No form and no Spara on the first view: each row opens a step of its own.
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Spara" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Byt namn" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kategori, Verktyg" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^Var på bilden/ })).toHaveTextContent("på väggen");
    const remove = within(dialog).getByRole("button", { name: "Ta bort föremålet" });
    expect(remove.querySelector(".text-danger")).not.toBeNull();
    expect(remove.className).not.toMatch(/bg-danger/);
    // Without a photo read, the mint tile with the category's emoji stands in.
    expect(within(dialog).getByTestId("thing-tile")).toHaveTextContent("\u{1F528}");
    // In the room there is no "Visa på kortet": the room is where it was opened.
    expect(within(dialog).queryByTestId("thing-sheet-link")).not.toBeInTheDocument();
  });

  it("shows the card's photo with the box framed and links the whole card, and the place as crumbs", async () => {
    loadThingDetail.mockResolvedValue(ok(detail));
    const dialog = await openHammer();
    const photo = await within(dialog).findByTestId("thing-photo");
    expect(photo).toHaveAttribute("href", `/prylar/kort/${photoId}?foremal=${hammer.id}`);
    expect(photo.querySelector("img")).toHaveAttribute("src", `/api/things/photo/${photoId}`);
    expect(within(dialog).getByTestId("thing-photo-box")).toHaveStyle({ left: "20%", top: "10%", width: "30%", height: "40%" });
    expect(within(dialog).queryByTestId("thing-tile")).not.toBeInTheDocument();
    const crumbs = within(dialog).getByTestId("thing-crumbs");
    expect(within(crumbs).getByRole("link", { name: "Garaget" })).toHaveAttribute("href", `/prylar/rum/${siteId}/garaget`);
    expect(crumbs).toHaveTextContent("Garaget›Hylla 2");
    expect(within(crumbs).queryByRole("link", { name: "Hylla 2" })).not.toBeInTheDocument();
  });

  it("links a box in the crumbs, and shows the photo without a frame when it has no box", async () => {
    loadThingDetail.mockResolvedValue(ok({ ...detail, box: null, place: { ...detail.place, kind: "box", part: "Jul" } }));
    const dialog = await openHammer();
    await within(dialog).findByTestId("thing-photo");
    expect(within(dialog).queryByTestId("thing-photo-box")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Låda Jul" })).toHaveAttribute("href", `/prylar/lada/${placeId}`);
  });

  it("hides Var på bilden for a thing without a photo, and ignores a read that fails", async () => {
    loadThingDetail.mockResolvedValue(ok({ ...detail, photoId: null, source: "added", box: null }));
    const dialog = await openHammer();
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /^Var på bilden/ })).not.toBeInTheDocument());
    expect(within(dialog).getByTestId("thing-tile")).toBeInTheDocument();
  });

  it("renames just that thing in its own step and reads the page again", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Byt namn" }));
    expect(screen.getByRole("dialog", { name: "Byt namn" })).toBe(dialog);
    const field = within(dialog).getByLabelText("Namn");
    expect(field).toHaveValue("Hammare");
    await userEvent.clear(field);
    await userEvent.type(field, "Klohammare");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Klohammare", category: "Verktyg", whereHint: "på väggen" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Back on the first view, which now has the new name and the row focused.
    expect(await screen.findByRole("dialog", { name: "Klohammare" })).toBe(dialog);
    expect(within(dialog).getByRole("button", { name: "Byt namn" })).toHaveFocus();
  });

  it("saves the category as soon as it is picked one level deeper", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    // Pontus 2 Nov: one compact row, not nine chips.
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kategori, Verktyg" }));
    expect(screen.getByRole("dialog", { name: "Kategori" })).toBe(dialog);
    expect(within(dialog).getByRole("button", { name: "Tillbaka" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(9);
    expect(within(dialog).getByRole("radio", { name: /Verktyg/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Verktyg/ })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("radio", { name: /Trädgård/ }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Hammare", category: "Trädgård", whereHint: "på väggen" }));
    // The föremål moves to another group of its list, so the sheet closes.
    await waitFor(() => expect(dialog).not.toBeVisible());
  });

  it("changes where on the picture in its own step, and an empty field clears it", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: /^Var på bilden/ }));
    const where = within(dialog).getByLabelText("Var på bilden");
    expect(where).toHaveValue("på väggen");
    await userEvent.clear(where);
    await userEvent.type(where, "översta hyllan");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Hammare", category: "Verktyg", whereHint: "översta hyllan" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: /^Var på bilden/ }));
    await userEvent.clear(within(dialog).getByLabelText("Var på bilden"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(updateThing).toHaveBeenLastCalledWith({ id: hammer.id, name: "Hammare", category: "Verktyg", whereHint: null }));
  });

  it("moves the check with the arrow keys, picks with Enter, and Tillbaka keeps the category", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kategori, Verktyg" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Tillbaka" }));
    expect(within(dialog).getByRole("button", { name: "Kategori, Verktyg" })).toHaveFocus();
    expect(updateThing).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}");
    // The arrow moves the check and stays in the list; Enter picks it.
    expect(within(dialog).getByRole("radio", { name: /Sport/ })).toBeChecked();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: hammer.id, name: "Hammare", category: "Sport & fritid", whereHint: "på väggen" }));
  });

  it("sends nothing when the name is unchanged, and asks for a name when it is emptied", async () => {
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Byt namn" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(updateThing).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Byt namn" }));
    await userEvent.clear(within(dialog).getByLabelText("Namn"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(screen.getByText("Ange ett namn.")).toBeInTheDocument();
    expect(updateThing).not.toHaveBeenCalled();
  });

  it("shows the server's text under the field when the name is refused", async () => {
    updateThing.mockResolvedValue(fail("validation", { name: "Namnet får vara högst 80 tecken." }));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Byt namn" }));
    await userEvent.type(within(dialog).getByLabelText("Namn"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara" }));
    expect(await screen.findByText("Namnet får vara högst 80 tecken.")).toBeInTheDocument();
  });

  it("removes just the thing with Ångra, which puts it back", async () => {
    removeThing.mockResolvedValue(ok(snapshot));
    restoreThing.mockResolvedValue(ok(null));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort föremålet" }));
    expect((await screen.findAllByText("Tog bort Hammare.")).length).toBeGreaterThan(0);
    expect(removeThing).toHaveBeenCalledWith(hammer.id);
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThing).toHaveBeenCalledWith(snapshot));
  });

  it("says so and keeps the thing when it cannot be removed", async () => {
    removeThing.mockResolvedValue(fail("things_item_failed"));
    const dialog = await openHammer();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort föremålet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara föremålet.");
  });
});

describe("a thing written in with where it is (Story 18.19)", () => {
  const pass: Thing = {
    id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a31",
    name: "Pass",
    category: "Övrigt",
    whereHint: "Översta byrålådan · skrivet 31 okt",
    confidence: "high",
    seenOn: 1,
    noted: { at: "2026-10-31T21:00:00.000Z", part: "Översta byrålådan" },
  };

  async function openPass() {
    render(
      <ToastProvider>
        <CardThings things={[pass]} headings={false} aside />
      </ToastProvider>,
    );
    expect(screen.getByTestId("thing")).toHaveTextContent("Översta byrålådan · skrivet 31 okt");
    await userEvent.click(screen.getByRole("button", { name: /Pass/ }));
    return screen.getByRole("dialog", { name: "Pass" });
  }

  it("says when it was written in and where, and has no 'Var på bilden'", async () => {
    const dialog = await openPass();
    expect(dialog).toHaveTextContent("Du skrev in det 31 okt · Översta byrålådan");
    expect(within(dialog).queryByRole("button", { name: /^Var på bilden/ })).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("thing-tile")).toBeInTheDocument();
  });

  it("changes the name and category without writing its hint as a 'where'", async () => {
    updateThing.mockResolvedValue(ok(null));
    const dialog = await openPass();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kategori, Övrigt" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: /Kläder/ }));
    await waitFor(() => expect(updateThing).toHaveBeenCalledWith({ id: pass.id, name: "Pass", category: "Kläder & textil", whereHint: null }));
  });

  it("is removed with Ta bort föremålet, and Ångra puts it back", async () => {
    const noted: ThingSnapshot = { ...snapshot, id: pass.id, photoId: null, name: "Pass", category: "Övrigt", whereHint: null, source: "noted" };
    removeThing.mockResolvedValue(ok(noted));
    restoreThing.mockResolvedValue(ok(null));
    const dialog = await openPass();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort föremålet" }));
    expect(removeThing).toHaveBeenCalledWith(pass.id);
    expect((await screen.findAllByText("Tog bort Pass.")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThing).toHaveBeenCalledWith(noted));
  });
});

