import { describe, expect, it } from "vitest";
import { formatCategory, formatMoney, formatTransactionAmount } from "./format";

describe("format helpers", () => {
  it("formats money, tolerating unofficial currency codes", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(1.5, "BTCX")).toBe("1.50 BTCX");
  });

  it("shows Plaid outflows as negative and inflows as positive", () => {
    expect(formatTransactionAmount(12.5, "USD")).toBe("−$12.50");
    expect(formatTransactionAmount(-1000, "USD")).toBe("+$1,000.00");
  });

  it("humanizes Plaid categories", () => {
    expect(formatCategory("FOOD_AND_DRINK")).toBe("Food and Drink");
    expect(formatCategory(null)).toBe("");
  });
});
