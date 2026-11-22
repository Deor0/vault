import { describe, expect, it } from "vitest";
import { detectRecurring, normalizeMerchant, projectCharges, type RecurringInput } from "./recurring";

const TODAY = "2026-11-22";

let counter = 0;
function txn(date: string, amount: number, name: string, extra: Partial<RecurringInput> = {}): RecurringInput {
  counter += 1;
  return {
    id: `t${counter}`,
    date,
    authorizedDate: null,
    amount,
    currency: "USD",
    name,
    merchantName: null,
    merchantEntityId: null,
    website: null,
    accountId: "card",
    pending: false,
    categoryPrimary: null,
    categoryDetailed: null,
    ...extra,
  };
}

/** `count` dates on `day` of each month starting at `start` (YYYY-MM), clamped to month length. */
function monthly(start: string, count: number, day: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const [year, month] = start.split("-").map(Number);
    const y = year + Math.floor((month - 1 + i) / 12);
    const m = (month - 1 + i) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
  });
}

function only(streams: ReturnType<typeof detectRecurring>, label: string) {
  const matches = streams.filter((stream) => stream.label === label);
  expect(matches, `streams labelled ${label}`).toHaveLength(1);
  return matches[0];
}

describe("normalizeMerchant", () => {
  it("collapses descriptor noise", () => {
    expect(normalizeMerchant("NETFLIX.COM 866-579-7172 CA")).toBe("netflix ca");
    expect(normalizeMerchant("Netflix")).toBe("netflix");
    expect(normalizeMerchant("SPOTIFY USA*P1234ABC")).toBe("spotify usa");
    expect(normalizeMerchant("POS DEBIT PLANET FITNESS #1234")).toBe("planet fitness");
  });
});

describe("detectRecurring", () => {
  it("finds a monthly subscription, its next date on the same day of the month, and a price rise", () => {
    const rows = monthly("2026-03", 9, 21).map((date, i) =>
      txn(date, i === 8 ? 17.99 : 15.49, "NETFLIX.COM", { merchantName: "Netflix" }),
    );
    const netflix = only(detectRecurring(rows, TODAY), "Netflix");
    expect(netflix).toMatchObject({
      cadence: "monthly",
      active: true,
      early: false,
      lastAmount: 17.99,
      typicalAmount: 17.99,
      monthlyAmount: 17.99,
      variableAmount: false,
      nextDate: "2026-12-21",
      priceChange: { from: 15.49, to: 17.99, date: "2026-11-21" },
    });
  });

  it("keeps a price change visible for a couple of cycles, then stops calling it new", () => {
    const recent = monthly("2026-03", 9, 5).map((date, i) => txn(date, i < 7 ? 10 : 12, "Spotify"));
    expect(only(detectRecurring(recent, TODAY), "Spotify").priceChange).toEqual({ from: 10, to: 12, date: "2026-10-05" });

    const old = monthly("2025-10", 14, 5).map((date, i) => txn(date, i < 3 ? 10 : 12, "Spotify"));
    expect(only(detectRecurring(old, TODAY), "Spotify")).toMatchObject({ priceChange: null, variableAmount: false });
  });

  it("keeps the usual day of the month across 31-day months", () => {
    const rows = monthly("2026-06", 6, 31).map((date) => txn(date, 9.99, "Gym"));
    expect(only(detectRecurring(rows, TODAY), "Gym").nextDate).toBe("2026-12-31");
  });

  it("tolerates weekend shifts and uses the authorized date when Plaid has one", () => {
    const posted = ["2026-05-04", "2026-06-02", "2026-07-01", "2026-08-03", "2026-09-01", "2026-10-01", "2026-11-03"];
    const rows = posted.map((date, i) =>
      txn(date, 39, "PLANET FITNESS #1234", { authorizedDate: i % 2 ? `${date.slice(0, 8)}01` : null }),
    );
    expect(only(detectRecurring(rows, TODAY), "PLANET FITNESS #1234")).toMatchObject({
      cadence: "monthly",
      nextDate: "2026-12-01",
      active: true,
    });
  });

  it("treats a utility bill with a changing amount as one stream priced at its median", () => {
    const amounts = [82.1, 119.4, 97.25, 140.02, 88.6, 101.33, 93.8, 124.5];
    const rows = monthly("2026-04", 8, 12).map((date, i) =>
      txn(date, amounts[i], "CON EDISON", { categoryPrimary: "RENT_AND_UTILITIES" }),
    );
    expect(only(detectRecurring(rows, TODAY), "CON EDISON")).toMatchObject({
      cadence: "monthly",
      variableAmount: true,
      priceChange: null,
      typicalAmount: 99.29,
      monthlyAmount: 99.29,
    });
  });

  it("detects an annual renewal from two charges and spreads it over the months", () => {
    const rows = [txn("2024-12-02", 12, "NAMECHEAP.COM"), txn("2025-12-01", 12, "NAMECHEAP.COM")];
    expect(only(detectRecurring(rows, TODAY), "NAMECHEAP.COM")).toMatchObject({
      cadence: "annual",
      active: true,
      nextDate: "2026-12-01",
      monthlyAmount: 1,
    });
  });

  it("recognizes weekly, biweekly, semi-monthly, and quarterly cadences", () => {
    const start = Date.UTC(2026, 8, 7);
    const everyNDays = (n: number, count: number, name: string) =>
      Array.from({ length: count }, (_, i) =>
        txn(new Date(start + i * n * 86_400_000).toISOString().slice(0, 10), 4.99, name),
      );
    const semi = monthly("2026-07", 5, 1).flatMap((date) => [
      txn(date, 25, "Daycare", { categoryPrimary: "GENERAL_SERVICES" }),
      txn(`${date.slice(0, 8)}15`, 25, "Daycare", { categoryPrimary: "GENERAL_SERVICES" }),
    ]);
    const quarterly = ["2026-02-10", "2026-05-10", "2026-08-10", "2026-11-10"].map((date) => txn(date, 60, "Water"));
    const streams = detectRecurring(
      [...everyNDays(7, 11, "Newsletter"), ...everyNDays(14, 6, "Lawn care"), ...semi, ...quarterly],
      TODAY,
    );
    expect(only(streams, "Newsletter")).toMatchObject({ cadence: "weekly", monthlyAmount: 21.7 });
    expect(only(streams, "Lawn care")).toMatchObject({ cadence: "biweekly" });
    expect(only(streams, "Daycare")).toMatchObject({ cadence: "semi_monthly", nextDate: "2026-12-01" });
    expect(only(streams, "Water")).toMatchObject({ cadence: "quarterly", nextDate: "2027-02-10" });
  });

  it("splits two plans billed under one descriptor", () => {
    const rows = [
      ...monthly("2026-06", 6, 5).map((date) => txn(date, 2.99, "APPLE.COM/BILL")),
      ...monthly("2026-06", 6, 14).map((date) => txn(date, 19.95, "APPLE.COM/BILL")),
    ];
    const streams = detectRecurring(rows, TODAY).filter((stream) => stream.label === "APPLE.COM/BILL");
    expect(streams.map((stream) => [stream.typicalAmount, stream.key])).toEqual([
      [2.99, "n:apple bill@3"],
      [19.95, "n:apple bill@20"],
    ]);
  });

  it("groups by Plaid merchant id, keeping older rows stored without one", () => {
    const dates = monthly("2026-05", 7, 9);
    const rows = dates.map((date, i) =>
      txn(date, 11.99, i < 3 ? "HULU 877-8244858 CA" : "Hulu LLC", {
        merchantName: "Hulu",
        merchantEntityId: i < 3 ? null : "ent_hulu",
      }),
    );
    const [stream] = detectRecurring(rows, TODAY);
    expect(stream).toMatchObject({ key: "e:ent_hulu", label: "Hulu", cadence: "monthly" });
    expect(stream.charges).toHaveLength(7);
    expect(stream.aliasKeys).toEqual(["n:hulu"]);
  });

  it("marks a stream that stopped as inactive", () => {
    const rows = monthly("2026-02", 5, 9).map((date) => txn(date, 7.99, "Peacock"));
    expect(only(detectRecurring(rows, TODAY), "Peacock")).toMatchObject({ active: false, nextDate: "2026-07-09" });
  });

  it("ignores a charge that was refunded in full, and a same-day duplicate", () => {
    const rows = [
      ...monthly("2026-06", 6, 3).map((date) => txn(date, 14.99, "Max")),
      txn("2026-08-17", 14.99, "Max"),
      txn("2026-08-19", -14.99, "Max"),
      txn("2026-09-03", 14.99, "Max"),
    ];
    const max = only(detectRecurring(rows, TODAY), "Max");
    expect(max.charges.map((charge) => charge.date)).toEqual(monthly("2026-06", 6, 3));
  });

  it("shows two identical monthly charges as early detection", () => {
    const rows = [txn("2026-10-14", 20, "Claude.ai"), txn("2026-11-14", 20, "Claude.ai")];
    expect(only(detectRecurring(rows, TODAY), "Claude.ai")).toMatchObject({
      early: true,
      cadence: "monthly",
      nextDate: "2026-12-14",
    });
  });

  it("ignores habits, transfers, income, card payments, and pending charges", () => {
    const weeklyCoffee = Array.from({ length: 10 }, (_, i) =>
      txn(new Date(Date.UTC(2026, 8, 1 + i * 7)).toISOString().slice(0, 10), 4 + (i % 4) * 2.15, "Starbucks", {
        categoryPrimary: "FOOD_AND_DRINK",
      }),
    );
    const rows = [
      ...weeklyCoffee,
      ...monthly("2026-01", 10, 1).map((date) => txn(date, 500, "TRANSFER TO SAVINGS", { categoryPrimary: "TRANSFER_OUT" })),
      ...monthly("2026-01", 10, 28).map((date) =>
        txn(date, 900, "CHASE CARD AUTOPAY", {
          categoryPrimary: "LOAN_PAYMENTS",
          categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
        }),
      ),
      ...monthly("2026-01", 10, 15).map((date) => txn(date, -3250, "ACME PAYROLL", { categoryPrimary: "INCOME" })),
      txn("2026-10-20", 5, "Pending thing", { pending: true }),
      txn("2026-11-20", 5, "Pending thing", { pending: true }),
    ];
    expect(detectRecurring(rows, TODAY)).toEqual([]);
  });
});

describe("projectCharges", () => {
  it("lists expected charge dates in a window", () => {
    expect(projectCharges({ cadence: "weekly", nextDate: "2026-11-25" }, "2026-11-22", "2026-12-22")).toEqual([
      "2026-11-25",
      "2026-12-02",
      "2026-12-09",
      "2026-12-16",
    ]);
    expect(projectCharges({ cadence: "monthly", nextDate: "2026-11-30" }, "2026-11-22", "2027-01-31")).toEqual([
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
    ]);
    expect(projectCharges({ cadence: "annual", nextDate: "2027-03-01" }, "2026-11-22", "2026-12-22")).toEqual([]);
  });
});
