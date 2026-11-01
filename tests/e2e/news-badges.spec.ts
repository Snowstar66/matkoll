import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, newsEmail, newsStorageState, thisMonday } from "./support";

// Story 23.1: Brickor. Two phones (two browser contexts) on one login, as on
// the household's shared login. What phone A adds on Inköpslista gets a badge
// on phone B's tab, never on A's own, and the badge goes when B opens the tab.

const mobile = { width: 375, height: 812 };
test.use({ storageState: newsStorageState, viewport: mobile });

test.beforeAll(async () => {
  const userId = await e2eUserId(newsEmail);
  const admin = adminClient();
  for (const table of ["shopping_custom_item", "shopping_check", "meal_plan"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const plan = await admin.from("meal_plan").insert({ user_id: userId, name: "Vecka", is_current: true, week_start: thisMonday() });
  if (plan.error) throw plan.error;
});

const tabs = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" });
const listTab = (page: Page) => tabs(page).getByRole("link", { name: /^Inköpslista/ });
const newsRead = (page: Page) => page.waitForResponse((response) => response.url().includes("/api/news") && response.ok());

test("an item added on one phone gets a badge on the other's tab, not on its own, and the badge goes when the tab is opened", async ({
  browser,
}) => {
  const phoneA = await browser.newContext({ storageState: newsStorageState, viewport: mobile });
  const phoneB = await browser.newContext({ storageState: newsStorageState, viewport: mobile });
  const a = await phoneA.newPage();
  const b = await phoneB.newPage();

  // Phone B opens the app first: from now on is news to it.
  let read = newsRead(b);
  await b.goto("/recept");
  await read;
  await expect(listTab(b).getByTestId("tab-badge")).toHaveCount(0);

  // Phone A adds an item on Inköpslista.
  await a.goto("/lista");
  await a.getByTestId("add-item-fab").filter({ visible: true }).click();
  const sheet = a.getByRole("dialog", { name: "Lägg till vara" });
  await sheet.getByRole("textbox", { name: "Vara" }).fill("diskmedel");
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  await expect(sheet.getByTestId("custom-item-added")).toHaveText("La till diskmedel.");
  await sheet.getByRole("button", { name: "Klar" }).click();

  // Phone B sees a badge on Inköpslista at its next read (here: a move between pages).
  read = newsRead(b);
  await tabs(b).getByRole("link", { name: "Matsedel" }).click();
  await read;
  await expect(tabs(b).getByRole("link", { name: "Inköpslista, 1 ny ändring" })).toBeVisible();
  await expect(listTab(b).getByTestId("tab-badge")).toHaveText("1");

  // Phone A's own item is no news to A.
  read = newsRead(a);
  await tabs(a).getByRole("link", { name: "Recept" }).click();
  await read;
  await expect(listTab(a).getByTestId("tab-badge")).toHaveCount(0);

  // Phone B opens Inköpslista: the badge goes, and stays gone after leaving.
  await listTab(b).click();
  await expect(b.getByText("diskmedel").filter({ visible: true })).toBeVisible();
  await expect(listTab(b).getByTestId("tab-badge")).toHaveCount(0);
  read = newsRead(b);
  await tabs(b).getByRole("link", { name: "Recept" }).click();
  await read;
  await expect(listTab(b)).toHaveAccessibleName("Inköpslista");
  await expect(listTab(b).getByTestId("tab-badge")).toHaveCount(0);

  await phoneA.close();
  await phoneB.close();
});
