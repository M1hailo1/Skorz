# Skorz

Skorz is a sports match centre for browsing fixtures, checking scores, saving
matches, and following commentary.

## Project layout

| Folder | Responsibility |
| --- | --- |
| `frontend/` | React, TypeScript, and Vite. The UI owns filters, browser-local bookmarks, and the demo fixtures. `src/feed.ts` handles API reads, WebSocket subscriptions, and reconnection. |
| `backend/` | TypeScript, Express, and WebSockets. Prisma and Neon PostgreSQL handle persistence. Backend credentials and Neon CLI state live here. |

The browser loads fixtures and commentary over HTTP and receives match creation
and commentary events over WebSockets. The Vite proxy forwards `/matches` and
`/ws` to the backend during local development.

## Run locally

From the repository root, with Node.js 20.19+ or 22.12+:

```sh
npm run setup
npm run dev
```

In VS Code, open **Terminal → New Terminal** from the repository root. Use
`npm.cmd run dev` in PowerShell. Open the URL Vite prints, usually
`http://localhost:5173`. **Demo data** provides sample fixtures and commentary
with no database setup. Use **Connect API** to switch to the real backend.

To run the API, open a second terminal with the **+** button in the terminal
panel and run `npm.cmd run dev:backend` in PowerShell:

```sh
npm run dev:backend
```

Set `DATABASE_URL` in `backend/.env` before starting the API. For the existing
Neon project, run Neon CLI commands from `backend/`. The API listens on port
8000 by default. If you configure `WS_ALLOWED_ORIGINS`, include the exact
frontend URL shown by Vite, typically `http://localhost:5173`.

## Frontend features

- Browse fixtures by date and sport, search across loaded matches, or switch to
  the Live view.
- Bookmark matches and find them in Saved. Bookmarks are stored in the browser
  separately for demo and API data.
- Open a match to see its score and commentary. The frontend reloads commentary
  when the WebSocket reconnects. On mobile, details open in a bottom sheet.

The demo is a frontend fixture set. The backend sports simulator is planned.
The current API serves stored scores and streams new commentary. It has no
score-update event yet.

## Backend features

- Express server on port 8000 with JSON middleware.
- Root endpoint (`GET /`) returning a greeting.
- `POST /matches` validates match details with Zod and saves a match through
  Prisma, deriving its status from start and end times.
- `GET /matches` lists newest matches first, with an optional positive integer
  `limit` (default 50, maximum 100).
- `POST /matches/:id/commentary` validates a commentary entry and saves it to
  the specified match. It returns HTTP 404 for an unknown match and HTTP 409
  for a duplicate sequence within that match.
- `GET /matches/:id/commentary` lists the match's commentary newest first,
  with an optional positive integer `limit` (default and maximum 100).
- WebSocket clients connect at `/ws`, receive a `welcome` event, and receive
  `match_created` after a match is saved. Clients can subscribe to live
  commentary for specific matches. A ping/pong heartbeat clears dead connections.
- Prisma connection to Neon, checked before the server starts.
- Prisma models for matches and commentary, including match status, scores,
  JSONB event metadata, tags, and ordered commentary per match.
- Private Neon Object Storage bucket (`assets`) with backend upload, download,
  and delete helpers.
- TypeScript development, type checking, and production builds.

## WebSocket subscriptions

Send `{"type":"subscribe","matchId":42}` to receive new commentary for match 42
or `{"type":"unsubscribe","matchId":42}` to stop receiving it. The server
acknowledges valid commands with `subscribed` or `unsubscribed` and the match ID.
Invalid commands receive an `error` event.

After a successful commentary POST, subscribers receive a `commentary` event
with the saved entry in `data`. Use `GET /matches/:id/commentary` to load history.
Send subscriptions again after reconnecting.

## Request protection

| Entry point | Limit per client IP |
| --- | --- |
| HTTP | 50 requests per fixed 10-second window |
| `POST /matches` | Also limited to 10 requests per fixed minute |
| `POST /matches/:id/commentary` | Also limited to 10 requests per fixed minute across all match IDs |
| `/ws` | 5 upgrade attempts per rolling 2 seconds and 20 concurrent sockets |

Rate-limit rejections use HTTP 429. The WebSocket server also caps total
connections at 1,000 and drops slow consumers. Each socket can subscribe to up
to 100 matches. Incoming messages have a 1 KiB payload limit, and a socket is
closed if it sends more than 100 messages in a fixed 10-second window.
Set `WS_ALLOWED_ORIGINS` to a comma-separated list of exact
frontend origins (including scheme and port) to enforce a browser origin
allowlist. With the allowlist enabled, clients must send a listed Origin.

Set `MATCH_WRITE_TOKEN` in the backend's `.env` to enable match and commentary creation.
Generate a secret with `node -p "require('node:crypto').randomBytes(32).toString('hex')"`
and send it as `Authorization: Bearer <token>` from a trusted backend or CLI.
Keep the token out of frontend code and transmit it over HTTPS in deployment.
Both write endpoints accept up to 16 KiB of uncompressed JSON.

Helmet adds HTTP security headers. Match reads and WebSocket upgrades use
User-Agent bot detection, with selected search and preview agents allowed on
match reads. User-Agent values are self-reported. Authorized match writes can
use automation clients and the root route is available to health checks.
Prisma model queries bind user values, and Zod validates match inputs.

Limits are in memory per process and reset on restart. Client IPs come from the
direct connection, so behind a reverse proxy all traffic through that proxy
shares a limit. Configure client-aware limits at a trusted proxy before relying
on these thresholds for a proxied deployment. A managed WAF or equivalent edge
filter can provide broader threat detection if needed.

## Builds and checks

From the repository root, run `npm run typecheck` to check both apps or
`npm run build` to build both. The output goes to each app's `dist/` directory.
Run `npm start` to start the compiled API. On Windows PowerShell, use `npm.cmd`
if the execution policy blocks `npm.ps1`.

For a production deployment, serve `frontend/dist/` as static files and route
`/matches` and `/ws` to the backend on the same origin. The proxy must forward
WebSocket upgrades, and the production origin belongs in `WS_ALLOWED_ORIGINS`
if that allowlist is enabled. Set `VITE_DATA_SOURCE=api` in the frontend build
environment to open in API mode by default. Copy `frontend/.env.example` to
`frontend/.env` for local overrides. Vite exposes `VITE_` variables to the
browser, so keep secrets in `backend/.env`.

## Database and storage

Run the commands in this section from `backend/`. Prisma migrations use
`DIRECT_URL`, then `DATABASE_URL_UNPOOLED`, falling back to `DATABASE_URL`.
Use `sslmode=verify-full` in PostgreSQL URLs for explicit TLS verification.

Object storage uses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_ENDPOINT_URL_S3`, and `AWS_REGION` from `.env`. The private `assets` bucket
is declared in `neon.ts`; `neon deploy` provisions it on the linked branch.

With port 8000 available, run `npm run check:services` to build the app and check
the live database, a storage upload/download/delete, and the HTTP root route.
The check removes its temporary object and stops its test server afterward.

Add models to `prisma/schema.prisma`, then run
`npm run db:migrate -- --name <migration-name>` and `npm run db:generate`.

The initial matches and commentary migration is included in `prisma/migrations`.
Apply committed migrations to another configured database with
`npx prisma migrate deploy`.
