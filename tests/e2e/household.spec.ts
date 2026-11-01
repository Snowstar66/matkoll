import { expect, test } from "@playwright/test";
import { adminClient, e2eUserId, householdEmail, householdStorageState } from "./support";

// Medlemmar och inbjudan (Story 21.2b): the owner invites from Inställningar → Medlemmar, a
// second browser opens the link, makes an account with e-mail and password (no mail, the sign-up
// hook lets the code through), says its name and sees the same list; then it leaves, and is
// signed out (it is let in only through the household). Story 21.3: what the guest checks off
// shows her initial on the owner's list.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

const guestEmail = `e2e-hushall-gast-${Date.now()}@matkoll.test`;
let ownerId: string;

async function deleteGuest() {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users.filter((candidate) => candidate.email === guestEmail) ?? []) await adminClient().auth.admin.deleteUser(user.id);
}

test.beforeAll(async () => {
  ownerId = await e2eUserId(householdEmail);
});

test.afterAll(async () => {
  await deleteGuest();
});

test("invite, join in a second browser, share the list, then leave", async ({ browser }) => {
  const ownerContext = await browser.newContext({ storageState: householdStorageState, viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  const household = (await adminClient().from("household_member").select("household_id").eq("user_id", ownerId).single()).data!.household_id;
  await adminClient().from("household").update({ name: "Hushållet Test" }).eq("id", household);

  // The owner: Inställningar → Medlemmar → Bjud in någon.
  await owner.goto("/installningar");
  await owner.getByRole("link", { name: /Medlemmar/ }).filter({ visible: true }).click();
  await expect(owner.getByRole("heading", { name: "Medlemmar", level: 1 }).filter({ visible: true })).toBeVisible();
  const rows = owner.getByTestId("member-row").filter({ visible: true });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Du");
  await expect(rows.first()).toContainText("Ägare");
  await owner.getByTestId("invite-someone").filter({ visible: true }).click();
  const sheet = owner.getByRole("dialog", { name: "Bjud in till hushållet" });
  await expect(sheet).toBeVisible();
  const shown = (await sheet.getByTestId("invite-code").textContent())!;
  expect(shown).toMatch(/^[2-9A-HJKMNP-Z]{3} [2-9A-HJKMNP-Z]{3}$/);
  const code = shown.replace(" ", "");
  await expect(sheet.getByTestId("invite-link")).toContainText(`/ga-med?kod=${code}`);
  await sheet.getByRole("button", { name: "Klar" }).click();
  await expect(owner.getByTestId("invite-row").filter({ visible: true })).toContainText(shown);

  // The guest: the link, an account, the name, the same list.
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  await guest.goto(`/ga-med?kod=${code}`);
  await expect(guest.getByRole("heading", { name: "Gå med i Hushållet Test" })).toBeVisible();
  await expect(guest.getByTestId("invite-card")).toContainText("1 medlem");
  await guest.getByLabel("E-postadress").fill(guestEmail);
  await guest.getByLabel("Välj lösenord").fill("hemligt-lösen-123");
  await guest.getByRole("button", { name: "Gå med" }).click();
  const prompt = guest.getByRole("dialog", { name: "Vad heter du?" });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await expect(guest).toHaveURL(/\/recept/);
  await prompt.getByLabel("Förnamn").fill("Martina");
  await prompt.getByRole("button", { name: "Fortsätt" }).click();
  await expect(prompt).toBeHidden();
  // The welcome tour (Story 20.1) comes after the name, as for anyone new.
  await guest.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Hoppa över" }).click();

  const { error } = await adminClient().from("shopping_custom_item").insert({ meal_plan_id: null, label: "Hushållsmjölk", user_id: ownerId, household_id: household });
  expect(error).toBeNull();
  await guest.goto("/lista");
  await expect(guest.getByText("Hushållsmjölk").filter({ visible: true })).toBeVisible();

  // Story 21.3: Martina checks it off; the owner's list shows her initial on the row, said as "bockad av Martina".
  await guest.getByRole("checkbox", { name: /Hushållsmjölk/ }).filter({ visible: true }).click();
  await expect
    .poll(async () => (await adminClient().from("shopping_check").select("user_id").eq("household_id", household)).data?.map((row) => row.user_id))
    .toHaveLength(1);
  await owner.goto("/lista");
  const showBasket = owner.getByRole("button", { name: /^Visa I korgen/ }).filter({ visible: true });
  if (await showBasket.count()) await showBasket.click();
  const milk = owner.getByTestId("shopping-line").filter({ hasText: "Hushållsmjölk" }).filter({ visible: true });
  await expect(milk.getByTestId("line-mark")).toHaveText("M");
  await expect(milk).toContainText("i korgen, bockad av Martina");

  await owner.goto("/installningar/medlemmar");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Martina");
  await expect(owner.getByTestId("invite-row").filter({ visible: true })).toHaveCount(0);

  // The guest leaves: asked first, then signed out, since only the household let them in.
  await guest.goto("/installningar/medlemmar");
  await guest.getByTestId("leave-household").filter({ visible: true }).click();
  const ask = guest.getByRole("dialog", { name: "Lämna Hushållet Test?" });
  await expect(ask).toContainText("Det går inte att ångra.");
  await ask.getByRole("button", { name: "Lämna" }).click();
  await expect(guest).toHaveURL(/\/logga-in\?fel=lamnat/);
  await expect(guest.getByText("Du har lämnat hushållet.")).toBeVisible();

  await owner.reload();
  await expect(rows).toHaveCount(1);
  await ownerContext.close();
  await guestContext.close();
});
