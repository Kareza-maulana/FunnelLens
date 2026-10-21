# FunnelLens backend

Bun + TypeScript + Elysia API using Drizzle/Postgres.js and PostgreSQL 16. The browser authenticates with Supabase Auth; the API verifies the owner session and connects directly to Postgres. Private `app` and `private` schemas are not exposed through Supabase's Data API.

## Supabase setup

Follow [../supabase/README.md](../supabase/README.md) to apply the migrations, create the owner account and least-privilege `funnellens_api` login. Copy `.env.example` to `.env`, enter the Supabase project URL and publishable key, the owner's Auth UUID, and a database URL using that API login. Use `DATABASE_SSL=require` for Supabase. Generate three different 32-byte keys with `bun run --cwd backend generate:keys`; keep them in a secret manager and back them up because encrypted data depends on them.

Copy the root `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`. Start the API with `bun run --cwd backend dev`, then start Vite with `npm run dev`.

## Local PostgreSQL

Docker Compose starts PostgreSQL 16 + pgvector. Apply `backend/database_mvp/schema.sql` and `backend/database_mvp/007_backend_runtime.sql` only to a new, empty local database. The schema bundle creates the role `fl_mvp_api`; provision a separate local login for the API as the Postgres migration user:

```sql
CREATE ROLE funnellens_api LOGIN PASSWORD 'local-only-change-me';
GRANT fl_mvp_api TO funnellens_api;
```

Set `DATABASE_URL` in `backend/.env` to that login. Use `localhost` when running Bun on the host; Compose overrides the host to `db` and uses `API_DATABASE_PASSWORD` from root `.env`. If you change that value, use the same password in the SQL role. The Compose Postgres credentials are development-only and must never be reused in production.

## Optional providers

- Local AI: start `docker compose --profile ai up -d ollama`, then `docker compose exec ollama ollama pull qwen2.5:0.5b`. Set `OLLAMA_BASE_URL=http://localhost:11434` for a host API or `http://ollama:11434` for Compose.
- WhatsApp: configure separate random `OPENWA_API_TOKEN` and `OPENWA_WEBHOOK_SECRET` values, then run `docker compose --profile whatsapp up -d openwa`. Pair the QR at `http://127.0.0.1:8000/dashboard/`. OpenWA inbound messages are stored even when the local classifier is unavailable.
- External AI: set an OpenAI-compatible base URL, API key, and model for brand options/insight generation.
- SMTP: set a Gmail App Password and alert recipient to receive WhatsApp gateway transition alerts.
- Meta: create a Meta app, configure its OAuth redirect to `META_REDIRECT_URI`, and set the app ID, app secret, and Graph API version. Requested permissions are subject to Meta app review. The backend reads OAuth assets and stores access tokens encrypted.

## API overview

- `GET /health`, `GET /ready`
- Authenticated workspace read/write/reset and owner session check
- Meta OAuth, integration listing, OpenWA health check, Landing Page tracking toggle
- Campaign draft creation, listing, and owner approval/rejection
- Local message classification, external AI brand/insight generation
- Public Landing Page event and consented lead intake, signed OpenWA webhook

Campaign approval is persisted but does not enqueue a Meta write: the execution worker is not implemented. Analytics screens remain clearly labeled prototype data until Meta sync and production data services are added.
