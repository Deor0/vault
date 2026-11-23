/** Display formatting shared by server and client components. */

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    // Plaid's unofficial currency codes (e.g. crypto) are not ISO 4217.
    return `${amount.toFixed(2)} ${code}`;
  }
}

/**
 * Plaid amounts are positive when money leaves the account. Flip the sign so
 * the UI reads naturally: spending shows as negative, income as positive.
 */
export function formatTransactionAmount(amount: number, currency: string | null): string {
  const display = -amount;
  const formatted = formatMoney(Math.abs(display), currency);
  return display < 0 ? `−${formatted}` : `+${formatted}`;
}

export function formatCategory(category: string | null): string {
  if (!category) return "";
  return category
    .toLowerCase()
    .split("_")
    .map((word) => (word === "and" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

/** A signed balance, with a true minus sign so negative figures line up in mono type. */
export function formatBalance(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const formatted = formatMoney(Math.abs(amount), currency);
  return amount < 0 ? `−${formatted}` : formatted;
}

/** "Mon, Nov 2, 2026" for a Plaid `YYYY-MM-DD` date (a calendar day, so no time zone shift). */
export function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Split a newest-first list into consecutive runs that share a date, keeping the order. */
export function groupByDay<T extends { date: string }>(rows: T[]): { date: string; rows: T[] }[] {
  const groups: { date: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }
  return groups;
}

/** Human labels for Plaid account types. */
export function formatAccountType(type: string, subtype: string | null): string {
  return [type, subtype].filter(Boolean).join(" · ");
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semi_monthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

/** "Monthly", "Every 2 weeks", … for a detected cadence. */
export function formatCadence(cadence: string): string {
  return CADENCE_LABELS[cadence] ?? cadence;
}

/** Whole days from `today` to `date` (both `YYYY-MM-DD`). */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "today", "tomorrow", "in 12 days", "3 days ago" for a calendar day relative to `today`. */
export function formatRelativeDay(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "Dec 21, 2026" for a Plaid `YYYY-MM-DD` date. */
export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
