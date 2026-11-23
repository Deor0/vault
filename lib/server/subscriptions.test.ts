import { randomBytes } from "node:crypto";
import type { Plaid } from "plaid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/tests/support/db";
import { createFakePlaid, makeAccount, makeAccountsResponse, makeSyncPage, makeTransaction } from "@/tests/support/plaid";
import { createTestUser } from "@/tests/support/users";
import { exchangePublicToken } from "./exchange";
import { getSubscriptions, inView, saveOverride, summarize } from "./subscriptions";
import { syncAllItems } from "./sync";

const TODAY = "2026-11-22";
const encryptionKey = randomBytes(32);

let db: TestDb;
let userId: string;
let seq = 0;

beforeEach(async () => {
  db = await createTestDb();
  userId = await createTestUser(db);
});

afterEach(async () => {
  await db.close();
});

function monthly(start: string, count: number, day: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const [year, month] = start.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + i, day)).toISOString().slice(0, 10);
  });
}

function charge(date: string, amount: number, name: string, extra: Partial<Plaid.Transaction> = {}) {
  seq += 1;
  return makeTransaction({
    transaction_id: `txn-${seq}`,
    account_id: "acc-card",
    date,
    authorized_date: null,
    amount,
    name,
    merchant_name: name,
    personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" },
    ...extra,
  });
}

const card = makeAccount({ account_id: "acc-card", name: "Plaid Credit Card", mask: "3333", type: "credit" as Plaid.AccountType, subtype: "credit card" as Plaid.AccountSubtype });

async function link(owner: string, transactions: Plaid.Transaction[], plaidItemId = "plaid-item-1") {
  const plaid = createFakePlaid();
  plaid.exchangePublicToken.mockResolvedValue({ access_token: `access-${plaidItemId}`, item_id: plaidItemId, request_id: "r" });
  plaid.getAccounts.mockResolvedValue(makeAccountsResponse([makeAccount(), card], { item_id: plaidItemId }));
  plaid.syncTransactions.mockResolvedValueOnce(makeSyncPage({ added: transactions }));
  await exchangePublicToken({ db, plaid, encryptionKey }, owner, "public-token");
  return plaid;
}

const history = () => [
  ...monthly("2026-03", 9, 21).map((date, i) => charge(date, i === 8 ? 17.99 : 15.49, "Netflix", { website: "netflix.com" })),
  ...monthly("2026-04", 8, 12).map((date, i) =>
    charge(date, [82.1, 119.4, 97.25, 140.02, 88.6, 101.33, 93.8, 124.5][i], "Con Edison", {
      account_id: "acc-checking",
      personal_finance_category: { primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY" },
    }),
  ),
  ...monthly("2026-02", 5, 9).map((date) => charge(date, 7.99, "Peacock")),
  ...monthly("2026-08", 4, 3).map((date) => charge(date, 11.99, "Spotify")),
  charge("2026-11-02", 6.45, "Starbucks", { personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" } }),
];

describe("getSubscriptions", () => {
  it("lists active subscriptions and bills, lapsed ones as inactive, and recent ones for review", async () => {
    await link(userId, history());
    const data = await getSubscriptions(db, userId, TODAY);

    expect(data.active.map((sub) => [sub.name, sub.kind, sub.amount, sub.nextDate, sub.needsReview])).toEqual([
      ["Spotify", "subscription", 11.99, "2026-12-03", true],
      ["Con Edison", "bill", 99.29, "2026-12-12", false],
      ["Netflix", "subscription", 17.99, "2026-12-21", false],
    ]);
    expect(data.active.find((sub) => sub.name === "Netflix")).toMatchObject({
      accountName: "Plaid Credit Card",
      accountMask: "3333",
      priceChange: { from: 15.49, to: 17.99 },
      status: "detected",
      cancel: [expect.objectContaining({ id: "netflix" }), expect.objectContaining({ id: "search" })],
    });
    expect(data.active.find((sub) => sub.name === "Con Edison")?.variableAmount).toBe(true);
    expect(data.inactive.map((sub) => [sub.name, sub.lapsed])).toEqual([["Peacock", true]]);
    expect(data.transactionCount).toBe(27);
  });

  it("applies confirm, ignore, rename, and bill/subscription choices", async () => {
    await link(userId, history());
    const keyOf = async (name: string) => (await getSubscriptions(db, userId, TODAY)).active.find((s) => s.name === name)!.key;

    await saveOverride(db, userId, { streamKey: await keyOf("Spotify"), status: "confirmed", displayName: "  Spotify Family " });
    await saveOverride(db, userId, { streamKey: await keyOf("Con Edison"), kind: "subscription" });
    await saveOverride(db, userId, { streamKey: await keyOf("Netflix"), status: "ignored" });

    const data = await getSubscriptions(db, userId, TODAY);
    expect(data.active.map((sub) => [sub.name, sub.detectedName, sub.kind, sub.needsReview, sub.status])).toEqual([
      ["Spotify Family", "Spotify", "subscription", false, "confirmed"],
      ["Con Edison", "Con Edison", "subscription", false, "confirmed"],
    ]);
    expect(data.ignored.map((sub) => sub.name)).toEqual(["Netflix"]);

    // Fields left out keep their value; clearing the name restores the detected one.
    await saveOverride(db, userId, { streamKey: await keyOf("Spotify Family"), displayName: null });
    const after = await getSubscriptions(db, userId, TODAY);
    expect(after.active.find((sub) => sub.name === "Spotify")).toMatchObject({ status: "confirmed" });
  });

  it("moves a cancelled subscription to Inactive and flags a charge after the cancellation", async () => {
    const plaid = await link(userId, history());
    const netflix = (await getSubscriptions(db, userId, TODAY)).active.find((sub) => sub.name === "Netflix")!;
    const saved = await saveOverride(db, userId, { streamKey: netflix.key, status: "cancelled" }, "2026-11-25");
    expect(saved).toMatchObject({ status: "cancelled", cancelledAt: "2026-11-25" });

    let data = await getSubscriptions(db, userId, "2026-11-26");
    expect(data.active.map((sub) => sub.name)).not.toContain("Netflix");
    expect(data.inactive.find((sub) => sub.name === "Netflix")).toMatchObject({ cancelledAt: "2026-11-25", chargedAfterCancel: [] });
    expect(data.chargedAfterCancel).toEqual([]);

    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: [charge("2026-12-21", 17.99, "Netflix")], next_cursor: "cursor-2" }),
    );
    await syncAllItems({ db, plaid, encryptionKey }, userId);
    data = await getSubscriptions(db, userId, "2026-12-22");
    expect(data.chargedAfterCancel.map((sub) => [sub.name, sub.chargedAfterCancel.map((c) => [c.date, c.amount])])).toEqual([
      ["Netflix", [["2026-12-21", 17.99]]],
    ]);

    // Still subscribed after all: back to active, flag gone.
    await saveOverride(db, userId, { streamKey: netflix.key, status: "confirmed" });
    data = await getSubscriptions(db, userId, "2026-12-22");
    expect(data.active.find((sub) => sub.name === "Netflix")).toMatchObject({ cancelledAt: null, nextDate: "2027-01-21" });
    expect(data.chargedAfterCancel).toEqual([]);
  });

  it("finds a decision stored under a name key after Plaid starts sending merchant ids", async () => {
    const plaid = await link(userId, monthly("2026-06", 5, 9).map((date) => charge(date, 11.99, "Hulu")));
    const before = (await getSubscriptions(db, userId, TODAY)).active[0];
    expect(before.key).toBe("n:hulu");
    await saveOverride(db, userId, { streamKey: before.key, displayName: "Hulu (no ads)" });

    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: [charge("2026-11-09", 11.99, "Hulu", { merchant_entity_id: "ent-hulu" })], next_cursor: "c2" }),
    );
    await syncAllItems({ db, plaid, encryptionKey }, userId);
    const after = (await getSubscriptions(db, userId, TODAY)).active[0];
    expect(after).toMatchObject({ key: "e:ent-hulu", name: "Hulu (no ads)" });
    expect(after.charges).toHaveLength(6);
  });

  it("keeps a cancellation found under an old key when the user edits the stream again", async () => {
    const plaid = await link(userId, monthly("2026-06", 5, 9).map((date) => charge(date, 11.99, "Hulu")));
    const before = (await getSubscriptions(db, userId, TODAY)).active[0];
    await saveOverride(db, userId, { streamKey: before.key, inheritFrom: before.inheritedFrom, status: "cancelled" }, "2026-11-10");

    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: [charge("2026-11-09", 11.99, "Hulu", { merchant_entity_id: "ent-hulu" })], next_cursor: "c2" }),
    );
    await syncAllItems({ db, plaid, encryptionKey }, userId);
    const renamed = (await getSubscriptions(db, userId, TODAY)).inactive[0];
    expect(renamed).toMatchObject({ key: "e:ent-hulu", inheritedFrom: "n:hulu", status: "cancelled" });
    await saveOverride(db, userId, { streamKey: renamed.key, inheritFrom: renamed.inheritedFrom, displayName: "Hulu (no ads)" });

    const after = await getSubscriptions(db, userId, TODAY);
    expect(after.active).toEqual([]);
    expect(after.inactive[0]).toMatchObject({
      key: "e:ent-hulu",
      inheritedFrom: null,
      name: "Hulu (no ads)",
      status: "cancelled",
      cancelledAt: "2026-11-10",
    });
  });

  it("keeps a decision on the plan it was made for when a new plan from the same merchant starts", async () => {
    const plaid = await link(userId, monthly("2026-01", 11, 5).map((date) => charge(date, 2.99, "Apple")));
    const icloud = (await getSubscriptions(db, userId, TODAY)).active[0];
    expect(icloud.key).toBe("n:apple");
    await saveOverride(db, userId, { streamKey: icloud.key, status: "ignored" });
    await db.query("UPDATE subscription_overrides SET created_at = '2026-04-01' WHERE stream_key = 'n:apple'");

    plaid.syncTransactions.mockResolvedValueOnce(
      makeSyncPage({ added: monthly("2026-08", 4, 14).map((date) => charge(date, 19.95, "Apple")), next_cursor: "c2" }),
    );
    await syncAllItems({ db, plaid, encryptionKey }, userId);
    let data = await getSubscriptions(db, userId, TODAY);
    expect(data.ignored.map((sub) => [sub.amount, sub.inheritedFrom])).toEqual([[2.99, "n:apple"]]);
    expect(data.active.map((sub) => [sub.amount, sub.status, sub.needsReview, sub.inheritedFrom])).toEqual([
      [19.95, "detected", true, null],
    ]);

    const old = data.ignored[0];
    await saveOverride(db, userId, { streamKey: old.key, inheritFrom: old.inheritedFrom, displayName: "iCloud+" });
    await saveOverride(db, userId, { streamKey: data.active[0].key, inheritFrom: data.active[0].inheritedFrom, status: "cancelled" }, TODAY);
    data = await getSubscriptions(db, userId, TODAY);
    expect(data.ignored.map((sub) => [sub.name, sub.amount, sub.status])).toEqual([["iCloud+", 2.99, "ignored"]]);
    expect(data.inactive.map((sub) => [sub.name, sub.amount, sub.status])).toEqual([["Apple", 19.95, "cancelled"]]);
  });

  it("shows each user only their own subscriptions and decisions", async () => {
    await link(userId, history());
    const other = await createTestUser(db, "someone-else@example.com");
    expect(await getSubscriptions(db, other, TODAY)).toMatchObject({ active: [], inactive: [], transactionCount: 0 });

    const key = (await getSubscriptions(db, userId, TODAY)).active[0].key;
    await saveOverride(db, other, { streamKey: key, status: "ignored" });
    expect((await getSubscriptions(db, userId, TODAY)).ignored).toEqual([]);
  });
});

describe("summarize", () => {
  it("totals monthly, yearly, next-30-day, and new charges for one view", async () => {
    await link(userId, history());
    const { active, today } = await getSubscriptions(db, userId, TODAY);
    expect(summarize(active.filter((sub) => inView(sub, "subscriptions")), today)).toEqual({
      currency: "USD",
      monthly: 29.98,
      yearly: 359.76,
      activeCount: 2,
      upcoming30: 29.98,
      upcomingCount: 2,
      newCount: 1,
      otherCurrency: 0,
    });
    expect(summarize(active, today)).toMatchObject({ monthly: 129.27, activeCount: 3, upcomingCount: 3 });
    expect(summarize([], today)).toMatchObject({ monthly: 0, activeCount: 0, currency: "USD" });
  });
});
