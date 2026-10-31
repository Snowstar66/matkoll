import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { ChangePassword } from "./change-password";

const requestPasswordReset = vi.fn<(input: { email: string; next?: string }) => Promise<Result<null>>>();
vi.mock("../actions/request-password-reset", () => ({
  requestPasswordReset: (input: { email: string; next?: string }) => requestPasswordReset(input),
}));

beforeEach(() => requestPasswordReset.mockReset().mockResolvedValue(ok()));

describe("ChangePassword (Story 14.7)", () => {
  it("mails the link of Story 17.2 to the signed-in address and says so", async () => {
    const user = userEvent.setup();
    render(<ChangePassword email="pontus@example.com" />);
    const button = screen.getByRole("button", { name: "Byt lösenord" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "pontus@example.com", next: "/installningar/konto" });
    expect(await screen.findByTestId("password-link-sent")).toHaveTextContent("pontus@example.com");
  });

  it("says so when the action refuses", async () => {
    requestPasswordReset.mockResolvedValue(fail("auth_password_rate_limited"));
    const user = userEvent.setup();
    render(<ChangePassword email="pontus@example.com" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Byt lösenord" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Byt lösenord" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("För många försök");
  });
});
