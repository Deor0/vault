import type { DashboardItem } from "@/lib/server/dashboard";
import { loadItems, requirePageUserId } from "../_lib/data";
import { formatAccountType, formatDateTime, formatMoney } from "../_lib/format";
import { setupMessage } from "../_lib/setup";
import { EmptyState } from "./EmptyState";
import { PageActions } from "./PageActions";
import { PageHeader } from "./PageHeader";
import { PlaidLinkButton } from "./PlaidLinkButton";
import { SetupNotice } from "./SetupNotice";
import { StatusTag } from "./StatusTag";

/** Every linked account in one table, grouped by institution, with sync status and Reconnect inline. */
export async function AccountsView() {
  const userId = await requirePageUserId();
  let items: DashboardItem[];
  try {
    items = await loadItems(userId);
  } catch (error) {
    return (
      <>
        <PageHeader title="Accounts" />
        <SetupNotice message={setupMessage(error)} />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Accounts" subtitle="Nothing linked yet." />
        <EmptyState />
      </>
    );
  }

  const accountCount = items.reduce((count, item) => count + item.accounts.length, 0);
  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${accountCount} ${accountCount === 1 ? "account" : "accounts"} at ${items.length} ${
          items.length === 1 ? "institution" : "institutions"
        }`}
      >
        <PageActions hasItems />
      </PageHeader>
      <div className="panel table-panel">
        <table className="accounts-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">
                Current
              </th>
              <th scope="col" className="num">
                Available
              </th>
              <th scope="col" className="num">
                Limit
              </th>
            </tr>
          </thead>
          {items.map((item) => (
            <InstitutionRows key={item.id} item={item} />
          ))}
        </table>
      </div>
    </>
  );
}

function InstitutionRows({ item }: { item: DashboardItem }) {
  const needsLogin = item.status === "login_required";
  return (
    <tbody id={`item-${item.id}`}>
      <tr className="institution-row">
        <th scope="rowgroup" colSpan={5}>
          <div className="institution-head">
            <span className="institution-title">{item.institutionName ?? "Linked institution"}</span>
            <StatusTag status={item.status} errorCode={item.errorCode} />
            <span className="muted sync-time">
              synced <span className="mono">{formatDateTime(item.lastSyncedAt)}</span>
            </span>
            {/* Update mode re-authenticates this Item instead of creating a new one. */}
            <PlaidLinkButton
              itemId={item.id}
              label="Reconnect"
              className={needsLogin ? "button primary small" : "button subtle"}
            />
          </div>
        </th>
      </tr>
      {item.accounts.length === 0 ? (
        <tr>
          <td colSpan={5} className="muted">
            No accounts reported yet.
          </td>
        </tr>
      ) : (
        item.accounts.map((account) => (
          <tr key={account.id} className="account-row">
            <td className="acct-name">
              {account.name}
              {account.mask ? <span className="muted mono"> ••{account.mask}</span> : null}
            </td>
            <td className="acct-type muted">{formatAccountType(account.type, account.subtype)}</td>
            <td className="num" data-label="Current">
              {formatMoney(account.currentBalance, account.currency)}
            </td>
            <td className="num" data-label="Available">
              {formatMoney(account.availableBalance, account.currency)}
            </td>
            <td className="num" data-label="Limit">
              {formatMoney(account.creditLimit, account.currency)}
            </td>
          </tr>
        ))
      )}
    </tbody>
  );
}
