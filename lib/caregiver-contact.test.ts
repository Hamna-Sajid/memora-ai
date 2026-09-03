import { describe, expect, it } from "vitest";

import { caregiverPhoneHref } from "@/lib/caregiver-contact";

describe("caregiverPhoneHref", () => {
  it("accepts and normalizes an international phone number", () => {
    expect(caregiverPhoneHref(" +92 300-1234567 ")).toBe("tel:+923001234567");
  });

  it.each([
    undefined,
    "",
    "+920000000000",
    "03001234567",
    "+92-call-now",
  ])("rejects an absent, placeholder, or invalid number: %s", (value) => {
    expect(caregiverPhoneHref(value)).toBeNull();
  });
});
