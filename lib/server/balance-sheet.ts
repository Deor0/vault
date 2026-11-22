import type { DashboardAccount, DashboardItem } from "./dashboard";

/**
 * Net worth and the Assets | Liabilities split, computed from the balances
 * already stored for each account. Pure: no database access, no secrets.
 *
 * Plaid reports credit and loan balances as the amount owed (positive), so
 * liabilities are listed as positive amounts and subtracted from assets.
 */

export type BalanceSide = "asset" | "liability";

export type AccountGroupKey = "depository" | "investment" | "other" | "credit" | "loan";

export interface BalanceSheetLine {
  account: DashboardAccount;
  itemId: string;
  institutionName: string | null;
  amount: number;
}

export interface BalanceSheetGroup {
  key: AccountGroupKey;
  label: string;
  side: BalanceSide;
  lines: BalanceSheetLine[];
  subtotal: number;
}

export type ExcludedReason = "no_balance" | "other_currency";

export interface ExcludedAccount {
  account: DashboardAccount;
  institutionName: string | null;
  reason: ExcludedReason;
}

export interface BalanceSheet {
  /** Every total is in this currency; accounts in other currencies are listed in `excluded`. */
  currency: string;
  assets: BalanceSheetGroup[];
  liabilities: BalanceSheetGroup[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  excluded: ExcludedAccount[];
}

/** Plaid account types, in display order, with the side of the sheet they belong on. */
const GROUPS: { key: AccountGroupKey; label: string; side: BalanceSide }[] = [
  { key: "depository", label: "Cash", side: "asset" },
  { key: "investment", label: "Investments", side: "asset" },
  { key: "other", label: "Other", side: "asset" },
  { key: "credit", label: "Credit cards", side: "liability" },
  { key: "loan", label: "Loans", side: "liability" },
];

/** Missing currency codes are treated as USD, matching how amounts are formatted. */
const DEFAULT_CURRENCY = "USD";

export function groupKeyForType(type: string): AccountGroupKey {
  switch (type) {
    case "depository":
    case "investment":
    case "credit":
    case "loan":
      return type;
    // Older Plaid responses call investment accounts "brokerage".
    case "brokerage":
      return "investment";
    default:
      return "other";
  }
}

export function sideForType(type: string): BalanceSide {
  const key = groupKeyForType(type);
  return key === "credit" || key === "loan" ? "liability" : "asset";
}

function currencyOf(account: DashboardAccount): string {
  return account.currency ?? DEFAULT_CURRENCY;
}

/**
 * The currency most accounts with a balance are held in (USD wins a tie, then
 * alphabetical order), so totals never add different currencies together.
 */
export function primaryCurrency(accounts: DashboardAccount[]): string {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    if (account.currentBalance === null) continue;
    const code = currencyOf(account);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best = DEFAULT_CURRENCY;
  let bestCount = 0;
  for (const [code, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount || (count === bestCount && code === DEFAULT_CURRENCY)) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/** Add amounts stored with 4 decimal places without binary floating-point drift. */
function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + Math.round(amount * 10_000), 0) / 10_000;
}

export function buildBalanceSheet(items: DashboardItem[]): BalanceSheet {
  const currency = primaryCurrency(items.flatMap((item) => item.accounts));
  const linesByGroup = new Map<AccountGroupKey, BalanceSheetLine[]>();
  const excluded: ExcludedAccount[] = [];

  for (const item of items) {
    for (const account of item.accounts) {
      if (account.currentBalance === null) {
        excluded.push({ account, institutionName: item.institutionName, reason: "no_balance" });
        continue;
      }
      if (currencyOf(account) !== currency) {
        excluded.push({ account, institutionName: item.institutionName, reason: "other_currency" });
        continue;
      }
      const key = groupKeyForType(account.type);
      const lines = linesByGroup.get(key) ?? [];
      lines.push({ account, itemId: item.id, institutionName: item.institutionName, amount: account.currentBalance });
      linesByGroup.set(key, lines);
    }
  }

  const groups: BalanceSheetGroup[] = [];
  for (const { key, label, side } of GROUPS) {
    const lines = linesByGroup.get(key);
    if (!lines) continue;
    // Largest balances first; ties keep their stored order.
    lines.sort((a, b) => b.amount - a.amount);
    groups.push({ key, label, side, lines, subtotal: sum(lines.map((line) => line.amount)) });
  }

  const assets = groups.filter((group) => group.side === "asset");
  const liabilities = groups.filter((group) => group.side === "liability");
  const totalAssets = sum(assets.map((group) => group.subtotal));
  const totalLiabilities = sum(liabilities.map((group) => group.subtotal));

  return {
    currency,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: sum([totalAssets, -totalLiabilities]),
    excluded,
  };
}
