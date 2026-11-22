import Link from "next/link";
import { buildBalanceSheet, type BalanceSheet, type BalanceSheetGroup } from "@/lib/server/balance-sheet";
import type { DashboardItem, DashboardTransaction } from "@/lib/server/dashboard";
import { loadItems, loadTransactions, requirePageUserId } from "../_lib/data";
import { formatBalance, formatDateTime } from "../_lib/format";
import { setupMessage } from "../_lib/setup";
import { EmptyState } from "./EmptyState";
import { PageActions } from "./PageActions";
import { PageHeader } from "./PageHeader";
import { PlaidLinkButton } from "./PlaidLinkButton";
import { SetupNotice } from "./SetupNotice";
import { NoTransactions, TransactionsTable } from "./TransactionsTable";

export const OVERVIEW_TRANSACTIONS = 10;

/** The balance-sheet home: net worth, Reconnect lines, Assets | Liabilities by type, then recent activity. */
export async function Overview() {
  const userId = await requirePageUserId();
  let items: DashboardItem[];
  let transactions: DashboardTransaction[];
  try {
    [items, transactions] = await Promise.all([loadItems(userId), loadTransactions(userId, OVERVIEW_TRANSACTIONS)]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Overview" />
        <SetupNotice message={setupMessage(error)} />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Overview" subtitle="Nothing linked yet." />
        <EmptyState />
      </>
    );
  }

  const sheet = buildBalanceSheet(items);
  const needsLogin = items.filter((item) => item.status === "login_required");

  return (
    <>
      <PageHeader title="Overview">
        <PageActions hasItems />
      </PageHeader>
      <NetWorthBar sheet={sheet} items={items} />
      {needsLogin.map((item) => (
        <div key={item.id} className="reconnect-line" role="status">
          <span className="tag tag-login_required">login required</span>
          <span>
            <strong>{item.institutionName ?? "A linked institution"}</strong> needs you to sign in again. Its
            balances may be out of date.
          </span>
          {/* Update mode re-authenticates this Item instead of creating a new one. */}
          <PlaidLinkButton itemId={item.id} label="Reconnect" className="button primary small" />
        </div>
      ))}
      <BalanceSheetView sheet={sheet} />
      <section className="section">
        <header className="section-header">
          <h2>Recent transactions</h2>
          <Link href="/transactions" className="section-link">
            All transactions →
          </Link>
        </header>
        {transactions.length > 0 ? <TransactionsTable transactions={transactions} /> : <NoTransactions />}
      </section>
    </>
  );
}

function latestSync(items: DashboardItem[]): string | null {
  const times = items.map((item) => item.lastSyncedAt).filter((time): time is string => time !== null);
  return times.length > 0 ? times.sort().at(-1)! : null;
}

function NetWorthBar({ sheet, items }: { sheet: BalanceSheet; items: DashboardItem[] }) {
  const assets = Math.max(sheet.totalAssets, 0);
  const liabilities = Math.max(sheet.totalLiabilities, 0);
  const scale = assets + liabilities;
  const assetShare = scale > 0 ? Math.round((assets / scale) * 100) : 0;
  const accountCount = items.reduce((count, item) => count + item.accounts.length, 0);
  return (
    <section className="panel networth" aria-label="Net worth">
      <div className="networth-head">
        <div className="networth-main">
          <span className="label">Net worth</span>
          <span className={`networth-figure mono ${sheet.netWorth < 0 ? "negative" : ""}`}>
            {formatBalance(sheet.netWorth, sheet.currency)}
          </span>
        </div>
        <dl className="networth-facts">
          <div>
            <dt>Assets</dt>
            <dd className="mono">{formatBalance(sheet.totalAssets, sheet.currency)}</dd>
          </div>
          <div>
            <dt>Liabilities</dt>
            <dd className="mono">{formatBalance(sheet.totalLiabilities, sheet.currency)}</dd>
          </div>
          <div>
            <dt>Accounts</dt>
            <dd className="mono">
              {accountCount} in {items.length}
            </dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd className="mono">{formatDateTime(latestSync(items))}</dd>
          </div>
        </dl>
      </div>
      {scale > 0 ? (
        <div
          className="networth-bar"
          role="img"
          aria-label={`Assets ${assetShare}%, liabilities ${100 - assetShare}% of the total`}
        >
          <span className="networth-bar-assets" style={{ width: `${assetShare}%` }} />
          <span className="networth-bar-liabilities" style={{ width: `${100 - assetShare}%` }} />
        </div>
      ) : null}
    </section>
  );
}

function BalanceSheetView({ sheet }: { sheet: BalanceSheet }) {
  return (
    <section className="section balance-sheet" aria-label="Balance sheet">
      <div className="balance-columns">
        <BalanceBox title="Assets" groups={sheet.assets} total={sheet.totalAssets} currency={sheet.currency} />
        <BalanceBox
          title="Liabilities"
          groups={sheet.liabilities}
          total={sheet.totalLiabilities}
          currency={sheet.currency}
        />
      </div>
      <div className="balance-total">
        <span>Net worth</span>
        <span className="mono">
          {formatBalance(sheet.totalAssets, sheet.currency)} − {formatBalance(sheet.totalLiabilities, sheet.currency)} ={" "}
          <strong className={sheet.netWorth < 0 ? "negative" : ""}>{formatBalance(sheet.netWorth, sheet.currency)}</strong>
        </span>
      </div>
      {sheet.excluded.length > 0 ? (
        <p className="hint">
          Not in these totals:{" "}
          {sheet.excluded
            .map(
              ({ account, reason }) =>
                `${account.name}${account.mask ? ` ••${account.mask}` : ""} (${
                  reason === "no_balance" ? "no balance reported" : `held in ${account.currency}`
                })`,
            )
            .join(", ")}
          .
        </p>
      ) : null}
    </section>
  );
}

function BalanceBox({
  title,
  groups,
  total,
  currency,
}: {
  title: string;
  groups: BalanceSheetGroup[];
  total: number;
  currency: string;
}) {
  return (
    <div className="panel table-panel balance-box">
      <table className="balance-table">
        <caption>{title}</caption>
        {groups.length === 0 ? (
          <tbody>
            <tr>
              <td className="muted">No {title.toLowerCase()} linked.</td>
            </tr>
          </tbody>
        ) : (
          groups.map((group) => (
            <tbody key={group.key}>
              <tr className="group-row">
                <th scope="rowgroup">{group.label}</th>
                <td className="num">{formatBalance(group.subtotal, currency)}</td>
              </tr>
              {group.lines.map((line) => (
                <tr key={line.account.id}>
                  <td className="line-name">
                    {line.account.name}
                    {line.account.mask ? <span className="muted mono"> ••{line.account.mask}</span> : null}
                    {line.institutionName ? <span className="line-inst muted">{line.institutionName}</span> : null}
                  </td>
                  <td className="num">{formatBalance(line.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          ))
        )}
        <tfoot>
          <tr>
            <th scope="row">Total {title.toLowerCase()}</th>
            <td className="num">{formatBalance(total, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
