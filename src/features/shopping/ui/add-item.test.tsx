import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import { AddItemHeaderButton, AddItemProvider } from "./add-item";
import { ShoppingList } from "./shopping-list";

vi.mock("../actions/set-checked", () => ({ setChecked: async (change: unknown) => ok(change) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The "+" in Inköpslista's header opens the sheet.

function Page({ openOnStart = false }: { openOnStart?: boolean }) {
  return (
    <ToastProvider>
      <AddItemProvider openOnStart={openOnStart}>
        <header>
          <AddItemHeaderButton />
        </header>
        <ShoppingList plan={null} lines={[]} pantryUnavailable={false} />
      </AddItemProvider>
    </ToastProvider>
  );
}

describe("Lägg till vara from the header", () => {
  it("opens the list's sheet from the header's +", async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(screen.queryByRole("dialog", { name: "Lägg till vara" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lägg till vara" }));
    const dialog = screen.getByRole("dialog", { name: "Lägg till vara" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Vara" })).toHaveFocus());
  });

  it("shows the header's + at every width, and there is no floating +", () => {
    render(<Page />);
    const plus = within(screen.getByRole("banner")).getByRole("button", { name: "Lägg till vara" });
    expect(plus).not.toHaveClass("hidden");
    expect(screen.queryByTestId("add-item-fab")).not.toBeInTheDocument();
  });

  it("is open from the start on the quick-add address", () => {
    render(<Page openOnStart />);
    expect(screen.getByRole("dialog", { name: "Lägg till vara" })).toBeInTheDocument();
  });

  it("has no + without a provider", () => {
    render(<AddItemHeaderButton />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
