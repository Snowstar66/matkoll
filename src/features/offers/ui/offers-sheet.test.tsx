import { render as renderBare, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type ErrorCode } from "@/lib/errors";
import type { FetchStoreOffersResult } from "../actions/fetch-store-offers";
import type { StoreOffer } from "../domain/offer";
import { OffersSheetButton, type OffersSheetProps } from "./offers-sheet";

// The sheet Veckans erbjudanden (Story 9.1), opened from "Erbjudanden" as
// Pontus opens it, with the Server Action stubbed.

const fetchStoreOffers = vi.fn<(input: { storeId: string }) => Promise<FetchStoreOffersResult>>();
vi.mock("../actions/fetch-store-offers", () => ({
  fetchStoreOffers: (input: { storeId: string }) => fetchStoreOffers(input),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const link = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/";
const store = { id: "11111111-1111-4111-8111-111111111111", name: "Maxi ICA Stormarknad Östersund", offersUrl: link, siteName: "ica.se" };

function offer(changes: Partial<StoreOffer>): StoreOffer {
  return {
    id: crypto.randomUUID(),
    storeId: store.id,
    weekStart: "2026-10-26",
    label: "Havets Laxfilé",
    name: "laxfilé",
    ingredientId: null,
    section: "Kött och fisk",
    price: "129 kr/kg",
    note: null,
    memberOnly: false,
    validTo: "2026-11-01",
    source: "link",
    createdAt: "2026-10-28T06:12:00Z",
    ...changes,
  };
}

const offers = [
  offer({ label: "Gårdens Herrgård, Präst", name: "herrgård", price: "89 kr/kg", memberOnly: true, note: "Max 1 köp/hushåll", validTo: "2026-11-22" }),
  offer({}),
  offer({ label: "Odlarna Gul lök", name: "gul lök", section: "Frukt och grönt", price: "10 kr/kg" }),
];

const base: OffersSheetProps = {
  store,
  offers: [],
  weekStart: "2026-10-26",
  fetchedAt: null,
  now: "2026-10-28T11:00:00Z",
  unavailable: false,
};

function render(props: Partial<OffersSheetProps> = {}) {
  return renderBare(<OffersSheetButton {...base} {...props} />, { wrapper: ToastProvider });
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Veckans erbjudanden" }) };
}

beforeEach(() => {
  fetchStoreOffers.mockReset().mockResolvedValue(ok({ saved: 7, skipped: 2, matched: 1, weekStart: "2026-10-26" }));
  refresh.mockReset();
});

describe("OffersSheet", () => {
  it("opens from Erbjudanden with the store and the week, and offers to fetch", async () => {
    render();
    expect(screen.getByRole("button", { name: "Erbjudanden" })).toHaveAttribute("aria-haspopup", "dialog");
    const { dialog } = await open();
    expect(dialog).toHaveAccessibleDescription("Maxi ICA Stormarknad Östersund · vecka 44, 26 okt–1 nov");
    expect(within(dialog).getByText("Inga erbjudanden hämtade för vecka 44.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" })).toBeEnabled();
    // Nothing is fetched by opening the sheet.
    expect(fetchStoreOffers).not.toHaveBeenCalled();
  });

  it("fetches once on a tap with only the store's id, shows the progress, then confirms and says what was not food", async () => {
    let finish: (result: FetchStoreOffersResult) => void = () => {};
    fetchStoreOffers.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await within(dialog).findByText("Hämtar erbjudandena från ica.se …")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" })).toBeDisabled();
    expect(fetchStoreOffers).toHaveBeenCalledTimes(1);
    expect(fetchStoreOffers).toHaveBeenCalledWith({ storeId: store.id });

    finish(ok({ saved: 7, skipped: 2, matched: 1, weekStart: "2026-10-26" }));
    expect(await screen.findAllByText("Hämtade 7 erbjudanden för vecka 44.")).not.toHaveLength(0);
    expect(await within(dialog).findByText("2 varor som inte är mat togs inte med.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hämtar erbjudandena från ica.se …")).not.toBeInTheDocument();
  });

  it("shows the offers under their categories, with the price and conditions, and the store's page last", async () => {
    render({ offers, fetchedAt: "2026-10-28T06:12:00Z" });
    const { dialog } = await open();
    expect(within(dialog).getByTestId("offers-summary")).toHaveTextContent("3 erbjudanden · hämtade idag 07:12");
    expect(within(dialog).getByRole("button", { name: "Hämta igen" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Frukt & grönt",
      "Kött, fisk & chark",
    ]);
    const meat = within(dialog).getByRole("list", { name: /Kött, fisk & chark/ });
    expect(within(meat).getByText("Gårdens Herrgård, Präst")).toBeInTheDocument();
    expect(within(meat).getByText("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov")).toBeInTheDocument();
    expect(within(meat).getByText("129 kr/kg")).toBeInTheDocument();
    const page = within(dialog).getByRole("link", { name: /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/ });
    expect(page).toHaveAttribute("href", link);
    expect(page).toHaveAttribute("target", "_blank");
    expect(page).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    ["offers_fetch_blocked", /^Öppna sidan ?\(öppnas i en ny flik\)$/],
    ["offers_page_changed", /^Öppna sidan ?\(öppnas i en ny flik\)$/],
    ["offers_fetch_failed", /^Öppna sidan ?\(öppnas i en ny flik\)$/],
    ["offers_link_unsupported", "Öppna inställningar"],
  ] as const)("shows %s in a notice with a way on, and does not try again", async (code: ErrorCode, action) => {
    fetchStoreOffers.mockResolvedValue(fail(code));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(/./);
    expect(within(dialog).getByRole("link", { name: action })).toBeInTheDocument();
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says when the offers were fetched just now", async () => {
    fetchStoreOffers.mockResolvedValue(fail("offers_fetched_recently"));
    render({ offers });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Erbjudandena hämtades nyss. Försök igen om en stund.");
  });

  it("says that a failed request saved nothing, when the action does not answer", async () => {
    fetchStoreOffers.mockRejectedValue(new Error("offline"));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att hämta erbjudandena. Försök igen senare.");
  });

  it("asks for the link without one, with Öppna inställningar, and offers no fetch", async () => {
    render({ store: { ...store, offersUrl: null, siteName: null } });
    const { dialog } = await open();
    expect(within(dialog).getByText("Lägg in länken till butikens erbjudanden under Butik i Inställningar.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Öppna inställningar" })).toHaveAttribute("href", "/installningar");
    expect(within(dialog).queryByRole("button", { name: /Hämta/ })).not.toBeInTheDocument();
  });

  it("asks for a store when none is selected", async () => {
    render({ store: null });
    const { dialog } = await open();
    expect(within(dialog).getByText("Välj en butik i inställningarna först.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Öppna inställningar" })).toBeInTheDocument();
  });

  it("says when the offers cannot be read", async () => {
    render({ unavailable: true });
    const { dialog } = await open();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Det gick inte att läsa erbjudandena.");
  });

  it("reads the page again after a session that ended", async () => {
    fetchStoreOffers.mockResolvedValue(fail("unauthorized"));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
