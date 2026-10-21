# Supabase setup

FunnelLens uses Supabase Auth for owner login and a direct PostgreSQL connection for the private `app` schema. The browser receives only the Supabase publishable key; it never connects to tables or receives a service-role key. Do not add `app` or `private` to the Supabase Data API exposed schemas.

## Provision a project

1. Create a Supabase project on PostgreSQL 16 or newer. Create the owner account under **Authentication → Users** and disable public sign-ups after provisioning.
2. Copy the Supabase project URL and publishable key from **Project Settings → API**. Copy the owner user's UUID from Authentication.
3. Log in to Supabase CLI, link this repository, then apply the committed migrations to the new project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   The first migration creates the MVP schema, pgvector extension, and capability roles. If the project already has `vector` enabled in another schema, the migration relocates the extension to `extensions` so the `app` functions use one consistent type path.

4. Create a login role for the persistent backend in the SQL Editor. Generate a strong password in a password manager and replace the placeholder before running:

   ```sql
   create role funnellens_api login password '<generated-strong-password>';
   grant fl_mvp_api to funnellens_api;
   ```

   Keep this role separate from `postgres` and the migration login. Do not give it to the browser. A worker login should be provisioned separately as a member of `fl_mvp_worker` when the worker service is deployed.

## Configure the app

1. Copy root `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`.
2. Copy `backend/.env.example` to `backend/.env`. Set the same Supabase URL/publishable key, `OWNER_AUTH_SUBJECT` to the owner's UUID, and `DATABASE_URL` to the project connection string using `funnellens_api`. Persistent servers should use the direct connection on IPv6 or the session pooler when the host only has IPv4. Keep SSL enabled with `DATABASE_SSL=require`. Percent-encode reserved characters in the URL password.
3. Generate fresh PII and integration encryption keys with `bun run --cwd backend generate:keys`, then put the generated values into `backend/.env`. Back them up in a secret manager; changing these keys makes existing encrypted PII and integration credentials unreadable.
4. Start the API and frontend:

   ```powershell
   bun install --cwd backend
   bun run --cwd backend start
   npm install
   npm run dev
   ```

5. Sign in with the owner account. The API verifies every access token with Supabase Auth and provisions only the configured owner subject in `app.users`.

The API syncs the onboarding workspace to `app.business_profile.onboarding_draft` and stores its primary product in `app.products`. `GET /ready` checks the database connection. The database owns a single business per project, matching the supplied MVP schema.

## Credentials and deployment

- Do not commit `.env.local`, `backend/.env`, database passwords, PII encryption keys, Meta app secrets, or OpenWA webhook secrets.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is public by design. `DATABASE_URL` and the encryption keys are server-only.
- Hosted API connections use the least-privilege `funnellens_api` role. Use the Supabase direct connection for persistent IPv6 deployments or session pooler for IPv4-only hosts; do not use transaction pooler for this long-running API.
- If Supabase `db push` cannot create a role or extension, apply the missing role/extension setup in the Supabase Dashboard SQL Editor as the project `postgres` user, then rerun `npx supabase db push`.
