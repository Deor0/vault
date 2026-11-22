import type { Queryable } from "./db/types";
import type { ItemStatus } from "./repo";

/** Read models for the dashboard. Contains no secrets; safe to pass to client components. */

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

export interface Dashboard {
  items: DashboardItem[];
  transactions: DashboardTransaction[];
}

export const RECENT_TRANSACTIONS_LIMIT = 50;

export async function getDashboard(db: Queryable, limit = RECENT_TRANSACTIONS_LIMIT): Promise<Dashboard> {
  const items = await db.query<{
    id: string;
    institution_name: string | null;
    status: ItemStatus;
    error_code: string | null;
    last_synced_at: string | null;
  }>(
    `SELECT id, institution_name, status, error_code,
       to_char(last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_synced_at
     FROM plaid_items ORDER BY created_at`,
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
    `SELECT id, item_id, name, official_name, mask, type, subtype,
       current_balance::float8 AS current_balance,
       available_balance::float8 AS available_balance,
       credit_limit::float8 AS credit_limit,
       COALESCE(iso_currency_code, unofficial_currency_code) AS currency
     FROM accounts ORDER BY type, name`,
  );

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
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     ORDER BY t.date DESC, t.created_at DESC, t.id
     LIMIT $1`,
    [limit],
  );

  return {
    items: items.rows.map((item) => ({
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
    })),
    transactions: transactions.rows.map((txn) => ({
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
    })),
  };
}
