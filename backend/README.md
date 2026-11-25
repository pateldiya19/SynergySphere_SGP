# SynergySphere Backend

The SynergySphere backend is a Node.js/Express API for project collaboration,
task management, discussions, notifications, analytics, attachments, and
GitHub-backed proof of work. It is written in TypeScript, persists data in
MongoDB through Mongoose, and exposes authenticated REST and Socket.IO
interfaces.

The frontend that consumes this API is documented in
[`../frontend/README.md`](../frontend/README.md).

## Table of contents

- [Architecture and technology](#architecture-and-technology)
- [Setup and startup](#setup-and-startup)
- [Environment variables](#environment-variables)
- [Application architecture](#application-architecture)
- [Authentication, roles, and permissions](#authentication-roles-and-permissions)
- [Database models and indexes](#database-models-and-indexes)
- [REST API](#rest-api)
- [Business modules](#business-modules)
- [GitHub and proof of work](#github-and-proof-of-work)
- [Notifications, email, and real time](#notifications-email-and-real-time)
- [Background jobs and operational behavior](#background-jobs-and-operational-behavior)
- [Testing, quality, and deployment](#testing-quality-and-deployment)
- [Troubleshooting](#troubleshooting)

## Architecture and technology

| Technology | Purpose |
| --- | --- |
| Node.js 18+ and TypeScript | Runtime and typed application code |
| Express | HTTP API and middleware pipeline |
| Mongoose/MongoDB | Document persistence, validation, population, and indexes |
| JWT and bcryptjs | Access/refresh sessions and password hashing |
| Socket.IO | Authenticated project/task rooms, presence, and broadcasts |
| express-validator and Joi | Request validation |
| Helmet, CORS, compression, rate limit | Security, cross-origin policy, response compression, and API throttling |
| Morgan and Winston | HTTP and application logging |
| Multer and Cloudinary | Multipart task uploads and optional attachment storage |
| Nodemailer | Optional invitation and proof-review email delivery |
| LangGraph and LangChain provider adapters | Modular Autopilot reasoning workflow with configurable OpenAI or Gemini models |
| Jest, Supertest, mongodb-memory-server | Tests and HTTP/database test isolation |
| `tsx`, `tsc-alias`, ESLint, Prettier | Development execution, build aliases, linting, and formatting |

`src/app.ts` creates the HTTP server and Socket.IO server, applies security and
parsing middleware, mounts `/api`, connects Socket.IO, and starts the reminder
scheduler after the database connection succeeds. `src/server.ts` handles
bootstrap, fatal process errors, and shutdown signals.

## Setup and startup

Requirements: Node.js 18+, npm, and MongoDB. From the repository root:

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Replace required placeholders in .env with locally generated values.
npm run dev
```

The API listens on `PORT` (the example is `5000`). Health and root responses
are available at `http://localhost:<PORT>/api/health` and
`http://localhost:<PORT>/`.

Production build and startup:

```powershell
npm run build
npm start
```

`prebuild` runs `clean`, `lint`, and `type-check`; `build` then runs
TypeScript and `tsc-alias`.

## Environment variables

`.env` is ignored and must never contain committed credentials. The following
values and defaults are derived from `src/config/index.ts` and
`.env.example`.

| Variable | Required | Description and safe local example |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime mode; `development`, `test`, or production-like values. Example: `development` |
| `PORT` | No | HTTP/Socket.IO port. Example: `5000` |
| `MONGODB_URI` | Yes | MongoDB connection string naming a database. Example: `mongodb://localhost:27017/synergysphere` |
| `MONGODB_TEST_URI` | No | Test database URI; falls back to `MONGODB_URI`. Example: `mongodb://localhost:27017/synergysphere_test` |
| `JWT_SECRET` | Yes | Access-token signing key, at least 32 characters, generated uniquely |
| `JWT_EXPIRE` | No | Access-token lifetime. Example: `7d` |
| `JWT_REFRESH_SECRET` | Yes | Different, independently generated refresh-token key, at least 32 characters |
| `JWT_REFRESH_EXPIRE` | No | Refresh-token lifetime. Example: `30d` |
| `FRONTEND_URL` | No | Allowed browser origin and Socket.IO CORS origin. Example: `http://localhost:5173` |
| `SMTP_HOST`, `SMTP_PORT` | No | SMTP server and port; example `smtp.gmail.com`, `587` |
| `SMTP_EMAIL`, `SMTP_PASSWORD` | No | SMTP account/app-password. When incomplete, email is skipped and in-app notifications remain available |
| `SMTP_FROM_NAME` | No | Sender display name; defaults to `SynergySphere` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | All three enable task attachment storage; otherwise uploads return an unavailable response |
| `RATE_LIMIT_WINDOW` | No | API rate-limit window in minutes; default `15` |
| `RATE_LIMIT_MAX_REQUESTS` | No | Requests per window; default `100` |
| `LOG_LEVEL` | No | Winston level; default `info` |
| `LOG_FILE` | No | Log path; default `logs/app.log` |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | No | Must be set together to enable verified GitHub identity linking |
| `GITHUB_OAUTH_CALLBACK_URL` | No | Must exactly match the GitHub OAuth app callback; default uses the configured port |
| `GITHUB_WEBHOOK_SECRET` | No | Strong HMAC secret enabling signed GitHub evidence ingestion |
| `GITHUB_WEBHOOK_URL` | No | URL shown by webhook configuration; default is `/api/github/webhook` on the configured port |
| `AI_PROVIDER` | No | `openai` or `gemini`; unset keeps deterministic Autopilot checks active |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | No | Backend-only OpenAI credentials and model; used when `AI_PROVIDER=openai` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | No | Backend-only Gemini credentials and model; used when `AI_PROVIDER=gemini` |

Generate each signing/webhook secret separately, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Startup rejects missing required values, short or template secrets, equal JWT
secrets, and MongoDB URIs that do not name a database. GitHub OAuth is
disabled when both OAuth values are absent; email, Cloudinary, and Autopilot AI
are optional. Autopilot never exposes provider keys to the frontend. When a
provider is configured, its LangGraph workflow retrieves the project context,
collects verified facts, reasons over the context, and validates recommendations
against known task/member IDs before persisting them. Provider failures fall
back to deterministic health checks without bypassing manager approval.

## Application architecture

```text
src/
├─ app/
│  ├─ controllers/    HTTP handlers and module validation
│  ├─ dto/            Project, task, and user response DTOs
│  ├─ models/         Mongoose schemas and domain persistence
│  ├─ repositories/   User, project, and task persistence helpers
│  └─ services/       Notifications, email, history, reminders, proof, health, uploads, identity
├─ config/            Environment and database configuration
├─ core/
│  ├─ base/           Base controller/repository/service abstractions
│  ├─ interfaces/     Core contracts
│  ├─ middleware/     Authentication, validation, errors
│  └─ utils/          JWT, GitHub parsing, query, logging, responses
├─ infrastructure/
│  ├─ database/       Database integration
│  ├─ routes/         Express route modules
│  ├─ scheduler.ts    In-process reminder sweep
│  └─ socket.ts       Room and broadcast registry
├─ scripts/            Seed, backfill, reminder, and GitHub demo scripts
├─ app.ts
└─ server.ts
```

Successful responses use `{ success: true, data, message }`; list responses
may add `pagination: { page, limit, total, pages }`. Errors use
`{ success: false, error }`; validation errors additionally include `data` and
`errors`. IDs are serialized as `id` by model transforms.

## Authentication, roles, and permissions

Protected routes require `Authorization: Bearer <access-token>`. Registration
and login return access and refresh tokens. `/api/auth/refresh-token` accepts a
refresh token and issues a new access token. Passwords are bcrypt-hashed before
save; inactive users cannot authenticate.

Each project has an owner and embedded members with `owner`, `manager`, or
`member` roles. Access checks require the user to be the owner or a project
member. Owners manage projects and membership; managers can act as reviewers
for proof-of-work; members can work on accessible tasks. Controllers perform
resource-level authorization in addition to the shared `authenticate`
middleware. GitHub webhook ingestion is authorized by HMAC signature rather
than a bearer token.

## Database models and indexes

| Model | Main data and relationships |
| --- | --- |
| `User` | Name, unique email, password, activity, optional verified GitHub identity; indexed by last seen and sparse unique GitHub ID |
| `Project` | Owner, embedded members/roles, tags, deadline, active flag, optional GitHub repository; indexed by owner, member, text name/description, and creation time |
| `Task` | Project, generated `TASK-n` key, assignee, status, priority, dates, subtasks, dependencies, attachments, proof, and reviews; indexed for project/status, assignee/status, dates, priority, text, and unique project/task key |
| `TaskHistory` | Task/project event timeline, actor, source, changes, and metadata |
| `TaskComment` | Task-scoped comments and authors |
| `Thread` / `Reply` | Project discussions and replies; thread indexes cover project time, author, reply time, and title text |
| `Notification` | User notifications, payload, read state; indexed for unread feeds and auto-expires read notifications after 30 days |
| `ProjectInvitation` | Incoming/project-scoped invitations and response state |
| `GitHubOAuthState` | Single-use OAuth state associated with a user |
| `GitHubWebhookDelivery` | Unique delivery IDs for webhook idempotency |

Mongoose population links users, projects, tasks, dependencies, comments,
proof submitters/reviewers, and attachment uploaders. Task dependency creation
checks for cycles and task status transitions check incomplete dependencies.

## REST API

All routes below are under `/api`. “Auth” means a bearer access token is
required. Query parameters are validated where noted; request and response
bodies use JSON unless an attachment upload is explicitly multipart.

### Docker Compose

Run `docker compose up --build` from this directory after setting strong,
different values for `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `JWT_SECRET`,
and `JWT_REFRESH_SECRET` in `.env`. MongoDB data is stored in the named
`mongodb_data` volume; do not remove it unless the database data is intended
to be destroyed. The backend is available at `http://localhost:5000` and the
frontend at `http://localhost:3000`.

### Health and authentication

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | No | Health response |
| `POST /auth/register` | No | Create account (`name`, `email`, `password`) |
| `POST /auth/login` | No | Authenticate (`email`, `password`) |
| `POST /auth/refresh-token` | No | Exchange refresh token |
| `GET /auth/profile` | Yes | Current profile |
| `GET /auth/github/status` | Yes | GitHub identity-linking status |
| `POST /auth/github/start` | Yes | Start GitHub OAuth |
| `GET /auth/github/callback` | No | OAuth callback using single-use state |
| `DELETE /auth/github/link` | Yes | Remove verified GitHub identity |
| `GET /users/search` | Yes | Search users |
| `GET /users/profile` | Yes | Current profile |
| `PUT /users/profile` | Yes | Update profile |
| `POST /users/logout` | Yes | Log out current user |
| `GET /dashboard` | Yes | Dashboard aggregates |
| `GET /search` | Yes | Global project/task search |

### Projects and invitations

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /projects` | Yes | Accessible projects |
| `POST /projects` | Yes | Create project |
| `GET /projects/:id` | Yes | Project detail |
| `PUT /projects/:id` | Yes | Update project |
| `DELETE /projects/:id` | Yes | Delete/deactivate project |
| `GET /projects/:id/health` | Yes | Health calculation |
| `GET /projects/:id/analytics` | Yes | Completion and member analytics |
| `GET /projects/:id/activity` | Yes | Project activity feed |
| `POST /projects/:id/members` | Yes | Add member |
| `PATCH /projects/:id/members/:userId` | Yes | Change member role |
| `DELETE /projects/:id/members/:userId` | Yes | Remove member |
| `POST /projects/:id/invitations` | Yes | Invite a user |
| `GET /projects/:id/invitations` | Yes | List project invitations |
| `DELETE /projects/:id/invitations/:invitationId` | Yes | Cancel invitation |
| `GET /invitations` | Yes | List incoming invitations |
| `PATCH /invitations/:id/accept` | Yes | Accept invitation |
| `PATCH /invitations/:id/decline` | Yes | Decline invitation |

### Tasks, comments, attachments, and proof

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /tasks/my-tasks` | Yes | Tasks assigned to current user |
| `GET /tasks/project/:projectId` | Yes | Project tasks; supports status, priority, assignee, due range, overdue, search, sort, order, page, and limit |
| `POST /tasks` | Yes | Create task |
| `GET /tasks/:id` | Yes | Task detail |
| `PUT /tasks/:id` | Yes | Update task |
| `DELETE /tasks/:id` | Yes | Delete task |
| `PATCH /tasks/:id/status` | Yes | Change status |
| `GET /tasks/:id/history` | Yes | Task history |
| `POST /tasks/:id/dependencies` | Yes | Add `dependencyTaskId` |
| `DELETE /tasks/:id/dependencies/:dependencyId` | Yes | Remove dependency |
| `GET /tasks/:id/comments` | Yes | List comments |
| `POST /tasks/:id/comments` | Yes | Add comment |
| `PUT /tasks/:id/comments/:commentId` | Yes | Edit comment |
| `DELETE /tasks/:id/comments/:commentId` | Yes | Delete comment |
| `POST /tasks/:id/attachments` | Yes | Multipart upload |
| `GET /tasks/:id/attachments/:attachmentId/download` | Yes | Download attachment |
| `DELETE /tasks/:id/attachments/:attachmentId` | Yes | Delete attachment |
| `POST /tasks/:id/proofs` | Yes | Submit `github`, `demo_url`, or `developer_notes` proof |
| `POST /tasks/:id/proofs/review` | Yes | Approve or request changes |

Task creation accepts project, title, optional description/assignee/due date,
status (`todo`, `in_progress`, or `blocked`), priority, tags, and subtasks.
Updates additionally support `ready_for_review`, `changes_requested`, and
`done`. Proof submissions accept an optional HTTPS URL and notes; review
requests accept `decision` (`approved` or `changes_requested`) and an optional
comment.

### Discussions, notifications, and GitHub webhooks

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /discussions/project/:projectId` | Yes | List project threads |
| `POST /discussions/project/:projectId` | Yes | Create thread |
| `GET /discussions/project/:projectId/:threadId/replies` | Yes | List replies |
| `POST /discussions/project/:projectId/:threadId/replies` | Yes | Create reply |
| `GET /notifications` | Yes | List notifications with pagination |
| `PATCH /notifications/read-all` | Yes | Mark all read |
| `PATCH /notifications/:id/read` | Yes | Mark one read |
| `GET /github/webhook-config` | No | Return configured webhook URL |
| `POST /github/webhook` | No bearer auth | Accept signed `push` and `pull_request` GitHub deliveries |

The webhook requires `x-hub-signature-256` and `x-github-delivery`; unsupported
events are acknowledged without processing, and duplicate delivery IDs are
ignored.

## Business modules

- **Controllers:** `AuthController`, `DashboardController`,
  `ProjectController`, `ProjectInvitationController`, `ProjectActivityController`,
  `ProjectAnalyticsController`, `ProjectHealthController`, `TaskController`,
  `TaskCommentController`, `TaskAttachmentController`, `TaskProofController`,
  `DiscussionController`, `NotificationController`, `SearchController`,
  `GitHubController`, and `GitHubIdentityController` validate requests,
  authorize resources, call services/repositories, and shape responses.
- **Services:** `TaskHistoryService` records auditable changes;
  `NotificationService` persists and emits notifications;
  `TaskReminderService` claims due/overdue reminders;
  `ProjectHealthService` calculates health;
  `TaskProofService` merges GitHub evidence and verification state;
  `TaskAttachmentStorageService` manages Cloudinary;
  `EmailService` sends optional mail; and `GitHubIdentityService` implements
  OAuth state, identity exchange, link, and unlink.
- **Utilities and middleware:** JWT verification/signing, GitHub URL and
  repository parsing, pagination/search query parsing, structured response
  helpers, request validation, bearer authentication, rate limiting, error
  mapping, Helmet/CORS/compression, Morgan, and Winston logging.

## GitHub and proof of work

Projects store an optional normalized repository owner/name/URL and repository
ID. The OAuth flow reads only the public GitHub identity, stores the immutable
GitHub account ID/login/avatar, and discards the OAuth access token. A linked
identity is the basis for author comparison; a user-entered legacy
`githubLogin` is not treated as verified.

For signed repository webhooks, `GitHubController` matches the repository to an
active project, records delivery metadata, extracts `TASK-n` references from
push commits and pull-request data, and updates task proof/history. Opening a
pull request can move a `todo` task to `in_progress`. GitHub proof is restricted
to the project's connected repository. The task assignee submits proof while
in progress; the project owner or manager reviews it. Proof stores commit and
pull-request metadata, author-match state, and review decisions.

## Notifications, email, and real time

Task assignments/status changes, comments, dependencies, blocked/completed
tasks, discussions, replies, and project invitations create in-app
notifications. `NotificationService` emits `notification:new` to the user's
Socket.IO room. `EmailService` optionally sends invitation and review-request
emails; missing SMTP configuration does not prevent the in-app workflow.

Socket.IO authenticates the handshake with the access token. Clients can join
authorized `project-<id>` and `task-<id>` rooms. Implemented events include
`task:created`, `task:updated`, `task:deleted`, `task:status-changed`,
`task:activity`, `task:comment-added`, `task:comment-updated`,
`task:comment-deleted`, `task:attachment-changed`,
`discussion:thread-created`, `discussion:reply-created`,
`discussion:typing`, `project:created`, `project:updated`,
`project:deleted`, `project:member-added`, `notification:new`,
`presence:state`, and `presence:changed`.

## Background jobs and operational behavior

`startScheduler` runs an initial reminder sweep after a short startup delay
and then every 15 minutes. Reminder timestamps make due-soon and overdue
claims idempotent; a failed sweep is logged and retried on the next interval.
The standalone `notify:due` script invokes the reminder service directly.

The API uses a 10 MB JSON/form limit, compression, CORS restricted to
`FRONTEND_URL`, rate limiting under `/api`, request logging, centralized 404
handling, and centralized error mapping for Mongoose, JWT, duplicate-key, cast,
and validation errors. Fatal process errors are logged and terminate the
process; SIGINT/SIGTERM exit cleanly.

## Testing, quality, and deployment

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch `src/server.ts` with `tsx` |
| `npm run build` | Clean, lint, type-check, compile, and resolve aliases |
| `npm start` | Run `dist/server.js` |
| `npm test` / `npm run test:watch` | Run Jest once or in watch mode |
| `npm run test:coverage` | Jest coverage |
| `npm run lint` / `npm run lint:fix` | ESLint for `src` |
| `npm run type-check` | TypeScript check without emit |
| `npm run format` / `npm run format:check` | Prettier write/check |
| `npm run seed` | Seed development data |
| `npm run seed:history` | Seed task history data |
| `npm run backfill:task-keys` | Backfill generated task keys |
| `npm run notify:due` | Run a reminder sweep |
| `npm run demo:github` | Run the repository's GitHub flow demonstration script |
| `npm run security:audit` / `npm run security:fix` | npm audit or remediation |
| `npm run clean` | Remove `dist` |

Tests use the configured test MongoDB URI and the repository's Jest setup;
`mongodb-memory-server` is available for isolated database tests.

### CI/CD deployment to AWS EC2

The repository's [GitHub Actions workflow](../.github/workflows/ci-cd.yml)
runs backend and frontend install, lint, type-check, test, and production
build checks. A push to `main` deploys the existing Docker Compose stack to
EC2 only after both check jobs pass. Pull requests run the checks but never
deploy.

The deployment uses the existing `backend/docker-compose.yml` stack:
MongoDB, the backend on port `5000`, and the Nginx frontend on port `3000`.
It does not use PM2. Each deployment is checked out into a commit-named
release directory. The `current` symlink is promoted only after the containers
start and both backend and frontend health checks pass. A remote `flock`
prevents overlapping deployments.

#### One-time EC2 setup

1. Install Git, Docker Engine, the Docker Compose plugin, and OpenSSH on the
   Linux EC2 host. Add the deployment user to the `docker` group and log in
   again so `docker compose` works without `sudo`.
2. Create the deployment directories and environment file:

   ```bash
   sudo mkdir -p /srv/synergysphere/shared /srv/synergysphere/releases
   sudo chown -R "$USER":"$USER" /srv/synergysphere
   cp backend/.env.example /srv/synergysphere/shared/backend.env
   chmod 600 /srv/synergysphere/shared/backend.env
   ```

   Replace every required placeholder in `backend.env`. Keep this file on
   the server; the workflow never creates, copies, or overwrites it.
3. Configure a read-only GitHub deploy key for the EC2 deployment user so
   `git@github.com:<owner>/<repository>.git` can be cloned from the host.
   Verify `git ls-remote git@github.com:pateldiya19/SynergySphere_SGP.git`
   as that user. Do not put this private key in the repository.
4. Ensure the EC2 security group or reverse proxy permits the intended public
   frontend port. The backend health check is internal to the Compose network.

#### Required GitHub Actions secrets

Configure these repository or production-environment secrets:

| Secret | Purpose |
| --- | --- |
| `EC2_HOST` | EC2 DNS name or IP address |
| `EC2_USER` | SSH deployment username |
| `EC2_SSH_KEY` | Private key used by the runner to SSH to EC2 |
| `EC2_APP_DIR` | Absolute deployment directory, for example `/srv/synergysphere` |

`EC2_APP_DIR` is intentionally explicit because the repository cannot safely
infer the server's filesystem layout. The GitHub deploy key mentioned above is
an EC2 host prerequisite, not a workflow secret. Never print any of these
values in workflow logs.

#### Triggering, monitoring, and rollback

Merge or push to `main` to trigger the workflow. Review the `Backend checks`
and `Frontend checks` jobs before the `Deploy to EC2` job. The deploy job
reports the checked-out commit, Compose build/start progress, and health-check
failure without printing environment values.

If a deployed release must be reverted, SSH to EC2 and promote the previous
release, then start its Compose files:

```bash
cd /srv/synergysphere
PREVIOUS="$(find releases -mindepth 1 -maxdepth 1 -type d | sort | tail -n 2 | head -n 1)"
ln -sfn "$PREVIOUS" current
docker compose --project-name synergysphere \
  --env-file "$PREVIOUS/backend/.env" \
  -f "$PREVIOUS/backend/docker-compose.yml" up -d --remove-orphans
```

Replace `/srv/synergysphere` with the configured `EC2_APP_DIR`. The workflow
automatically attempts this same previous-release recovery when a promoted
release fails its health check. Retain release directories until the desired
rollback window has passed; cleanup is intentionally not automated.

## Troubleshooting

- **Startup rejects configuration:** use real, independently generated JWT
  secrets of at least 32 characters, name a database in `MONGODB_URI`, and
  leave optional integrations entirely unset rather than using template values.
- **Frontend CORS or Socket.IO failures:** set `FRONTEND_URL` to the exact
  browser origin and make the frontend API/WS URLs point to the same backend
  port.
- **Uploads fail:** configure all Cloudinary variables; partial configuration
  is not an attachment backend.
- **Emails are absent:** configure all SMTP values and use an app password
  where required. In-app notifications still work without SMTP.
- **GitHub linking fails:** configure both OAuth values and make
  `GITHUB_OAUTH_CALLBACK_URL` match the GitHub application byte for byte.
- **Webhook evidence is ignored:** configure the same strong secret in the
  repository webhook and `GITHUB_WEBHOOK_SECRET`; send `x-github-event`,
  `x-github-delivery`, and `x-hub-signature-256`.
- **Port already in use:** stop the process using `PORT` before starting
  another instance; the server logs an explicit `EADDRINUSE` message.

Repository inspection found no backend routes, models, services, dependencies,
or frontend modules for site visits, call automation, WhatsApp, AI features,
or Buildesk integration. They are therefore not documented as implemented
features. No production credentials or personal data are included here.
