import Link from "next/link";
import type { DashboardItem } from "@/lib/server/dashboard";
import {
  inView,
  summarize,
  type Subscription,
  type SubscriptionsData,
  type SubscriptionTotals,
  type SubscriptionView,
} from "@/lib/server/subscriptions";
import { loadItems, loadSubscriptions, requirePageUserId } from "../_lib/data";
import { formatMoney, formatShortDate } from "../_lib/format";
import { setupMessage } from "../_lib/setup";
import { EmptyState } from "./EmptyState";
import { PageActions } from "./PageActions";
import { PageHeader } from "./PageHeader";
import { SetupNotice } from "./SetupNotice";
import { ReviewActions, IgnoredList, SubscriptionsTable } from "./SubscriptionsTable";

const VIEWS: { view: SubscriptionView; label: string }[] = [
  { view: "subscriptions", label: "Subscriptions" },
  { view: "bills", label: "Bills" },
  { view: "all", label: "All" },
];

function parseView(value: string | string[] | undefined): SubscriptionView {
  return VIEWS.some(({ view }) => view === value) ? (value as SubscriptionView) : "subscriptions";
}

/**
 * Recurring charges detected from stored transactions: what you pay each month
 * and year, what is due next, new or changed charges, and where to cancel.
 */
export async function SubscriptionsView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requirePageUserId();
  const view = parseView((await searchParams).view);
  let items: DashboardItem[];
  let data: SubscriptionsData;
  try {
    [items, data] = await Promise.all([loadItems(userId), loadSubscriptions(userId)]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Subscriptions" />
        <SetupNotice message={setupMessage(error)} />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Subscriptions" subtitle="Nothing linked yet." />
        <EmptyState />
      </>
    );
  }

  const active = data.active.filter((sub) => inView(sub, view));
  const inactive = data.inactive.filter((sub) => inView(sub, view));
  const totals = summarize(active, data.today);
  const review = data.active.filter((sub) => sub.needsReview);
  const viewCounts = Object.fromEntries(
    VIEWS.map(({ view: v }) => [v, data.active.filter((sub) => inView(sub, v)).length]),
  ) as Record<SubscriptionView, number>;

  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Recurring charges Vault found in your transactions">
        <PageActions hasItems />
      </PageHeader>
      <TotalsCard totals={totals} view={view} />
      {data.chargedAfterCancel.map((sub) => (
        <ChargedAfterCancelLine key={sub.key} subscription={sub} />
      ))}
      {review.length > 0 ? <ReviewLine subscriptions={review} /> : null}
      <section className="section" aria-label="Recurring charges">
        <nav className="segmented view-tabs" aria-label="Show">
          {VIEWS.map(({ view: v, label }) => (
            <Link
              key={v}
              href={v === "subscriptions" ? "/subscriptions" : `/subscriptions?view=${v}`}
              className={v === view ? "segment active" : "segment"}
              aria-current={v === view ? "page" : undefined}
            >
              {label} <span className="mono muted">{viewCounts[v]}</span>
            </Link>
          ))}
        </nav>
        {active.length > 0 ? (
          <SubscriptionsTable subscriptions={active} today={data.today} />
        ) : (
          <p className="muted panel-note">{emptyMessage(view, data)}</p>
        )}
      </section>
      {inactive.length > 0 ? (
        <section className="section" aria-label="Inactive">
          <header className="section-header wrap">
            <h2>
              Inactive <span className="mono muted">{inactive.length}</span>
            </h2>
            <span className="hint">Cancelled, or not charged since the last expected date</span>
          </header>
          <SubscriptionsTable subscriptions={inactive} today={data.today} inactive />
        </section>
      ) : null}
      {data.ignored.length > 0 ? <IgnoredList subscriptions={data.ignored} /> : null}
      <p className="hint">
        Found by looking for regular charges in the last 24 months of transactions ({data.transactionCount} read).
        Cancel links and steps are best effort; the merchant&apos;s own page is authoritative. Vault never contacts a
        merchant: marking something cancelled only tells Vault to watch for another charge.
      </p>
    </>
  );
}

function emptyMessage(view: SubscriptionView, data: SubscriptionsData): string {
  if (data.transactionCount === 0) {
    return "No transactions yet. Plaid can take a little while to pull history for a new link; press Refresh in a minute.";
  }
  const what = view === "bills" ? "recurring bills" : view === "all" ? "recurring charges" : "subscriptions";
  return `No active ${what} found. A charge needs a regular rhythm (weekly to yearly) to show up here.`;
}

function TotalsCard({ totals, view }: { totals: SubscriptionTotals; view: SubscriptionView }) {
  const label = view === "bills" ? "Recurring bills" : view === "all" ? "Recurring spend" : "Subscriptions";
  return (
    <section className="panel networth subs-totals" aria-label="Totals">
      <div className="networth-head">
        <div className="networth-main">
          <span className="label">{label} per month</span>
          <span className="networth-figure mono">{formatMoney(totals.monthly, totals.currency)}</span>
        </div>
        <dl className="networth-facts">
          <div>
            <dt>Per year</dt>
            <dd className="mono">{formatMoney(totals.yearly, totals.currency)}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd className="mono">{totals.activeCount}</dd>
          </div>
          <div>
            <dt>Next 30 days</dt>
            <dd className="mono">
              {formatMoney(totals.upcoming30, totals.currency)}
              <span className="muted"> · {totals.upcomingCount}</span>
            </dd>
          </div>
          <div>
            <dt>New</dt>
            <dd className={`mono ${totals.newCount > 0 ? "accent" : ""}`}>{totals.newCount}</dd>
          </div>
        </dl>
      </div>
      {totals.otherCurrency > 0 ? (
        <p className="hint">
          {totals.otherCurrency} {totals.otherCurrency === 1 ? "charge bills" : "charges bill"} in another currency and{" "}
          {totals.otherCurrency === 1 ? "is" : "are"} not in these totals.
        </p>
      ) : null}
    </section>
  );
}

function ChargedAfterCancelLine({ subscription }: { subscription: Subscription }) {
  const latest = subscription.chargedAfterCancel[0];
  return (
    <div className="alert-line alert-bad" role="alert">
      <span className="tag tag-error">charged after cancel</span>
      <span>
        <strong>{subscription.name}</strong> charged {formatMoney(latest.amount, subscription.currency)} on{" "}
        {formatShortDate(latest.date)}, after you marked it cancelled on {formatShortDate(subscription.cancelledAt!)}.
        Check the merchant&apos;s cancellation confirmation; if the charge should not have happened, dispute it with
        your bank or card issuer.
      </span>
    </div>
  );
}

function ReviewLine({ subscriptions }: { subscriptions: Subscription[] }) {
  return (
    <section className="alert-line alert-review" aria-label="Needs review">
      <span className="tag tag-new">needs review</span>
      <div className="review-body">
        <p>
          {subscriptions.length === 1 ? "A new recurring charge" : `${subscriptions.length} new recurring charges`}. Keep
          the ones you pay for; ignore anything that is not a subscription or bill.
        </p>
        <ul className="review-list">
          {subscriptions.map((sub) => (
            <li key={sub.key}>
              <ReviewActions subscription={sub} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
