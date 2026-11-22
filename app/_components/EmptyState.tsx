import { plaidSetup } from "../_lib/setup";
import { PlaidLinkButton } from "./PlaidLinkButton";

/** First run: a setup checklist ending in Link account, with the Sandbox test login as an aside. */
export function EmptyState() {
  const plaid = plaidSetup();
  return (
    <div className="setup-grid">
      <section className="panel setup">
        <header className="panel-header">
          <h2>Set up this instance</h2>
          <span className="muted mono">{plaid.configured ? "2 / 3" : "1 / 3"}</span>
        </header>
        <ol className="checklist">
          <li className="done">
            <span className="check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Database reachable</strong>
              <p className="muted">Postgres is up and the schema is migrated.</p>
            </div>
          </li>
          <li className={plaid.configured ? "done" : "todo"}>
            <span className="check" aria-hidden="true">
              {plaid.configured ? "✓" : "○"}
            </span>
            <div>
              <strong>Plaid keys configured</strong>
              <p className="muted">
                {plaid.configured ? (
                  <>
                    Using Plaid <span className="mono">{plaid.env}</span>.
                  </>
                ) : (
                  <>
                    Set <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> in <code>.env</code>, then restart.
                  </>
                )}
              </p>
            </div>
          </li>
          <li className="todo current">
            <span className="check" aria-hidden="true">
              ○
            </span>
            <div>
              <strong>Link your first institution</strong>
              <p className="muted">
                Connect a bank, card, brokerage, or loan through Plaid. Vault imports balances and up to 24 months
                of transactions.
              </p>
              <div className="checklist-action">
                <PlaidLinkButton label="Link account" />
              </div>
            </div>
          </li>
        </ol>
        <p className="hint">
          Vault asks Plaid for read-only transaction access and keeps the access token encrypted (AES-256-GCM) in
          your own Postgres.
        </p>
      </section>
      {plaid.env === "sandbox" ? (
        <aside className="panel aside">
          <h3>Sandbox test login</h3>
          <p className="muted">
            In Sandbox, pick any institution (for example <em>First Platypus Bank</em>) and sign in with{" "}
            <code>user_good</code> / <code>pass_good</code>.
          </p>
        </aside>
      ) : null}
    </div>
  );
}
