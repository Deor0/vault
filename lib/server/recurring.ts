/**
 * Recurring-charge detection over stored transactions (pure; no database).
 *
 * Charges are grouped by merchant (Plaid's `merchant_entity_id` when known,
 * otherwise a normalized merchant name), and each group is tested for a
 * regular cadence. A merchant that bills two plans (two Apple subscriptions,
 * say) is split by amount when the whole group is not regular on its own.
 */

export interface RecurringInput {
  id: string;
  /** Posted date, YYYY-MM-DD. */
  date: string;
  /** When the card was charged, if Plaid reports it; preferred for cadence because posting lags vary. */
  authorizedDate: string | null;
  /** Plaid convention: positive = money out. */
  amount: number;
  currency: string | null;
  name: string;
  merchantName: string | null;
  merchantEntityId: string | null;
  website: string | null;
  accountId: string;
  pending: boolean;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
}

export type Cadence = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "quarterly" | "annual";

export interface RecurringCharge {
  id: string;
  /** The charge date used for cadence: authorized date, else posted date. */
  date: string;
  amount: number;
  accountId: string;
}

export interface RecurringStream {
  /** Stable id for this stream, used to store the user's decisions about it. */
  key: string;
  /** Other keys the same stream may have been stored under (for example before Plaid sent a merchant id). */
  aliasKeys: string[];
  /** Keys of the whole merchant group this amount band was split from; a decision stored there applies only if this band's charges predate it. */
  parentKeys: string[];
  /** For a whole merchant group: the amount-band keys its latest plan had while the group was split. A newer decision stored there wins. */
  bandKeys: string[];
  label: string;
  merchantName: string | null;
  website: string | null;
  /** Lower-cased descriptor text (merchant name, raw name, website) for matching cancel links. */
  descriptor: string;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  currency: string | null;
  cadence: Cadence;
  /** Oldest first. */
  charges: RecurringCharge[];
  firstDate: string;
  lastDate: string;
  lastAmount: number;
  /** The amount to expect: the latest amount, or the median for a bill whose amount varies. */
  typicalAmount: number;
  variableAmount: boolean;
  /** The amount stepped up or down recently on an otherwise fixed charge. */
  priceChange: { from: number; to: number; date: string } | null;
  nextDate: string;
  monthlyAmount: number;
  active: boolean;
  /** Only two charges so far (monthly or longer cadence): plausible, not yet proven. */
  early: boolean;
  accountId: string;
}

interface CadenceRule {
  cadence: Cadence;
  /** Typical gap in days. */
  days: number;
  /** Accepted distance of the median gap from `days`. */
  tolerance: number;
  /** Charges needed before a stream counts. */
  minCharges: number;
  /** Calendar months per period, when the charge follows a day of the month. */
  months?: number;
}

const RULES: CadenceRule[] = [
  { cadence: "weekly", days: 7, tolerance: 1, minCharges: 4 },
  { cadence: "biweekly", days: 14, tolerance: 1, minCharges: 3 },
  { cadence: "semi_monthly", days: 15.22, tolerance: 2.5, minCharges: 4 },
  { cadence: "monthly", days: 30.44, tolerance: 4, minCharges: 3, months: 1 },
  { cadence: "quarterly", days: 91.31, tolerance: 8, minCharges: 3, months: 3 },
  { cadence: "annual", days: 365.25, tolerance: 12, minCharges: 2, months: 12 },
];

const PERIOD_DAYS: Record<Cadence, number> = Object.fromEntries(RULES.map((r) => [r.cadence, r.days])) as Record<
  Cadence,
  number
>;

/** Money movement between your own accounts, income, and fees: never a subscription or a bill. */
const EXCLUDED_PRIMARY = new Set(["INCOME", "TRANSFER_IN", "TRANSFER_OUT", "BANK_FEES", "LOAN_DISBURSEMENTS"]);
const EXCLUDED_DETAILED = new Set(["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);

/** Everyday spending that repeats by habit rather than by contract. */
const HABITUAL_PRIMARY = new Set(["FOOD_AND_DRINK", "TRANSPORTATION", "TRAVEL"]);

/** Bills whose amount legitimately varies month to month. */
const VARIABLE_BILL_PRIMARY = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS", "GOVERNMENT_AND_NON_PROFIT"]);

const DAY_MS = 86_400_000;
/** A charge refunded in full within this many days is treated as if it never happened. */
const REFUND_WINDOW_DAYS = 10;
const AMOUNT_EPSILON = 0.005;

/** Collapse descriptor noise ("NETFLIX.COM 866-579-7172 CA", "SPOTIFY USA*P1234") to a merchant key. */
export function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pos|ach|debit|purchase|recurring|autopay|payment|pmt|www)\b/g, " ")
    .replace(/[#*][\w-]*/g, " ")
    .replace(/\d[\d-]{2,}/g, " ")
    .replace(/\.(com|net|org|io|tv|co)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toDays(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

export function fromDays(days: number): string {
  return new Date(Math.round(days) * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDays(toDays(date) + days);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function chargeDate(txn: RecurringInput): string {
  return txn.authorizedDate ?? txn.date;
}

/** Detect recurring outflows. `today` is YYYY-MM-DD. Streams come back soonest-next first. */
export function detectRecurring(transactions: RecurringInput[], today: string): RecurringStream[] {
  const nameKeyOf = (txn: RecurringInput) => normalizeMerchant(txn.merchantName ?? txn.name);

  // Rows without a merchant id join the merchant id their name is most often seen with,
  // so history stored before Plaid sent ids stays in the same stream.
  const entityByName = new Map<string, Map<string, number>>();
  for (const txn of transactions) {
    if (!txn.merchantEntityId) continue;
    const counts = entityByName.get(nameKeyOf(txn)) ?? new Map<string, number>();
    counts.set(txn.merchantEntityId, (counts.get(txn.merchantEntityId) ?? 0) + 1);
    entityByName.set(nameKeyOf(txn), counts);
  }
  const groupKeyOf = (txn: RecurringInput) => {
    const nameKey = nameKeyOf(txn);
    const entity =
      txn.merchantEntityId ??
      [...(entityByName.get(nameKey)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;
    return { key: entity ? `e:${entity}` : `n:${nameKey}`, nameKey };
  };

  const groups = new Map<string, { charges: RecurringInput[]; refunds: RecurringInput[]; nameKeys: Set<string> }>();
  for (const txn of transactions) {
    if (txn.pending || txn.amount === 0) continue;
    if (txn.categoryPrimary && EXCLUDED_PRIMARY.has(txn.categoryPrimary)) continue;
    if (txn.categoryDetailed && EXCLUDED_DETAILED.has(txn.categoryDetailed)) continue;
    const { key, nameKey } = groupKeyOf(txn);
    if (key === "n:") continue;
    const group = groups.get(key) ?? { charges: [], refunds: [], nameKeys: new Set<string>() };
    if (txn.amount > 0) group.charges.push(txn);
    else group.refunds.push(txn);
    group.nameKeys.add(nameKey);
    groups.set(key, group);
  }

  const streams: RecurringStream[] = [];
  for (const [key, group] of groups) {
    const charges = dropNoise(group.charges, group.refunds);
    if (charges.length < 2) continue;
    const aliasKeys = [...group.nameKeys].map((nameKey) => `n:${nameKey}`).filter((alias) => alias !== key);

    const whole = classify(key, aliasKeys, charges, today);
    if (whole) {
      const suffix = `@${Math.round(charges[charges.length - 1].amount)}`;
      streams.push({ ...whole, bandKeys: [key, ...aliasKeys].map((base) => `${base}${suffix}`) });
      continue;
    }
    // Splitting by amount finds two plans billed by one merchant; for coffee shops it only finds coincidences.
    const habitual = charges.some((txn) => txn.categoryPrimary !== null && HABITUAL_PRIMARY.has(txn.categoryPrimary));
    if (habitual) continue;
    const bands = amountBands(charges).map((band) => ({
      band,
      suffix: `@${Math.round(median(band.map((txn) => txn.amount)))}`,
    }));
    const currentSuffixes = new Set(bands.map(({ suffix }) => suffix));
    for (const { band, suffix } of bands) {
      const pastSuffixes = [...new Set(band.map((txn) => `@${Math.round(txn.amount)}`))].filter(
        (past) => !currentSuffixes.has(past),
      );
      const stream = classify(
        `${key}${suffix}`,
        [
          ...aliasKeys.map((alias) => `${alias}${suffix}`),
          ...pastSuffixes.flatMap((past) => [key, ...aliasKeys].map((base) => `${base}${past}`)),
        ],
        band,
        today,
      );
      if (stream) streams.push({ ...stream, parentKeys: [key, ...aliasKeys] });
    }
  }
  return streams.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.monthlyAmount - a.monthlyAmount);
}

/** Drop charges refunded in full shortly after, and same-day duplicates of the same amount. Oldest first. */
function dropNoise(charges: RecurringInput[], refunds: RecurringInput[]): RecurringInput[] {
  const sorted = [...charges].sort((a, b) => chargeDate(a).localeCompare(chargeDate(b)) || a.id.localeCompare(b.id));
  const refunded = new Set<string>();
  for (const refund of refunds) {
    const refundDay = toDays(chargeDate(refund));
    const match = sorted.find(
      (charge) =>
        !refunded.has(charge.id) &&
        Math.abs(charge.amount + refund.amount) < AMOUNT_EPSILON &&
        refundDay - toDays(chargeDate(charge)) >= 0 &&
        refundDay - toDays(chargeDate(charge)) <= REFUND_WINDOW_DAYS,
    );
    if (match) refunded.add(match.id);
  }
  const seen = new Set<string>();
  return sorted.filter((charge) => {
    if (refunded.has(charge.id)) return false;
    const fingerprint = `${chargeDate(charge)}|${charge.amount.toFixed(2)}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

/** Split a merchant's charges into amount bands (within 25% or $2 of the band's median). */
function amountBands(charges: RecurringInput[]): RecurringInput[][] {
  const bands: RecurringInput[][] = [];
  for (const charge of [...charges].sort((a, b) => a.amount - b.amount)) {
    const band = bands.find((candidate) => {
      const center = median(candidate.map((txn) => txn.amount));
      return Math.abs(charge.amount - center) <= Math.max(2, 0.25 * center);
    });
    if (band) band.push(charge);
    else bands.push([charge]);
  }
  return bands.map((band) => band.sort((a, b) => chargeDate(a).localeCompare(chargeDate(b))));
}

function matchRule(gaps: number[], charges: RecurringInput[]): CadenceRule | null {
  const typical = median(gaps);
  for (const rule of RULES) {
    if (Math.abs(typical - rule.days) > rule.tolerance) continue;
    const slack = rule.tolerance * 1.5;
    const regular = gaps.filter((gap) => Math.abs(gap - rule.days) <= slack).length / gaps.length;
    if (regular < 0.75) continue;
    // Twice a month means two fixed days of the month; a strict 14-day rhythm is biweekly instead.
    if (rule.cadence === "semi_monthly" && anchorDays(charges, 2).length < 2) continue;
    return rule;
  }
  return null;
}

function classify(
  key: string,
  aliasKeys: string[],
  charges: RecurringInput[],
  today: string,
): RecurringStream | null {
  const dates = charges.map(chargeDate);
  const gaps = dates.slice(1).map((date, i) => toDays(date) - toDays(dates[i]));
  if (gaps.some((gap) => gap <= 0)) return null;
  const rule = matchRule(gaps, charges);
  if (!rule) return null;

  const last = charges[charges.length - 1];
  const amounts = charges.map((txn) => txn.amount);
  const shape = amountShape(charges);
  const habitual = last.categoryPrimary !== null && HABITUAL_PRIMARY.has(last.categoryPrimary);
  const bill = last.categoryPrimary !== null && VARIABLE_BILL_PRIMARY.has(last.categoryPrimary);

  let early = false;
  if (charges.length < rule.minCharges) {
    // Two identical charges a month or more apart: show it, but as early detection.
    const identical = amounts.every((amount) => Math.abs(amount - amounts[0]) < AMOUNT_EPSILON);
    if (!(charges.length === 2 && rule.months && identical && !habitual)) return null;
    early = true;
  }
  // Regular habits with a changing bill (groceries every week, a weekly ride) are spending, not a subscription.
  if (shape.variable && !bill && (habitual || rule.days < 28)) return null;

  const nextDate = nextChargeDate(rule, charges);
  const typicalAmount = shape.variable ? round2(median(amounts)) : last.amount;
  const graceDays = Math.min(Math.max(5, rule.days * 0.5), 35);
  return {
    key,
    aliasKeys,
    parentKeys: [],
    bandKeys: [],
    label: last.merchantName ?? last.name,
    merchantName: last.merchantName,
    website: charges.map((txn) => txn.website).findLast((website) => website) ?? null,
    descriptor: [last.merchantName, last.name, last.website].filter(Boolean).join(" ").toLowerCase(),
    categoryPrimary: last.categoryPrimary,
    categoryDetailed: last.categoryDetailed,
    currency: last.currency,
    cadence: rule.cadence,
    charges: charges.map((txn) => ({ id: txn.id, date: chargeDate(txn), amount: txn.amount, accountId: txn.accountId })),
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    lastAmount: last.amount,
    typicalAmount,
    variableAmount: shape.variable,
    priceChange:
      shape.step && toDays(today) - toDays(shape.step.date) <= Math.max(rule.days * 2, 62) ? shape.step : null,
    nextDate,
    monthlyAmount: round2((typicalAmount * PERIOD_DAYS.monthly) / rule.days),
    active: toDays(today) - toDays(nextDate) <= graceDays,
    early,
    accountId: last.accountId,
  };
}

/**
 * Fixed amounts (possibly with a step or two, i.e. price changes) versus a bill
 * that varies. `step` is the latest change, if the amount is otherwise fixed.
 */
function amountShape(charges: RecurringInput[]): {
  variable: boolean;
  step: { from: number; to: number; date: string } | null;
} {
  // Consecutive charges of the same amount form a run.
  const runs: { amount: number; date: string; length: number }[] = [];
  for (const txn of charges) {
    const last = runs.at(-1);
    if (last && Math.abs(last.amount - txn.amount) < AMOUNT_EPSILON) last.length += 1;
    else runs.push({ amount: txn.amount, date: chargeDate(txn), length: 1 });
  }
  // One or two prices, or three where the middle one held for a while (a first prorated charge, then
  // two price changes): a fixed price that changed, not a bill that varies.
  const stepped = runs.length <= 2 || (runs.length === 3 && runs[1].length >= 2);
  if (stepped) {
    const latest = runs[runs.length - 1];
    const previous = runs.at(-2);
    const step =
      previous && Math.abs(latest.amount - previous.amount) >= Math.max(0.5, 0.02 * previous.amount)
        ? { from: previous.amount, to: latest.amount, date: latest.date }
        : null;
    return { variable: false, step };
  }
  const amounts = charges.map((txn) => txn.amount);
  const center = median(amounts);
  // Small wobbles (tax, currency rounding) still count as a fixed amount.
  return { variable: amounts.some((amount) => Math.abs(amount - center) > Math.max(1, 0.1 * center)), step: null };
}

/** The most common days of the month the charges land on (weekend shifts merge into their neighbour). */
function anchorDays(charges: RecurringInput[], count: number): number[] {
  const counts = new Map<number, number>();
  for (const txn of charges) {
    const date = chargeDate(txn);
    const day = Number(date.slice(8, 10));
    // A charge on the last day of a short month belongs to a "31st" (end of month) anchor.
    const monthEnd = day >= 28 && day === daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1);
    const anchor = monthEnd ? 31 : day;
    counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
  }
  const anchors: number[] = [];
  for (const [day] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    if (anchors.some((anchor) => Math.abs(anchor - day) <= 3)) continue;
    anchors.push(day);
    if (anchors.length === count) break;
  }
  return anchors.sort((a, b) => a - b);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** `date` moved by `months` calendar months, on `day` (clamped to the month's length). */
function shiftMonths(date: string, months: number, day: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))).toISOString().slice(0, 10);
}

function nextChargeDate(rule: CadenceRule, charges: RecurringInput[]): string {
  const lastDate = chargeDate(charges[charges.length - 1]);
  if (rule.months) {
    // Same day of the month as usual, not "+30 days", so a charge on the 21st stays on the 21st.
    const [anchor] = anchorDays(charges.slice(-6), 1);
    let next = shiftMonths(lastDate, rule.months, anchor);
    if (toDays(next) - toDays(lastDate) < rule.days / 2) next = shiftMonths(lastDate, rule.months * 2, anchor);
    return next;
  }
  if (rule.cadence === "semi_monthly") {
    const anchors = anchorDays(charges.slice(-8), 2);
    const candidates = [0, 1, 2].flatMap((months) => anchors.map((day) => shiftMonths(lastDate, months, day)));
    return candidates.sort().find((date) => toDays(date) - toDays(lastDate) >= 7) ?? addDays(lastDate, 15);
  }
  return addDays(lastDate, rule.days);
}

/** Every expected charge date of `stream` from `from` through `to` (inclusive). */
export function projectCharges(stream: Pick<RecurringStream, "cadence" | "nextDate">, from: string, to: string): string[] {
  const dates: string[] = [];
  const start = toDays(from);
  const end = toDays(to);
  const anchorDay = Number(stream.nextDate.slice(8, 10));
  const months = RULES.find((rule) => rule.cadence === stream.cadence)?.months;
  for (let i = 0, date = stream.nextDate; toDays(date) <= end && i < 60; i++) {
    if (toDays(date) >= start) dates.push(date);
    date = months
      ? shiftMonths(stream.nextDate, months * (i + 1), anchorDay)
      : stream.cadence === "semi_monthly"
        ? addDays(date, i % 2 === 0 ? 15 : 16)
        : addDays(stream.nextDate, Math.round(PERIOD_DAYS[stream.cadence] * (i + 1)));
  }
  return dates;
}
