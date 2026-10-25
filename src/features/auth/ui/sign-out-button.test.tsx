import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, type Result } from "@/lib/errors";
import { SignOutButton } from "./sign-out-button";

// SignOutButton with the Server Action stubbed; a successful sign-out redirects, so only failures come back.

const signOut = vi.fn<() => Promise<Result<never>>>();
vi.mock("../actions/sign-out", () => ({ signOut: () => signOut() }));

beforeEach(() => {
  signOut.mockReset();
});

describe("SignOutButton", () => {
  it.each([
    ["an error result", () => Promise.resolve(fail("auth_sign_out_failed"))],
    ["no answer", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("shows the notice and can be tried again after %s", async (_, answer) => {
    signOut.mockImplementation(answer);
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Logga ut" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att logga ut. Försök igen.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Logga ut" })).toBeEnabled());
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
