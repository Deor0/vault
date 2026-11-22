import { describe, expect, it } from "vitest";
import { formatBalance, formatCategory, formatDay, formatMoney, formatTransactionAmount, groupByDay } from "./format";

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

  it("signs balances with a true minus", () => {
    expect(formatBalance(-55391.81, "USD")).toBe("−$55,391.81");
    expect(formatBalance(12, "USD")).toBe("$12.00");
    expect(formatBalance(null, "USD")).toBe("—");
  });

  it("formats a Plaid date as a calendar day", () => {
    expect(formatDay("2026-11-02")).toBe("Mon, Nov 2, 2026");
    expect(formatDay("not-a-date")).toBe("not-a-date");
  });

  it("groups consecutive rows by day, keeping order", () => {
    const rows = [
      { id: "a", date: "2026-11-02" },
      { id: "b", date: "2026-11-02" },
      { id: "c", date: "2026-11-01" },
    ];
    expect(groupByDay(rows)).toEqual([
      { date: "2026-11-02", rows: [rows[0], rows[1]] },
      { date: "2026-11-01", rows: [rows[2]] },
    ]);
    expect(groupByDay([])).toEqual([]);
  });
});
