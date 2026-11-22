import { describe, expect, it } from "vitest";
import { buildBalanceSheet, groupKeyForType, primaryCurrency, sideForType } from "./balance-sheet";
import type { DashboardAccount, DashboardItem } from "./dashboard";

let nextId = 0;

function account(overrides: Partial<DashboardAccount> = {}): DashboardAccount {
  nextId += 1;
  return {
    id: `acc-${nextId}`,
    name: `Account ${nextId}`,
    officialName: null,
    mask: null,
    type: "depository",
    subtype: "checking",
    currentBalance: 0,
    availableBalance: null,
    creditLimit: null,
    currency: "USD",
    ...overrides,
  };
}

function item(accounts: DashboardAccount[], overrides: Partial<DashboardItem> = {}): DashboardItem {
  nextId += 1;
  return {
    id: `item-${nextId}`,
    institutionName: "First Platypus Bank",
    status: "active",
    errorCode: null,
    lastSyncedAt: null,
    accounts,
    ...overrides,
  };
}

describe("groupKeyForType / sideForType", () => {
  it("puts depository, investment, and unknown types on the asset side", () => {
    expect(groupKeyForType("depository")).toBe("depository");
    expect(groupKeyForType("investment")).toBe("investment");
    expect(groupKeyForType("brokerage")).toBe("investment");
    expect(groupKeyForType("other")).toBe("other");
    expect(groupKeyForType("something-new")).toBe("other");
    expect(sideForType("depository")).toBe("asset");
    expect(sideForType("investment")).toBe("asset");
    expect(sideForType("other")).toBe("asset");
  });

  it("puts credit and loan on the liability side", () => {
    expect(groupKeyForType("credit")).toBe("credit");
    expect(groupKeyForType("loan")).toBe("loan");
    expect(sideForType("credit")).toBe("liability");
    expect(sideForType("loan")).toBe("liability");
  });
});

describe("buildBalanceSheet", () => {
  it("is all zeros in USD with nothing linked", () => {
    expect(buildBalanceSheet([])).toEqual({
      currency: "USD",
      assets: [],
      liabilities: [],
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
      excluded: [],
    });
  });

  it("groups accounts by type with subtotals and subtracts liabilities from assets", () => {
    const checking = account({ type: "depository", currentBalance: 110 });
    const savings = account({ type: "depository", subtype: "savings", currentBalance: 210.5 });
    const brokerage = account({ type: "investment", subtype: "brokerage", currentBalance: 1000 });
    const card = account({ type: "credit", subtype: "credit card", currentBalance: 410.25, creditLimit: 2000 });
    const mortgage = account({ type: "loan", subtype: "mortgage", currentBalance: 56302.06 });
    const bank = item([checking, savings, card]);
    const broker = item([brokerage, mortgage], { institutionName: "Tattersall Brokerage" });

    const sheet = buildBalanceSheet([bank, broker]);

    expect(sheet.assets.map((g) => [g.key, g.label, g.subtotal])).toEqual([
      ["depository", "Cash", 320.5],
      ["investment", "Investments", 1000],
    ]);
    expect(sheet.liabilities.map((g) => [g.key, g.label, g.subtotal])).toEqual([
      ["credit", "Credit cards", 410.25],
      ["loan", "Loans", 56302.06],
    ]);
    // Largest balance first within a group.
    expect(sheet.assets[0].lines.map((line) => line.account.id)).toEqual([savings.id, checking.id]);
    expect(sheet.liabilities[1].lines[0]).toMatchObject({
      itemId: broker.id,
      institutionName: "Tattersall Brokerage",
      amount: 56302.06,
    });
    expect(sheet.totalAssets).toBe(1320.5);
    expect(sheet.totalLiabilities).toBe(56712.31);
    expect(sheet.netWorth).toBe(-55391.81);
    expect(sheet.excluded).toEqual([]);
  });

  it("adds cents without floating-point drift", () => {
    const sheet = buildBalanceSheet([
      item([account({ currentBalance: 0.1 }), account({ currentBalance: 0.2 })]),
    ]);
    expect(sheet.totalAssets).toBe(0.3);
    expect(sheet.netWorth).toBe(0.3);
  });

  it("lowers liabilities when a card is overpaid (negative balance)", () => {
    const sheet = buildBalanceSheet([
      item([account({ currentBalance: 100 }), account({ type: "credit", currentBalance: -25 })]),
    ]);
    expect(sheet.totalLiabilities).toBe(-25);
    expect(sheet.netWorth).toBe(125);
  });

  it("files unknown account types under Other assets", () => {
    const sheet = buildBalanceSheet([item([account({ type: "other", subtype: null, currentBalance: 42 })])]);
    expect(sheet.assets.map((g) => [g.key, g.label, g.subtotal])).toEqual([["other", "Other", 42]]);
  });

  it("leaves out accounts without a current balance", () => {
    const unknown = account({ currentBalance: null });
    const sheet = buildBalanceSheet([item([account({ currentBalance: 5 }), unknown])]);
    expect(sheet.totalAssets).toBe(5);
    expect(sheet.excluded).toEqual([{ account: unknown, institutionName: "First Platypus Bank", reason: "no_balance" }]);
  });

  it("totals in the most common currency and lists the others as excluded", () => {
    const euro = account({ currency: "EUR", currentBalance: 900 });
    const sheet = buildBalanceSheet([
      item([account({ currentBalance: 10 }), account({ currency: null, currentBalance: 5 }), euro]),
    ]);
    expect(sheet.currency).toBe("USD");
    expect(sheet.totalAssets).toBe(15);
    expect(sheet.excluded).toEqual([{ account: euro, institutionName: "First Platypus Bank", reason: "other_currency" }]);
  });
});

describe("primaryCurrency", () => {
  it("prefers the currency most accounts use", () => {
    expect(primaryCurrency([account({ currency: "CAD" }), account({ currency: "CAD" }), account()])).toBe("CAD");
  });

  it("breaks ties in favor of USD, then alphabetically", () => {
    expect(primaryCurrency([account({ currency: "EUR" }), account({ currency: "USD" })])).toBe("USD");
    expect(primaryCurrency([account({ currency: "GBP" }), account({ currency: "EUR" })])).toBe("EUR");
  });

  it("ignores accounts without a balance", () => {
    expect(primaryCurrency([account({ currency: "EUR", currentBalance: null }), account()])).toBe("USD");
  });
});
