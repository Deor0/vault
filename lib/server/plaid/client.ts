import "server-only";
import { Plaid, PlaidClient, PlaidEnvironment, PlaidError } from "plaid";
import type { PlaidConfig } from "../env";

/**
 * The narrow slice of the Plaid API Vault uses. Server logic depends on this
 * interface rather than the SDK class, so tests can substitute a fake.
 */
export interface PlaidApi {
  createLinkToken(request: Plaid.LinkTokenCreateRequest): Promise<Plaid.LinkTokenCreateResponse>;
  exchangePublicToken(publicToken: string): Promise<Plaid.ItemPublicTokenExchangeResponse>;
  getAccounts(accessToken: string): Promise<Plaid.AccountsGetResponse>;
  syncTransactions(accessToken: string, cursor: string | undefined): Promise<Plaid.TransactionsSyncResponse>;
  removeItem(accessToken: string): Promise<void>;
}

export function plaidBaseUrl(env: PlaidConfig["env"]): string {
  return env === "production" ? PlaidEnvironment.Production : PlaidEnvironment.Sandbox;
}

export function createPlaidApi(config: PlaidConfig): PlaidApi {
  const client = new PlaidClient({
    environment: plaidBaseUrl(config.env),
    clientId: config.clientId,
    secret: config.secret,
    timeoutInSeconds: 30,
    maxRetries: 1,
  });

  return {
    createLinkToken: (request) => client.link.createToken(request),
    exchangePublicToken: (publicToken) => client.item.exchangePublicToken({ public_token: publicToken }),
    getAccounts: (accessToken) => client.accounts.get({ access_token: accessToken }),
    syncTransactions: (accessToken, cursor) =>
      client.transactions.sync({
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
        count: 500,
        options: { include_personal_finance_category: true },
      }),
    removeItem: async (accessToken) => {
      await client.item.remove({ access_token: accessToken });
    },
  };
}

/** The Plaid-specific fields of an API error, safe to log and show (no secrets). */
export interface PlaidErrorInfo {
  errorType: string;
  errorCode: string;
  displayMessage: string | null;
  requestId?: string;
}

/**
 * Extract Plaid's error envelope from a thrown SDK error. Returns null for
 * non-Plaid failures (network errors, bugs). Accepts any object carrying a
 * Plaid error `body` so test fakes need not construct SDK error classes.
 */
export function plaidErrorInfo(error: unknown): PlaidErrorInfo | null {
  if (typeof error !== "object" || error === null) return null;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== "object" || body === null) return null;
  const { error_type, error_code, display_message, request_id } = body as Record<string, unknown>;
  if (typeof error_code !== "string" || typeof error_type !== "string") return null;
  return {
    errorType: error_type,
    errorCode: error_code,
    displayMessage: typeof display_message === "string" ? display_message : null,
    requestId:
      typeof request_id === "string"
        ? request_id
        : error instanceof PlaidError
          ? error.requestId
          : undefined,
  };
}

/** Error codes meaning the user must re-authenticate through update-mode Link. */
export const LOGIN_REQUIRED_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "ACCESS_NOT_GRANTED",
  "NO_ACCOUNTS",
]);

export function requiresUpdateMode(info: PlaidErrorInfo | null): boolean {
  return info !== null && info.errorType === "ITEM_ERROR" && LOGIN_REQUIRED_CODES.has(info.errorCode);
}
