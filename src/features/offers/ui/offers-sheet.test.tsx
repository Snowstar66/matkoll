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
const clearOtherStoreOffers = vi.fn<(input: { keep: string[] }) => Promise<unknown>>();
vi.mock("../actions/clear-other-store-offers", () => ({
  clearOtherStoreOffers: (input: { keep: string[] }) => clearOtherStoreOffers(input),
}));
const startJob = vi.fn<(url: string, body: Record<string, unknown>, key: string) => Promise<unknown>>();
vi.mock("@/lib/ai-jobs-client", () => ({
  useAiJobs: () => ({ start: (url: string, body: Record<string, unknown>, key: string) => startJob(url, body, key) }),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const link = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/";
const store = { id: "11111111-1111-4111-8111-111111111111", name: "Maxi ICA Stormarknad Östersund", chain: "ICA", offersUrl: link, siteName: "ica.se", fetchedAt: null };

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
    regularPrice: null,
    savingPercent: null,
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
  stores: [store],
  offers: [],
  weekStart: "2026-10-26",
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

/** Story 14.1: the store panel sits behind "Hämta igen". */
async function openPanel(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string | RegExp) {
  await user.click(within(dialog).getByRole("button", { name }));
}

beforeEach(() => {
  fetchStoreOffers.mockReset().mockResolvedValue(ok({ saved: 7, skipped: 2, matched: 1, weekStart: "2026-10-26" }));
  refresh.mockReset();
  startJob.mockReset().mockResolvedValue(ok({ id: "job" }));
  clearOtherStoreOffers.mockReset().mockResolvedValue(ok({ removed: 0 }));
});

describe("OffersSheet", () => {
  it("opens from Erbjudanden with the store and the week, and offers to fetch", async () => {
    render();
    expect(screen.getByRole("button", { name: "Erbjudanden" })).toHaveAttribute("aria-haspopup", "dialog");
    const { dialog } = await open();
    expect(dialog).toHaveAccessibleDescription("Maxi ICA Stormarknad Östersund · vecka 44");
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

  it("calls onFetched once after a fetch that saved offers, without waiting for it, and never after a refusal", async () => {
    const onFetched = vi.fn(() => new Promise<unknown>(() => {}));
    render({ onFetched });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await screen.findAllByText("Hämtade 7 erbjudanden för vecka 44.")).not.toHaveLength(0);
    expect(onFetched).toHaveBeenCalledTimes(1);
  });

  it("does not call onFetched when the fetch failed or onFetched itself fails", async () => {
    const onFetched = vi.fn().mockRejectedValue(new Error("offline"));
    fetchStoreOffers.mockResolvedValue(fail("offers_fetch_failed"));
    const first = render({ onFetched });
    const opened = await open();
    await opened.user.click(within(opened.dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(1));
    expect(onFetched).not.toHaveBeenCalled();
    first.unmount();
    fetchStoreOffers.mockResolvedValue(ok({ saved: 7, skipped: 0, matched: 1, weekStart: "2026-10-26" }));
    render({ onFetched });
    const second = await open();
    await second.user.click(within(second.dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await screen.findAllByText("Hämtade 7 erbjudanden för vecka 44.")).not.toHaveLength(0);
    expect(onFetched).toHaveBeenCalledTimes(1);
  });

  it("shows the slot Rätter med erbjudanden at the top when there are offers, and not without", async () => {
    const dishes = <section data-testid="offer-dishes">Rätter med erbjudanden</section>;
    const first = render({ offers, dishes });
    const { dialog } = await open();
    expect(within(dialog).getByTestId("offer-dishes")).toBeInTheDocument();
    first.unmount();
    render({ offers: [], dishes });
    const second = await open();
    expect(within(second.dialog).queryByTestId("offer-dishes")).not.toBeInTheDocument();
  });

  it("shows the offers under their categories, with the price and conditions, and the store's page last", async () => {
    render({ offers, stores: [{ ...store, fetchedAt: "2026-10-28T06:12:00Z" }] });
    const { dialog } = await open();
    // UX-18: store and week under the title, then the count, when it was fetched and "Hämta igen".
    expect(dialog).toHaveAccessibleDescription("Maxi ICA Stormarknad Östersund · vecka 44");
    expect(within(dialog).getByTestId("offers-fetched")).toHaveTextContent("3 erbjudanden · Hämtade idag 07:12 · Hämta igen");
    expect(within(dialog).getByRole("button", { name: "Hämta igen" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Frukt & grönt",
      "Kött, fisk & chark",
    ]);
    const meat = within(dialog).getByRole("list", { name: /Kött, fisk & chark/ });
    expect(within(meat).getByText("Gårdens Herrgård, Präst")).toBeInTheDocument();
    expect(within(meat).getByText("Stammis · Max 1 köp/hushåll · t.o.m. 22 nov")).toBeInTheDocument();
    expect(within(meat).getByText("89 kr/kg")).toBeInTheDocument();
    expect(within(meat).getByText("129 kr/kg")).toBeInTheDocument();
    const page = within(dialog).getByRole("link", { name: /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/ });
    expect(page).toHaveAttribute("href", link);
    expect(page).toHaveAttribute("target", "_blank");
    expect(page).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    ["offers_fetch_blocked", /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/],
    ["offers_page_changed", /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/],
    ["offers_fetch_failed", /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/],
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

  it("says calmly that the offers come every morning when the cloud is refused (Story 17.11)", async () => {
    fetchStoreOffers.mockResolvedValue(fail("offers_fetch_scheduled"));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    const status = await within(dialog).findByText("Erbjudandena hämtas automatiskt varje morgon – nästa veckas kommer så fort butiken lagt ut dem (oftast söndag kväll eller måndag).");
    expect(status).toHaveAttribute("role", "status");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/släppte inte in/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /^Öppna sidan på ica\.se ?\(öppnas i en ny flik\)$/ })).toBeInTheDocument();
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(1));
  });

  it("UX-29: after a failed fetch shows one page link and no empty-week line", async () => {
    fetchStoreOffers.mockResolvedValue(fail("offers_fetch_failed"));
    render();
    const { user, dialog } = await open();
    expect(within(dialog).getByText(/^Inga erbjudanden hämtade/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att hämta erbjudandena. Försök igen om en stund, eller öppna sidan.");
    expect(within(dialog).getAllByRole("link", { name: /Öppna sidan/ })).toHaveLength(1);
    expect(within(dialog).queryByText(/^Inga erbjudanden hämtade/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" })).toBeInTheDocument();
  });

  it("says when a new try comes too soon", async () => {
    fetchStoreOffers.mockResolvedValue(fail("offers_fetched_recently"));
    render({ offers });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Du försökte nyss. Vänta en stund och försök igen.");
  });

  it("says that a failed request saved nothing, when the action does not answer", async () => {
    fetchStoreOffers.mockRejectedValue(new Error("offline"));
    render();
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta veckans erbjudanden" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att hämta erbjudandena. Försök igen om en stund, eller öppna sidan.");
  });

  it("asks for the link without one, with Öppna inställningar, and offers no fetch", async () => {
    render({ stores: [{ ...store, offersUrl: null, siteName: null }] });
    const { dialog } = await open();
    expect(within(dialog).getByText("Lägg in länken till butikens erbjudanden under Butik i Inställningar.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Öppna inställningar" })).toHaveAttribute("href", "/installningar/butiker");
    expect(within(dialog).queryByRole("button", { name: /Hämta/ })).not.toBeInTheDocument();
  });

  it("asks for a store when none is selected", async () => {
    render({ stores: [] });
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

describe("OffersSheet: picking offers for the shopping list (Story 9.12)", () => {
  const add = vi.fn();
  const remove = vi.fn();
  const planId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    add.mockReset().mockResolvedValue(ok({ count: 1 }));
    remove.mockReset().mockResolvedValue(ok({ removed: 1 }));
  });

  it("gives each row a round + named by the offer that adds it at once, with Ångra (UX-31)", async () => {
    const [herrgard] = offers;
    render({ offers, listing: { planId, onList: [], add, remove } });
    const { user, dialog } = await open();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Lägg \d i inköpslistan/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lägg Gårdens Herrgård, Präst på inköpslistan" }));
    expect(add).toHaveBeenCalledWith({
      planId,
      items: [{ key: herrgard.id, label: "Herrgård (Erbjudande Maxi: 89 kr/kg)", ingredientId: null }],
    });
    await waitFor(() => expect(within(dialog).getByTestId("offers-added-status")).toHaveTextContent("Lade gårdens Herrgård, Präst på inköpslistan."));
    // The sheet stays open; the row now says På listan and has no + any more.
    expect(within(dialog).getAllByText("På listan")).toHaveLength(1);
    expect(within(dialog).queryByRole("button", { name: "Lägg Gårdens Herrgård, Präst på inköpslistan" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Ångra, ta Gårdens Herrgård, Präst från inköpslistan" }));
    expect(remove).toHaveBeenCalledWith({ keys: [herrgard.id] });
    await waitFor(() => expect(within(dialog).queryByText("På listan")).not.toBeInTheDocument());
    expect(within(dialog).getByRole("button", { name: "Lägg Gårdens Herrgård, Präst på inköpslistan" })).toBeEnabled();
    expect(within(dialog).getByTestId("offers-added-status")).toHaveTextContent("Tog bort gårdens Herrgård, Präst från inköpslistan.");
  });

  it("shows På listan for offers already on the list, with no + to press and no Ångra", async () => {
    render({ offers, listing: { planId, onList: [offers[0].id], add, remove } });
    const { dialog } = await open();
    expect(within(dialog).queryByTestId("offer-undo")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Lägg Gårdens Herrgård, Präst på inköpslistan" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("På listan")).toHaveLength(1);
    expect(within(dialog).getAllByRole("button", { name: /^Lägg .* på inköpslistan$/ })).toHaveLength(2);
  });

  it("says so when adding fails and keeps the +", async () => {
    add.mockResolvedValue(fail("shopping_save_failed"));
    render({ offers, listing: { planId, onList: [], add, remove } });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Lägg Gul lök på inköpslistan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Det gick inte att spara varan. Försök igen.");
    expect(within(dialog).getByRole("button", { name: "Lägg Gul lök på inköpslistan" })).toBeEnabled();
  });

  it("marks a Toppklipp on its row with the flame and has no count line (UX-18)", async () => {
    render({ offers: [offer({ label: "Havets Laxfilé", savingPercent: 40 })] });
    const { dialog } = await open();
    expect(within(dialog).getByTestId("offer-top-tag")).toHaveTextContent("Toppklipp");
    expect(within(dialog).queryByTestId("offers-finds")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("offer-saving")).toHaveTextContent("\u221240 %");
  });

  it("puts the not-food line last, above the link to the store's page (UX-18)", async () => {
    render({ offers });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    const skipped = await within(dialog).findByTestId("offers-skipped");
    const page = within(dialog).getByRole("link", { name: /^Öppna sidan på ica\.se/ });
    expect(skipped.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getByTestId("offers-list").compareDocumentPosition(skipped) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no add buttons without a listing", async () => {
    render({ offers, listing: null });
    const { dialog } = await open();
    expect(within(dialog).queryByRole("button", { name: /på inköpslistan$/ })).not.toBeInTheDocument();
  });
});

describe("OffersSheet: several stores (Story 9.13)", () => {
  const krokom = { id: "22222222-2222-4222-8222-222222222222", name: "ICA Kvantum Krokom", chain: "ICA", offersUrl: "https://www.ica.se/erbjudanden/ica-kvantum-krokom-1000002/", siteName: "ica.se", fetchedAt: null };
  const noLink = { id: "44444444-4444-4444-8444-444444444444", name: "Willys Östersund", chain: "Willys", offersUrl: null, siteName: null, fetchedAt: null };
  const stores = [store, krokom, noLink];
  const both = [
    offer({ label: "Havets Laxfilé", savingPercent: 10 }),
    offer({ label: "Havets Laxfilé", storeId: krokom.id, price: "119 kr/kg", savingPercent: 25 }),
    offer({ label: "Odlarna Gul lök", name: "gul lök", storeId: krokom.id, section: "Frukt och grönt", savingPercent: null }),
  ];

  it("lists the stores with a link, all ticked, and fetches the ticked ones one after the other", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    fetchStoreOffers.mockImplementation(async ({ storeId }) => {
      order.push(`start ${storeId}`);
      await new Promise<void>((resolve) => (release = resolve));
      order.push(`end ${storeId}`);
      return ok({ saved: 4, skipped: 1, matched: 0, weekStart: "2026-10-26" });
    });
    render({ stores, offers: both });
    const { user, dialog } = await open();
    await openPanel(user, dialog, "Hämta igen");
    const rows = within(dialog).getAllByTestId("store-fetch-row");
    expect(rows).toHaveLength(2);
    expect(within(dialog).getByRole("checkbox", { name: "ICA Kvantum Krokom" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("button", { name: "Hämta alla" }));
    expect(await within(dialog).findByText("Hämtar Maxi från ica.se (1 av 2) …")).toBeInTheDocument();
    expect(fetchStoreOffers).toHaveBeenCalledTimes(1);
    release();
    expect(await within(dialog).findByText("Hämtar Krokom från ica.se (2 av 2) …")).toBeInTheDocument();
    release();
    expect(await screen.findAllByText("Hämtade 8 erbjudanden från 2 butiker för vecka 44.")).not.toHaveLength(0);
    expect(order).toEqual([`start ${store.id}`, `end ${store.id}`, `start ${krokom.id}`, `end ${krokom.id}`]);
    expect(within(dialog).getAllByTestId("offers-store-result").map((line) => line.textContent)).toEqual([
      "Maxi: Hämtade 4 erbjudanden.",
      "Krokom: Hämtade 4 erbjudanden.",
    ]);
  });

  it("fetches only the ticked stores with Hämta valda", async () => {
    render({ stores });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("checkbox", { name: "Maxi ICA Stormarknad Östersund" }));
    await user.click(within(dialog).getByRole("button", { name: "Hämta valda (1)" }));
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(1));
    expect(fetchStoreOffers).toHaveBeenCalledWith({ storeId: krokom.id });
  });

  it("skips a store that is throttled or blocked with its own message, and still fetches the others", async () => {
    fetchStoreOffers.mockImplementation(async ({ storeId }) =>
      storeId === store.id ? fail("offers_fetch_blocked") : ok({ saved: 5, skipped: 0, matched: 0, weekStart: "2026-10-26" }),
    );
    render({ stores });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta alla" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(/^Maxi: /);
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(2));
    expect(await within(dialog).findByText("Krokom: Hämtade 5 erbjudanden.")).toBeInTheDocument();
  });

  it("badges every row with its store, filters per store and sorts by saving across stores", async () => {
    render({ stores, offers: both });
    const { user, dialog } = await open();
    expect(within(dialog).getAllByTestId("store-badge").map((badge) => badge.textContent)).toEqual(["Krokom", "Maxi", "Krokom"]);
    // The same product in two stores shows twice.
    expect(within(dialog).getAllByText("Havets Laxfilé")).toHaveLength(2);
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Sortera" })).getByRole("radio", { name: "Bäst rabatt" }));
    const best = within(dialog).getByRole("list", { name: "Bäst rabatt först" }).querySelectorAll("[data-testid=offer-row]");
    expect(best[0]).toHaveTextContent("Krokom");
    expect(best[1]).toHaveTextContent("Maxi");
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Visa butik" })).getByRole("radio", { name: "Krokom" }));
    expect(within(dialog).getAllByTestId("offer-row")).toHaveLength(2);
    await user.click(within(dialog).getByRole("radio", { name: "Alla" }));
    expect(within(dialog).getAllByTestId("offer-row")).toHaveLength(3);
  });

  it("shows labelled list filters without a Filter button, and no store pills in the AI area (Stories 16.8, 16.10)", async () => {
    render({ stores, offers: both });
    const { dialog } = await open();
    expect(within(dialog).queryByRole("button", { name: /^Filter/ })).not.toBeInTheDocument();
    const filters = within(dialog).getByTestId("list-filters");
    expect(filters).toHaveTextContent("Visa butik");
    // UX-18: sorting is its own segment "Sortera: Avdelning | Bäst rabatt", not part of the store filter.
    expect(filters).not.toHaveTextContent("Sortera");
    const sort = within(dialog).getByRole("radiogroup", { name: "Sortera" });
    expect(within(sort).getByRole("radio", { name: "Avdelning" })).toBeChecked();
    expect(within(dialog).queryByTestId("suggest-store-picker")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup", { name: "Föreslå rätter från" })).not.toBeInTheDocument();
  });

  it("has no store filter and no suggestion picker with one store's offers, and no sort without savings (Story 16.8)", async () => {
    render({ stores, offers: [{ ...both[0], savingPercent: null, regularPrice: null }] });
    const { dialog } = await open();
    expect(within(dialog).queryByTestId("list-filters")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("suggest-store-picker")).not.toBeInTheDocument();
  });

  it("clears the other stores' offers after Hämta valda, only when a fetch worked (Story 16.8)", async () => {
    render({ stores, offers: both });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Maxi ICA Stormarknad Östersund" }));
    await user.click(within(dialog).getByRole("button", { name: "Hämta valda (1)" }));
    await waitFor(() => expect(clearOtherStoreOffers).toHaveBeenCalledWith({ keep: [krokom.id] }));
  });

  it("keeps the other stores' offers when the selected fetch failed, and after Hämta alla (Story 16.8)", async () => {
    fetchStoreOffers.mockResolvedValue(fail("offers_fetch_blocked"));
    render({ stores, offers: both });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Maxi ICA Stormarknad Östersund" }));
    await user.click(within(dialog).getByRole("button", { name: "Hämta valda (1)" }));
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(1));
    fetchStoreOffers.mockResolvedValue(ok({ saved: 3, skipped: 0, matched: 0, weekStart: "2026-10-26" }));
    await user.click(within(dialog).getByRole("button", { name: "Hämta igen" }));
    await user.click(within(dialog).getByRole("button", { name: "Hämta alla" }));
    await waitFor(() => expect(fetchStoreOffers).toHaveBeenCalledTimes(3));
    expect(clearOtherStoreOffers).not.toHaveBeenCalled();
  });

  it("has no best-store tip any more (UX-18), but the offers that fit still say Passar dig", async () => {
    render({ stores, offers: both, fitIds: [both[1].id, both[2].id] });
    const { dialog } = await open();
    expect(within(dialog).queryByTestId("best-store")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/passar dig bäst/)).not.toBeInTheDocument();
    expect(within(dialog).getAllByTestId("offer-fit")).toHaveLength(2);
    expect(within(dialog).queryByRole("button", { name: "Föreslå rätter från veckans erbjudanden" })).not.toBeInTheDocument();
    expect(startJob).not.toHaveBeenCalled();
  });

  it("has no Visa dessa toggle; the matching offers are only marked, and every offer has a + (Story 16.12)", async () => {
    render({ stores, offers: both, listing: { planId: "33333333-3333-4333-8333-333333333333", onList: [], add: vi.fn(), remove: vi.fn() } });
    const { dialog } = await open();
    expect(within(dialog).queryByRole("button", { name: /Visa bara de erbjudandena|Visa alla erbjudanden/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Välj$/ })).not.toBeInTheDocument();
    expect(within(dialog).getAllByTestId("offer-row")).toHaveLength(both.length);
    expect(within(dialog).getAllByRole("button", { name: /^Lägg .* på inköpslistan$/ })).toHaveLength(both.length);
  });

  it("puts the store in the item's note when an offer is added", async () => {
    const add = vi.fn().mockResolvedValue(ok({ count: 1 }));
    render({ stores, offers: both, listing: { planId: "33333333-3333-4333-8333-333333333333", onList: [], add, remove: vi.fn() } });
    const { user, dialog } = await open();
    await user.click(within(dialog).getAllByRole("button", { name: /^Lägg Havets Laxfilé \(Krokom\) på inköpslistan$/ })[0]);
    expect(add.mock.calls[0][0].items[0].label).toBe("Laxfilé (Erbjudande Krokom: 119 kr/kg)");
  });
});
