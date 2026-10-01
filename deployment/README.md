# Deployment

Planner runs on a VPS as two containers (app + Postgres) behind nginx, deployed by
GitHub Actions on every push to `main`. Everything here is per environment; only
`production` exists today, `dev` is provisioned the same way when needed.

## One-time setup

1. **Keys** – creates `deployment/keys/github` (private, gitignored) and `.pub`:

       deployment/generate-keys.sh

2. **Provision the VPS** (as root; safe to re-run; installs nginx, certbot, docker,
   creates user `github` in group `docker`, the `/data/planner` directories, the nginx
   site and the TLS certificate). Point DNS for the domain at the box first, or re-run
   certbot afterwards.

       deployment/provision-remote.sh root@<host> production planner.spectron.dev you@example.com

3. **Environment** – copy `.env.production.example` to `.env.production`, fill it in,
   then push it to the GitHub `production` environment (variables for lines marked
   `# public`, secrets for the rest, plus `SSH_PRIVATE_KEY`):

       deployment/github-env.sh production

   Every value the deploy job sends to the server is listed by name in
   `.github/workflows/ci.yml` (job `deploy`); add a line there for any new key.

4. Push to `main`. The workflow runs checks, builds `ghcr.io/<owner>/planner`, copies
   `docker-compose.production.yml` and a generated `.env` to `/data/planner`, then runs
   `docker compose pull && up -d` as user `github`.

## Layout on the VPS

    /data/planner/docker-compose.yml   written by the deploy job
    /data/planner/.env                 written by the deploy job (from GitHub secrets/vars)
    /data/planner/db                   postgres data
    /data/planner/media                uploads; nginx serves it at /media/

App listens on 127.0.0.1:3000 (dev: 3001); nginx terminates TLS.

## Workflow

- Pull requests: lint + format (Biome), typecheck, unit tests.
- `dev`: no-op for now.
- `main`: the checks, then build and push the image, then deploy.

## Serving onboardings to an app

Apps read published onboardings from Planner's read-only public API
(`GET /public/v1/onboardings/{key}?locale=…` with `Authorization: Bearer <project API key>`,
and `GET /public/v1/files/{sha256}` for media). The key must not ship inside an app, so each
app reaches Planner through a proxy on its own domain that adds the key and caches:

1. Planner → Settings → API keys → create a key for the Production environment (owner only;
   shown once).
2. Add the block from `nginx/app-content-proxy.conf.example` to the app's nginx, with the key.
3. Check: `curl -i https://<app domain>/content/onboardings/<key>?locale=en` → 200, an `ETag`,
   `Cache-Control: public, max-age=300`; a second request shows `X-Cache-Status: HIT`.

Publishing to Production reaches devices within the 5-minute cache. Revoking the key answers
401 at once, which the app treats as "could not say" and keeps its cached copy.

Each key reads one environment (Settings → Environments). For dev builds, create a Development
key and give it its own location (e.g. `/content-dev/`, second block in the example) that dev
builds point at. Development answers `Cache-Control: no-cache`, so a publish there shows on the
next request; where Development has nothing of its own published, it serves Production's.

## Manual operations on the box

    sudo -iu github
    cd /data/planner
    docker compose ps
    docker compose logs -f app
    docker compose exec db psql -U planner
