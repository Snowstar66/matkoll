import { expect, type Page, test } from "@playwright/test";
import { adminClient, e2eUserId, recipeTimerEmail, recipeTimerStorageState } from "./support";

// A time in a recipe step starts a timer. The spec has an E2E user of its own
// (recipeTimerEmail); its recipe is made with the service role.

const mobile = { width: 390, height: 844 };
const title = "Timergryta";
const screenshot = process.env.TIMER_SHOT;

test.use({ storageState: recipeTimerStorageState, viewport: mobile });

let recipeId = "";

test.beforeEach(async () => {
  const userId = await e2eUserId(recipeTimerEmail);
  const admin = adminClient();
  for (const table of ["meal_plan_recipe", "meal_plan", "recipe_ingredient", "recipe_step", "recipe"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const recipe = await admin
    .from("recipe")
    .insert({ user_id: userId, title, original_servings: 4, total_minutes: 30, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  recipeId = (recipe.data as { id: string }).id;
  const steps = await admin.from("recipe_step").insert(
    ["Skär löken.", "Koka i 10 minuter.", "Ugnen på 180 grader i 1 timme."].map((text, position) => ({
      user_id: userId,
      recipe_id: recipeId,
      position,
      text,
    })),
  );
  if (steps.error) throw steps.error;
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("tapping a time in a step starts a timer that counts down and can be stopped", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // Only times are buttons: not "180 grader", and not the other steps.
  await expect(page.getByRole("button", { name: /^Starta timer/ })).toHaveCount(2);
  await expect(page.getByTestId("timer-bar")).toHaveCount(0);

  await page.getByRole("button", { name: "Starta timer 10 minuter" }).click();
  const row = page.getByTestId("timer-row");
  await expect(row).toHaveCount(1);
  // What the timer is for (the step's verb, as the recipe has no ingredients) over its step.
  await expect(row.getByTestId("timer-cue")).toHaveText("Koka");
  await expect(row).toContainText("Steg 2");
  await expect(row.getByTestId("timer-time")).toHaveText(/^(10:00|9:5\d)$/);

  // A second timer next to it, and the bar stays at the top when the page is scrolled.
  await page.getByRole("button", { name: "Starta timer 1 timme" }).click();
  await expect(page.getByTestId("timer-row")).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByTestId("timer-bar")).toBeInViewport();
  if (screenshot) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: screenshot });
  }

  // The time is counted from the end time: it is lower a moment later.
  await expect(row.first().getByTestId("timer-time")).not.toHaveText("10:00");

  await page.getByRole("button", { name: "Stoppa timer Koka, Steg 2" }).click();
  await expect(page.getByTestId("timer-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Stoppa timer Ugnen på 180 grader, Steg 3" }).click();
  await expect(page.getByTestId("timer-bar")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Tillval turns the timer off: the time is plain text, and on again it is a button", async ({ page }) => {
  await page.goto("/installningar");
  await page.getByRole("link", { name: "Tillval" }).click();
  await expect(page).toHaveURL(/\/installningar\/tillval$/);
  const timerSwitch = page.getByRole("switch", { name: "Timer i receptet" });
  await expect(timerSwitch).toBeChecked();
  await expect(page.getByRole("switch", { name: "Skärmen släcks inte i receptet" })).toBeChecked();

  await timerSwitch.click();
  await expect(timerSwitch).not.toBeChecked();
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByText("Koka i 10 minuter.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Starta timer/ })).toHaveCount(0);

  await page.goto("/installningar/tillval");
  await page.getByRole("switch", { name: "Timer i receptet" }).click();
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("button", { name: /^Starta timer/ })).toHaveCount(2);
});

test("a finished timer rings, takes more minutes and is answered with the check", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.install();
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await page.getByRole("button", { name: "Starta timer 10 minuter" }).click();
  const row = page.getByTestId("timer-row");
  await expect(row.getByTestId("timer-time")).toBeVisible();

  await page.clock.fastForward("10:01");
  await expect(row.getByRole("status")).toHaveText(/Klar/);
  await expect(row.getByTestId("timer-time")).toHaveCount(0);
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/, "-klar.png") });

  // One more minute: it counts again from now.
  await page.getByRole("button", { name: "1 minut till på Koka, Steg 2" }).click();
  await expect(row.getByTestId("timer-time")).toHaveText(/^(1:00|0:5\d)$/);
  await page.clock.fastForward("01:01");
  await expect(row.getByRole("status")).toHaveText(/Klar/);

  await page.getByRole("button", { name: "Kvittera timer Koka, Steg 2" }).click();
  await expect(page.getByTestId("timer-bar")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("steps can be ticked off, stay after a reload, and Börja om opens them again", async ({ page }) => {
  await page.goto(`/recept/${recipeId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const steps = page.getByTestId("recipe-step");
  await expect(page.getByRole("button", { name: "Börja om" })).toHaveCount(0);

  await page.getByRole("button", { name: "Steg 1 klart" }).click();
  await expect(page.getByRole("button", { name: "Steg 1 klart" })).toHaveAttribute("aria-pressed", "true");
  await expect(steps.first()).toHaveAttribute("data-done", "");
  await expect(steps.nth(1)).not.toHaveAttribute("data-done", "");
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/, "-steg.png") });

  await page.reload();
  await expect(page.getByRole("button", { name: "Steg 1 klart" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Börja om" }).click();
  await expect(page.getByRole("button", { name: "Steg 1 klart" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Börja om" })).toHaveCount(0);
});
