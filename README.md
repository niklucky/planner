# Planner

Open-source product management for teams. First focus: mobile app release management
(App Store / Google Play integrations, release notes, publishing, analytics, screenshots).

## Layout

```
apps/
  app/        web application (React, Vite, TanStack Router)
  web/        public single-page website
  desktop/    Electron/Tauri — later
  mobile/     React Native — later
packages/
  frontend/   design system & shared UI components
  server/     business & data logic (services)
  api/        tRPC + REST routes, HTTP entrypoint
  db/         Drizzle schema, migrations, client
  shared/     zod schemas, types, constants shared by every layer
```

Dependency direction: `shared` ← `db` ← `server` ← `api` ← `app`. `frontend` depends only on `shared`.

## Development

```bash
cp .env.example .env
pnpm install
pnpm compose:up    # local Postgres (compose.local.yml)
pnpm db:migrate
pnpm dev           # api on :3000, app on :5173 (proxies /trpc and /api)
pnpm compose:down  # stop the database
```

Without `RESEND_API_KEY` in `.env`, emails (password reset) are printed to the API console.

## Self-hosting

```bash
docker compose up -d
```

Serves the web app and API on port 3000 and runs migrations on start. Requires `ENCRYPTION_KEY` in the environment (or a `.env` next to the compose file); it encrypts store credentials at rest.
