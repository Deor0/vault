import type { Plaid } from "plaid";
import { vi } from "vitest";
import type { PlaidApi } from "@/lib/server/plaid/client";

/** Builders and a fake PlaidApi so tests never call Plaid. */

export function makeAccount(overrides: Partial<Plaid.AccountBase> = {}): Plaid.AccountBase {
  return {
    account_id: "acc-checking",
    name: "Plaid Checking",
    official_name: "Plaid Gold Standard 0% Interest Checking",
    mask: "0000",
    type: "depository",
    subtype: "checking",
    balances: {
      available: 100,
      current: 110,
      limit: null,
      iso_currency_code: "USD",
      unofficial_currency_code: null,
    },
    ...overrides,
  } as Plaid.AccountBase;
}

export function makeTransaction(overrides: Partial<Plaid.Transaction> = {}): Plaid.Transaction {
  return {
    transaction_id: "txn-1",
    account_id: "acc-checking",
    amount: 12.5,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-11-01",
    authorized_date: "2026-10-31",
    authorized_datetime: null,
    datetime: null,
    name: "Coffee Shop",
    merchant_name: "Coffee Shop",
    pending: false,
    pending_transaction_id: null,
    account_owner: null,
    payment_channel: "in store",
    payment_meta: {} as Plaid.PaymentMeta,
    location: {} as Plaid.Location,
    transaction_code: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
    ...overrides,
  } as Plaid.Transaction;
}

export function makeSyncPage(overrides: Partial<Plaid.TransactionsSyncResponse> = {}): Plaid.TransactionsSyncResponse {
  return {
    transactions_update_status: "HISTORICAL_UPDATE_COMPLETE",
    accounts: [],
    added: [],
    modified: [],
    removed: [],
    next_cursor: "cursor-1",
    has_more: false,
    request_id: "req-sync",
    ...overrides,
  } as Plaid.TransactionsSyncResponse;
}

export function makeAccountsResponse(
  accounts: Plaid.AccountBase[] = [makeAccount()],
  item: Partial<Plaid.Item> = {},
): Plaid.AccountsGetResponse {
  return {
    accounts,
    item: {
      item_id: "plaid-item-1",
      institution_id: "ins_109508",
      institution_name: "First Platypus Bank",
      webhook: null,
      error: null,
      available_products: [],
      billed_products: ["transactions"],
      products: ["transactions"],
      consent_expiration_time: null,
      update_type: "background",
      ...item,
    } as Plaid.Item,
    request_id: "req-accounts",
  } as Plaid.AccountsGetResponse;
}

/** Shape of an error thrown by the Plaid SDK: the Plaid error envelope lives on `body`. */
export function plaidApiError(errorCode: string, errorType = "ITEM_ERROR"): Error & { body: Plaid.PlaidError } {
  return Object.assign(new Error(`Plaid error ${errorCode}`), {
    statusCode: 400,
    body: {
      error_type: errorType,
      error_code: errorCode,
      error_message: `simulated ${errorCode}`,
      display_message: null,
      request_id: "req-error",
    } as Plaid.PlaidError,
  });
}

export const ACCESS_TOKEN = "access-sandbox-11111111-2222-3333-4444-555555555555";

export function createFakePlaid() {
  const fake = {
    createLinkToken: vi.fn<PlaidApi["createLinkToken"]>(async () => ({
      link_token: "link-sandbox-token",
      expiration: "2026-11-22T00:00:00Z",
      request_id: "req-link",
    })),
    exchangePublicToken: vi.fn<PlaidApi["exchangePublicToken"]>(async () => ({
      access_token: ACCESS_TOKEN,
      item_id: "plaid-item-1",
      request_id: "req-exchange",
    })),
    getAccounts: vi.fn<PlaidApi["getAccounts"]>(async () => makeAccountsResponse()),
    syncTransactions: vi.fn<PlaidApi["syncTransactions"]>(async () => makeSyncPage()),
    removeItem: vi.fn<PlaidApi["removeItem"]>(async () => undefined),
  };
  return fake satisfies PlaidApi;
}

export type FakePlaid = ReturnType<typeof createFakePlaid>;
