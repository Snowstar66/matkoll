import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AccountProvider } from "./account";
import { PageHeader } from "./page-header";

const account = Promise.resolve({ name: "Pontus", email: "pontus@matkoll.local", initial: "P" });
const signOut = { sheet: <button type="button">Logga ut</button>, menu: null };

describe("the P button (Story 19.2)", () => {
  it("is in the header of a tab, after the tab's own button, and opens the sheet with the account and three choices", async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <AccountProvider account={account} signOut={signOut}>
          <PageHeader title="Recept" tab="/recept" action={<button type="button">Importera recept</button>} />
        </AccountProvider>,
      );
    });
    const button = await screen.findByRole("button", { name: "Konto" });
    expect(button).toHaveTextContent("P");
    expect(screen.getByRole("button", { name: "Importera recept" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(button);
    const sheet = await screen.findByRole("dialog", { name: /Pontus.*pontus@matkoll.local/ });
    expect(screen.getByRole("link", { name: "Inställningar" })).toHaveAttribute("href", "/installningar");
    expect(screen.getByRole("link", { name: /Hjälp och tips/ })).toHaveAttribute("href", "/hjalp#recept");
    expect(screen.getByRole("link", { name: /Hjälp och tips/ })).toHaveTextContent("Om Recept");
    expect(sheet).toContainElement(screen.getByRole("button", { name: "Logga ut" }));
  });

  it("is not in a header without a tab, nor without an account", () => {
    render(
      <AccountProvider account={account} signOut={signOut}>
        <PageHeader title="Inställningar" backHref="/recept" />
      </AccountProvider>,
    );
    expect(screen.queryByRole("button", { name: "Konto" })).not.toBeInTheDocument();
  });

  it("has no button without an account provider", () => {
    render(<PageHeader title="Recept" tab="/recept" />);
    expect(screen.queryByRole("button", { name: "Konto" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Recept" })).toBeInTheDocument();
  });
});
