import type { DashboardTransaction } from "@/lib/server/dashboard";
import { formatCategory, formatDay, formatTransactionAmount, groupByDay } from "../_lib/format";

/**
 * Transactions, newest first. A table on wide screens; on phones the CSS turns
 * each row into two lines under a day heading, so nothing scrolls sideways.
 */
export function TransactionsTable({ transactions }: { transactions: DashboardTransaction[] }) {
  return (
    <div className="panel table-panel">
      <table className="txn-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Category</th>
            <th scope="col">Account</th>
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        {groupByDay(transactions).map((day) => (
          <tbody key={day.date}>
            <tr className="day-row">
              <th scope="rowgroup" colSpan={5}>
                {formatDay(day.date)}
              </th>
            </tr>
            {day.rows.map((txn) => (
              <tr key={txn.id} className="txn-row">
                <td className="txn-date mono nowrap">{txn.date}</td>
                <td className="txn-desc">
                  {txn.merchantName ?? txn.name}
                  {txn.pending ? <span className="badge">Pending</span> : null}
                </td>
                <td className="txn-cat muted">{formatCategory(txn.category)}</td>
                <td className="txn-acct muted">
                  {txn.accountName}
                  {txn.accountMask ? <span className="mono"> ••{txn.accountMask}</span> : null}
                </td>
                <td className={`txn-amount num ${txn.amount > 0 ? "" : "positive"}`}>
                  {formatTransactionAmount(txn.amount, txn.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function NoTransactions() {
  return (
    <p className="muted panel-note">
      No transactions yet. Plaid can take a little while to pull history for a new link; press Refresh in a
      minute.
    </p>
  );
}
