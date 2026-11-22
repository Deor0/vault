# vault

Personal finance app: banks, credit cards, investments, and loans in one place.

This first milestone is a local web app. You create an account, sign in, and link a bank
account through [Plaid](https://plaid.com). Vault then shows your accounts with their
current balances and your recent transactions. It runs against Plaid's free **Sandbox** first. Moving to real
accounts on Plaid's **Production** (Trial plan) needs only a configuration change.

## Stack

- Next.js (App Router) + React + TypeScript for the UI and the server routes
- [Auth.js](https://authjs.dev) (`next-auth` v5) for email + password sign-in, with
  passwords hashed by bcrypt (`bcryptjs`)
- Postgres (local via Docker Compose), with plain SQL migrations in `db/migrations/`
- Plaid's official Node SDK (`plaid`) and `react-plaid-link` for Plaid Link
- Vitest for tests. Server tests run against an in-process Postgres
  ([PGlite](https://pglite.dev)) and mock Plaid, so they need neither Docker nor Plaid keys.

## Local setup

Prerequisites: Node.js 20.9 or newer, and Docker (for Postgres).

```bash
npm install
cp .env.example .env            # then fill in the values (see below)
docker compose up -d db         # Postgres 17 on localhost:5432 (user/password/db: vault)
npm run db:migrate              # create the tables (safe to re-run)
npm run dev                     # http://127.0.0.1:3000
```

Open <http://127.0.0.1:3000>. Vault sends you to **Sign in**; choose **Create an account**,
enter an email and a password (at least 8 characters), and you land on the dashboard.
Then click **Link account**. In Sandbox, pick any institution
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
| `DATABASE_URL` | `postgres://vault:vault@localhost:5432/vault` for the Docker Compose database |
| `AUTH_SECRET` | 32 random bytes, base64-encoded. Auth.js uses it to encrypt the session cookie. Generate one with `openssl rand -base64 32` (or `npm run gen:key`). Changing it signs everyone out |
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
3. Start from an empty database. Sandbox Items do not work against Production, and the data
   in them is fake:
   ```bash
   docker compose down -v && docker compose up -d db && npm run db:migrate
   ```
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

## Using the app

- **Sign up / Sign in / Sign out**: every page and API route needs a session. Signed-out
  visits to the dashboard go to `/signin`, and signed-out API calls get `401`. **Sign out**
  is at the top right of the dashboard. Each user sees and syncs only the banks they
  linked.
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

### Troubleshooting

- **Every page answers "There was a problem with the server configuration"**: Auth.js
  is missing a setting. Check that `AUTH_SECRET` is set in `.env`, and under `npm start`
  also `AUTH_TRUST_HOST=true`. The server log names the exact problem.
- **The page says Vault is not ready yet**: follow the message. It usually means Postgres is
  not running (`docker compose up -d db`), the schema is missing (`npm run db:migrate`), or a
  variable is missing from `.env`.
- **Under `npm run dev`, the page stays on "Loading accounts…"**: Postgres is probably not
  running. When the database connection is refused, the Next.js dev server cannot render the
  error and the page never finishes loading (production builds show the setup message).
  Start Postgres and reload.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build / serve it on 127.0.0.1 |
| `npm run db:up` | `docker compose up -d db` |
| `npm run db:migrate` | Apply pending SQL migrations from `db/migrations/` |
| `npm test` | Run the test suite (Plaid mocked, in-process Postgres) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run gen:key` | Print a new random key (for `TOKEN_ENCRYPTION_KEY` or `AUTH_SECRET`) |

## How it fits together

```
auth.ts                          Auth.js: Credentials provider (email + password)
auth.config.ts                   Auth.js settings shared with the proxy (JWT sessions, callbacks)
proxy.ts                         gates every page and API route behind a session
app/
  page.tsx                       dashboard page (static shell + streamed data)
  signin/, signup/               sign-in and sign-up pages (_components/AuthForm.tsx)
  _lib/auth-actions.ts           Server Actions: sign up, sign in, sign out
  _components/UserMenu.tsx       signed-in user + Sign out
  _components/Dashboard.tsx      server component: reads the user's data from Postgres
  _components/PlaidLinkButton.tsx  client: Link (new Item) and Reconnect (update mode)
  _components/RefreshButton.tsx  client: manual re-sync
  api/plaid/link-token/route.ts  POST: create link_token ({ itemId } => update mode)
  api/plaid/exchange/route.ts    POST: exchange public_token, store Item, first sync
  api/plaid/update-complete/route.ts  POST: after update mode, clear error + re-sync
  api/sync/route.ts              POST: Refresh (all Items, or one { itemId })
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
db/migrations/   SQL schema
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
  visitors (or answers `401` for `/api/*`), and the dashboard and each route handler read
  the session again before touching data. All queries are scoped to the signed-in user, and
  foreign keys keep each account and transaction owned by the same user as its Item. The
  API routes also accept only same-origin JSON requests (CSRF protection).
- The dev and production servers still bind to `127.0.0.1`, and Postgres is published on
  localhost only. Before exposing Vault to a network, serve it over HTTPS and set `AUTH_URL`
  instead of `AUTH_TRUST_HOST`.
- **Upgrading a database from before accounts existed**: `npm run db:migrate` keeps
  already-linked banks but leaves them without an owner, so nobody sees them. The first
  account created afterwards takes ownership of all of them. Later accounts start empty.

Sync details: each Refresh upserts accounts and balances first. It then pages through
`/transactions/sync` from the stored cursor, restarting if Plaid reports
`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, and applies the added, modified, and removed
transactions together with the new cursor in one database transaction. Writes are upserts
keyed on Plaid's ids, so replaying a sync never creates duplicates.

## Not built yet (follow-ups)

- Investment holdings and loan/liability views (the accounts already appear with their balances)
- Password reset, email verification, and social sign-in (Google, Apple)
- Deployment and hosting
- Plaid webhooks (Refresh is manual for now)
- Other data sources (SimpleFIN, SnapTrade)
- Native iOS app
