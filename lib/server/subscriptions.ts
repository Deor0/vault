import { cancelRoutes, type CancelRoute } from "./cancel-links";
import type { Queryable } from "./db/types";
import { addDays, detectRecurring, projectCharges, toDays, type Cadence, type RecurringInput } from "./recurring";

/**
 * The Subscriptions page's read model: recurring charges detected from the
 * user's stored transactions, combined with the user's own decisions about
 * them (confirmed, ignored, cancelled, renamed, bill or subscription).
 */

export type SubscriptionKind = "subscription" | "bill";
export type OverrideStatus = "confirmed" | "ignored" | "cancelled";

export interface SubscriptionOverride {
  streamKey: string;
  status: OverrideStatus;
  kind: SubscriptionKind | null;
  displayName: string | null;
  cancelledAt: string | null;
}

interface StoredOverride extends SubscriptionOverride {
  /** The day the decision was first saved. */
  createdOn: string;
}

export interface SubscriptionCharge {
  id: string;
  date: string;
  amount: number;
  accountName: string;
  accountMask: string | null;
}

export interface Subscription {
  key: string;
  name: string;
  /** The name detection found, shown when the user renamed the stream. */
  detectedName: string;
  kind: SubscriptionKind;
  /** Detected kind, before any user choice. */
  detectedKind: SubscriptionKind;
  cadence: Cadence;
  currency: string | null;
  amount: number;
  lastAmount: number;
  variableAmount: boolean;
  monthlyAmount: number;
  nextDate: string;
  lastDate: string;
  firstDate: string;
  accountName: string;
  accountMask: string | null;
  category: string | null;
  priceChange: { from: number; to: number; date: string } | null;
  /** Not charged since it was due: probably ended. */
  lapsed: boolean;
  /** Detected but not yet confirmed by the user, and new (recently started or only two charges so far). */
  needsReview: boolean;
  status: OverrideStatus | "detected";
  cancelledAt: string | null;
  /** Charges dated after the user marked the stream cancelled. */
  chargedAfterCancel: SubscriptionCharge[];
  charges: SubscriptionCharge[];
  cancel: CancelRoute[];
}

export interface SubscriptionsData {
  today: string;
  /** Recurring charges that are still running (not lapsed, ignored, or cancelled). */
  active: Subscription[];
  /** Lapsed or cancelled. */
  inactive: Subscription[];
  ignored: Subscription[];
  /** Cancelled, then charged again. */
  chargedAfterCancel: Subscription[];
  /** How many transactions detection looked at. */
  transactionCount: number;
}

export type SubscriptionView = "subscriptions" | "bills" | "all";

export interface SubscriptionTotals {
  currency: string;
  monthly: number;
  yearly: number;
  activeCount: number;
  upcoming30: number;
  upcomingCount: number;
  newCount: number;
  /** Streams left out of the money totals because they bill in another currency. */
  otherCurrency: number;
}

/** History detection reads: Plaid's 24 months plus a little, so annual charges are seen twice. */
export const HISTORY_DAYS = 760;
/** A stream that started within this many days and is unreviewed shows in "Needs review". */
export const NEW_STREAM_DAYS = 120;

/** Categories whose recurring charges are bills rather than subscriptions. */
const BILL_PRIMARY = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS", "GOVERNMENT_AND_NON_PROFIT", "MEDICAL"]);
const BILL_DETAILED = new Set(["GENERAL_SERVICES_INSURANCE"]);

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TransactionRow {
  id: string;
  date: string;
  authorized_date: string | null;
  amount: number;
  currency: string | null;
  name: string;
  merchant_name: string | null;
  merchant_entity_id: string | null;
  website: string | null;
  account_id: string;
  account_name: string;
  account_mask: string | null;
  pending: boolean;
  category_primary: string | null;
  category_detailed: string | null;
}

async function loadTransactions(db: Queryable, userId: string, since: string): Promise<TransactionRow[]> {
  const { rows } = await db.query<TransactionRow & Record<string, unknown>>(
    `SELECT t.id, t.date::text AS date, t.authorized_date::text AS authorized_date, t.amount::float8 AS amount,
       COALESCE(t.iso_currency_code, t.unofficial_currency_code) AS currency, t.name, t.merchant_name,
       t.merchant_entity_id, t.website, t.account_id, a.name AS account_name, a.mask AS account_mask, t.pending,
       t.category_primary, t.category_detailed
     FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN plaid_items i ON i.id = t.item_id
     WHERE i.user_id = $1 AND t.date >= $2::date AND NOT t.pending
     ORDER BY t.date, t.id`,
    [userId, since],
  );
  return rows;
}

export async function getOverrides(db: Queryable, userId: string): Promise<StoredOverride[]> {
  const { rows } = await db.query<{
    stream_key: string;
    status: OverrideStatus;
    kind: SubscriptionKind | null;
    display_name: string | null;
    cancelled_at: string | null;
    created_on: string;
  }>(
    `SELECT stream_key, status, kind, display_name, cancelled_at::text AS cancelled_at, created_at::date::text AS created_on
     FROM subscription_overrides WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => ({
    streamKey: row.stream_key,
    status: row.status,
    kind: row.kind,
    displayName: row.display_name,
    cancelledAt: row.cancelled_at,
    createdOn: row.created_on,
  }));
}

export interface OverrideInput {
  streamKey: string;
  status?: OverrideStatus;
  kind?: SubscriptionKind | null;
  displayName?: string | null;
  cancelledAt?: string | null;
}

/**
 * Record the user's decision about a stream. Fields left out keep their stored
 * value. Marking a stream cancelled without a date uses `today`; any other
 * status clears the cancellation date.
 */
export async function saveOverride(
  db: Queryable,
  userId: string,
  input: OverrideInput,
  today: string = todayUtc(),
): Promise<SubscriptionOverride> {
  const cancelledAt =
    input.status === undefined ? undefined : input.status === "cancelled" ? (input.cancelledAt ?? today) : null;
  const displayName = input.displayName === undefined ? undefined : input.displayName?.trim() || null;
  const { rows } = await db.query<{
    stream_key: string;
    status: OverrideStatus;
    kind: SubscriptionKind | null;
    display_name: string | null;
    cancelled_at: string | null;
  }>(
    `INSERT INTO subscription_overrides (user_id, stream_key, status, kind, display_name, cancelled_at)
     VALUES ($1, $2, COALESCE($3, 'confirmed'), $5, $7, $9::date)
     ON CONFLICT (user_id, stream_key) DO UPDATE SET
       status = CASE WHEN $3::text IS NULL THEN subscription_overrides.status ELSE $3 END,
       kind = CASE WHEN $4 THEN $5 ELSE subscription_overrides.kind END,
       display_name = CASE WHEN $6 THEN $7 ELSE subscription_overrides.display_name END,
       cancelled_at = CASE WHEN $8 THEN $9::date ELSE subscription_overrides.cancelled_at END,
       updated_at = now()
     RETURNING stream_key, status, kind, display_name, cancelled_at::text AS cancelled_at`,
    [
      userId,
      input.streamKey,
      input.status ?? null,
      input.kind !== undefined,
      input.kind ?? null,
      displayName !== undefined,
      displayName ?? null,
      cancelledAt !== undefined,
      cancelledAt ?? null,
    ],
  );
  const row = rows[0];
  return {
    streamKey: row.stream_key,
    status: row.status,
    kind: row.kind,
    displayName: row.display_name,
    cancelledAt: row.cancelled_at,
  };
}

function detectedKind(categoryPrimary: string | null, categoryDetailed: string | null, variable: boolean): SubscriptionKind {
  if (categoryPrimary && BILL_PRIMARY.has(categoryPrimary)) return "bill";
  if (categoryDetailed && BILL_DETAILED.has(categoryDetailed)) return "bill";
  return variable ? "bill" : "subscription";
}

/** Detect recurring charges for `userId` and apply their decisions. */
export async function getSubscriptions(
  db: Queryable,
  userId: string,
  today: string = todayUtc(),
): Promise<SubscriptionsData> {
  const [rows, overrides] = await Promise.all([
    loadTransactions(db, userId, addDays(today, -HISTORY_DAYS)),
    getOverrides(db, userId),
  ]);
  const { data, inherited } = buildSubscriptions(rows, overrides, today);
  for (const [streamKey, fromKey] of inherited) {
    await db.query(
      `INSERT INTO subscription_overrides (user_id, stream_key, status, kind, display_name, cancelled_at)
       SELECT user_id, $3, status, kind, display_name, cancelled_at
       FROM subscription_overrides WHERE user_id = $1 AND stream_key = $2
       ON CONFLICT (user_id, stream_key) DO NOTHING`,
      [userId, fromKey, streamKey],
    );
  }
  return data;
}

/**
 * Match detected streams with the user's decisions. `inherited` lists each
 * stream whose decision was found under another key (stored before a re-key or
 * a split), as [stream key, stored key], so it can be copied onto the stream.
 */
function buildSubscriptions(
  rows: TransactionRow[],
  overrides: StoredOverride[],
  today: string,
): { data: SubscriptionsData; inherited: [string, string][] } {
  const accounts = new Map(rows.map((row) => [row.account_id, { name: row.account_name, mask: row.account_mask }]));
  const inputs: RecurringInput[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    authorizedDate: row.authorized_date,
    amount: row.amount,
    currency: row.currency,
    name: row.name,
    merchantName: row.merchant_name,
    merchantEntityId: row.merchant_entity_id,
    website: row.website,
    accountId: row.account_id,
    pending: row.pending,
    categoryPrimary: row.category_primary,
    categoryDetailed: row.category_detailed,
  }));
  const byKey = new Map(overrides.map((override) => [override.streamKey, override]));

  const data: SubscriptionsData = {
    today,
    active: [],
    inactive: [],
    ignored: [],
    chargedAfterCancel: [],
    transactionCount: rows.length,
  };

  const inherited: [string, string][] = [];
  for (const stream of detectRecurring(inputs, today)) {
    const override =
      [stream.key, ...stream.aliasKeys].map((key) => byKey.get(key)).find(Boolean) ??
      stream.parentKeys
        .map((key) => byKey.get(key))
        .find((parent) => parent !== undefined && stream.firstDate <= parent.createdOn) ??
      null;
    if (override && override.streamKey !== stream.key) inherited.push([stream.key, override.streamKey]);
    const account = accounts.get(stream.accountId);
    const charges: SubscriptionCharge[] = stream.charges
      .map((charge) => {
        const chargeAccount = accounts.get(charge.accountId);
        return {
          id: charge.id,
          date: charge.date,
          amount: charge.amount,
          accountName: chargeAccount?.name ?? "",
          accountMask: chargeAccount?.mask ?? null,
        };
      })
      .reverse();
    const cancelledAt = override?.status === "cancelled" ? override.cancelledAt : null;
    const chargedAfterCancel = cancelledAt ? charges.filter((charge) => charge.date > cancelledAt) : [];
    const kind = detectedKind(stream.categoryPrimary, stream.categoryDetailed, stream.variableAmount);
    const name = override?.displayName ?? stream.label;
    const isNew = toDays(today) - toDays(stream.firstDate) <= NEW_STREAM_DAYS || stream.early;

    const subscription: Subscription = {
      key: stream.key,
      name,
      detectedName: stream.label,
      kind: override?.kind ?? kind,
      detectedKind: kind,
      cadence: stream.cadence,
      currency: stream.currency,
      amount: stream.typicalAmount,
      lastAmount: stream.lastAmount,
      variableAmount: stream.variableAmount,
      monthlyAmount: stream.monthlyAmount,
      nextDate: stream.nextDate,
      lastDate: stream.lastDate,
      firstDate: stream.firstDate,
      accountName: account?.name ?? "",
      accountMask: account?.mask ?? null,
      category: stream.categoryPrimary,
      priceChange: stream.priceChange,
      lapsed: !stream.active,
      needsReview: override === null && stream.active && isNew,
      status: override?.status ?? "detected",
      cancelledAt,
      chargedAfterCancel,
      charges,
      cancel: cancelRoutes({ descriptor: stream.descriptor, label: name, website: stream.website }),
    };

    if (override?.status === "ignored") data.ignored.push(subscription);
    else if (cancelledAt) {
      data.inactive.push(subscription);
      if (chargedAfterCancel.length > 0) data.chargedAfterCancel.push(subscription);
    } else if (subscription.lapsed) data.inactive.push(subscription);
    else data.active.push(subscription);
  }

  data.inactive.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  data.ignored.sort((a, b) => a.name.localeCompare(b.name));
  return { data, inherited };
}

export function inView(subscription: Pick<Subscription, "kind">, view: SubscriptionView): boolean {
  return view === "all" || (view === "subscriptions" ? subscription.kind === "subscription" : subscription.kind === "bill");
}

/** Money totals for the active streams in one view, in the currency most of them use. */
export function summarize(active: Subscription[], today: string): SubscriptionTotals {
  const counts = new Map<string, number>();
  for (const sub of active) counts.set(sub.currency ?? "USD", (counts.get(sub.currency ?? "USD") ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const inCurrency = active.filter((sub) => (sub.currency ?? "USD") === currency);
  const horizon = addDays(today, 30);
  let upcoming30 = 0;
  let upcomingCount = 0;
  for (const sub of inCurrency) {
    const dates = projectCharges(sub, today, horizon);
    upcoming30 += dates.length * sub.amount;
    upcomingCount += dates.length;
  }
  const monthly = inCurrency.reduce((sum, sub) => sum + sub.monthlyAmount, 0);
  return {
    currency,
    monthly: round2(monthly),
    yearly: round2(monthly * 12),
    activeCount: active.length,
    upcoming30: round2(upcoming30),
    upcomingCount,
    newCount: active.filter((sub) => sub.needsReview).length,
    otherCurrency: active.length - inCurrency.length,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
