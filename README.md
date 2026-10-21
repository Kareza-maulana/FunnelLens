# FunnelLens

FunnelLens is a React/Vite owner workspace with a Bun/Elysia API and PostgreSQL data model. Supabase provides owner authentication; the API connects directly to Postgres and keeps the private `app` schema and provider credentials out of the browser.

## Run locally

1. Create a Supabase project and follow [supabase/README.md](supabase/README.md) to apply the migrations and create the restricted API database login.
2. Copy `backend/.env.example` to `backend/.env`, then enter the Supabase URL, publishable key, owner Auth UUID, database URL, and newly generated encryption keys.
3. Copy `.env.example` to `.env.local` and set the frontend Supabase URL/key and API URL.
4. Install Bun 1.4+, Node.js 20.19+ (or 22.12+), and Docker Compose. Install dependencies with `bun install --cwd backend` and `npm install`.
5. Start the API with `bun run --cwd backend dev` and the frontend with `npm run dev` in separate terminals. Sign in using the provisioned owner account.

See [backend/README.md](backend/README.md) for local PostgreSQL, Docker, Ollama, OpenWA, and API setup.

## Implemented integrations

- Supabase Auth login is verified by the backend. One configured owner can read/write the saved business profile and onboarding draft.
- The API stores primary product data, encrypted Meta credentials, connection status, campaign plans, immutable drafts, and owner approval decisions in PostgreSQL.
- Meta OAuth reads available ad accounts, Pages, permissions, and WhatsApp Business phone assets. Campaign configuration is persisted as a paused draft; owner approval is recorded separately.
- OpenWA health verification and signed webhook ingestion save contacts/messages with encrypted PII. Local Ollama classifies masked messages when available; a message is still stored as unclassified if Ollama is offline.
- Landing Page tracking events and consented form leads can be stored in Supabase. Contact details and free-text needs are encrypted before persistence.
- Backend endpoints support readiness, workspace persistence, Meta/OpenWA/landing-page integrations, campaign approvals, AI brand options/insights, and lead intent classification.

## Current limits

Campaign approval is a database decision only. A Meta write worker has not been implemented, so no ad is created, paused, or activated. Existing Landing Page templates are previews; campaign submission requires a live HTTPS landing-page URL. WhatsApp campaigns require a Meta-verified WhatsApp Business phone asset.

The Overview, Funnel, Audience, Campaign, Creative, Insight, Strategy, and Business Impact analytics still use the prototype fixtures in `src/lib/data.js`; they are not yet populated from Meta metrics or production lead records. Strategy execution, Meta CAPI, background sync/embedding workers, and production deployment are also not complete. The UI identifies the remaining prototype analytics and does not present them as live account performance.

## Data and credentials

The supplied `schema.sql` is a fresh-database migration source. Apply the committed Supabase migrations to a new project; do not run the bundle over an existing database. Never commit `.env`, `backend/.env`, database URLs/passwords, Supabase secret/service-role keys, Meta secrets, PII keys, or OpenWA secrets. The browser uses only the Supabase publishable key.

`src/lib/data.js` remains a labeled demo dataset for the insight surfaces. Local unauthenticated drafts may be kept in browser storage; signed-in workspace drafts sync to Supabase.
