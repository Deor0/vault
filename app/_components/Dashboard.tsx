import { connection } from "next/server";
import { getDb } from "@/lib/server/context";
import { getDashboard, type Dashboard as DashboardData, type DashboardItem } from "@/lib/server/dashboard";
import { ConfigError } from "@/lib/server/env";
import { formatCategory, formatDateTime, formatMoney, formatTransactionAmount } from "../_lib/format";
import { PlaidLinkButton } from "./PlaidLinkButton";
import { RefreshButton } from "./RefreshButton";

/** Linked accounts, balances, and recent transactions, read from Postgres at request time. */
export async function Dashboard() {
  await connection();

  let data: DashboardData;
  try {
    data = await getDashboard(getDb());
  } catch (error) {
    return <SetupNotice message={setupMessage(error)} />;
  }

  return (
    <>
      <div className="toolbar">
        <PlaidLinkButton label="Link account" />
        {data.items.length > 0 ? <RefreshButton /> : null}
      </div>

      {data.items.length === 0 ? (
        <section className="card empty">
          <h2>No accounts linked yet</h2>
          <p>
            Use <strong>Link account</strong> to connect a bank through Plaid. In Sandbox, pick any
            institution and sign in with <code>user_good</code> / <code>pass_good</code>.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h2>Accounts</h2>
            {data.items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </section>
          <section>
            <h2>Recent transactions</h2>
            <TransactionsTable data={data} />
          </section>
        </>
      )}
    </>
  );
}

function ItemCard({ item }: { item: DashboardItem }) {
  const needsLogin = item.status === "login_required";
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>{item.institutionName ?? "Linked institution"}</h3>
          <p className="muted">Last synced {formatDateTime(item.lastSyncedAt)}</p>
        </div>
        <div className="card-actions">
          {needsLogin ? (
            <span className="badge warn">Login required</span>
          ) : item.status === "error" ? (
            <span className="badge warn">Sync error{item.errorCode ? `: ${item.errorCode}` : ""}</span>
          ) : null}
          {/* Update mode re-authenticates this Item instead of creating a new one. */}
          <PlaidLinkButton
            itemId={item.id}
            label="Reconnect"
            className={needsLogin ? "button primary" : "button subtle"}
          />
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th className="num">Current</th>
            <th className="num">Available</th>
          </tr>
        </thead>
        <tbody>
          {item.accounts.map((account) => (
            <tr key={account.id}>
              <td>
                {account.name}
                {account.mask ? <span className="muted"> ••{account.mask}</span> : null}
              </td>
              <td className="muted">{[account.type, account.subtype].filter(Boolean).join(" · ")}</td>
              <td className="num">{formatMoney(account.currentBalance, account.currency)}</td>
              <td className="num">{formatMoney(account.availableBalance, account.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable({ data }: { data: DashboardData }) {
  if (data.transactions.length === 0) {
    return (
      <p className="muted">
        No transactions yet. Plaid can take a little while to pull history for a new link; press
        Refresh in a minute.
      </p>
    );
  }
  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Account</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((txn) => (
            <tr key={txn.id}>
              <td className="nowrap">{txn.date}</td>
              <td>
                {txn.merchantName ?? txn.name}
                {txn.pending ? <span className="badge">Pending</span> : null}
              </td>
              <td className="muted">{formatCategory(txn.category)}</td>
              <td className="muted">
                {txn.accountName}
                {txn.accountMask ? ` ••${txn.accountMask}` : ""}
              </td>
              <td className={`num ${txn.amount > 0 ? "" : "positive"}`}>
                {formatTransactionAmount(txn.amount, txn.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function setupMessage(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "42P01") return "The database schema is missing. Run `npm run db:migrate`.";
  const message = error instanceof Error ? error.message : "";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || /timeout.*connect|connection timeout/i.test(message)) {
    return "Cannot reach Postgres. Start it with `docker compose up -d db` and check DATABASE_URL.";
  }
  if (code === "28P01" || code === "3D000") {
    return "Postgres rejected the connection. Check the credentials and database name in DATABASE_URL.";
  }
  console.error(`Dashboard failed to load: ${message || "unknown error"}`);
  return "The dashboard could not load. Check the server logs.";
}

function SetupNotice({ message }: { message: string }) {
  return (
    <section className="card notice">
      <h2>Vault is not ready yet</h2>
      <p>{message}</p>
      <p className="muted">See the README for local setup steps.</p>
    </section>
  );
}
