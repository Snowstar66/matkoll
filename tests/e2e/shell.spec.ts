import { expect, type Page, test } from "@playwright/test";
import { openSettingsViaAvatar, userStorageState } from "./support";

// Story 1.3: the app shell on mobile and desktop, signed in.

test.use({ storageState: userStorageState });

const surfaces = [
  { tab: "Recept", path: "/recept", title: "Recept", empty: "Inga recept än. Klistra in en länk till ett recept du gillar." },
  { tab: "Matsedel", path: "/matsedel", title: "Matsedel", empty: "Den här veckan är tom." },
  { tab: "Inköpslista", path: "/lista", title: "Inköpslista", empty: "Lägg rätter på matsedeln så räknas listan fram." },
  { tab: "Matvaror", path: "/hemma", title: "Matvaror", empty: "Inget i kylen än." },
  { tab: "Förråd", path: "/prylar", title: "Förråd", empty: "Börja med ett rum, som Förrådet eller Garaget." },
] as const;

/** The tab bar's labels, in order (Story 10.4: Inköpslista and Matvaror; Epic 18: Förråd). */
const mainLabels = ["Recept", "Matsedel", "Inköpslista", "Matvaror", "Förråd"];

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

// Story 14.4: each link starts with its coloured emoji; the label is what follows.
const endsWith = (label: string) => new RegExp(`${label}$`);

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
    await expect(mainMenu(page).getByRole("link")).toHaveText(mainLabels.map(endsWith));

    // The tab bar sits at the bottom of the screen and is 56 px high (no safe area in a browser tab, Story 19.1).
    const box = await mainMenu(page).boundingBox();
    expect(box?.height).toBe(56);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(mobile.height);

    // The active tab is in the accent colour, the others in ink-3 (light mode values).
    const color = (name: string) => mainMenu(page).getByRole("link", { name }).evaluate((el) => getComputedStyle(el).color);
    // Polled: until the bar has hydrated it has no current tab (AD-18), which a busy machine shows for a while.
    await expect.poll(() => color("Recept")).toBe("rgb(62, 124, 98)");
    await expect.poll(() => color("Matsedel")).toBe("rgb(107, 120, 114)");

    await expectSurface(page, surfaces[0]);
    for (const surface of [...surfaces.slice(1), surfaces[0]]) {
      await mainMenu(page).getByRole("link", { name: surface.tab }).click();
      await expectSurface(page, surface);
    }
    expect(errors).toEqual([]);
  });

  test("the P button at the right of every tab's header opens a sheet with Inställningar, Hjälp och tips and Logga ut (Story 19.2)", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/recept");
    // The gear is gone; Inställningar is not a tab and not a link in the header.
    await expect(mainMenu(page).getByRole("link", { name: "Inställningar" })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "Inställningar" })).toHaveCount(0);

    // The same place, size and way on all five tabs.
    const boxes = [];
    for (const surface of surfaces) {
      await mainMenu(page).getByRole("link", { name: surface.tab }).click();
      await expect(page).toHaveURL(new RegExp(`${surface.path}$`));
      const button = page.getByRole("button", { name: "Konto" }).filter({ visible: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    expect(new Set(boxes.map((box) => Math.round(box!.x))).size).toBe(1);

    await mainMenu(page).getByRole("link", { name: "Recept" }).click();
    await expect(page).toHaveURL(/\/recept$/);
    await page.getByRole("button", { name: "Konto" }).filter({ visible: true }).click();
    const sheet = page.getByRole("dialog").filter({ visible: true });
    await expect(sheet.getByRole("link", { name: "Inställningar" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Hjälp och tips/ })).toContainText("Om Recept");
    await expect(sheet.getByRole("button", { name: "Logga ut" })).toBeVisible();
    await sheet.getByRole("link", { name: "Inställningar" }).click();
    await expect(page).toHaveURL(/\/installningar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();

    // No tab for Inställningar on mobile, so the header has a way back, named for the page above.
    await page.getByRole("main").getByRole("link", { name: "Recept", exact: true }).click();
    await expect(page).toHaveURL(/\/recept$/);
    expect(errors).toEqual([]);
  });

  test("Hjälp och tips opens on the area of the tab the P button was opened from, with its chip chosen", async ({ page }) => {
    await page.goto("/matsedel");
    await page.getByRole("button", { name: "Konto" }).filter({ visible: true }).click();
    await page.getByRole("dialog").filter({ visible: true }).getByRole("link", { name: /Hjälp och tips/ }).click();
    await expect(page).toHaveURL(/\/hjalp#matsedel$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hjälp och tips" })).toBeVisible();
    const areas = page.getByRole("group", { name: "Område" }).filter({ visible: true });
    await expect(areas.getByRole("button", { name: "Matsedel", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 3, name: "Välj vecka" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Matsedel" })).toBeVisible();
    for (const tab of mainLabels) await expect(mainMenu(page).getByRole("link", { name: tab })).not.toHaveAttribute("aria-current", /.*/);
  });

  test("Hjälp och tips shows one area at a time, searches every area and has the tour card and Tyck till", async ({ page }) => {
    await page.goto("/hjalp#matvaror");
    const main = page.getByRole("main").filter({ visible: true });
    const areas = main.getByRole("group", { name: "Område" });
    await expect(areas.getByRole("button", { name: "Matvaror" })).toHaveAttribute("aria-pressed", "true");
    await areas.getByRole("button", { name: "Konto" }).click();
    await expect(main.getByRole("heading", { level: 3, name: "Siri" })).toBeVisible();
    await expect(main.getByRole("heading", { level: 3, name: "Fota kylen" })).toHaveCount(0);
    const question = main.locator("details").filter({ hasText: "Vem kan se min data?" });
    await question.locator("summary").click();
    await expect(question.getByText(/kan tekniskt se kontots data/)).toBeVisible();
    await expect(main.getByRole("link", { name: /Så funkar Livskoll/ })).toHaveAttribute("href", "/valkomst?fran=hjalp");
    for (const kind of ["idea", "rate", "problem"]) await expect(main.getByTestId(`feedback-${kind}`)).toBeVisible();

    const field = main.getByRole("searchbox", { name: "Sök i hjälpen" });
    await field.fill("FORRAD");
    await expect(main.getByRole("list", { name: "Träffar" })).toContainText("Ska maten in här?");
    await expect(areas).toHaveCount(0);
    await field.fill("zebrafink");
    await expect(main.getByRole("status").filter({ hasText: /träff/ })).toHaveText("0 träffar");
    await expect(main.getByTestId("feedback-idea")).toHaveAttribute("href", "/hjalp?tyck=idea&q=zebrafink");
  });

  test("the large title gives way to a slim bar with the title centred when it scrolls out of sight", async ({ page }) => {
    await page.goto("/recept");
    await page.evaluate(() => {
      document.documentElement.style.minHeight = "3000px";
    });
    const bar = page.getByTestId("collapsed-bar").filter({ visible: true });
    await expect(bar).toHaveCSS("opacity", "0");
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(bar).toHaveCSS("opacity", "1");
    const box = await bar.boundingBox();
    expect(box).toMatchObject({ x: 0, y: 0, height: 52 });
    // The P button is the same one, now on the bar.
    const p = await page.getByRole("button", { name: "Konto" }).filter({ visible: true }).boundingBox();
    expect(p!.y).toBeLessThan(52);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toHaveCSS("opacity", "0");
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
    await expect(mainMenu(page).getByRole("link")).toHaveText([...mainLabels, "Hjälp och tips", "Inställningar"].map(endsWith));
    // Under a hairline at the bottom: who is signed in, and Logga ut (Story 19.2).
    await expect(mainMenu(page).getByTestId("side-account")).toBeVisible();
    await expect(mainMenu(page).getByRole("button", { name: "Logga ut" })).toBeVisible();

    const menu = await mainMenu(page).boundingBox();
    expect(menu).toMatchObject({ x: 0, y: 0, width: 240, height: desktop.height });
    // No P button in the header on desktop: the account is at the bottom of the side menu.
    await expect(page.getByRole("main").getByRole("button", { name: "Konto" })).toBeHidden();

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
    expect(dark).toBe("rgb(15, 19, 17)");
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
    expect({ body, title, tabBar }).toEqual({ body: "rgb(15, 19, 17)", title: "rgb(230, 235, 232)", tabBar: "color(srgb 0.0941176 0.113725 0.101961 / 0.82)" });
  });
});

/**
 * Each tab's label, measured: whether it is clipped or runs out of its tab
 * (sideways, or below the link), whether the link runs into the bar's bottom
 * padding (the safe area), its number of lines and whether it is the active,
 * semibold tab.
 */
async function tabLabels(page: Page) {
  return mainMenu(page).evaluate((nav) => {
    const bar = nav.getBoundingClientRect();
    const contentBottom = bar.bottom - parseFloat(getComputedStyle(nav).paddingBottom);
    return [...nav.querySelectorAll("a")].map((link) => {
      const label = link.querySelector("span")!;
      const box = link.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      return {
        name: label.textContent,
        active: link.getAttribute("aria-current") === "page",
        fits:
          label.scrollWidth <= label.clientWidth &&
          text.left >= box.left &&
          text.right <= box.right &&
          text.bottom <= box.bottom &&
          box.bottom <= contentBottom + 0.5,
        lines: Math.round(text.height / parseFloat(getComputedStyle(label).lineHeight)),
      };
    });
  });
}

/** Opens Inköpslista and Matvaror, so each long label is measured while it is active (semibold). */
async function measureActive(page: Page, rootFontSize?: string) {
  const measured = [];
  for (const path of ["/lista", "/hemma"]) {
    await page.goto(path);
    await expect(mainMenu(page).locator('a[aria-current="page"]')).toHaveCount(1);
    if (rootFontSize) await page.addStyleTag({ content: `html { font-size: ${rootFontSize}; }` });
    measured.push(...(await tabLabels(page)));
  }
  return measured;
}

test.describe("tab labels (Story 10.4)", () => {
  test("Inköpslista and Matvaror fit on one line at 375 × 812, also active, and name their pages", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const labels = await measureActive(page);
    expect(labels.map(({ name }) => name)).toEqual([...mainLabels, ...mainLabels]);
    expect(labels.filter(({ active }) => active).map(({ name }) => name)).toEqual(["Inköpslista", "Matvaror"]);
    expect(labels.filter(({ fits, lines }) => !fits || lines !== 1)).toEqual([]);
    await page.goto("/lista");
    await expect(page).toHaveTitle("Inköpslista – Livskoll");
    await page.goto("/hemma");
    await expect(page).toHaveTitle("Matvaror – Livskoll");
  });

  test("at 375 px with the root font size doubled every label fits its tab and stays clear of the safe area", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const labels = await measureActive(page, "200%");
    expect(labels.filter(({ fits, lines }) => !fits || lines > 2)).toEqual([]);
  });

  // 234 px wide is a 375 px phone at 160 % zoom: with the fifth tab (Föremål) each tab is as wide as at 187 px with four.
  test("at 200 % zoom every label fits its tab, the long ones on two lines between their parts", async ({ page }) => {
    await page.setViewportSize({ width: 234, height: 406 });
    const labels = await measureActive(page);
    expect(labels.filter(({ fits, lines }) => !fits || lines > 2)).toEqual([]);
    expect(labels.filter(({ lines }) => lines === 2).map(({ name }) => name)).toEqual(
      expect.arrayContaining(["Inköpslista"]),
    );
    // The tab bar itself never scrolls sideways, and keeps its height while everything fits.
    expect(await mainMenu(page).evaluate((nav) => nav.scrollWidth <= nav.clientWidth)).toBe(true);
    expect((await mainMenu(page).boundingBox())?.height).toBe(56);
  });
});
