import { describe, expect, it } from "vitest";
import { cancellationEmail } from "./cancel-email";

describe("cancellationEmail", () => {
  it("names the subscription, the last charge, and the card", () => {
    const email = cancellationEmail({
      name: "Netflix",
      lastAmount: 17.99,
      lastDate: "2026-11-21",
      currency: "USD",
      accountMask: "3333",
    });
    expect(email.subject).toBe("Cancel my Netflix subscription");
    expect(email.body).toContain("Please cancel my Netflix subscription effective immediately");
    expect(email.body).toContain("The most recent charge was $17.99 on Nov 21, 2026 to my card or account ending in 3333.");
  });

  it("leaves the card out when the account has no mask", () => {
    const email = cancellationEmail({ name: "Gym", lastAmount: 39, lastDate: "2026-11-01", currency: null, accountMask: null });
    expect(email.body).toContain("The most recent charge was $39.00 on Nov 1, 2026.");
  });
});
