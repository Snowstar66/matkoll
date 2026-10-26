import { describe, expect, it } from "vitest";
import { loginFieldErrors, loginSchema } from "./login-schema";

describe("loginSchema", () => {
  it("accepts and trims a valid address", () => {
    expect(loginSchema.parse({ email: " pontus@example.com " }).email).toBe("pontus@example.com");
  });

  it.each(["inte-en-adress", "", "pontus@", undefined])("rejects %s with the Swedish message", (email) => {
    const result = loginSchema.safeParse({ email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(loginFieldErrors(result.error)).toEqual({ email: "Ange en giltig e-postadress." });
    }
  });
});
