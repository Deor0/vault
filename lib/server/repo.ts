import type { Plaid } from "plaid";
import type { Queryable } from "./db/types";

/** SQL for Items, accounts, and transactions. All writes are idempotent upserts keyed on Plaid ids. */

export type ItemStatus = "active" | "login_required" | "error";

export interface ItemRow {
  id: string;
  plaid_item_id: string;
  access_token_ciphertext: string;
  institution_id: string | null;
  institution_name: string | null;
  status: ItemStatus;
  error_code: string | null;
  transactions_cursor: string | null;
}

const ITEM_COLUMNS = `id, plaid_item_id, access_token_ciphertext, institution_id, institution_name,
  status, error_code, transactions_cursor`;

export async function getItem(db: Queryable, id: string): Promise<ItemRow | null> {
  const { rows } = await db.query<ItemRow & Record<string, unknown>>(
    `SELECT ${ITEM_COLUMNS} FROM plaid_items WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listItems(db: Queryable): Promise<ItemRow[]> {
  const { rows } = await db.query<ItemRow & Record<string, unknown>>(
    `SELECT ${ITEM_COLUMNS} FROM plaid_items ORDER BY created_at`,
  );
  return rows;
}

export async function insertItem(
  db: Queryable,
  item: {
    plaidItemId: string;
    accessTokenCiphertext: string;
    institutionId: string | null;
    institutionName: string | null;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO plaid_items (plaid_item_id, access_token_ciphertext, institution_id, institution_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (plaid_item_id) DO UPDATE SET
       access_token_ciphertext = EXCLUDED.access_token_ciphertext,
       institution_id = EXCLUDED.institution_id,
       institution_name = EXCLUDED.institution_name,
       status = 'active',
       error_code = NULL,
       updated_at = now()
     RETURNING id`,
    [item.plaidItemId, item.accessTokenCiphertext, item.institutionId, item.institutionName],
  );
  return rows[0].id;
}

export async function setItemStatus(
  db: Queryable,
  id: string,
  status: ItemStatus,
  errorCode: string | null,
): Promise<void> {
  await db.query(
    `UPDATE plaid_items SET status = $2, error_code = $3, updated_at = now() WHERE id = $1`,
    [id, status, errorCode],
  );
}

/** Upsert accounts (with balances) for an Item, keyed on Plaid's account_id. */
export async function upsertAccounts(
  db: Queryable,
  itemId: string,
  accounts: Plaid.AccountBase[],
  options: { overwrite: boolean } = { overwrite: true },
): Promise<void> {
  for (const account of accounts) {
    const conflict = options.overwrite
      ? `DO UPDATE SET
           name = EXCLUDED.name,
           official_name = EXCLUDED.official_name,
           mask = EXCLUDED.mask,
           type = EXCLUDED.type,
           subtype = EXCLUDED.subtype,
           current_balance = EXCLUDED.current_balance,
           available_balance = EXCLUDED.available_balance,
           credit_limit = EXCLUDED.credit_limit,
           iso_currency_code = EXCLUDED.iso_currency_code,
           unofficial_currency_code = EXCLUDED.unofficial_currency_code,
           balances_updated_at = now(),
           updated_at = now()`
      : "DO NOTHING";
    await db.query(
      `INSERT INTO accounts (item_id, plaid_account_id, name, official_name, mask, type, subtype,
         current_balance, available_balance, credit_limit, iso_currency_code, unofficial_currency_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (plaid_account_id) ${conflict}`,
      [
        itemId,
        account.account_id,
        account.name,
        account.official_name ?? null,
        account.mask ?? null,
        account.type,
        account.subtype ?? null,
        account.balances.current ?? null,
        account.balances.available ?? null,
        account.balances.limit ?? null,
        account.balances.iso_currency_code ?? null,
        account.balances.unofficial_currency_code ?? null,
      ],
    );
  }
}

export class UnknownAccountError extends Error {
  constructor(plaidAccountId: string) {
    super(`Transaction references unknown account ${plaidAccountId}`);
  }
}

/** Upsert transactions (added or modified), keyed on Plaid's transaction_id. */
export async function upsertTransactions(
  db: Queryable,
  itemId: string,
  transactions: Plaid.Transaction[],
): Promise<void> {
  for (const txn of transactions) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO transactions (item_id, account_id, plaid_transaction_id, amount, iso_currency_code,
         unofficial_currency_code, date, authorized_date, name, merchant_name, category_primary,
         category_detailed, payment_channel, pending, pending_transaction_id)
       SELECT $1, a.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       FROM accounts a WHERE a.plaid_account_id = $2 AND a.item_id = $1
       ON CONFLICT (plaid_transaction_id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         amount = EXCLUDED.amount,
         iso_currency_code = EXCLUDED.iso_currency_code,
         unofficial_currency_code = EXCLUDED.unofficial_currency_code,
         date = EXCLUDED.date,
         authorized_date = EXCLUDED.authorized_date,
         name = EXCLUDED.name,
         merchant_name = EXCLUDED.merchant_name,
         category_primary = EXCLUDED.category_primary,
         category_detailed = EXCLUDED.category_detailed,
         payment_channel = EXCLUDED.payment_channel,
         pending = EXCLUDED.pending,
         pending_transaction_id = EXCLUDED.pending_transaction_id,
         updated_at = now()
       RETURNING id`,
      [
        itemId,
        txn.account_id,
        txn.transaction_id,
        txn.amount,
        txn.iso_currency_code ?? null,
        txn.unofficial_currency_code ?? null,
        txn.date,
        txn.authorized_date ?? null,
        txn.name,
        txn.merchant_name ?? null,
        txn.personal_finance_category?.primary ?? null,
        txn.personal_finance_category?.detailed ?? null,
        txn.payment_channel ?? null,
        txn.pending,
        txn.pending_transaction_id ?? null,
      ],
    );
    if (rows.length === 0) throw new UnknownAccountError(txn.account_id);
  }
}

export async function deleteTransactions(
  db: Queryable,
  itemId: string,
  plaidTransactionIds: string[],
): Promise<void> {
  if (plaidTransactionIds.length === 0) return;
  await db.query(
    `DELETE FROM transactions WHERE item_id = $1 AND plaid_transaction_id = ANY($2::text[])`,
    [itemId, plaidTransactionIds],
  );
}
