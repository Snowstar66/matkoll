import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { adminClient, e2eEmail, outsiderStorageState, userStorageState } from "./support";

// Story 1.6 and 1.8: importing a recipe from pasted text or a link, with
// AI_PROVIDER=mock. In CI this runs against the built server (`pnpm build &&
// pnpm start`), so a working import also shows that the AI port, with its
// prompt bundled through `?raw`, works after `next build`. It also tests the
// Sheet in a real browser: Esc, the close button and "Släng ändringarna?".
//
// Recipe sites: with AI_PROVIDER=mock the import flow's fetch port reads the
// saved pages in tests/fixtures/sites instead of the internet
// (src/server/fetch/fixture-sites.ts), still through safeFetch and its checks,
// so no test reaches a real site. The approved sites come from
// ensure_user_defaults(), which /auth/confirm runs when global-setup signs in.

const linssoppa = readFileSync("tests/fixtures/ai/linssoppa.txt", "utf8");
const kycklinggryta = readFileSync("tests/fixtures/ai/kycklinggryta.txt", "utf8");
const mobile = { width: 390, height: 844 };

/** The E2E user's id, set by seedCatalog. */
let e2eUserId = "";

/** Catalog rows for the E2E user, so some lines match by the AI's name ("Kontrollera"). */
async function seedCatalog() {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === e2eEmail);
  if (!user) throw new Error(`${e2eEmail} is missing; global-setup creates it`);
  e2eUserId = user.id;
  const rows = [
    { name: "Gul lök", normalized_name: "gul lök", section: "Frukt och grönt", location: "Skafferi", default_unit: "st" },
    { name: "Vitlök", normalized_name: "vitlök", section: "Frukt och grönt", location: "Skafferi", default_unit: "klyfta" },
  ].map((row) => ({ ...row, user_id: user.id }));
  const inserted = await admin
    .from("ingredient")
    .upsert(rows, { onConflict: "user_id,normalized_name", ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
}

/** Collects console errors and uncaught exceptions for the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Importera recept" });
const textField = (page: Page) => sheet(page).getByLabel("Recepttext");
const linkField = (page: Page) => sheet(page).getByLabel("Länk till receptet");
const line = (page: Page, originalText: string): Locator =>
  sheet(page).getByTestId("recipe-line").filter({ hasText: originalText });

/** Opens the sheet, on the Text tab unless `tab` says otherwise (it opens on Länk). */
async function openImport(page: Page, tab: "Länk" | "Text" = "Text") {
  await page.goto("/recept");
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("tab", { name: "Länk" })).toHaveAttribute("aria-selected", "true");
  if (tab === "Text") await sheet(page).getByRole("tab", { name: "Text" }).click();
}

async function parse(page: Page, text: string) {
  await textField(page).fill(text);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
}

test.use({ storageState: userStorageState, viewport: mobile });

test.beforeAll(async () => {
  await seedCatalog();
});

test("the sheet opens on the Länk tab; Text works and Foto is coming", async ({ page }) => {
  const errors = watchErrors(page);
  await openImport(page, "Länk");

  const tabs = sheet(page).getByRole("tab");
  await expect(tabs).toHaveText(["Länk", "Text", "Foto"]);
  await expect(linkField(page)).toBeVisible();
  const tolka = sheet(page).getByRole("button", { name: "Tolka" });
  await expect(tolka).toBeDisabled();
  await linkField(page).fill("   ");
  await expect(tolka).toBeDisabled();

  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await expect(textField(page)).toBeVisible();
  await expect(tolka).toBeDisabled();
  await textField(page).fill("   ");
  await expect(tolka).toBeDisabled();

  await sheet(page).getByRole("tab", { name: "Foto" }).click();
  await expect(sheet(page).getByRole("tabpanel")).toHaveText("Kommer snart.");
  expect(errors).toEqual([]);
});

test("the empty library's button opens the same sheet", async ({ page }) => {
  await page.goto("/recept");
  const empty = page.getByText("Inga recept än.");
  await expect(empty).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Importera recept" }).last().click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("tab", { name: "Länk" })).toHaveAttribute("aria-selected", "true");
});

test("pasted text becomes a preview that can be edited, and closing asks before discarding", async ({ page }) => {
  const errors = watchErrors(page);
  await openImport(page);
  await parse(page, linssoppa);

  // The preview in Matkoll's format.
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk");
  await expect(sheet(page).getByText("6 portioner")).toBeVisible();
  await expect(sheet(page).getByLabel("Tid i minuter")).toHaveValue("30");
  await expect(sheet(page).getByTestId("recipe-line")).toHaveCount(12);
  await expect(sheet(page).getByLabel("Steg 1")).toHaveValue(/^Hacka lök, vitlök och ingefära/);

  // Matched through the AI's name: ring and "Kontrollera". No catalog row: "Ny".
  const onion = line(page, "2 gula lökar");
  await expect(onion.getByRole("button", { name: /^Gul lök/ })).toBeVisible();
  await expect(onion.getByText("Kontrollera")).toBeVisible();
  await expect(line(page, "3 vitlöksklyftor").getByText("Kontrollera")).toBeVisible();
  const carrots = line(page, "2 morötter");
  await expect(carrots.getByText("Ny", { exact: true })).toBeVisible();
  await expect(carrots.getByText("Kontrollera")).toHaveCount(0);
  await expect(line(page, "3 dl röda linser").getByText("3 dl", { exact: true })).toBeVisible();
  // "1 bit" is not a catalog unit: a vague line, shown as its original text without amount.
  const ginger = line(page, "1 bit färsk ingefära, ca 3 cm");
  await expect(ginger.getByText("1 bit färsk ingefära, ca 3 cm")).toBeVisible();
  await expect(ginger).toHaveText(/^ingefära/);

  // Edit title, servings, time, amount and unit.
  await sheet(page).getByLabel("Titel").fill("Linssoppa");
  await sheet(page).getByRole("button", { name: "Fler portioner" }).click();
  await expect(sheet(page).getByText("7 portioner")).toBeVisible();
  await sheet(page).getByLabel("Tid i minuter").fill("en halvtimme");
  await expect(sheet(page).getByText("Ange ett tal.")).toBeVisible();
  await sheet(page).getByLabel("Tid i minuter").fill("35");
  await expect(sheet(page).getByText("Ange ett tal.")).toHaveCount(0);

  const lentils = line(page, "3 dl röda linser");
  await lentils.getByRole("button", { name: /^Ändra mängd/ }).click();
  await lentils.getByLabel("Mängd").fill("abc");
  await expect(lentils.getByText("Ange ett tal.")).toBeVisible();
  await lentils.getByLabel("Mängd").fill("2,5");
  await expect(lentils.getByText("Ange ett tal.")).toHaveCount(0);
  await lentils.getByLabel("Enhet").selectOption("msk");
  await expect(lentils.getByText("2,5 msk", { exact: true })).toBeVisible();
  await lentils.getByRole("button", { name: /^Ändra mängd/ }).click();
  await expect(lentils.getByLabel("Mängd")).toHaveCount(0);

  await sheet(page).getByLabel("Steg 1").fill("Hacka allt.");
  await expect(sheet(page).getByLabel("Steg 1")).toHaveValue("Hacka allt.");

  // Swap the ingredient of the uncertain line: search, choose, no "Kontrollera".
  await onion.getByRole("button", { name: /^Gul lök/ }).click();
  await sheet(page).getByLabel("Sök ingrediens").fill("gul lök");
  await sheet(page).getByRole("list", { name: "Träffar" }).getByRole("button", { name: "Gul lök" }).click();
  await expect(onion.getByRole("button", { name: /^Gul lök/ })).toBeFocused();
  await expect(onion.getByText("Kontrollera")).toHaveCount(0);

  // No hit: a new ingredient with the typed name.
  await carrots.getByRole("button", { name: /^morot/ }).click();
  await sheet(page).getByLabel("Sök ingrediens").fill("palsternacka");
  await expect(sheet(page).getByText("Ingen ingrediens hittades.")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Lägg till palsternacka som ny" }).click();
  await expect(carrots.getByRole("button", { name: /^palsternacka/ })).toBeVisible();
  await expect(carrots.getByText("Ny", { exact: true })).toBeVisible();

  // Esc asks first; "Fortsätt ändra" keeps the changes.
  await page.keyboard.press("Escape");
  await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Fortsätt ändra" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Linssoppa");
  await expect(sheet(page).getByText("7 portioner")).toBeVisible();

  // The close button asks too; "Släng ändringarna" closes without saving.
  await sheet(page).getByRole("button", { name: "Stäng" }).click();
  await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText("Inga recept än.")).toBeVisible();

  // Opened again, the sheet starts empty, on Länk.
  await page.locator("header").getByRole("button", { name: "Importera recept" }).click();
  await expect(sheet(page).getByRole("tab", { name: "Länk" })).toHaveAttribute("aria-selected", "true");
  await sheet(page).getByRole("tab", { name: "Text" }).click();
  await expect(textField(page)).toHaveValue("");
  expect(errors).toEqual([]);
});

test("an unchanged preview closes without asking, and the text is still there behind it", async ({ page }) => {
  await openImport(page);
  await parse(page, linssoppa);
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk");

  await sheet(page).getByRole("button", { name: "Tillbaka till texten" }).click();
  await expect(textField(page)).toHaveValue(linssoppa);
  await sheet(page).getByRole("button", { name: "Visa förhandsgranskningen" }).click();
  await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk");

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
});

test("Avbryt stops the import and goes back to the text without an error", async ({ page }) => {
  const errors = watchErrors(page);
  // Hold the request, so "Läser receptet …" stays until Avbryt.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/ai/import", async (route) => {
    requests++;
    await held;
    // The page has aborted the request by now, so there is nothing to continue.
    await route.continue().catch(() => {});
  });

  await openImport(page);
  await parse(page, linssoppa);
  await expect(sheet(page).getByRole("status").getByText("Läser receptet …")).toBeVisible();
  await expect(textField(page)).toHaveValue(linssoppa);
  const aborted = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/api/ai/import"));
  await sheet(page).getByRole("button", { name: "Avbryt" }).click();
  await aborted;
  release();

  await expect(sheet(page).getByText("Läser receptet …")).toHaveCount(0);
  await expect(textField(page)).toHaveValue(linssoppa);
  await expect(textField(page)).toBeFocused();
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await expect(sheet(page).getByLabel("Titel")).toHaveCount(0);
  expect(requests).toBe(1);
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
});

test("parsing again asks before it replaces an edited preview", async ({ page }) => {
  await openImport(page);
  await parse(page, linssoppa);
  const title = sheet(page).getByLabel("Titel");
  await expect(title).toBeFocused();
  await title.fill("Min soppa");

  // Back to the same text: the preview is still there, and Tolka asks first.
  await sheet(page).getByRole("button", { name: "Tillbaka till texten" }).click();
  await expect(sheet(page).getByRole("button", { name: "Visa förhandsgranskningen" })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Fortsätt ändra" }).click();
  await expect(title).toHaveValue("Min soppa");

  // Another text: the old preview is no longer offered, and "Släng ändringarna" replaces it.
  await sheet(page).getByRole("button", { name: "Tillbaka till texten" }).click();
  await textField(page).fill(kycklinggryta);
  await expect(sheet(page).getByRole("button", { name: "Visa förhandsgranskningen" })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
  await sheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
  await expect(title).toHaveValue("Krämig kycklinggryta med curry");
});

test("pasted text that has not been parsed is not lost silently", async ({ page }) => {
  await openImport(page);
  await textField(page).fill(linssoppa);
  await page.keyboard.press("Escape");
  await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Fortsätt ändra" }).click();
  await expect(textField(page)).toHaveValue(linssoppa);
  await sheet(page).getByRole("button", { name: "Stäng" }).click();
  await sheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
  await expect(sheet(page)).toBeHidden();
});

test("an empty title or step and a time that is not a number are pointed out", async ({ page }) => {
  await openImport(page);
  await parse(page, linssoppa);
  await expect(sheet(page).locator("[data-valid=true]")).toHaveCount(1);
  await sheet(page).getByLabel("Titel").fill(" ");
  await expect(sheet(page).getByText("Ange en titel.")).toBeVisible();
  await sheet(page).getByLabel("Steg 2").fill("");
  await expect(sheet(page).getByText("Skriv vad steget gör.")).toBeVisible();
  await expect(sheet(page).locator("[data-valid=false]")).toHaveCount(1);
});

test("the text field stops at 12 000 characters and says so", async ({ page }) => {
  await openImport(page);
  await textField(page).fill("a".repeat(11_000));
  await expect(sheet(page).getByText("11 000 av 12 000 tecken")).toBeVisible();
  await textField(page).fill("a".repeat(12_500));
  await expect(textField(page)).toHaveValue("a".repeat(12_000));
  await expect(sheet(page).getByText(/^Texten får vara högst 12 000 tecken/)).toBeVisible();
});

const failures = [
  {
    code: "ai_unavailable",
    message: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
    retry: true,
  },
  {
    code: "ai_invalid",
    message: "Det gick inte att tolka svaret. Försök igen eller klistra in texten.",
    retry: true,
  },
  {
    code: "ai_rejected",
    message: "AI-tjänsten tog inte emot förfrågan. Prova med en kortare text eller försök igen senare.",
    retry: false,
  },
  { code: "import_no_recipe", message: "Det gick inte att hitta något recept i texten.", retry: false },
] as const;

for (const { code, message, retry } of failures) {
  test(`${code} shows its message and keeps the text`, async ({ page }) => {
    const text = `matkoll-mock: ${code}`;
    await openImport(page);
    await parse(page, text);

    const alert = sheet(page).getByRole("alert");
    await expect(alert).toHaveText(message);
    await expect(textField(page)).toHaveValue(text);
    const again = sheet(page).getByRole("button", { name: "Försök igen" });
    await expect(again).toHaveCount(retry ? 1 : 0);
    if (retry) {
      await again.click();
      await expect(alert).toHaveText(message);
    }
    // The error goes away once a new text is parsed.
    await parse(page, linssoppa);
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk");
    await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  });
}

const chowMein = "https://www.koket.se/chow-mein-med-lovbiff";

async function parseLink(page: Page, url: string) {
  await linkField(page).fill(url);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
}

test.describe("import from a link", () => {
  test("an approved link becomes a preview with its source", async ({ page }) => {
    const errors = watchErrors(page);
    await openImport(page, "Länk");
    await parseLink(page, chowMein);

    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff");
    await expect(sheet(page).getByText("Källa: koket.se")).toBeVisible();
    await expect(sheet(page).getByText("4 portioner")).toBeVisible();
    await expect(sheet(page).getByLabel("Tid i minuter")).toHaveValue("45");
    await expect(sheet(page).getByTestId("recipe-line")).toHaveCount(19);

    // Back to the link, and to the same preview again.
    await sheet(page).getByRole("button", { name: "Tillbaka till länken" }).click();
    await expect(linkField(page)).toHaveValue(chowMein);
    await expect(linkField(page)).toBeFocused();
    await sheet(page).getByRole("button", { name: "Visa förhandsgranskningen" }).click();
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff");
    expect(errors).toEqual([]);
  });

  test("tasteline.com, and a link that redirects within the site, work too", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.tasteline.com/recept/bakad-fetaost-med-rostad-potatis/");
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Bakad fetaost med rostad potatis");
    await expect(sheet(page).getByText("Källa: tasteline.com")).toBeVisible();

    await sheet(page).getByRole("button", { name: "Tillbaka till länken" }).click();
    await parseLink(page, "https://koket.se/chow-mein-med-lovbiff");
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff");
  });

  test("a site that is not approved is refused, with a way to the settings", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.example.com/recept/kladdkaka");
    await expect(sheet(page).getByRole("alert")).toHaveText("example.com är inte en godkänd receptsajt.");
    await expect(linkField(page)).toHaveValue("https://www.example.com/recept/kladdkaka");
    await sheet(page).getByRole("button", { name: "Öppna inställningar" }).click();
    await expect(page).toHaveURL(/\/installningar$/);
  });

  test("Öppna inställningar asks before it throws away pasted text", async ({ page }) => {
    await openImport(page);
    await textField(page).fill(linssoppa);
    await sheet(page).getByRole("tab", { name: "Länk" }).click();
    await parseLink(page, "https://www.example.com/recept/kladdkaka");
    await sheet(page).getByRole("button", { name: "Öppna inställningar" }).click();
    await expect(sheet(page).getByText("Släng ändringarna?")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Fortsätt ändra" }).click();
    await expect(page).toHaveURL(/\/recept$/);
    await expect(linkField(page)).toBeVisible();

    await sheet(page).getByRole("button", { name: "Öppna inställningar" }).click();
    await sheet(page).getByRole("button", { name: "Släng ändringarna" }).click();
    await expect(page).toHaveURL(/\/installningar$/);
  });

  test("Enter while the page is read does not start a second import", async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route("**/api/ai/import", async (route) => {
      requests++;
      await held;
      await route.continue().catch(() => {});
    });
    await openImport(page, "Länk");
    await parseLink(page, chowMein);
    await expect(sheet(page).getByRole("status").getByText("Läser receptet …")).toBeVisible();
    await linkField(page).press("Enter");
    release();
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff");
    expect(requests).toBe(1);
  });

  test("when the approved sites cannot be read, Försök igen tries again", async ({ page }) => {
    // The settings read cannot fail on its own in E2E, so the answer is simulated in the browser.
    let calls = 0;
    await page.route("**/api/ai/import", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({
          status: 503,
          json: { ok: false, error: { code: "settings_unavailable", message: "" } },
        });
      } else {
        await route.continue();
      }
    });
    await openImport(page, "Länk");
    await parseLink(page, chowMein);
    await expect(sheet(page).getByRole("alert")).toHaveText("Det gick inte att läsa inställningarna. Försök igen.");
    await sheet(page).getByRole("button", { name: "Försök igen" }).click();
    await expect(sheet(page).getByLabel("Titel")).toHaveValue("Chow mein med lövbiff");
    expect(calls).toBe(2);
  });

  test("an address that is not an https link is refused", async ({ page }) => {
    await openImport(page, "Länk");
    for (const url of ["http://www.koket.se/chow-mein-med-lovbiff", "https://127.0.0.1/recept", "chow mein"]) {
      await parseLink(page, url);
      await expect(sheet(page).getByRole("alert")).toHaveText(
        "Det där ser inte ut som en länk till en receptsida. Kopiera hela adressen, som börjar med https://.",
      );
    }
  });

  for (const { name, url, message } of [
    { name: "a site that refuses", url: "https://www.koket.se/matkoll-test/blockerad", message: "koket.se släppte inte in oss." },
    {
      name: "a page without a recipe",
      url: "https://www.koket.se/matkoll-test/inget-recept",
      message: "Det gick inte att hitta något recept på sidan.",
    },
    // The saved site never answers, so this one waits for safeFetch's 10 s.
    { name: "a site that does not answer in time", url: "https://www.koket.se/matkoll-test/langsam", message: "koket.se svarade inte i tid." },
    { name: "a page over 3 MB", url: "https://www.koket.se/matkoll-test/for-stor", message: "Sidan är för stor för att läsas." },
  ]) {
    test(`${name} offers to paste the text instead`, async ({ page }) => {
      await openImport(page, "Länk");
      await parseLink(page, url);
      // Longer than safeFetch's 10 s, for the site that never answers.
      await expect(sheet(page).getByRole("alert")).toHaveText(message, { timeout: 15_000 });
      await sheet(page).getByRole("button", { name: "Klistra in text i stället" }).click();
      await expect(sheet(page).getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
      await expect(textField(page)).toBeFocused();

      // The text tab works as usual from there.
      await parse(page, linssoppa);
      await expect(sheet(page).getByLabel("Titel")).toHaveValue("Röd linssoppa med kokosmjölk");
      await sheet(page).getByRole("button", { name: "Tillbaka till texten" }).click();
      await expect(textField(page)).toHaveValue(linssoppa);
    });
  }

  test("a redirect to another site is refused", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.koket.se/matkoll-test/annan-sajt");
    await expect(sheet(page).getByRole("alert")).toHaveText("example.com är inte en godkänd receptsajt.");
  });

  test("Klistra in länk reads the clipboard only when tapped, if the browser allows it", async ({ page, context }) => {
    await openImport(page, "Länk");
    // Without permission nothing happens.
    await context.clearPermissions();
    await sheet(page).getByRole("button", { name: "Klistra in länk" }).click();
    await expect(linkField(page)).toHaveValue("");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate((url) => navigator.clipboard.writeText(`  ${url}\n`), chowMein);
    await expect(linkField(page)).toHaveValue("");
    await sheet(page).getByRole("button", { name: "Klistra in länk" }).click();
    await expect(linkField(page)).toHaveValue(chowMein);

    // A link that is too long is not cut; it is not used, and the sheet says why.
    await linkField(page).fill("");
    await page.evaluate((url) => navigator.clipboard.writeText(url), `${chowMein}?${"a".repeat(2_100)}`);
    await sheet(page).getByRole("button", { name: "Klistra in länk" }).click();
    await expect(sheet(page).getByText(/^Länken i urklippet är längre än 2 048 tecken/)).toBeVisible();
    await expect(linkField(page)).toHaveValue("");
  });
});

test.describe("desktop, 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the + is in the page header and the sheet is a dialog of at most 560 px", async ({ page }) => {
    await openImport(page);
    const box = await sheet(page).boundingBox();
    expect(box?.width).toBeLessThanOrEqual(560);
    await parse(page, linssoppa);
    await expect(line(page, "2 gula lökar").getByText("Kontrollera")).toBeVisible();
  });
});

test.describe("/api/ai/import without access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("answers 401 without a session", async ({ request }) => {
    const response = await request.post("/api/ai/import", { data: { kind: "text", text: linssoppa } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Du behöver logga in." },
    });
  });
});

test.describe("/api/ai/import for an address outside ALLOWED_EMAILS", () => {
  test.use({ storageState: outsiderStorageState });

  test("answers 401", async ({ request }) => {
    const response = await request.post("/api/ai/import", { data: { kind: "text", text: linssoppa } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });
});

test.describe("/api/ai/import signed in", () => {
  test("answers a draft and never writes, and rejects an invalid body", async ({ request }) => {
    const count = () =>
      adminClient().from("ingredient").select("id", { count: "exact", head: true }).eq("user_id", e2eUserId);
    const before = await count();
    const response = await request.post("/api/ai/import", { data: { kind: "text", text: linssoppa } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { draft: { title: "Röd linssoppa med kokosmjölk", sourceKind: "text" } } });
    expect(Object.values(body.data.ingredientNames)).toEqual(expect.arrayContaining(["Gul lök", "Vitlök"]));
    const after = await count();
    expect(before.count).toBeGreaterThan(0);
    expect(after.count).toBe(before.count);

    const invalid = await request.post("/api/ai/import", { data: { kind: "text", text: "  " } });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  test("answers a link with the page's draft and its source", async ({ request }) => {
    const response = await request.post("/api/ai/import", { data: { kind: "url", url: chowMein } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        draft: {
          title: "Chow mein med lövbiff",
          sourceKind: "url",
          sourceUrl: chowMein,
          imageUrl: "https://img.koket.se/standard-mega/chow-mein-med-lovbiff-filip-poons-recept.png.jpg",
        },
      },
    });
  });

  for (const { name, url, status, code, fields } of [
    { name: "a site that is not approved", url: "https://www.example.org/recept/x", status: 422, code: "fetch_domain_not_allowed", fields: { domain: "example.org" } },
    { name: "an http link", url: "http://www.koket.se/x", status: 422, code: "fetch_invalid_url", fields: undefined },
    { name: "a site that refuses", url: "https://www.koket.se/matkoll-test/blockerad", status: 502, code: "fetch_blocked", fields: { domain: "koket.se" } },
  ]) {
    test(`answers ${name} with ${status} ${code}`, async ({ request }) => {
      const response = await request.post("/api/ai/import", { data: { kind: "url", url } });
      expect(response.status()).toBe(status);
      const body = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code } });
      expect(body.error.fields).toEqual(fields);
    });
  }
});
