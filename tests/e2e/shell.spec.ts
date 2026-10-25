import { expect, type Page, test } from "@playwright/test";
import { userStorageState } from "./support";

// Story 1.3: the app shell on mobile and desktop, signed in.

test.use({ storageState: userStorageState });

const surfaces = [
  { tab: "Recept", path: "/recept", title: "Recept", empty: "Inga recept än. Klistra in en länk till ett recept du gillar." },
  { tab: "Matsedel", path: "/matsedel", title: "Matsedel", empty: "Ingen rätt på matsedeln än." },
  { tab: "Lista", path: "/lista", title: "Inköpslista", empty: "Lägg rätter på matsedeln så räknas listan fram." },
  { tab: "Hemma", path: "/hemma", title: "Hemma", empty: "Inget i kylen än." },
] as const;

const mobile = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const mainMenu = (page: Page) => page.getByRole("navigation", { name: "Huvudmeny" });

async function expectSurface(page: Page, surface: (typeof surfaces)[number]) {
  await expect(page).toHaveURL(new RegExp(`${surface.path}$`));
  await expect(page.getByRole("heading", { level: 1, name: surface.title })).toBeVisible();
  await expect(page.getByText(surface.empty)).toBeVisible();
  await expect(mainMenu(page).getByRole("link", { name: surface.tab })).toHaveAttribute("aria-current", "page");
  for (const other of surfaces.filter((s) => s !== surface)) {
    await expect(mainMenu(page).getByRole("link", { name: other.tab })).not.toHaveAttribute("aria-current", /.*/);
  }
}

test.describe("mobile, 390 × 844", () => {
  test.use({ viewport: mobile });

  test("a tab bar at the bottom leads to every surface and marks the active one", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/recept");
    await expect(mainMenu(page)).toHaveCount(1);
    await expect(mainMenu(page).getByRole("link")).toHaveText(["Recept", "Matsedel", "Lista", "Hemma"]);

    // The tab bar sits at the bottom of the screen and is 84 px high.
    const box = await mainMenu(page).boundingBox();
    expect(box?.height).toBe(84);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(mobile.height);

    // The active tab is in the accent colour, the others in ink-3 (light mode values).
    const color = (name: string) => mainMenu(page).getByRole("link", { name }).evaluate((el) => getComputedStyle(el).color);
    expect(await color("Recept")).toBe("rgb(62, 124, 98)");
    expect(await color("Matsedel")).toBe("rgb(107, 120, 114)");

    await expectSurface(page, surfaces[0]);
    for (const surface of [...surfaces.slice(1), surfaces[0]]) {
      await mainMenu(page).getByRole("link", { name: surface.tab }).click();
      await expectSurface(page, surface);
    }
    expect(errors).toEqual([]);
  });

  test("the gear in the Recept header opens Inställningar", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/recept");
    await expect(mainMenu(page).getByRole("link", { name: "Inställningar" })).toHaveCount(0);
    const gear = page.getByRole("main").getByRole("link", { name: "Inställningar" });
    const box = await gear.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await gear.click();
    await expect(page).toHaveURL(/\/installningar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();

    // No tab for Inställningar on mobile, so the header has a way back.
    await page.getByRole("main").getByRole("link", { name: "Tillbaka" }).click();
    await expect(page).toHaveURL(/\/recept$/);
    expect(errors).toEqual([]);
  });

  test("switching tabs keeps each surface's scroll position", async ({ page }) => {
    await page.goto("/recept");
    await expect(page.getByText(surfaces[0].empty)).toBeVisible();
    // The empty pages are short; make room to scroll. <html> is outside what React replaces.
    await page.evaluate(() => {
      document.documentElement.style.minHeight = "3000px";
    });
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);

    await mainMenu(page).getByRole("link", { name: "Matsedel" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Matsedel" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 250));

    await mainMenu(page).getByRole("link", { name: "Recept" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);

    await mainMenu(page).getByRole("link", { name: "Matsedel" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Matsedel" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(250);
  });
});

test.describe("desktop, 1280 × 800", () => {
  test.use({ viewport: desktop });

  test("a side menu replaces the tab bar and has Inställningar at the bottom", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/recept");
    await expect(mainMenu(page)).toHaveCount(1);
    await expect(mainMenu(page).getByRole("link")).toHaveText(["Recept", "Matsedel", "Lista", "Hemma", "Inställningar"]);

    const menu = await mainMenu(page).boundingBox();
    expect(menu).toMatchObject({ x: 0, y: 0, width: 240, height: desktop.height });
    // No gear in the header on desktop.
    await expect(page.getByRole("main").getByRole("link", { name: "Inställningar" })).toBeHidden();

    // Content is at most 720 px wide, to the right of the menu.
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(heading?.x).toBeGreaterThanOrEqual(240);
    const content = await page.locator("#innehall > div").boundingBox();
    expect(content?.width).toBeLessThanOrEqual(720);

    for (const surface of [...surfaces.slice(1), surfaces[0]]) {
      await mainMenu(page).getByRole("link", { name: surface.tab }).click();
      await expectSurface(page, surface);
    }

    await mainMenu(page).getByRole("link", { name: "Inställningar" }).click();
    await expect(page).toHaveURL(/\/installningar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();
    await expect(mainMenu(page).getByRole("link", { name: "Inställningar" })).toHaveAttribute("aria-current", "page");
    expect(errors).toEqual([]);
  });

  test("the keyboard reaches the menu with a visible focus ring in the accent colour", async ({ page }) => {
    await page.goto("/recept");
    await expect(page.getByText(surfaces[0].empty)).toBeVisible();
    const target = mainMenu(page).getByRole("link", { name: "Matsedel" });
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(target).toBeFocused();
    const outline = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBe("2px");
    expect(outline.color).toBe("rgb(62, 124, 98)"); // --accent, light mode
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/matsedel$/);
  });

  test("dark mode uses the dark tokens", async ({ page }) => {
    await page.goto("/recept");
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await background();
    expect(light).toBe("rgb(245, 247, 244)");
    expect(dark).toBe("rgb(18, 23, 20)");
  });
});

test.describe("dark mode from the start", () => {
  test.use({ colorScheme: "dark", viewport: mobile });

  test("the page, tab bar and text follow the system setting", async ({ page }) => {
    await page.goto("/recept");
    await expect(page.getByRole("heading", { level: 1, name: "Recept" })).toBeVisible();
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const title = await page.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).color);
    // The visible main menu: the tab bar at this width.
    const tabBar = await mainMenu(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect({ body, title, tabBar }).toEqual({ body: "rgb(18, 23, 20)", title: "rgb(232, 237, 234)", tabBar: "rgb(27, 33, 30)" });
  });
});
