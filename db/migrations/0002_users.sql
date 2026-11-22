-- Users (Auth.js email + password sign-in) and per-user ownership of Plaid data.
--
-- Sessions are Auth.js JWTs in an encrypted, HTTP-only cookie: the Credentials
-- provider only supports the JWT session strategy, so there is no sessions table.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored trimmed and lowercased so sign-in is case-insensitive.
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
  name text,
  -- bcrypt hash (see lib/server/auth/users.ts); never the password itself.
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every Item, account, and transaction belongs to one user. user_id is nullable
-- only for rows linked before accounts existed: those stay invisible to everyone
-- (every read filters on user_id) until the first user to sign up claims them
-- (claimUnownedData in lib/server/auth/users.ts).
ALTER TABLE plaid_items ADD COLUMN user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE plaid_items ADD CONSTRAINT plaid_items_id_user_id_key UNIQUE (id, user_id);
CREATE INDEX plaid_items_user_id_idx ON plaid_items (user_id);

-- The composite foreign keys keep an account or transaction owned by the same
-- user as its Item, so a row can never be attached to someone else's Item.
ALTER TABLE accounts ADD COLUMN user_id uuid;
ALTER TABLE accounts ADD CONSTRAINT accounts_item_owner_fkey
  FOREIGN KEY (item_id, user_id) REFERENCES plaid_items (id, user_id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX accounts_user_id_idx ON accounts (user_id);

ALTER TABLE transactions ADD COLUMN user_id uuid;
ALTER TABLE transactions ADD CONSTRAINT transactions_item_owner_fkey
  FOREIGN KEY (item_id, user_id) REFERENCES plaid_items (id, user_id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX transactions_user_id_date_idx ON transactions (user_id, date DESC, created_at DESC);
