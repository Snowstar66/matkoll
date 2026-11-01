import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, plainPng, userStorageState, welcomeEmail, welcomeStorageState } from "./support";

// Story 20.1: the welcome tour. welcomeEmail is the one E2E user that has not
// seen it; before each test its row in welcome_tour is removed, so the tour
// shows again. The tests run in order, since they share the user.

test.use({ storageState: welcomeStorageState });
test.describe.configure({ mode: "serial" });

let userId = "";
test.beforeAll(async () => {
  userId = await e2eUserId(welcomeEmail);
});

test.beforeEach(async () => {
  const removed = await adminClient().from("welcome_tour").delete().eq("user_id", userId);
  if (removed.error) throw removed.error;
});

const tour = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const privacyNote = (page: Page) => page.getByRole("region", { name: "Om din data" }).filter({ visible: true });

async function seenRows(): Promise<number> {
  const { count, error } = await adminClient().from("welcome_tour").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function toLastPage(page: Page) {
  for (let i = 0; i < 5; i++) await tour(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(tour(page).getByRole("heading", { name: "Var vill du börja?" })).toBeVisible();
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the tour full screen the first time, before the privacy note, and never again after Hoppa över", async ({ page }) => {
    // The saved session has pressed Okej on the privacy note (openMagicLink); this test needs it unpressed.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("matkoll.integritet.okej");
      } catch {
        // No storage: the note shows anyway.
      }
    });
    await page.goto("/recept");
    const dialog = tour(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Välkommen till Livskoll");
    await expect(privacyNote(page)).toHaveCount(0);
    // Full screen: the dialog covers the window, tab bar and all.
    const box = (await dialog.boundingBox())!;
    expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });

    await dialog.getByRole("button", { name: "Fortsätt" }).click();
    await expect(dialog).toHaveAccessibleName("Spara recept var du än hittar dem");
    await expect(dialog.getByText("Sida 2 av 6", { exact: true })).toBeAttached();
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toHaveAccessibleName("Planera veckan. Listan skriver sig själv.");
    await page.keyboard.press("ArrowLeft");
    await expect(dialog).toHaveAccessibleName("Spara recept var du än hittar dem");

    await dialog.getByRole("button", { name: "Hoppa över" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/recept$/);
    await expect(privacyNote(page)).toBeVisible();
    // Pontus 1 Nov: a card floating above the tab bar, not a banner at the top.
    const note = (await privacyNote(page).boundingBox())!;
    const bar = (await page.getByRole("navigation", { name: "Huvudmeny" }).filter({ visible: true }).boundingBox())!;
    expect(note.y + note.height).toBeLessThanOrEqual(bar.y);
    expect(note.y).toBeGreaterThan(400);
    await expect.poll(seenRows).toBe(1);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Recept", level: 1 }).filter({ visible: true })).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });

  test("changes page with a swipe", async ({ page }) => {
    await page.goto("/recept");
    const dialog = tour(page);
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 300, { steps: 4 });
    await page.mouse.up();
    await expect(dialog).toHaveAccessibleName("Spara recept var du än hittar dem");
  });

  test("Esc closes the tour like Hoppa över", async ({ page }) => {
    await page.goto("/recept");
    await expect(tour(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await expect.poll(seenRows).toBe(1);
  });

  test("Lägg till ett recept opens Importera recept on Recept", async ({ page }) => {
    await page.goto("/matsedel");
    await toLastPage(page);
    // Fortsätt and Hoppa över give way to the choices: faded out and out of reach.
    for (const name of ["Fortsätt", "Hoppa över"]) {
      await expect(tour(page).getByRole("button", { name })).toHaveCSS("opacity", "0");
      await expect(tour(page).getByRole("button", { name })).toHaveAttribute("inert", "");
    }
    await tour(page).getByRole("button", { name: /Lägg till ett recept/ }).click();
    await expect(page).toHaveURL(/\/recept$/);
    await expect(page.getByRole("dialog", { name: "Importera recept" })).toBeVisible();
    await expect.poll(seenRows).toBe(1);
  });

  test("Fotografera kylen opens the camera and reads the photo in Matvaror, Kyl", async ({ page }) => {
    await page.goto("/recept");
    await toLastPage(page);
    const chooser = page.waitForEvent("filechooser");
    await tour(page).getByRole("button", { name: /Fotografera kylen/ }).click();
    await (await chooser).setFiles(plainPng(40));
    await expect(page).toHaveURL(/\/hemma\?plats=kyl$/);
    await expect(page.getByTestId("pantry-camera").filter({ visible: true }).getByRole("status").first()).toContainText(
      /Tittar på bilden|Hittar varorna|Jämför/,
    );
    await expect.poll(seenRows).toBe(1);
  });

  test("Titta runt själv opens Recept", async ({ page }) => {
    await page.goto("/lista");
    await toLastPage(page);
    await tour(page).getByRole("button", { name: /Titta runt själv/ }).click();
    await expect(page).toHaveURL(/\/recept$/);
    await expect(tour(page)).toHaveCount(0);
  });

  test("with Minska rörelse the drawings stand still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/recept");
    await expect(tour(page)).toBeVisible();
    const dash = await tour(page)
      .locator(".tour-art .d")
      .first()
      .evaluate((path) => getComputedStyle(path).strokeDasharray);
    expect(dash).toBe("none");
  });
});

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows the tour as a 560 px dialog over the app", async ({ page }) => {
    await page.goto("/recept");
    const dialog = tour(page);
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBe(560);
    expect(box.height).toBe(680);
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toHaveAccessibleName("Spara recept var du än hittar dem");
  });
});

test.describe("played again from Hjälp", () => {
  test.use({ storageState: userStorageState, viewport: { width: 390, height: 844 } });

  test("shows no tour to someone who has seen it, plays it at /valkomst and goes back to Hjälp", async ({ page }) => {
    await page.goto("/recept");
    await expect(page.getByRole("heading", { name: "Recept", level: 1 }).filter({ visible: true })).toBeVisible();
    await expect(tour(page)).toHaveCount(0);

    await page.goto("/valkomst?fran=hjalp");
    await expect(tour(page)).toHaveAccessibleName("Välkommen till Livskoll");
    await tour(page).getByRole("button", { name: "Hoppa över" }).click();
    await expect(page).toHaveURL(/\/hjalp$/);
  });

  test("goes to Recept from /valkomst without fran", async ({ page }) => {
    await page.goto("/valkomst");
    await tour(page).getByRole("button", { name: "Hoppa över" }).click();
    await expect(page).toHaveURL(/\/recept$/);
  });
});
