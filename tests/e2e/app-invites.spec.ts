import { expect, test } from "@playwright/test";
import { adminClient, appInvitesEmail, appInvitesStorageState, e2eUserId } from "./support";

// Bjud in ett hushåll från appen (Story 21.1): the app's owner (made so in app_owner for this spec)
// invites an address from Inställningar → Inbjudningar and gets a code and a link; a second browser
// opens the link, makes an account with that address (no mail, the sign-up hook lets the code
// through), and is in. Removing the address asks first, and the guest is out at the next request.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

const guestEmail = `e2e-inbjuden-${Date.now()}@matkoll.test`;
let ownerId: string;

async function deleteGuest() {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users.filter((candidate) => candidate.email === guestEmail) ?? []) {
    const member = await adminClient().from("household_member").select("household_id").eq("user_id", user.id).maybeSingle();
    await adminClient().auth.admin.deleteUser(user.id);
    if (member.data) await adminClient().from("household").delete().eq("id", member.data.household_id);
  }
}

test.beforeAll(async () => {
  ownerId = await e2eUserId(appInvitesEmail);
  const { error } = await adminClient().from("app_owner").upsert({ user_id: ownerId });
  if (error) throw error;
  await adminClient().from("app_invite").delete().eq("email", guestEmail);
});

test.afterAll(async () => {
  await adminClient().from("app_owner").delete().eq("user_id", ownerId);
  await adminClient().from("app_invite").delete().eq("email", guestEmail);
  await deleteGuest();
});

test("the owner invites an address, the guest makes an account with the code, and removing it locks them out", async ({ browser }) => {
  const ownerContext = await browser.newContext({ storageState: appInvitesStorageState, viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();

  // Inställningar → Appens ägare → Inbjudningar.
  await owner.goto("/installningar");
  await owner.getByRole("link", { name: /Inbjudningar/ }).filter({ visible: true }).click();
  await expect(owner.getByRole("heading", { name: "Inbjudningar", level: 1 }).filter({ visible: true })).toBeVisible();

  // An address that is not one is refused before anything is sent.
  await owner.getByLabel("E-postadress").fill("inte-en-adress");
  await owner.getByTestId("app-invite-submit").click();
  await expect(owner.getByText("Skriv en giltig e-postadress.")).toBeVisible();

  await owner.getByLabel("E-postadress").fill(guestEmail);
  await owner.getByTestId("app-invite-submit").click();
  const sheet = owner.getByRole("dialog", { name: "Dela inbjudan" });
  await expect(sheet).toBeVisible();
  const shown = (await sheet.getByTestId("app-invite-code").textContent())!;
  expect(shown).toMatch(/^[2-9A-HJKMNP-Z]{4} [2-9A-HJKMNP-Z]{4}$/);
  const code = shown.replace(" ", "");
  await expect(sheet.getByTestId("app-invite-link")).toContainText(`/inbjudan?kod=${code}`);
  await sheet.getByRole("button", { name: "Klar" }).click();
  const row = owner.getByTestId("app-invite-row").filter({ visible: true });
  await expect(row).toContainText(guestEmail);
  await expect(row).toContainText("Väntar på konto");

  // The guest: the link, a wrong address is refused, then the right one makes an account.
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  await guest.goto(`/inbjudan?kod=${code}`);
  await expect(guest.getByRole("heading", { name: /^Välkommen till/ })).toBeVisible();
  await guest.getByLabel("E-postadress").fill(`annan-${guestEmail}`);
  await guest.getByLabel("Välj lösenord").fill("hemligt-lösen-123");
  await guest.getByRole("button", { name: "Skapa konto" }).click();
  await expect(guest.getByTestId("join-app-error")).toContainText("Inbjudan gäller inte längre");
  await guest.getByLabel("E-postadress").fill(guestEmail);
  await guest.getByRole("button", { name: "Skapa konto" }).click();
  await expect(guest).toHaveURL(/\/recept/, { timeout: 30_000 });

  await owner.reload();
  await expect(row).toContainText("Har konto");

  // Removing asks first, since it cannot be undone.
  await row.getByRole("button", { name: `Ta bort ${guestEmail}` }).click();
  const ask = owner.getByRole("dialog", { name: `Ta bort ${guestEmail}?` });
  await expect(ask).toContainText("Det går inte att ångra.");
  await ask.getByRole("button", { name: "Avbryt" }).click();
  await expect(row).toHaveCount(1);
  // A second pointer press on a bin within 400 ms (trashPressGuardMs) of the first is ignored on purpose,
  // so the dialog would not open again on a fast machine (CI).
  await owner.waitForTimeout(500);
  await row.getByRole("button", { name: `Ta bort ${guestEmail}` }).click();
  await ask.getByRole("button", { name: "Ta bort" }).click();
  await expect(owner.getByTestId("app-invite-row")).toHaveCount(0);

  // The guest's session loses access at the next request.
  await guest.goto("/installningar");
  await expect(guest).toHaveURL(/\/logga-in/);
  await ownerContext.close();
  await guestContext.close();
});

test("anyone but the owner gets no Inbjudningar row and no page", async ({ browser }) => {
  await adminClient().from("app_owner").delete().eq("user_id", ownerId);
  const context = await browser.newContext({ storageState: appInvitesStorageState, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/installningar");
  await expect(page.getByRole("heading", { name: "Hushåll" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appens ägare" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Inbjudningar/ })).toHaveCount(0);
  // The page streams, so the answer is the not-found page rather than a 404 status.
  await page.goto("/installningar/inbjudningar");
  await expect(page.getByRole("heading", { name: "Sidan finns inte" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("app-invite-form")).toHaveCount(0);
  await context.close();
});
