import type { DashboardItem, DashboardTransaction } from "@/lib/server/dashboard";
import { loadItems, loadTransactions, requirePageUserId } from "../_lib/data";
import { setupMessage } from "../_lib/setup";
import { EmptyState } from "./EmptyState";
import { PageActions } from "./PageActions";
import { PageHeader } from "./PageHeader";
import { SetupNotice } from "./SetupNotice";
import { NoTransactions, TransactionsTable } from "./TransactionsTable";

export const TRANSACTIONS_PAGE_LIMIT = 250;

/** The latest transactions across every linked account. */
export async function TransactionsView() {
  const userId = await requirePageUserId();
  let items: DashboardItem[];
  let transactions: DashboardTransaction[];
  try {
    [items, transactions] = await Promise.all([loadItems(userId), loadTransactions(userId, TRANSACTIONS_PAGE_LIMIT)]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Transactions" />
        <SetupNotice message={setupMessage(error)} />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Transactions" subtitle="Nothing linked yet." />
        <EmptyState />
      </>
    );
  }

  const subtitle =
    transactions.length >= TRANSACTIONS_PAGE_LIMIT
      ? `Latest ${TRANSACTIONS_PAGE_LIMIT}, newest first`
      : `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}, newest first`;
  return (
    <>
      <PageHeader title="Transactions" subtitle={subtitle}>
        <PageActions hasItems />
      </PageHeader>
      {transactions.length > 0 ? <TransactionsTable transactions={transactions} /> : <NoTransactions />}
    </>
  );
}
