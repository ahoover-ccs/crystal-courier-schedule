# Crystal Courier Schedule

A Next.js app for managing courier routes, drivers, time-off requests, open-shift sign-ups, and approvals. Built on Next.js 16, React 19, and Tailwind v4.

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The management UI lives at the root; the driver-facing portal is under `/driver`.

By default the app reads and writes its state to `data/schedule.json`. This is fine for local development and for any environment with a persistent filesystem.

## Storage backends

State lives behind a single module ([`lib/db.ts`](lib/db.ts)) with two interchangeable backends:

| Condition | Backend |
| --- | --- |
| `DATABASE_URL` is **unset** | JSON file at `data/schedule.json` |
| `DATABASE_URL` is **set** | Postgres (single `app_state` row, `JSONB` column) |

The same `readDb()`, `writeDb()`, and `ensureDb()` functions are used everywhere — call sites do not change between backends.

### Postgres details

On first connect, the app:

1. Creates an `app_state` table if it does not already exist:

   ```sql
   CREATE TABLE app_state (
     id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

2. If the table is empty and a `data/schedule.json` file ships with the deploy, the contents are imported as the seed row. This is how an existing roster carries over automatically on the first deploy.

3. If neither condition is met, the app seeds with the defaults defined in `createSeedData()` ([`lib/db.ts`](lib/db.ts)).

TLS is enabled automatically unless the connection string contains `sslmode=disable`. This matches the defaults of every managed Postgres provider (Neon, Render Postgres, Supabase, etc.).

## Deploying to Render

1. Push the repository to GitHub.
2. On Render, create a new **Web Service** from the repo:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Runtime:** Node
3. Provision a Postgres database (either Render Postgres or any other managed Postgres provider — Neon's free tier is recommended because it does not expire).
4. In the web service's **Environment** tab, set `DATABASE_URL` to the Postgres connection string.
5. Deploy. The first request will create the `app_state` table and, if you committed `data/schedule.json`, seed it with that data.

### Email / SMS (optional)

Notifications fall back to console logs if these are unset:

- `RESEND_API_KEY`, `RESEND_FROM` — transactional email via Resend.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — SMS via Twilio.

## Project layout

- `app/` — Next.js App Router routes. Management UI at the root, driver portal under `/driver`, JSON APIs under `/api`.
- `components/` — shared React components (schedule board, settings form, etc.).
- `lib/` — data model, business logic, and storage. `lib/db.ts` is the only file that talks to disk or Postgres.
- `data/schedule.json` — local-development state file. Committed so the first Postgres deploy can import an existing roster.

## Scripts

- `npm run dev` — start the dev server with hot reload.
- `npm run build` — production build.
- `npm start` — run the production build.
- `npm run lint` — ESLint.
