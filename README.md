# ClickPrint Backend

REST API for ClickPrint — a print-shop ordering service. Users upload documents,
configure print settings, and submit them to a nearby shop; shops receive the
jobs live and move them through a print queue.

Built with Express 5, MongoDB (Mongoose) and Gotenberg for document conversion.

## How it works

1. **Auth** — a user requests an OTP for their phone number, which is delivered
   over WhatsApp by an external NotifyBot service. Verifying the OTP creates the
   user if needed and returns a 30-day JWT plus the list of shops they own.
2. **Files** — documents are uploaded to `POST /api/files` over the resumable
   [tus](https://tus.io/protocols/resumable-upload) protocol (pass `filename`
   and optionally `filetype` in `Upload-Metadata`). The request that delivers
   the last byte waits while non-PDF uploads are converted to PDF by Gotenberg
   (LibreOffice) and the page count is read. If conversion fails, the upload
   fails. Every file keeps its original bytes (`files/original/<id>`) and its
   PDF (`files/pdf/<id>`), keyed by a UUID. `GET /api/files/:id` returns the
   original, or the PDF when the client sends `Accept: application/pdf`. It
   supports `Range` requests, so downloads can be resumed.
3. **Drafts** — a draft holds a shop plus a list of files, each with its own
   settings (color, page type, pages-per-sheet, orientation, sidedness, copies,
   page selection). `PATCH /drafts/:id/check` prices the draft against the
   shop's services; `PATCH /drafts/:id/submit` turns it into a job.
4. **Pricing** — each shop defines *services*, keyed by `{ color, pageType,
   sidedness }` with a per-sheet `rate`. For every file the most specific
   matching service wins (cheapest rate breaks ties), sheets are computed from
   the selected pages, imposition and copies, and the totals become the job's
   cost breakdown. See [src/func/cost.js](src/func/cost.js).
5. **Jobs** — jobs move through a state machine
   (`draft → submitted → queued → printing → completed | failed | cancelled`)
   with per-role transition rules. Transitions fire side effects: submitting
   deducts the user's wallet balance, cancel/fail refunds it, and terminal jobs
   are archived into the `History` collection. See
   [src/func/jobs.js](src/func/jobs.js) and [src/func/effects.js](src/func/effects.js).
6. **Realtime** — shops subscribe to `GET /api/events/:shopId` (SSE) for
   `jobsUpdate` events; users get Expo push notifications on status changes.

## Requirements

- Docker and Docker Compose (the supported way to run this)
- Node.js 22 if running outside Docker
- A MongoDB instance (replica set required — job transitions use transactions)
- A reachable [NotifyBot](https://github.com/) endpoint for WhatsApp OTP delivery
- An Expo access token for push notifications

## Getting started

```sh
cp .env.example .env    # then fill in the values
npm install
npm run dev
```

`npm run dev` builds the images, brings up the stack (backend + Gotenberg) and
tails the backend logs; nodemon rebuilds on change. The API listens on
`http://localhost:3000`.

To run it plain, without the dev loop:

```sh
docker compose up -d --build
docker compose logs -f backend
```

## Configuration

All configuration comes from environment variables. The server exits at startup
if any required variable is missing.

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign and verify client JWTs |
| `SERVICE_KEY` | yes | Shared key for service-to-service endpoints (`Authorization: ApiKey …`) |
| `EXPO_ACCESS_TOKEN` | yes | Expo push notification access token |
| `NOTIFYBOT_URL` | yes | Endpoint that delivers OTP messages over WhatsApp |
| `PORT` | no | Listen port (default `3000`) |
| `GOTENBERG_URL` | no | Gotenberg base URL (default `http://gotenberg:3000`) |

## API

Base path is `/api`. Every response has the shape:

```json
{ "success": true, "message": "...", "data": {} }
```

### Authentication

Most routes require `Authorization: Bearer <jwt>`. Token minting uses
`Authorization: ApiKey <SERVICE_KEY>` instead.

Only the uploader can continue an unfinished upload. A file can be downloaded
by its uploader, by admins, by owners of a shop with an active job (submitted,
queued or printing) that uses the file, and by any user when the file is a
shop's image. Everyone else gets a `404`.

Authorization beyond the token is per-route: `isAdmin` gates admin-only
operations, and `ownsShops` gates shop-scoped ones.

### Routes

| Prefix | Purpose |
| --- | --- |
| `/api/auth` | Send OTP, verify OTP, mint token (service) |
| `/api/users` | User CRUD, disable/enable |
| `/api/admins` | Admin list, grant, revoke (admin only) |
| `/api/shops` | Shop CRUD, disable/enable, heartbeat status |
| `/api/owners` | Shop ownership management |
| `/api/printers` | Per-shop printer CRUD |
| `/api/services` | Per-shop service (pricing) CRUD |
| `/api/files` | Resumable (tus) upload, download |
| `/api/drafts` | Draft CRUD, cost check, submit |
| `/api/jobs` | Job listing and status transitions |
| `/api/history` | Archived (terminal) jobs |
| `/api/topups` | Wallet top-up requests and approval |
| `/api/stats` | Aggregate counts (admin only) |
| `/api/events/:shopId` | Server-sent events stream for a shop |

`GET /health` returns `200` when MongoDB is reachable, `503` otherwise.

Full request/response examples live in the [bruno/](bruno/) collection — open it
with [Bruno](https://www.usebruno.com/) and pick the `local` or `prod`
environment. Recent breaking changes are tracked in [CHANGELOG.md](CHANGELOG.md),
and open work in [TODOS.md](TODOS.md).

## Project layout

```
src/
  server.js       app setup, env validation, route mounting, graceful shutdown
  routes/         one router per resource
  models/         Mongoose schemas
  func/           shared logic: auth middleware, pricing, job state machine,
                  side effects, SSE registry, push notifications, helpers
bruno/            API collection (requests, environments)
compose.yaml      backend + Gotenberg services
```

## Deployment

Pushing to the `prod` branch builds the image, pushes it to GHCR as
`ghcr.io/<repo>:latest`, then SSHes into the host and runs `docker compose pull
&& docker compose up -d`. See
[.github/workflows/build-and-deploy.yaml](.github/workflows/build-and-deploy.yaml).

Required repository secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`,
`SSH_PORT`; and the `DEPLOY_PATH` variable.
