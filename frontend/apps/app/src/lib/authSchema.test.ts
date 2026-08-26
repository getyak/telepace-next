import { describe, expect, it } from "vitest";

import { isValidEmail, validateEmail } from "@telepace/config/auth-schema";

describe("email validation", () => {
  it.each(["person@example.com", "name+tag@sub.example.co"])(
    "accepts %s",
    (email) => {
      expect(isValidEmail(email)).toBe(true);
      expect(validateEmail(email)).toBeNull();
    },
  );

  it.each(["", "person", "@example.com", "person@example", "a@@example.com", "a b@example.com"])(
    "rejects %s",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );

  it("handles adversarially long input without regex backtracking", () => {
    const email = `${"!@!.".repeat(25_000)}example.com`;
    expect(isValidEmail(email)).toBe(false);
  });
});
