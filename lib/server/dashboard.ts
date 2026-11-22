import type { Queryable } from "./db/types";
import type { ItemStatus } from "./repo";

/** Read models for the dashboard, scoped to one user. Contains no secrets; safe to pass to client components. */

export interface DashboardAccount {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  currency: string | null;
}

export interface DashboardItem {
  id: string;
  institutionName: string | null;
  status: ItemStatus;
  errorCode: string | null;
  lastSyncedAt: string | null;
  accounts: DashboardAccount[];
}

export interface DashboardTransaction {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  category: string | null;
  amount: number;
  currency: string | null;
  pending: boolean;
  accountName: string;
  accountMask: string | null;
}

export const RECENT_TRANSACTIONS_LIMIT = 50;

/** The user's linked Items (institutions), each with its accounts and balances. */
export async function getItemsWithAccounts(db: Queryable, userId: string): Promise<DashboardItem[]> {
  const items = await db.query<{
    id: string;
    institution_name: string | null;
    status: ItemStatus;
    error_code: string | null;
    last_synced_at: string | null;
  }>(
    `SELECT id, institution_name, status, error_code,
       to_char(last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_synced_at
     FROM plaid_items WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );

  const accounts = await db.query<{
    id: string;
    item_id: string;
    name: string;
    official_name: string | null;
    mask: string | null;
    type: string;
    subtype: string | null;
    current_balance: number | null;
    available_balance: number | null;
    credit_limit: number | null;
    currency: string | null;
  }>(
    `SELECT a.id, a.item_id, a.name, a.official_name, a.mask, a.type, a.subtype,
       a.current_balance::float8 AS current_balance,
       a.available_balance::float8 AS available_balance,
       a.credit_limit::float8 AS credit_limit,
       COALESCE(a.iso_currency_code, a.unofficial_currency_code) AS currency
     FROM accounts a JOIN plaid_items i ON i.id = a.item_id
     WHERE i.user_id = $1
     ORDER BY a.type, a.name`,
    [userId],
  );

  return items.rows.map((item) => ({
    id: item.id,
    institutionName: item.institution_name,
    status: item.status,
    errorCode: item.error_code,
    lastSyncedAt: item.last_synced_at,
    accounts: accounts.rows
      .filter((account) => account.item_id === item.id)
      .map((account) => ({
        id: account.id,
        name: account.name,
        officialName: account.official_name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        currentBalance: account.current_balance,
        availableBalance: account.available_balance,
        creditLimit: account.credit_limit,
        currency: account.currency,
      })),
  }));
}

/** The user's most recent transactions, newest first. */
export async function getRecentTransactions(
  db: Queryable,
  userId: string,
  limit = RECENT_TRANSACTIONS_LIMIT,
): Promise<DashboardTransaction[]> {
  const transactions = await db.query<{
    id: string;
    date: string;
    name: string;
    merchant_name: string | null;
    category_primary: string | null;
    amount: number;
    currency: string | null;
    pending: boolean;
    account_name: string;
    account_mask: string | null;
  }>(
    `SELECT t.id, t.date::text AS date, t.name, t.merchant_name, t.category_primary,
       t.amount::float8 AS amount, COALESCE(t.iso_currency_code, t.unofficial_currency_code) AS currency,
       t.pending, a.name AS account_name, a.mask AS account_mask
     FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN plaid_items i ON i.id = t.item_id
     WHERE i.user_id = $1
     ORDER BY t.date DESC, t.created_at DESC, t.id
     LIMIT $2`,
    [userId, limit],
  );

  return transactions.rows.map((txn) => ({
    id: txn.id,
    date: txn.date,
    name: txn.name,
    merchantName: txn.merchant_name,
    category: txn.category_primary,
    amount: txn.amount,
    currency: txn.currency,
    pending: txn.pending,
    accountName: txn.account_name,
    accountMask: txn.account_mask,
  }));
}
