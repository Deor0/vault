import { PlaidLinkButton } from "./PlaidLinkButton";
import { RefreshButton } from "./RefreshButton";

/** Link account, plus Refresh once something is linked. */
export function PageActions({ hasItems }: { hasItems: boolean }) {
  return (
    <>
      <PlaidLinkButton label="Link account" />
      {hasItems ? <RefreshButton /> : null}
    </>
  );
}
