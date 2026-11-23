"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { CancelRoute } from "@/lib/server/cancel-links";
import type { OverrideInput, Subscription } from "@/lib/server/subscriptions";
import { postJson } from "../_lib/api";
import { cancellationEmail } from "../_lib/cancel-email";
import { formatCadence, formatMoney, formatRelativeDay, formatShortDate } from "../_lib/format";

/** Save the user's decision about a stream, then re-render the page with it. */
function useOverride() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(input: OverrideInput): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/subscriptions/override", input);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error };
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <span className="field-error" role="alert">
      {error}
    </span>
  ) : null;
}

function Account({ name, mask }: { name: string; mask: string | null }) {
  return (
    <>
      {name}
      {mask ? <span className="mono"> ••{mask}</span> : null}
    </>
  );
}

function Amount({ sub }: { sub: Subscription }) {
  return (
    <>
      {sub.variableAmount ? "~" : ""}
      {formatMoney(sub.amount, sub.currency)}
    </>
  );
}

function PriceChange({ sub }: { sub: Subscription }) {
  if (!sub.priceChange) return null;
  const up = sub.priceChange.to > sub.priceChange.from;
  return (
    <span
      className={`tag ${up ? "tag-up" : "tag-down"}`}
      title={`Changed on ${formatShortDate(sub.priceChange.date)}`}
    >
      {up ? "▲" : "▼"} {formatMoney(sub.priceChange.from, sub.currency)} → {formatMoney(sub.priceChange.to, sub.currency)}
    </span>
  );
}

function StatusBadges({ sub, inactive }: { sub: Subscription; inactive: boolean }) {
  return (
    <>
      {sub.needsReview ? <span className="tag tag-new">new</span> : null}
      {sub.kind === "bill" ? <span className="badge">bill</span> : null}
      {inactive && sub.cancelledAt ? (
        <span className={`tag ${sub.chargedAfterCancel.length > 0 ? "tag-error" : "tag-muted"}`}>
          {sub.chargedAfterCancel.length > 0 ? "charged after cancel" : `cancelled ${formatShortDate(sub.cancelledAt)}`}
        </span>
      ) : null}
      {inactive && !sub.cancelledAt ? (
        <span className="tag tag-muted">no charge since {formatShortDate(sub.lastDate)}</span>
      ) : null}
      <PriceChange sub={sub} />
    </>
  );
}

type Panel = "cancel" | "details" | null;

/**
 * Recurring charges as a table (two-line rows on phones). Each row opens a
 * Cancel panel (where and how to cancel, a ready-made email, Mark cancelled)
 * or a Details panel (every matched charge, rename, bill/subscription, ignore).
 */
export function SubscriptionsTable({
  subscriptions,
  today,
  inactive = false,
}: {
  subscriptions: Subscription[];
  today: string;
  inactive?: boolean;
}) {
  return (
    <div className="panel table-panel">
      <table className={`subs-table ${inactive ? "subs-inactive" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Cadence</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col">{inactive ? "Last charge" : "Next charge"}</th>
            <th scope="col">Account</th>
            <th scope="col" className="num">
              Per month
            </th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        {subscriptions.map((sub) => (
          <SubscriptionRow key={sub.key} sub={sub} today={today} inactive={inactive} />
        ))}
      </table>
    </div>
  );
}

function SubscriptionRow({ sub, today, inactive }: { sub: Subscription; today: string; inactive: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const panelId = useId();
  const toggle = (next: Exclude<Panel, null>) => setPanel((current) => (current === next ? null : next));
  const when = inactive ? sub.lastDate : sub.nextDate;

  return (
    <tbody className={panel ? "sub-group open" : "sub-group"}>
      <tr className="sub-row">
        <td className="sub-name">
          <span className="sub-title">{sub.name}</span>
          <span className="sub-badges">
            <StatusBadges sub={sub} inactive={inactive} />
          </span>
        </td>
        <td className="sub-cadence muted">{formatCadence(sub.cadence)}</td>
        <td className="sub-amount num">
          <Amount sub={sub} />
        </td>
        <td className="sub-when">
          <span className="mono">{when}</span>
          <span className="sub-relative hint">{formatRelativeDay(when, today)}</span>
        </td>
        <td className="sub-account muted">
          <Account name={sub.accountName} mask={sub.accountMask} />
        </td>
        <td className="sub-monthly num muted">{formatMoney(sub.monthlyAmount, sub.currency)}</td>
        <td className="sub-meta muted">
          {formatCadence(sub.cadence)} · {inactive ? "last" : "next"} <span className="mono">{when}</span> ·{" "}
          <Account name={sub.accountName} mask={sub.accountMask} />
        </td>
        <td className="sub-actions">
          <button
            type="button"
            className={panel === "cancel" ? "button subtle pressed" : "button subtle"}
            aria-expanded={panel === "cancel"}
            aria-controls={panelId}
            aria-label={`${inactive && sub.cancelledAt ? "Cancelled" : "Cancel"}: ${sub.name}`}
            onClick={() => toggle("cancel")}
          >
            {inactive && sub.cancelledAt ? "Cancelled" : "Cancel"} ▾
          </button>
          <button
            type="button"
            className={panel === "details" ? "button subtle pressed" : "button subtle"}
            aria-expanded={panel === "details"}
            aria-controls={panelId}
            aria-label={`Details: ${sub.name}`}
            onClick={() => toggle("details")}
          >
            Details
          </button>
        </td>
      </tr>
      {panel ? (
        <tr className="sub-panel-row">
          <td colSpan={8} id={panelId}>
            {panel === "cancel" ? <CancelPanel sub={sub} /> : <DetailsPanel sub={sub} />}
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  web: "website",
  app: "app",
  phone: "phone",
  chat: "chat",
  in_person: "in person",
  mail: "mail",
};

function RouteBlock({ route, primary }: { route: CancelRoute; primary: boolean }) {
  const label =
    route.source === "search"
      ? `Search how to cancel ${route.name === "Web search" ? "" : route.name}`.trim()
      : route.source === "platform"
        ? `Open ${route.name} subscriptions`
        : route.source === "website"
          ? `Open ${route.name}`
          : `Open ${route.name} cancel page`;
  return (
    <div className="cancel-route">
      <div className="cancel-route-head">
        <a
          href={route.url}
          target="_blank"
          rel="noopener noreferrer"
          className={primary ? "button primary small" : "button small"}
        >
          {route.source === "search" ? "Search the web" : label} ↗
        </a>
        {route.source === "platform" ? <span className="hint">Billed through {route.name}: cancel it there.</span> : null}
        {route.source !== "search" ? (
          <span className="cancel-channels">
            {route.channels.map((channel) => (
              <span key={channel} className="badge">
                {CHANNEL_LABELS[channel] ?? channel}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {route.steps.length > 0 ? (
        <ol className="cancel-steps">
          {route.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {route.links.length > 0 ? (
        <p className="hint">
          Also:{" "}
          {route.links.map((link, index) => (
            <span key={link.url}>
              {index > 0 ? ", " : null}
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label} ↗
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function CancelPanel({ sub }: { sub: Subscription }) {
  const { save, busy, error } = useOverride();
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const email = cancellationEmail(sub);
  const emailText = `Subject: ${email.subject}\n\n${email.body}`;
  const routes = sub.cancel.filter((route) => route.source !== "search");
  const search = sub.cancel.find((route) => route.source === "search");

  async function copy() {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="sub-panel cancel-panel">
      <div className="cancel-routes">
        <h3 className="label">Where to cancel</h3>
        {routes.length > 0 ? (
          routes.map((route, index) => <RouteBlock key={route.id} route={route} primary={index === 0} />)
        ) : (
          <p className="muted">Vault has no cancel page on file for this merchant.</p>
        )}
        {search ? (
          <p className="hint">
            Not right?{" "}
            <a href={search.url} target="_blank" rel="noopener noreferrer">
              Search how to cancel {sub.name} ↗
            </a>
          </p>
        ) : null}
      </div>
      <div className="cancel-side">
        <h3 className="label">Cancellation email</h3>
        <p className="hint">For merchants that cancel by email or chat. Fill in the bracketed lines before sending.</p>
        <div className="toolbar">
          <button type="button" className="button small" onClick={copy}>
            Copy cancellation email
          </button>
          {copied ? (
            <span className="hint" role="status">
              {copied === "copied" ? "Copied." : "Could not copy; select the text below."}
            </span>
          ) : null}
        </div>
        <details className="email-preview" open={copied === "failed"}>
          <summary className="hint">Show email</summary>
          <textarea readOnly value={emailText} rows={11} aria-label="Cancellation email" />
        </details>
        <h3 className="label">After you cancel</h3>
        {sub.cancelledAt ? (
          <>
            <p className="muted">
              Marked cancelled on {formatShortDate(sub.cancelledAt)}.{" "}
              {sub.chargedAfterCancel.length > 0
                ? `Charged ${sub.chargedAfterCancel.length} time${sub.chargedAfterCancel.length === 1 ? "" : "s"} since.`
                : "No charge since."}
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={() => save({ streamKey: sub.overrideKey, status: "confirmed" })}
              >
                Undo: still subscribed
              </button>
              <ErrorNote error={error} />
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Vault moves it to Inactive and flags any charge from this merchant after today.
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="button primary small"
                disabled={busy}
                onClick={() => save({ streamKey: sub.overrideKey, status: "cancelled" })}
              >
                {busy ? "Saving…" : "Mark cancelled"}
              </button>
              <ErrorNote error={error} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailsPanel({ sub }: { sub: Subscription }) {
  const { save, busy, error } = useOverride();
  const [name, setName] = useState(sub.name);
  const nameId = useId();
  const renamed = sub.name !== sub.detectedName;
  const otherKind = sub.kind === "bill" ? "subscription" : "bill";

  return (
    <div className="sub-panel details-panel">
      <div className="details-charges">
        <h3 className="label">Charges · {sub.charges.length}</h3>
        <table className="charges-table">
          <tbody>
            {sub.charges.map((charge) => (
              <tr key={charge.id}>
                <td className="mono nowrap">{charge.date}</td>
                <td className="muted">
                  <Account name={charge.accountName} mask={charge.accountMask} />
                </td>
                <td className={`num ${sub.chargedAfterCancel.some((late) => late.id === charge.id) ? "negative" : ""}`}>
                  {formatMoney(charge.amount, sub.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="details-side">
        <dl className="details-facts">
          <div>
            <dt>First charge</dt>
            <dd className="mono">{sub.firstDate}</dd>
          </div>
          <div>
            <dt>Last charge</dt>
            <dd className="mono">
              {sub.lastDate} · {formatMoney(sub.lastAmount, sub.currency)}
            </dd>
          </div>
          {sub.variableAmount ? (
            <div>
              <dt>Amount</dt>
              <dd>Varies; the typical (median) charge is used for totals.</dd>
            </div>
          ) : null}
          {renamed ? (
            <div>
              <dt>Detected as</dt>
              <dd>{sub.detectedName}</dd>
            </div>
          ) : null}
        </dl>
        <form
          className="rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ streamKey: sub.overrideKey, displayName: name.trim() === sub.detectedName ? null : name });
          }}
        >
          <div className="field">
            <label htmlFor={`${nameId}-name`}>Name</label>
            <input
              id={`${nameId}-name`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" className="button small" disabled={busy || name.trim() === "" || name === sub.name}>
            Rename
          </button>
        </form>
        <div className="toolbar">
          {sub.needsReview ? (
            <button
              type="button"
              className="button small"
              disabled={busy}
              onClick={() => save({ streamKey: sub.overrideKey, status: "confirmed" })}
            >
              Keep
            </button>
          ) : null}
          <button
            type="button"
            className="button small"
            disabled={busy}
            onClick={() => save({ streamKey: sub.overrideKey, kind: otherKind })}
          >
            File under {otherKind === "bill" ? "Bills" : "Subscriptions"}
          </button>
          <button
            type="button"
            className="button small"
            disabled={busy}
            onClick={() => save({ streamKey: sub.overrideKey, status: "ignored" })}
          >
            Not recurring: ignore
          </button>
          <ErrorNote error={error} />
        </div>
      </div>
    </div>
  );
}

/** One line of the "needs review" banner: name, amount, cadence, and Keep / Ignore. */
export function ReviewActions({ subscription: sub }: { subscription: Subscription }) {
  const { save, busy, error } = useOverride();
  return (
    <span className="review-item">
      <span className="review-name">
        <strong>{sub.name}</strong>{" "}
        <span className="muted">
          <Amount sub={sub} /> · {formatCadence(sub.cadence).toLowerCase()} · since{" "}
          <span className="mono">{sub.firstDate}</span>
        </span>
      </span>
      <span className="toolbar">
        <button
          type="button"
          className="button small"
          disabled={busy}
          aria-label={`Keep ${sub.name}`}
          onClick={() => save({ streamKey: sub.overrideKey, status: "confirmed" })}
        >
          Keep
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={busy}
          aria-label={`Ignore ${sub.name}`}
          onClick={() => save({ streamKey: sub.overrideKey, status: "ignored" })}
        >
          Ignore
        </button>
        <ErrorNote error={error} />
      </span>
    </span>
  );
}

/** Charges the user said are not recurring, collapsed, each with Restore. */
export function IgnoredList({ subscriptions }: { subscriptions: Subscription[] }) {
  return (
    <details className="ignored-list">
      <summary>
        Ignored <span className="mono muted">{subscriptions.length}</span>
      </summary>
      <ul>
        {subscriptions.map((sub) => (
          <li key={sub.key}>
            <IgnoredItem sub={sub} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function IgnoredItem({ sub }: { sub: Subscription }) {
  const { save, busy, error } = useOverride();
  return (
    <>
      <span>
        {sub.name}{" "}
        <span className="muted">
          <Amount sub={sub} /> · {formatCadence(sub.cadence).toLowerCase()}
        </span>
      </span>
      <button
        type="button"
        className="button subtle"
        disabled={busy}
        aria-label={`Restore ${sub.name}`}
        onClick={() => save({ streamKey: sub.overrideKey, status: "confirmed" })}
      >
        Restore
      </button>
      <ErrorNote error={error} />
    </>
  );
}
