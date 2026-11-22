import { Plaid } from "plaid";
import { decryptSecret } from "./crypto";
import { CLIENT_USER_ID, type Deps } from "./deps";
import { NotFoundError } from "./errors";
import { getItem, setItemStatus } from "./repo";
import { syncItem, type SyncResult } from "./sync";

/** Days of transaction history to request when an Item is first linked (Plaid max is 730). */
export const TRANSACTIONS_DAYS_REQUESTED = 730;

export type LinkMode = "create" | "update";

/**
 * Create a Link token.
 *
 * Without `itemId` this starts a new Item. With `itemId` it creates an
 * update-mode token for that existing Item, so re-authenticating reuses the
 * Item instead of consuming another one (the Plaid Trial plan allows only 10
 * Items over the account's lifetime).
 */
export async function createLinkToken(
  deps: Pick<Deps, "db" | "plaid" | "encryptionKey" | "redirectUri">,
  options: { itemId?: string } = {},
): Promise<{ linkToken: string; mode: LinkMode }> {
  const base: Plaid.LinkTokenCreateRequest = {
    client_name: "Vault",
    language: "en",
    country_codes: [Plaid.CountryCode.Us],
    user: { client_user_id: CLIENT_USER_ID },
    ...(deps.redirectUri ? { redirect_uri: deps.redirectUri } : {}),
  };

  if (options.itemId) {
    const item = await getItem(deps.db, options.itemId);
    if (!item) throw new NotFoundError("Linked item not found");
    const accessToken = decryptSecret(item.access_token_ciphertext, deps.encryptionKey, item.plaid_item_id);
    // Update mode: pass the Item's access_token and no products.
    const response = await deps.plaid.createLinkToken({
      ...base,
      access_token: accessToken,
      update: { account_selection_enabled: true },
    });
    return { linkToken: response.link_token, mode: "update" };
  }

  const response = await deps.plaid.createLinkToken({
    ...base,
    products: [Plaid.Products.Transactions],
    transactions: { days_requested: TRANSACTIONS_DAYS_REQUESTED },
  });
  return { linkToken: response.link_token, mode: "create" };
}

/**
 * Called after update-mode Link succeeds. Update mode keeps the same Item and
 * access_token, so there is no token to exchange: clear the error state and
 * re-sync.
 */
export async function completeUpdateMode(
  deps: Pick<Deps, "db" | "plaid" | "encryptionKey">,
  itemId: string,
): Promise<SyncResult> {
  const item = await getItem(deps.db, itemId);
  if (!item) throw new NotFoundError("Linked item not found");
  await setItemStatus(deps.db, item.id, "active", null);
  return syncItem(deps, item.id);
}
