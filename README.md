# vault

Personal finance app: banks, credit cards, investments, and loans in one place.

This first milestone is a local web app. You create an account, sign in, and link a bank
account through [Plaid](https://plaid.com). Vault then shows your net worth as a balance
sheet (assets and liabilities by account type), your accounts with their current balances,
your recent transactions, and the subscriptions and bills you pay, with where to cancel each
one. It runs against Plaid's free **Sandbox** first. Moving to real
accounts on Plaid's **Production** (Trial plan) needs only a configuration change.

## Screenshots

Sandbox demo data (fake institutions and balances). Dark is the default theme; Light is
the alternative in **Settings**. Phone shots show the first screen. Click any image for
full size.

| Page | Desktop, dark | Desktop, light | Phone, dark | Phone, light |
| --- | --- | --- | --- | --- |
| Overview (`/`) | <a href="docs/screenshots/overview-desktop-dark.png"><img src="docs/screenshots/overview-desktop-dark.png" width="240" alt="Overview, desktop, dark theme"></a> | <a href="docs/screenshots/overview-desktop-light.png"><img src="docs/screenshots/overview-desktop-light.png" width="240" alt="Overview, desktop, light theme"></a> | <a href="docs/screenshots/overview-phone-dark.png"><img src="docs/screenshots/overview-phone-dark.png" width="110" alt="Overview, phone, dark theme"></a> | <a href="docs/screenshots/overview-phone-light.png"><img src="docs/screenshots/overview-phone-light.png" width="110" alt="Overview, phone, light theme"></a> |
| Accounts | <a href="docs/screenshots/accounts-desktop-dark.png"><img src="docs/screenshots/accounts-desktop-dark.png" width="240" alt="Accounts, desktop, dark theme"></a> | <a href="docs/screenshots/accounts-desktop-light.png"><img src="docs/screenshots/accounts-desktop-light.png" width="240" alt="Accounts, desktop, light theme"></a> | <a href="docs/screenshots/accounts-phone-dark.png"><img src="docs/screenshots/accounts-phone-dark.png" width="110" alt="Accounts, phone, dark theme"></a> | <a href="docs/screenshots/accounts-phone-light.png"><img src="docs/screenshots/accounts-phone-light.png" width="110" alt="Accounts, phone, light theme"></a> |
| Transactions | <a href="docs/screenshots/transactions-desktop-dark.png"><img src="docs/screenshots/transactions-desktop-dark.png" width="240" alt="Transactions, desktop, dark theme"></a> | <a href="docs/screenshots/transactions-desktop-light.png"><img src="docs/screenshots/transactions-desktop-light.png" width="240" alt="Transactions, desktop, light theme"></a> | <a href="docs/screenshots/transactions-phone-dark.png"><img src="docs/screenshots/transactions-phone-dark.png" width="110" alt="Transactions, phone, dark theme"></a> | <a href="docs/screenshots/transactions-phone-light.png"><img src="docs/screenshots/transactions-phone-light.png" width="110" alt="Transactions, phone, light theme"></a> |
| Subscriptions | <a href="docs/screenshots/subscriptions-desktop-dark.png"><img src="docs/screenshots/subscriptions-desktop-dark.png" width="240" alt="Subscriptions, desktop, dark theme"></a> | <a href="docs/screenshots/subscriptions-desktop-light.png"><img src="docs/screenshots/subscriptions-desktop-light.png" width="240" alt="Subscriptions, desktop, light theme"></a> | <a href="docs/screenshots/subscriptions-phone-dark.png"><img src="docs/screenshots/subscriptions-phone-dark.png" width="110" alt="Subscriptions, phone, dark theme"></a> | <a href="docs/screenshots/subscriptions-phone-light.png"><img src="docs/screenshots/subscriptions-phone-light.png" width="110" alt="Subscriptions, phone, light theme"></a> |
| Settings | <a href="docs/screenshots/settings-desktop-dark.png"><img src="docs/screenshots/settings-desktop-dark.png" width="240" alt="Settings, desktop, dark theme"></a> | <a href="docs/screenshots/settings-desktop-light.png"><img src="docs/screenshots/settings-desktop-light.png" width="240" alt="Settings, desktop, light theme"></a> | <a href="docs/screenshots/settings-phone-dark.png"><img src="docs/screenshots/settings-phone-dark.png" width="110" alt="Settings, phone, dark theme"></a> | <a href="docs/screenshots/settings-phone-light.png"><img src="docs/screenshots/settings-phone-light.png" width="110" alt="Settings, phone, light theme"></a> |
| First run (nothing linked) | <a href="docs/screenshots/empty-desktop-dark.png"><img src="docs/screenshots/empty-desktop-dark.png" width="240" alt="First run, desktop, dark theme"></a> | <a href="docs/screenshots/empty-desktop-light.png"><img src="docs/screenshots/empty-desktop-light.png" width="240" alt="First run, desktop, light theme"></a> | <a href="docs/screenshots/empty-phone-dark.png"><img src="docs/screenshots/empty-phone-dark.png" width="110" alt="First run, phone, dark theme"></a> | <a href="docs/screenshots/empty-phone-light.png"><img src="docs/screenshots/empty-phone-light.png" width="110" alt="First run, phone, light theme"></a> |
| Sign in | <a href="docs/screenshots/signin-desktop-dark.png"><img src="docs/screenshots/signin-desktop-dark.png" width="240" alt="Sign in, desktop, dark theme"></a> | <a href="docs/screenshots/signin-desktop-light.png"><img src="docs/screenshots/signin-desktop-light.png" width="240" alt="Sign in, desktop, light theme"></a> | <a href="docs/screenshots/signin-phone-dark.png"><img src="docs/screenshots/signin-phone-dark.png" width="110" alt="Sign in, phone, dark theme"></a> | <a href="docs/screenshots/signin-phone-light.png"><img src="docs/screenshots/signin-phone-light.png" width="110" alt="Sign in, phone, light theme"></a> |
| Sign up | <a href="docs/screenshots/signup-desktop-dark.png"><img src="docs/screenshots/signup-desktop-dark.png" width="240" alt="Sign up, desktop, dark theme"></a> | <a href="docs/screenshots/signup-desktop-light.png"><img src="docs/screenshots/signup-desktop-light.png" width="240" alt="Sign up, desktop, light theme"></a> | <a href="docs/screenshots/signup-phone-dark.png"><img src="docs/screenshots/signup-phone-dark.png" width="110" alt="Sign up, phone, dark theme"></a> | <a href="docs/screenshots/signup-phone-light.png"><img src="docs/screenshots/signup-phone-light.png" width="110" alt="Sign up, phone, light theme"></a> |

Subscriptions with a row's **Cancel** panel open: [desktop, dark](docs/screenshots/subscriptions-cancel-desktop-dark.png).

## Stack

- Next.js (App Router) + React + TypeScript for the UI and the server routes
- [Auth.js](https://authjs.dev) (`next-auth` v5) for email + password sign-in, with
  passwords hashed by bcrypt (`bcryptjs`)
- IBM Plex Sans and IBM Plex Mono through `next/font/google`: downloaded once when the app
  builds or the dev server starts, then served by Vault itself (the browser never calls Google)
- Postgres on [Neon](https://neon.com) (a development branch locally, `production` when
  hosted), through node-postgres (`pg`), with plain SQL migrations in `db/migrations/`
- Plaid's official Node SDK (`plaid`) and `react-plaid-link` for Plaid Link
- Vitest for tests. Server tests run against an in-process Postgres
  ([PGlite](https://pglite.dev)) and mock Plaid, so they need neither a database server nor Plaid keys.

## Local setup

Prerequisites: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env            # then set the Neon connection strings (see below)
npm run db:migrate              # create the tables (safe to re-run)
npm run dev                     # http://127.0.0.1:3000
```

Open <http://127.0.0.1:3000>. Vault sends you to **Sign in**; choose **Create owner account**,
enter an email and a password (at least 8 characters), and you land on **Overview**, which
shows a short setup checklist until something is linked. Then click **Link account**. In Sandbox, pick any institution
(for example *First Platypus Bank*). Sign in with username `user_good` and password
`pass_good`. If Plaid asks for a phone number, use the Sandbox number shown in the Link
window or choose to continue without one.

### Configuration (`.env`)

`.env` is gitignored. Never commit real credentials. `.env.example` lists every variable:

| Variable | Purpose |
| --- | --- |
| `PLAID_CLIENT_ID` | Your Plaid client ID |
| `PLAID_SECRET` | The Plaid secret **for the environment in `PLAID_ENV`** (Sandbox and Production use different secrets) |
| `PLAID_ENV` | `sandbox` (default) or `production` |
| `DATABASE_URL` | Neon's pooled connection string (the host ends in `-pooler`) for your own development branch, never `production` (see [Hosted database (Neon)](#hosted-database-neon)) |
| `DATABASE_URL_UNPOOLED` | Neon's direct connection string for the same development branch. `npm run db:migrate` prefers it over `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | 32 random bytes, base64-encoded. Auth.js uses it to encrypt the session cookie. Generate one with `openssl rand -base64 32` (or `npm run gen:key`). Changing it signs everyone out. `AUTH_SECRET` (the Auth.js default name) is accepted as an alias and wins if both are set |
| `AUTH_TRUST_HOST` | `true` (as in `.env.example`) so Auth.js accepts `127.0.0.1` under `npm start`. `npm run dev` does not need it |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64-encoded. It encrypts Plaid access tokens at rest. Generate one with `openssl rand -base64 32` (or `npm run gen:key`) |
| `PLAID_REDIRECT_URI` | Optional. Only needed for redirect-based OAuth. Web Link opens OAuth banks in a popup without it |

Keep `TOKEN_ENCRYPTION_KEY` safe and stable: if you lose or change it, the stored access
tokens can no longer be decrypted, and each bank has to be linked again.

### Getting Plaid Sandbox keys

1. Create a free account at <https://dashboard.plaid.com/signup>.
2. In the Plaid Dashboard, open **Developers → Keys**.
3. Copy your `client_id` into `PLAID_CLIENT_ID` and the **Sandbox** secret into `PLAID_SECRET`.
   Leave `PLAID_ENV=sandbox`.

Sandbox is free and unlimited. It serves fake institutions and test data, so you can link,
refresh, and re-link as often as you like.

### Switching to Production (Plaid Trial plan)

Once Plaid approves your Trial plan for Production access:

1. In **Developers → Keys**, copy the **Production** secret.
2. In `.env`, set `PLAID_ENV=production` and replace `PLAID_SECRET` with the Production secret.
   `PLAID_CLIENT_ID` stays the same.
3. Start from a Neon branch that does not already hold Sandbox Items. Sandbox Items do not
   work against Production, and the data in them is fake. Point `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` at that branch, then run `npm run db:migrate`.
4. Restart `npm run dev`.

No code changes are needed. Keep these Trial plan limits in mind:

- **Each "Link account" creates a Plaid Item, and the Trial plan allows 10 Items over the
  lifetime of your Plaid account.** Removing an Item does not give one back.
- When a bank asks you to sign in again, use **Reconnect** on that institution, not
  **Link account**. Reconnect runs Plaid Link in *update mode*, which re-authenticates the
  existing Item and does not use up a new one.
- If you link a bank login that is already linked, Vault detects the duplicate, removes the
  new Item at Plaid, and keeps the existing one. The duplicate still counts toward the limit.
- OAuth banks (Chase, Wells Fargo, and others) open in a popup from Link.
  `PLAID_REDIRECT_URI` is not required.

### Hosted database (Neon)

The database is Lakebase Postgres on Neon. The hosted app uses the `production` branch,
which holds real users, encrypted Plaid access tokens and transactions. Local development
must not point at it: `npm run dev` would read and write live data, and `npm run db:migrate`
would apply unmerged migrations to the live schema.

For local development, create your own branch (for example `dev`) in the Neon console as
a schema-only branch of `production`, so it holds no live data. Copy that branch's pooled
connection string into `DATABASE_URL` and its direct connection string into
`DATABASE_URL_UNPOOLED`, then run `npm run db:migrate`. Do not copy the Vercel project's
values; they point at `production`.

The repo also has `neon.ts`. A gitignored `.neon` file can link a checkout to a Neon
project and branch. That CLI path is optional; link it to your development branch:

```bash
npm i -g neon
neon login
neon init -y --org-id <org-id> --project-id <project-id> --branch dev --services postgres
neon deploy        # applies neon.ts and writes DATABASE_URL + DATABASE_URL_UNPOOLED
                   # into .env (or .env.local when there is no .env)
npm run db:migrate # uses the direct DATABASE_URL_UNPOOLED
```

The app reads the pooled `DATABASE_URL` (its host ends in `-pooler`). On Vercel, the pool
is registered with `attachDatabasePool` from `@vercel/functions`, so idle connections close
before a function suspends. Migrations use the direct `DATABASE_URL_UNPOOLED`, because
Neon's pooler runs PgBouncer in transaction mode. `npm run db:migrate` loads `.env` and
then `.env.local` (the later file wins, as in Next.js).

On Vercel, set `DATABASE_URL` (pooled) for the Production environment, and the other
variables from [Configuration](#configuration-env). Instead of copying the connection
string by hand, the Neon-Managed Vercel integration can set `DATABASE_URL` and
`DATABASE_URL_UNPOOLED`: choose `production` as its Production branch, and remove any
existing `DATABASE_URL` from the Vercel project first.

## Using the app

- **Sign up / Sign in / Sign out**: every page and API route needs a session. Signed-out
  page visits go to `/signin`, and signed-out API calls get `401`. **Sign out** is at the
  bottom of the sidebar and on **Settings**. Each user sees and syncs only the banks they
  linked.
- **Pages**: a left sidebar (top tabs on phones) switches between them. It also lists your
  institutions with their sync status (`ok`, `login`, or `error`) and, at the bottom, this
  instance's host, version, database status, and Plaid environment.
  - **Overview** (`/`): net worth, a **Reconnect** line for any bank that needs you to sign
    in again, then an Assets | Liabilities balance sheet grouped by account type (cash and
    investments are assets; credit cards and loans are liabilities) with subtotals and a
    net worth total, then the latest transactions. Totals use the balances stored at the
    last sync, in the currency most of your accounts use; accounts in another currency or
    without a reported balance are listed under the totals instead of being added in.
  - **Accounts** (`/accounts`): every account in one table grouped by institution, with sync
    status, last sync time, **Reconnect**, type, and current, available, and limit balances.
  - **Transactions** (`/transactions`): the latest 250 transactions. A table on wide screens;
    on phones and tablets, two-line rows grouped by day.
  - **Subscriptions** (`/subscriptions`): recurring charges Vault finds in your stored
    transactions (see [Subscriptions](#subscriptions) below), split into **Subscriptions**,
    **Bills**, and **All**.
  - **Settings** (`/settings`): theme (dark by default, or light; saved in the browser), the signed-in
    account with **Sign out**, and instance details.
- **Link account**: opens Plaid Link. The server creates the `link_token`, then exchanges the
  resulting `public_token` for an access token and stores it encrypted. Vault then fetches
  accounts and balances (`/accounts/get`) and whatever transactions Plaid already has
  (`/transactions/sync`). Plaid can take a minute to pull a new account's full history, so
  press **Refresh** shortly after linking.
- **Refresh**: re-syncs balances and transactions for every linked institution. Transactions
  sync incrementally from a stored cursor.
- **Reconnect**: re-authenticates an institution with update-mode Link. It is highlighted
  when Plaid reports that the login needs attention (for example `ITEM_LOGIN_REQUIRED`).

Amounts follow everyday sign conventions: spending shows as negative and money coming in
as positive. Plaid itself reports outflows as positive numbers.

### Subscriptions

Vault looks through the last 24 months of stored transactions for charges that repeat on a
regular rhythm (weekly, every 2 weeks, twice a month, monthly, quarterly, or yearly). It
groups charges by merchant (Plaid's merchant id when it has one, otherwise the cleaned-up
merchant name), splits a merchant that bills two plans (two Apple subscriptions, say) by
amount, and leaves out transfers between your accounts, income, card payments, fees, and
pending charges. Nothing extra is requested from Plaid, so it works in Sandbox and on the
Trial plan. Detection runs each time the page loads, so **Refresh** is all it takes to update.

- **Totals**: what the charges in the current view cost per month and per year, how many are
  active, what is due in the next 30 days, and how many are new. A yearly charge counts as
  1/12 per month; a bill whose amount varies counts at its typical (median) amount.
- **Table**: name, cadence, amount, next charge date, the account it is charged to, and the
  monthly equivalent. A price change on an otherwise fixed charge shows next to the name
  (for example `▲ $15.49 → $17.99`). On phones and tablets, each row becomes two lines plus its
  buttons.
- **Subscriptions | Bills | All**: utilities, phone and internet, insurance, loan payments,
  government and medical payments, and charges whose amount varies are filed as bills. **Details** → **File under Bills/Subscriptions** moves one.
- **Needs review**: a recurring charge that started in the last 120 days, or has only two
  charges so far, waits here until you choose **Keep** or **Ignore**. Ignored charges are listed,
  collapsed, at the bottom of the page with **Restore**.
- **Details**: every matched charge, the first and last charge, **Rename**, the
  bill/subscription switch, and **Not recurring: ignore**.
- **Inactive**: charges you marked cancelled, and charges that stopped (none since the
  expected date).
- **Cancel** opens a panel for that charge:
  - **Where to cancel**: a link to the page where you cancel, with steps and how the
    merchant takes cancellations (website, app, phone, chat, in person, or mail). Charges
    billed through Apple, Google, PayPal, or Amazon point to that platform's subscriptions
    page first, because that is where they are cancelled. Links come from
    `data/cancel-links.json`, a hand-curated list of about 50 common US services and the four
    billing platforms. For anything else Vault links the merchant's website as Plaid reports
    it, and it always offers a web search.
  - **Copy cancellation email**: a ready-made request for merchants that cancel by email or
    chat. Fill in your name and account details before sending.
  - **Mark cancelled**: records the date and moves the charge to Inactive. If the merchant
    charges you again after that date, a **charged after cancel** alert appears at the top of
    the page with what to do (check the confirmation; dispute the charge with your bank or
    card issuer). **Undo: still subscribed** brings it back.

Vault never contacts a merchant or cancels anything itself: the cancellation happens on the
merchant's (or billing platform's) own page, and Vault watches for charges afterwards. Links
and steps are best effort; merchants move their pages, so the merchant's site is the
authority. Your choices (keep, ignore, rename, bill or subscription, cancelled date) are
stored per user in `subscription_overrides`.

**Updating an existing install**: this feature adds a migration. Run `npm run db:migrate`
after pulling. Transactions synced before it get Plaid's merchant id and website only when
Plaid sends them again; detection falls back to the merchant name until then.

### Troubleshooting

- **Every page answers "There was a problem with the server configuration"**: Auth.js
  is missing a setting. Check that `BETTER_AUTH_SECRET` (or `AUTH_SECRET`) is set in `.env`, and under `npm start`
  also `AUTH_TRUST_HOST=true`. The server log names the exact problem.
- **The page says Vault is not ready yet**: follow the message. It usually means
  `DATABASE_URL` does not reach Neon, the schema is missing (`npm run db:migrate`), or a
  variable is missing from `.env`.
- **Under `npm run dev`, the page stays on "Loading accounts…"**: the database connection
  is refused or timing out. Check `DATABASE_URL` (the pooled Neon string). When the
  connection is refused, the Next.js dev server cannot render the error and the page never
  finishes loading (production builds show the setup message). Fix the connection string
  and reload.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build / serve it on 127.0.0.1 |
| `npm run db:migrate` | Apply pending SQL migrations from `db/migrations/` |
| `npm test` | Run the test suite (Plaid mocked, in-process Postgres) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run gen:key` | Print a new random key (for `TOKEN_ENCRYPTION_KEY` or `BETTER_AUTH_SECRET`) |

## How it fits together

```
auth.ts                          Auth.js: Credentials provider (email + password)
auth.config.ts                   Auth.js settings shared with the proxy (JWT sessions, callbacks)
proxy.ts                         gates every page and API route behind a session
app/
  layout.tsx                     fonts (IBM Plex Sans + Mono), theme bootstrap, globals.css
  (app)/layout.tsx               signed-in shell: sidebar / phone tabs (static) + streamed status
  (app)/page.tsx                 Overview; accounts/, transactions/, settings/ are the other pages
  signin/, signup/               sign-in and sign-up pages (_components/AuthForm.tsx in InstanceCard.tsx)
  _lib/auth-actions.ts           Server Actions: sign up, sign in, sign out
  _lib/data.ts                   per-request reads (session user, items, transactions), deduped with cache()
  _components/Overview.tsx       net worth, Reconnect lines, balance sheet, recent transactions
  _components/AccountsView.tsx, TransactionsView.tsx, SidebarStatus.tsx  the other data views
  _components/SubscriptionsView.tsx  Subscriptions page: totals, alerts, review, tables (server)
  _components/SubscriptionsTable.tsx  client: rows with the Cancel and Details panels
  _lib/cancel-email.ts           the cancellation email template
  _components/UserMenu.tsx       signed-in user + Sign out
  _components/PlaidLinkButton.tsx  client: Link (new Item) and Reconnect (update mode)
  _components/RefreshButton.tsx  client: manual re-sync
  api/plaid/link-token/route.ts  POST: create link_token ({ itemId } => update mode)
  api/plaid/exchange/route.ts    POST: exchange public_token, store Item, first sync
  api/plaid/update-complete/route.ts  POST: after update mode, clear error + re-sync
  api/sync/route.ts              POST: Refresh (all Items, or one { itemId })
  api/subscriptions/override/route.ts  POST: keep, ignore, mark cancelled, rename, bill/subscription
  api/auth/[...nextauth]/route.ts  Auth.js endpoints (session, csrf, callback, signout)
lib/auth/access.ts               which paths need a session
lib/server/
  auth/users.ts  users table, bcrypt hashing, sign-up/sign-in validation, Credentials check
  session.ts     requireUserId() for route handlers
  crypto.ts      AES-256-GCM encryption of access tokens (bound to the Plaid item_id)
  plaid/client.ts  thin wrapper around the Plaid SDK + Plaid error helpers
  exchange.ts    token exchange, duplicate-Item detection, cleanup on failure
  sync.ts        /accounts/get + /transactions/sync with cursor, atomic apply
  link.ts        link_token creation (create vs update mode)
  repo.ts        SQL upserts keyed on Plaid ids
  dashboard.ts   read model for the UI (no secrets)
  balance-sheet.ts  net worth and the Assets | Liabilities split by account type (pure)
  recurring.ts   recurring-charge detection: cadence, next date, price changes (pure)
  subscriptions.ts  Subscriptions read model + the user's decisions (subscription_overrides)
  cancel-links.ts  where to cancel: matches data/cancel-links.json, website, web search
data/cancel-links.json  curated cancel pages and steps (billing platforms + common US services)
db/migrations/   SQL schema
neon.ts          Neon config (services and branch policy) applied by `neon deploy`
```

Security notes:

- Access tokens and Plaid secrets never reach the browser. They are used only in server
  modules, which import `server-only`. Access tokens are stored as AES-256-GCM ciphertext
  and decrypted only for the Plaid call that needs them. Logs record Plaid error codes and
  request ids only.
- Sign-in uses Auth.js with the Credentials provider. Passwords are stored only as bcrypt
  hashes (cost 12), and a wrong email and a wrong password get the same message. Sessions
  are Auth.js JWTs in an encrypted, HTTP-only cookie (the Credentials provider supports
  only JWT sessions), valid for 7 days; **Sign out** clears it.
- Every page and API route checks the session twice: `proxy.ts` redirects signed-out
  visitors (or answers `401` for `/api/*`), and each page and route handler reads
  the session again before touching data. All queries are scoped to the signed-in user, and
  foreign keys keep each account and transaction owned by the same user as its Item. The
  API routes also accept only same-origin JSON requests (CSRF protection).
- The dev and production servers still bind to `127.0.0.1`. The database is Neon;
  connection strings stay in `.env`. Before exposing Vault to a network, serve it over
  HTTPS and set `AUTH_URL` instead of `AUTH_TRUST_HOST`.
- **Upgrading a database from before accounts existed**: `npm run db:migrate` keeps
  already-linked banks but leaves them without an owner, so nobody sees them. The first
  account created afterwards takes ownership of all of them. Later accounts start empty.

Sync details: each Refresh upserts accounts and balances first. It then pages through
`/transactions/sync` from the stored cursor, restarting if Plaid reports
`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, and applies the added, modified, and removed
transactions together with the new cursor in one database transaction. Writes are upserts
keyed on Plaid's ids, so replaying a sync never creates duplicates.

## Not built yet (follow-ups)

- Keyboard shortcuts (`G O`/`G A`/`G T` navigation, `j`/`k` row movement, `/` search,
  `L` link, `R` refresh)
- Net-worth trend and change since last month (needs balance history, for example a
  `balance_snapshots` table written on each sync)
- Transaction search, filters, and CSV export; paging beyond the latest 250
- Investment holdings and loan/liability views (the accounts already appear with their balances)
- Password reset, email verification, and social sign-in (Google, Apple)
- Deployment and hosting
- Plaid webhooks (Refresh is manual for now)
- Subscriptions: alerts by email or push for price changes, upcoming renewals, and charges
  after a cancellation; adding subscriptions paid from accounts that are not linked; Plaid's
  Recurring Transactions add-on as a second signal (it needs a paid plan); pausing a card
  through a virtual-card service such as Privacy.com
- Other data sources (SimpleFIN, SnapTrade)
- Native iOS app
