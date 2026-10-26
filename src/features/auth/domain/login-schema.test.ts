import { describe, expect, it } from "vitest";
import { emailCodeSchema, loginFieldErrors, loginSchema } from "./login-schema";

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

describe("emailCodeSchema", () => {
  it("accepts six digits and drops spaces around them", () => {
    expect(emailCodeSchema.parse({ email: "pontus@example.com", code: " 012345 " }).code).toBe("012345");
  });

  it.each(["12a45", "12345", "1234567", "123 456", "", "١٢٣٤٥٦", undefined])("refuses the code %s", (code) => {
    expect(emailCodeSchema.safeParse({ email: "pontus@example.com", code }).success).toBe(false);
  });

  it("refuses an invalid address", () => {
    expect(emailCodeSchema.safeParse({ email: "inte-en-adress", code: "123456" }).success).toBe(false);
  });
});
