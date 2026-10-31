import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { adminClient, importEmail, importStorageState, outsiderStorageState } from "./support";

// Story 1.6, 1.8 and 1.9: importing a recipe from pasted text, a link or a photo, with
// AI_PROVIDER=mock. Since Story 12.6 an import is an AI job (POST /api/ai/jobs and
// /api/ai/jobs/photo), which the mock answers after AI_MOCK_DELAY_MS (3 s). In CI this runs against the built server (`pnpm build &&
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
  const user = data.users.find((candidate) => candidate.email === importEmail);
  if (!user) throw new Error(`${importEmail} is missing; global-setup creates it`);
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

test.use({ storageState: importStorageState, viewport: mobile });
// One user for all the tests, which empty its recipes and catalog first: they must not run at the same time.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedCatalog();
});

// The queue takes three active jobs; each test starts with none.
test.beforeEach(async () => {
  // Children before parents. An import saves its recipe (Story 1.15), so each test starts without
  // recipes. The catalog is only added to: service_role may not delete ingredients.
  const admin = adminClient();
  for (const table of ["ai_job", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", e2eUserId);
    if (error) throw error;
  }
  await seedCatalog();
});

/** The states of the E2E user's import jobs, oldest first. */
async function jobStatuses(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("ai_job")
    .select("status")
    .eq("user_id", e2eUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => row.status);
}

/** Starts an import job through the route and waits for its end: the draft, or the job's error code. */
async function runImportJob(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ draft: unknown; ingredientNames: Record<string, string> } | { errorCode: string }> {
  const started = await request.post("/api/ai/jobs", { data: { kind: "import", clientKey: crypto.randomUUID(), ...data } });
  expect(started.status()).toBe(202);
  const { id } = (await started.json()).data.job as { id: string };
  let errorCode: string | null = null;
  await expect
    .poll(
      async () => {
        const result = await request.get(`/api/ai/jobs/${id}`);
        if (result.status() === 200) return "done";
        const list = (await (await request.get("/api/ai/jobs")).json()).data.jobs as { id: string; status: string; errorCode: string | null }[];
        const job = list.find((candidate) => candidate.id === id);
        if (job?.status === "failed") {
          errorCode = job.errorCode;
          return "failed";
        }
        return "waiting";
      },
      { timeout: 20_000, intervals: [500] },
    )
    .not.toBe("waiting");
  if (errorCode !== null) return { errorCode };
  return (await (await request.get(`/api/ai/jobs/${id}`)).json()).data.result;
}

test("the sheet opens on the Länk tab, with Text and Foto beside it", async ({ page }) => {
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
  await expect(sheet(page).getByRole("tabpanel")).toContainText("Bilden sparas inte.");
  await expect(sheet(page).getByRole("button", { name: "Välj bild" })).toBeVisible();
  await expect(tolka).toHaveCount(0);
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

test("pasted text is saved by itself, with the catalog's matches and new ingredients' suggestions, and Öppna shows it", async ({ page }) => {
  const errors = watchErrors(page);
  await openImport(page);
  await parse(page, linssoppa);
  await expect(sheet(page).getByText("Läser receptet …").first()).toBeVisible();

  // No preview: the sheet closes and the recipe is in the library (Story 1.15).
  await expect(sheet(page)).toHaveCount(0, { timeout: 20_000 });
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("Receptet Röd linssoppa med kokosmjölk är sparat");
  await expect(toast.getByRole("button", { name: "Ångra" })).toBeVisible();
  await expect(page.getByTestId("recipe-card").filter({ hasText: "Röd linssoppa med kokosmjölk" })).toHaveCount(1);

  const { data: recipes, error } = await adminClient()
    .from("recipe")
    .select("id, original_servings, total_minutes, source_kind, recipe_ingredient(ingredient_id)")
    .eq("user_id", e2eUserId);
  if (error) throw error;
  expect(recipes).toHaveLength(1);
  expect(recipes[0]).toMatchObject({ original_servings: 6, total_minutes: 30, source_kind: "text" });
  expect(recipes[0].recipe_ingredient).toHaveLength(12);

  // Matched through the AI's name: no copy of "Gul lök". No catalog row: a new one with its section, place and unit.
  const { data: catalog, error: catalogError } = await adminClient()
    .from("ingredient")
    .select("name, section, location, default_unit")
    .eq("user_id", e2eUserId);
  if (catalogError) throw catalogError;
  expect(catalog.filter((row) => row.name === "Gul lök")).toHaveLength(1);
  const carrot = catalog.find((row) => /^Morot/.test(row.name));
  expect(carrot).toBeDefined();
  expect(carrot?.section).toBeTruthy();
  expect(carrot?.location).toBeTruthy();
  expect(carrot?.default_unit).toBeTruthy();

  // Öppna opens the recipe, where "Ändra recept" is.
  await toast.getByRole("button", { name: "Öppna" }).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Röd linssoppa med kokosmjölk" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Avbryt stops the import and goes back to the text without an error", async ({ page }) => {
  const errors = watchErrors(page);
  await openImport(page);
  await parse(page, linssoppa);
  await expect(sheet(page).getByRole("status").getByText("Läser receptet …").first()).toBeVisible();
  await expect(sheet(page).getByText("Du kan göra annat under tiden.")).toBeVisible();
  await expect(textField(page)).toHaveValue(linssoppa);
  await sheet(page).getByRole("button", { name: "Avbryt" }).click();

  await expect(sheet(page).getByText("Läser receptet …")).toHaveCount(0);
  await expect(textField(page)).toHaveValue(linssoppa);
  await expect(textField(page)).toBeFocused();
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await expect(sheet(page).getByLabel("Titel")).toHaveCount(0);
  // The job is stopped, not just forgotten: it is cancelled, and no draft comes after the mock's 3 s.
  await expect.poll(jobStatuses).toEqual(["cancelled"]);
  await page.waitForTimeout(4_500);
  await expect(sheet(page).getByLabel("Titel")).toHaveCount(0);
  expect(await jobStatuses()).toEqual(["cancelled"]);
  expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
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
    await expect(page.getByTestId("toast")).toContainText("Receptet Röd linssoppa med kokosmjölk är sparat", { timeout: 20_000 });
    await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  });
}

const chowMein = "https://www.koket.se/chow-mein-med-lovbiff";

async function parseLink(page: Page, url: string) {
  await linkField(page).fill(url);
  await sheet(page).getByRole("button", { name: "Tolka" }).click();
}

test.describe("import from a link", () => {
  test("an approved link is saved with its source, and the sheet closes", async ({ page }) => {
    const errors = watchErrors(page);
    await openImport(page, "Länk");
    await parseLink(page, chowMein);

    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
    await expect(sheet(page)).toHaveCount(0);
    const { data, error } = await adminClient()
      .from("recipe")
      .select("original_servings, total_minutes, source_kind, source_url, recipe_ingredient(ingredient_id)")
      .eq("user_id", e2eUserId)
      .single();
    if (error) throw error;
    expect(data).toMatchObject({ original_servings: 4, total_minutes: 45, source_kind: "url" });
    expect(data.source_url).toContain("koket.se");
    expect(data.recipe_ingredient).toHaveLength(19);
    expect(errors).toEqual([]);
  });

  test("tasteline.com, and a link that redirects within the site, work too", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.tasteline.com/recept/bakad-fetaost-med-rostad-potatis/");
    await expect(page.getByTestId("toast")).toContainText("Receptet Bakad fetaost med rostad potatis är sparat", { timeout: 20_000 });
    await expect(sheet(page)).toHaveCount(0);

    await openImport(page, "Länk");
    await parseLink(page, "https://koket.se/chow-mein-med-lovbiff");
    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
  });

  test("a site that is not approved is refused, with a way to the settings", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.example.com/recept/kladdkaka");
    await expect(sheet(page).getByRole("alert")).toHaveText("example.com är inte en godkänd receptsajt.");
    await expect(linkField(page)).toHaveValue("https://www.example.com/recept/kladdkaka");
    await sheet(page).getByRole("button", { name: "Öppna inställningar" }).click();
    await expect(page).toHaveURL(/\/installningar$/);
  });

  // Story 1.13: /recept/importera reads the link in the browser after mount.
  test("/recept/importera?url= saves the recipe in the library, with Öppna and Ångra, and the link is spent", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/recept/importera?url=${encodeURIComponent(chowMein)}`);
    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
    await expect(page.getByTestId("toast").getByRole("button", { name: "Öppna" })).toBeVisible();
    await expect(page.getByTestId("toast").getByRole("button", { name: "Ångra" })).toBeVisible();
    await expect(page).toHaveURL(/\/recept$/);
    await expect(page.getByTestId("recipe-card").filter({ hasText: "Chow mein med lövbiff" })).toHaveCount(1);
    // One recipe only (the job is closed by now), also in dev's Strict Mode.
    const { count } = await adminClient().from("recipe").select("id", { count: "exact", head: true }).eq("user_id", e2eUserId);
    expect(count).toBe(1);

    // Ångra removes it again.
    await page.getByTestId("toast").getByRole("button", { name: "Ångra" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Receptet är borttaget.");
    await expect(page.getByTestId("recipe-card")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("/recept/importera takes the address from text, like Android's share menu", async ({ page }) => {
    await page.goto(`/recept/importera?text=${encodeURIComponent(`Kolla detta! ${chowMein}`)}`);
    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
  });

  test("/recept/importera with an unapproved site says so, and without a usable link asks for one", async ({ page }) => {
    await page.goto(`/recept/importera?url=${encodeURIComponent("https://www.example.com/recept/kladdkaka")}`);
    await expect(sheet(page).getByRole("alert")).toHaveText("example.com är inte en godkänd receptsajt.");

    await page.goto(`/recept/importera?url=${encodeURIComponent("http://www.koket.se/chow-mein-med-lovbiff")}`);
    await expect(sheet(page).getByRole("alert")).toContainText("börjar med https://");
    await page.goto("/recept/importera");
    await expect(sheet(page).getByRole("alert")).toContainText("börjar med https://");
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
    let requests = 0;
    await page.route("**/api/ai/jobs", async (route) => {
      if (route.request().method() === "POST") requests++;
      await route.continue();
    });
    await openImport(page, "Länk");
    await parseLink(page, chowMein);
    await expect(sheet(page).getByRole("status").getByText("Läser receptet …").first()).toBeVisible();
    await linkField(page).press("Enter");
    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
    expect(requests).toBe(1);
    const { count } = await adminClient().from("recipe").select("id", { count: "exact", head: true }).eq("user_id", e2eUserId);
    expect(count).toBe(1);
  });

  test("when the approved sites cannot be read, Försök igen tries again", async ({ page }) => {
    // The settings read cannot fail on its own in E2E, so the answer is simulated in the browser.
    let calls = 0;
    await page.route("**/api/ai/jobs", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
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
    await expect(page.getByTestId("toast")).toContainText("Receptet Chow mein med lövbiff är sparat", { timeout: 20_000 });
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
      await expect(page.getByTestId("toast")).toContainText("Receptet Röd linssoppa med kokosmjölk är sparat", { timeout: 20_000 });
    });
  }

  test("a redirect to another site is refused", async ({ page }) => {
    await openImport(page, "Länk");
    await parseLink(page, "https://www.koket.se/matkoll-test/annan-sajt");
    // The job's own error has no site: the redirect's target is not the one Pontus gave.
    await expect(sheet(page).getByRole("alert")).toHaveText("Sajten är inte en godkänd receptsajt.");
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
    // No preview since Story 1.15: the sheet closes on the saved recipe.
    await expect(page.getByTestId("toast")).toContainText("Receptet Röd linssoppa med kokosmjölk är sparat", { timeout: 20_000 });
  });
});

const textJob = { source: "text", text: linssoppa };

test.describe("/api/ai/jobs, kind import, without access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("answers 401 without a session", async ({ request }) => {
    const response = await request.post("/api/ai/jobs", { data: { kind: "import", clientKey: crypto.randomUUID(), ...textJob } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Du behöver logga in." },
    });
  });
});

test.describe("/api/ai/jobs, kind import, for an address outside ALLOWED_EMAILS", () => {
  test.use({ storageState: outsiderStorageState });

  test("answers 401", async ({ request }) => {
    const response = await request.post("/api/ai/jobs", { data: { kind: "import", clientKey: crypto.randomUUID(), ...textJob } });
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });
});

test.describe("/api/ai/jobs, kind import, signed in", () => {
  test("answers 202 at once, gives a draft in the end and saves the recipe under the job's id", async ({ request }) => {
    const started = Date.now();
    const response = await request.post("/api/ai/jobs", { data: { kind: "import", clientKey: crypto.randomUUID(), ...textJob } });
    expect(response.status()).toBe(202);
    // Well before the mock's 3 s: the AI works in the background.
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(await response.json()).toMatchObject({ ok: true, data: { job: { kind: "import", context: { source: "text" } } } });
    await expect.poll(jobStatuses, { timeout: 20_000 }).toEqual(["done"]);

    const done = await runImportJob(request, textJob);
    expect(done).toMatchObject({ draft: { title: "Röd linssoppa med kokosmjölk", sourceKind: "text" } });
    expect(Object.values((done as { ingredientNames: Record<string, string> }).ingredientNames)).toEqual(
      expect.arrayContaining(["Gul lök", "Vitlök"]),
    );
    // Story 1.15: the job saved the recipe, and its id is the job's id.
    const savedId = (done as { savedRecipeId?: string }).savedRecipeId;
    expect(savedId).toBeDefined();
    const { data: saved } = await adminClient().from("recipe").select("id").eq("user_id", e2eUserId).eq("id", savedId!);
    expect(saved).toHaveLength(1);
  });

  test("refuses an empty text and one over 12 000 characters at once, without a job", async ({ request }) => {
    for (const text of ["  ", "a".repeat(13_000)]) {
      const response = await request.post("/api/ai/jobs", {
        data: { kind: "import", clientKey: crypto.randomUUID(), source: "text", text },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(await jobStatuses()).toEqual([]);
  });

  test("keeps only the domain of a link in the job, never the link", async ({ request }) => {
    expect(await runImportJob(request, { source: "url", url: chowMein })).toMatchObject({
      draft: {
        title: "Chow mein med lövbiff",
        sourceKind: "url",
        sourceUrl: chowMein,
        imageUrl: "https://img.koket.se/standard-mega/chow-mein-med-lovbiff-filip-poons-recept.png.jpg",
      },
    });
    const { data, error } = await adminClient().from("ai_job").select("context").eq("user_id", e2eUserId);
    if (error) throw error;
    expect(data).toEqual([{ context: { source: "url", domain: "koket.se" } }]);
  });

  for (const { name, url, status, code, fields } of [
    { name: "a site that is not approved", url: "https://www.example.org/recept/x", status: 422, code: "fetch_domain_not_allowed", fields: { domain: "example.org" } },
    { name: "an http link", url: "http://www.koket.se/x", status: 422, code: "fetch_invalid_url", fields: undefined },
    { name: "text that is not a link", url: "koket", status: 422, code: "fetch_invalid_url", fields: undefined },
  ]) {
    test(`answers ${name} at once with ${status} ${code}, without a job`, async ({ request }) => {
      const response = await request.post("/api/ai/jobs", {
        data: { kind: "import", clientKey: crypto.randomUUID(), source: "url", url },
      });
      expect(response.status()).toBe(status);
      const body = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code } });
      expect(body.error.fields).toEqual(fields);
      expect(await jobStatuses()).toEqual([]);
    });
  }

  test("a site that refuses makes the job fail with fetch_blocked", async ({ request }) => {
    expect(await runImportJob(request, { source: "url", url: "https://www.koket.se/matkoll-test/blockerad" })).toEqual({
      errorCode: "fetch_blocked",
    });
  });

  test("a fourth job is refused with ai_queue_full while three are active", async ({ request }) => {
    for (let index = 0; index < 3; index++) {
      const response = await request.post("/api/ai/jobs", {
        data: { kind: "import", clientKey: crypto.randomUUID(), source: "text", text: `${linssoppa} ${index}` },
      });
      expect(response.status()).toBe(202);
    }
    const fourth = await request.post("/api/ai/jobs", {
      data: { kind: "import", clientKey: crypto.randomUUID(), source: "text", text: linssoppa },
    });
    expect(await fourth.json()).toMatchObject({ ok: false, error: { code: "ai_queue_full" } });
    await expect.poll(jobStatuses, { timeout: 30_000 }).toEqual(["done", "done", "done"]);
  });
});

// Story 1.9: a photo of a cookbook page. The fixture PNG already fits (768 × 942
// px, 110 kB), so the client sends it as it is and the mock answers it by its
// bytes; the reserved PNGs make the mock fail with an error code the same way.

const photoPath = "tests/fixtures/ai/ugnspannkaka.png";
const photoRoute = "**/api/ai/jobs/photo";

/** Opens the Foto tab and chooses `files` with "Välj bild", through the browser's file chooser. */
async function choosePhoto(page: Page, files: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]) {
  const tab = sheet(page).getByRole("tab", { name: "Foto" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  const chooser = page.waitForEvent("filechooser");
  await sheet(page).getByRole("button", { name: "Välj bild" }).click();
  await (await chooser).setFiles(files);
}

/** The width and height in a JPEG's frame header (SOF0–SOF15, except DHT, JPG and DAC). */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1];
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("no frame header");
}

/** The file in a multipart/form-data body's `image` field. */
function imageFromMultipart(body: Buffer, contentType: string): Buffer {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  if (!boundary) throw new Error("no boundary");
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const start = body.indexOf(delimiter);
  const headerEnd = body.indexOf("\r\n\r\n", start);
  if (!body.subarray(start, headerEnd).toString().includes('name="image"')) throw new Error("no image field");
  const end = body.indexOf(Buffer.concat([Buffer.from("\r\n"), delimiter]), headerEnd);
  return body.subarray(headerEnd + 4, end);
}

/**
 * A camera-sized JPEG of about 6 MB, 4000 × 3000 px, made in the browser, with
 * EXIF orientation 6 (turned 90° clockwise), so it shows as 3000 × 4000.
 */
async function largeCameraPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(4000, 3000);
    // A page-like light background with fine noise, so the JPEG is large. The noise
    // comes from a fixed-seed generator (mulberry32), so every run sends the same photo.
    let seed = 0x6d61746b;
    const next = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let index = 0; index < image.data.length; index += 4) {
      const shade = 225 + Math.floor(next() * 30);
      image.data[index] = shade;
      image.data[index + 1] = shade - 5;
      image.data[index + 2] = shade - 15;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    context.fillStyle = "black";
    context.font = "120px serif";
    for (let line = 0; line < 20; line++) context.fillText("Ugnspannkaka med bacon", 200, 200 + line * 140);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  });
  const jpeg = Buffer.from(base64, "base64");
  // APP1 "Exif" with a big-endian TIFF header and one IFD entry: Orientation (0x0112) = 6.
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, payload, jpeg.subarray(2)]);
}

test.describe("import from a photo", () => {
  test("the photo is saved by itself as a recipe from 'Foto av kokbok'", async ({ page }) => {
    const errors = watchErrors(page);
    await openImport(page, "Länk");
    await choosePhoto(page, photoPath);

    await expect(page.getByTestId("toast")).toContainText("Receptet Ugnspannkaka med bacon är sparat", { timeout: 20_000 });
    await expect(sheet(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the saved recipe has the photo as its source and no image", async ({ page }) => {
    await openImport(page, "Länk");
    await choosePhoto(page, photoPath);
    await expect(page.getByTestId("toast")).toContainText("Receptet Ugnspannkaka med bacon är sparat", { timeout: 20_000 });
    await page.getByTestId("toast").getByRole("button", { name: "Öppna" }).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop();
    const { data, error } = await adminClient().from("recipe").select("source_kind, source_url, image_url").eq("id", id).single();
    if (error) throw error;
    expect(data).toEqual({ source_kind: "photo", source_url: null, image_url: null });
    await expect(page.getByText("Foto av kokbok")).toBeVisible();
  });

  test("a large camera photo is sent as a JPEG of at most 1600 px and 1.5 MB, turned the right way", async ({ page }) => {
    await openImport(page, "Länk");
    const photo = await largeCameraPhoto(page);
    expect(photo.length).toBeGreaterThan(4 * 1024 * 1024);
    expect(jpegSize(photo)).toEqual({ width: 4000, height: 3000 });

    // Read from the route: a large body is not kept on the request event.
    const sent: { body: Buffer; contentType: string }[] = [];
    await page.route(photoRoute, async (route) => {
      const request = route.request();
      sent.push({ body: request.postDataBuffer()!, contentType: (await request.allHeaders())["content-type"] });
      await route.continue();
    });
    await choosePhoto(page, { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: photo });
    await expect.poll(() => sent.length).toBe(1);
    const { body, contentType } = sent[0];
    const image = imageFromMultipart(body, contentType);
    expect(image.length).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    expect(body.length).toBeLessThan(2 * 1024 * 1024);
    expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // EXIF orientation 6 is applied: the landscape sensor image becomes a portrait page.
    expect(jpegSize(image)).toEqual({ width: 1200, height: 1600 });
    // Unknown bytes to the mock: its default recipe, still from a photo, saved by itself.
    await expect(page.getByTestId("toast")).toContainText("är sparat", { timeout: 20_000 });
  });

  test("a file that cannot be read is not sent", async ({ page }) => {
    let requests = 0;
    await page.route(photoRoute, async (route) => {
      requests++;
      await route.continue();
    });
    await openImport(page, "Länk");
    // HEIC from an iPhone, which Chrome on a desktop cannot decode.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(2048, 7)]);
    await choosePhoto(page, { name: "IMG_0002.HEIC", mimeType: "image/heic", buffer: heic });
    await expect(sheet(page).getByRole("alert")).toHaveText("Bildformatet stöds inte. Välj en JPEG-, PNG- eller WebP-bild.");
    await expect(sheet(page).getByRole("button", { name: "Försök igen" })).toHaveCount(0);
    expect(requests).toBe(0);

    // Another photo works as usual from there.
    await choosePhoto(page, photoPath);
    await expect(page.getByTestId("toast")).toContainText("Receptet Ugnspannkaka med bacon är sparat", { timeout: 20_000 });
  });

  const unreadable = "Det gick inte att tolka bilden. Ta en ny bild, välj en annan eller klistra in texten.";
  const photoFailures = [
    { code: "import_no_recipe", message: unreadable, retry: true, otherWays: true },
    { code: "ai_invalid", message: unreadable, retry: true, otherWays: true },
    { code: "ai_unavailable", message: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?", retry: true, otherWays: false },
    {
      code: "ai_rejected",
      message: "AI-tjänsten tog inte emot bilden. Prova en tydligare bild eller försök igen senare.",
      retry: false,
      otherWays: false,
    },
  ] as const;

  for (const { code, message, retry, otherWays } of photoFailures) {
    test(`${code} for a photo shows its message${retry ? " and sends the same photo again" : ""}`, async ({ page }) => {
      const reserved = `tests/fixtures/ai/reserved-${code}.png`;
      let requests = 0;
      await page.route(photoRoute, async (route) => {
        requests++;
        await route.continue();
      });
      await openImport(page, "Länk");
      await choosePhoto(page, reserved);
      const alert = sheet(page).getByRole("alert");
      await expect(alert).toHaveText(message);
      const again = sheet(page).getByRole("button", { name: "Försök igen" });
      await expect(again).toHaveCount(retry ? 1 : 0);
      await expect(sheet(page).getByRole("button", { name: "Välj en annan bild" })).toHaveCount(otherWays ? 1 : 0);
      await expect(sheet(page).getByRole("button", { name: "Klistra in text i stället" })).toHaveCount(otherWays ? 1 : 0);
      if (retry) {
        await again.click();
        // The same photo again, from memory, without choosing a file: the mock knows it by its bytes.
        await expect.poll(() => requests).toBe(2);
        await expect(alert).toHaveText(message);
      }
      // The error goes away with a photo that works.
      await choosePhoto(page, photoPath);
      await expect(page.getByTestId("toast")).toContainText("Receptet Ugnspannkaka med bacon är sparat", { timeout: 20_000 });
      await expect(sheet(page).getByRole("alert")).toHaveCount(0);
    });
  }

  test("a photo without a recipe offers another photo or pasting the text instead", async ({ page }) => {
    await openImport(page, "Länk");
    await choosePhoto(page, "tests/fixtures/ai/reserved-import_no_recipe.png");
    await expect(sheet(page).getByRole("alert")).toHaveText(unreadable);

    // "Välj en annan bild" opens the file picker again, from the photo tab's button.
    const chooser = page.waitForEvent("filechooser");
    await sheet(page).getByRole("button", { name: "Välj en annan bild" }).click();
    await (await chooser).setFiles([]);
    await expect(sheet(page).getByRole("button", { name: "Välj bild" })).toBeFocused();

    await sheet(page).getByRole("button", { name: "Klistra in text i stället" }).click();
    await expect(sheet(page).getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
    await expect(textField(page)).toBeFocused();
  });

  test("Avbryt stops the photo import without an error", async ({ page }) => {
    const errors = watchErrors(page);
    await openImport(page, "Länk");
    await choosePhoto(page, photoPath);
    await expect(sheet(page).getByRole("status").getByText("Läser receptet …").first()).toBeVisible();
    await sheet(page).getByRole("button", { name: "Avbryt" }).click();

    await expect(sheet(page).getByText("Läser receptet …")).toHaveCount(0);
    await expect(sheet(page).getByRole("alert")).toHaveCount(0);
    await expect(sheet(page).getByLabel("Titel")).toHaveCount(0);
    await expect(sheet(page).getByRole("button", { name: "Välj bild" })).toBeFocused();
    await expect.poll(jobStatuses).toEqual(["cancelled"]);
    expect(errors.filter((error) => !error.includes("Failed to load resource"))).toEqual([]);
  });

});

test.describe("import from a photo on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("Fotografera sidan opens the back camera; Välj bild is there too", async ({ page }) => {
    await openImport(page, "Länk");
    await sheet(page).getByRole("tab", { name: "Foto" }).click();
    const chooser = page.waitForEvent("filechooser");
    await sheet(page).getByRole("button", { name: "Fotografera sidan" }).click();
    const camera = await chooser;
    expect(await camera.element().getAttribute("capture")).toBe("environment");
    expect(await camera.element().getAttribute("accept")).toBe("image/*");
    await camera.setFiles(photoPath);
    await expect(page.getByTestId("toast")).toContainText("Receptet Ugnspannkaka med bacon är sparat", { timeout: 20_000 });

    await openImport(page, "Länk");
    await sheet(page).getByRole("tab", { name: "Foto" }).click();
    const picker = page.waitForEvent("filechooser");
    await sheet(page).getByRole("button", { name: "Välj bild" }).click();
    expect(await (await picker).element().getAttribute("capture")).toBeNull();
  });
});

/** A multipart form for a photo job. */
const photoJob = (buffer: Buffer, name = "photo.png", mimeType = "image/png") => ({
  kind: "import",
  clientKey: crypto.randomUUID(),
  image: { name, mimeType, buffer },
});

test.describe("/api/ai/jobs/photo without access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("answers 401 without a session", async ({ request }) => {
    const response = await request.post("/api/ai/jobs/photo", { multipart: photoJob(readFileSync(photoPath)) });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "unauthorized", message: "Du behöver logga in." } });
  });
});

test.describe("/api/ai/jobs/photo signed in", () => {
  test("answers 202, reads the photo in the background, saves the recipe, and keeps no photo in the job", async ({ request }) => {
    const response = await request.post("/api/ai/jobs/photo", {
      multipart: photoJob(readFileSync(photoPath), "photo.jpg", "image/jpeg"),
    });
    expect(response.status()).toBe(202);
    const { id } = (await response.json()).data.job as { id: string };
    await expect.poll(jobStatuses, { timeout: 20_000 }).toEqual(["done"]);
    const result = await request.get(`/api/ai/jobs/${id}`);
    expect(await result.json()).toMatchObject({
      ok: true,
      data: { result: { draft: { title: "Ugnspannkaka med bacon", sourceKind: "photo", sourceUrl: null, imageUrl: null } } },
    });
    const { data, error } = await adminClient().from("ai_job").select("context").eq("user_id", e2eUserId);
    if (error) throw error;
    expect(data).toEqual([{ context: { source: "photo" } }]);
    const { data: recipes } = await adminClient().from("recipe").select("id").eq("user_id", e2eUserId).eq("id", id);
    expect(recipes).toHaveLength(1);
  });

  test("answers an image over 1.5 MB with 413 image_too_large, without a job", async ({ request }) => {
    // About 1.6 MB: under the 2 MB request limit, so the image's own size check answers.
    const big = Buffer.concat([readFileSync(photoPath), Buffer.alloc(1.6 * 1024 * 1024 - 110_000)]);
    const response = await request.post("/api/ai/jobs/photo", { multipart: photoJob(big) });
    expect(response.status()).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "image_too_large", message: "Bilden är för stor. Ta en ny bild eller välj en mindre bild." },
    });
    expect(await jobStatuses()).toEqual([]);
  });

  test("answers a text file with 415 image_unsupported, even when it says it is a JPEG", async ({ request }) => {
    const response = await request.post("/api/ai/jobs/photo", {
      multipart: photoJob(Buffer.from(kycklinggryta), "recept.jpg", "image/jpeg"),
    });
    expect(response.status()).toBe(415);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "image_unsupported", message: "Bildformatet stöds inte. Välj en JPEG-, PNG- eller WebP-bild." },
    });
  });
});
