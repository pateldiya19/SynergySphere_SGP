# SynergySphere

Project management where completed work is backed by evidence: tasks link to real
GitHub commits and pull requests, and a manager approves the work against that
evidence rather than a checkbox.

- **backend/** — Express + TypeScript + MongoDB (Mongoose), Socket.io
- **frontend/** — React 18 + Vite + TypeScript + Tailwind

### Where documentation lives

| Document | Scope |
|---|---|
| **This file** | Getting running, connecting a repository, and the demo walkthrough |
| `backend/README.md` | Full backend reference: architecture, every env var, REST API, deployment, troubleshooting |
| `frontend/README.md` | Frontend reference: routes, components, state, styling |

The environment table below is the **minimum needed to run a demo**. For the
exhaustive reference — including deployment and operational detail — see
`backend/README.md`.

---

## 1. Setup

Requires Node.js 20+ and a MongoDB database (Atlas or local).

```bash
cd backend  && npm install
cd ../frontend && npm install
```

Create `backend/.env` from the template and fill it in:

```bash
cd backend && cp .env.example .env
```

Generate each secret separately — never reuse one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run both apps (two terminals):

```bash
cd backend && npm run dev     # http://localhost:8000
```

```bash
cd frontend && npm run dev    # http://localhost:5173
```

### Seed demo data

```bash
cd backend
npm run seed:history          # demo users, projects, tasks, discussions
npm run backfill:task-keys    # ensures every task has a TASK-n key
```

Seeded logins use the password `Password123`:
`aarav@synergysphere.dev` (manager/owner), `neha@synergysphere.dev` (developer),
`rohan@synergysphere.dev`.

> `backfill:task-keys` matters: a commit can only attach to a task that has a
> `TASK-n` key. Tasks created before keys existed have none until this runs. It
> is safe to run repeatedly.

---

## 2. Environment variables

All secrets and provider keys live in `backend/.env` and are **backend-only** —
none are exposed to the browser. The frontend's `VITE_*` values are public by
design and must never hold a secret.

### Required

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Must name a database, e.g. `.../synergysphere`. The server refuses to start without one, because MongoDB would silently fall back to `test` and read an empty dataset. |
| `JWT_SECRET` | ≥ 32 chars. Rejected at startup if it is a placeholder. |
| `JWT_REFRESH_SECRET` | ≥ 32 chars, and must differ from `JWT_SECRET`. |

### Optional — each feature degrades cleanly when unset

| Variable | Enables | When unset |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | GitHub evidence ingestion | Webhook deliveries are rejected; everything else works |
| `GITHUB_WEBHOOK_URL` | The URL shown in the project's GitHub panel | Defaults to `http://localhost:<PORT>/api/github/webhook` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD`, `SMTP_FROM_NAME` | Outbound email | Email is skipped and logged; in-app notifications still fire |
| `AI_PROVIDER` (`openai` \| `gemini`) | Autopilot AI analysis | Rule-based risk detection still works in full |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI provider | — |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini provider | — |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL` | Verified GitHub identity linking | The "developer matches assignee" check stays indeterminate |
| `CLOUDINARY_*` | Task attachments | Uploads return 503 |
| `FRONTEND_URL` | Links in emails, CORS, OAuth redirect | `http://localhost:5173` |
| `PORT`, `LOG_LEVEL`, `LOG_FILE`, `RATE_LIMIT_*` | — | Sensible defaults |

---

## 3. Connecting a GitHub repository

Each project connects its own repository, independently of other projects. One
repository may be connected to **one** project at a time, so an incoming commit
always has exactly one place to land.

1. Open the project → **GitHub integration** panel.
2. Paste the repository. Any of these work — they are all normalised to
   `owner/name`:
   - `https://github.com/acme/widget`
   - `acme/widget`
   - `git@github.com:acme/widget.git`
3. Press **Update repository**. Only the **project owner** may connect,
   reconfigure or disconnect a repository.
4. Expand **Repository settings and webhook details** and copy the webhook URL.
5. In GitHub: repo → **Settings → Webhooks → Add webhook**
   - **Payload URL**: the copied URL
   - **Content type**: `application/json`
   - **Secret**: the value of `GITHUB_WEBHOOK_SECRET` in `backend/.env`
   - **Events**: *Pushes* and *Pull requests*
6. The panel's **Webhook** field then shows `Last delivery <time>` once GitHub
   has actually reached the server. Until then it reads
   `No deliveries received yet`.

### Webhook deployment configuration

GitHub cannot reach `localhost`, so a live repository needs a publicly
reachable URL.

**Local demo, via a tunnel:**

```bash
ngrok http 8000
```

Then in `backend/.env`:

```bash
GITHUB_WEBHOOK_URL=https://<your-subdomain>.ngrok-free.dev/api/github/webhook
GITHUB_WEBHOOK_SECRET=<the same value you paste into GitHub>
```

Restart the backend after editing `.env`.

**Deployed server:** set `GITHUB_WEBHOOK_URL` to
`https://<your-host>/api/github/webhook` and keep `GITHUB_WEBHOOK_SECRET`
identical on both sides.

Rules that matter:

- `GITHUB_WEBHOOK_URL` only controls the URL **displayed** in the project
  panel. The delivery itself is whatever you typed into GitHub, so the two must
  match exactly — scheme, host and path.
- `GITHUB_WEBHOOK_SECRET` must be byte-identical in `.env` and in the GitHub
  webhook's **Secret** field. A mismatch makes every delivery fail its
  signature check and the evidence never arrives.
- A free ngrok subdomain changes on every restart. After restarting the
  tunnel, update both `GITHUB_WEBHOOK_URL` and the webhook's Payload URL.
- Rotating the secret invalidates the existing GitHub webhook until you paste
  the new value there too.

**Confirming it works:** GitHub's **Settings → Webhooks → Recent Deliveries**
shows each attempt and its response; a `200` with
`"GitHub webhook processed"` means it landed. The project's GitHub panel also
shows `Last delivery <time>` once a delivery has matched that project.

Duplicate deliveries are ignored (GitHub retries carry the same delivery id),
unsigned or wrongly-signed deliveries are rejected, and a delivery for a
repository no project has connected is answered with
`"Repository is not connected"` rather than being applied anywhere.

### Linking commits to tasks

Reference the task key anywhere in a branch name, commit message, PR title or
PR body:

```
git checkout -b TASK-24-idempotency-keys
git commit -m "TASK-24: add idempotency key column"
```

- Opening a PR that references a task moves it **To do → In progress**.
- Merging a PR records the evidence but **never** completes the task — only a
  reviewer can do that.

---

## 4. Demo workflow

### Proof of work, end to end

1. **Manager** (`aarav@…`) creates a task, assigns it to the **developer**
   (`neha@…`), and ticks *Requires GitHub evidence*.
2. **Developer** branches/commits/opens a PR using the task key. The task's
   **Development verification** panel fills in: repository, branch, PR number,
   author, commit count and the diff size.
3. **Developer** opens the task → **Submit proof**, attaches the commit/PR link
   and a description. Status becomes **Ready for review**.
   → The manager gets an in-app notification **and an email** containing the
   task details, the description and the evidence links.
4. **Manager** reviews the evidence and chooses **Approve** or **Request
   changes** (a comment is required for changes).
   → The developer gets an in-app notification **and an email** with the
   decision and the reviewer's comment.
5. Approve sets the task to **Done**. A developer cannot approve their own work.

**Rehearsing without a public tunnel:**

```bash
cd backend && npm run demo:github
```

This drives the whole workflow against the running server using correctly
signed webhook deliveries — the same code path GitHub calls — and prints each
step. It clears projects left by previous runs. Set `DEMO_LINK_GITHUB=0` to see
the unlinked-developer state instead.

### AI Autopilot

Open a project → **Autopilot**.

- The board loads **rule-based** risks and recommendations immediately. This
  works with **no API key** and makes **no AI call**.
- Press **Run AI analysis** to call the configured provider. This is the only
  thing that spends AI quota.
- Background monitoring (every 15 minutes) refreshes deterministic risks and
  notifies owners/managers of new ones. It **never** calls an AI provider.
- If the provider fails or is unconfigured, the card says so explicitly and the
  rule-based board stays intact. A failed analysis is never presented as a
  successful one.
- **Ask Autopilot** answers questions about the project; it calls the provider
  only when you submit a question.

---

## 5. Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start in watch mode (both apps) |
| `npm run build` | Production build (both apps) |
| `npm run type-check` | TypeScript, no emit (both apps) |
| `npm run lint` | ESLint (both apps) |
| `npm test` | Jest (backend) / Vitest (frontend) |
| `npm run demo:github` | Backend: full proof-of-work walkthrough |
| `npm run verify:multi-repo` | Backend: prove two projects/repositories stay isolated |
| `npm run verify:email` | Backend: check SMTP; add `-- you@example.com` to send one test |
| `npm run backfill:task-keys` | Backend: give every task a `TASK-n` key |
| `npm run notify:due` | Backend: run the due/overdue reminder sweep now |
| `npm run seed:history` | Backend: seed demo users, projects and history |

All verification scripts need the backend running (`npm run dev`).

---

## 6. Testing email delivery

```bash
cd backend
npm run verify:email                       # authenticate only — sends nothing
npm run verify:email -- you@example.com    # send one real test message
```

The first form connects and authenticates; the second also sends a sample
"review requested" email so you can confirm it arrives.

For Gmail, `SMTP_PASSWORD` must be a 16-character **app password**, not the
account password:

1. Enable 2-Step Verification on the Google account.
2. Create an app password at <https://myaccount.google.com/apppasswords>.
3. Put it in `SMTP_PASSWORD` and set `SMTP_EMAIL` to that same account.
4. Re-run `npm run verify:email`.

To see the emails in the real workflow, point a seeded user at a mailbox you
control, then submit and review a proof:

```javascript
// mongosh
db.users.updateOne({ email: "aarav@synergysphere.dev" }, { $set: { email: "you@example.com" } })
```

Log in as that address (password unchanged) and run the proof workflow.

> If SMTP is wrong or unset the app still works end to end — every message is
> logged as `Email skipped` or `Email failed` and nothing blocks.

---

## 7. Demo checklist

Run through this before presenting.

**Beforehand**

- [ ] `cd backend && npm run dev` — starts, logs `Server is running on port 8000`
- [ ] `cd frontend && npm run dev` — reachable at <http://localhost:5173>
- [ ] `npm run backfill:task-keys` — every task has a `TASK-n` key
- [ ] Log in as `aarav@synergysphere.dev` / `Password123`
- [ ] *(if showing email)* `npm run verify:email` reports **OK**
- [ ] *(if showing a live repo)* tunnel up, `GITHUB_WEBHOOK_URL` and the
      webhook's Payload URL match, secret identical on both sides
- [ ] *(if showing AI)* `AI_PROVIDER` and the matching key set in `.env`

**The walkthrough**

1. **Projects** — show two projects, each with its own repository in the
   GitHub panel. `npm run verify:multi-repo` proves they stay separate.
2. **Assign** — create a task, assign it to `neha@synergysphere.dev`, tick
   *Requires GitHub evidence*. Note the `TASK-n` key.
3. **Develop** — push a commit or open a PR mentioning that key. The task moves
   to **In progress** and the Development verification panel fills in.
4. **Submit** — as the developer, submit proof with the PR link and a
   description → **Ready for review**, manager emailed.
5. **Request changes** — as the manager, request changes with a comment →
   **Changes requested**, developer emailed.
6. **Resubmit and approve** — developer resubmits, manager approves →
   **Done**, developer emailed. Show that self-approval is refused.
7. **Autopilot** — open the tab: risks appear immediately with no AI call.
   Press **Run AI analysis** to call the provider on demand.

**Fallback if the tunnel or network fails**

```bash
cd backend && npm run demo:github
```

Drives the entire workflow locally through the same signed-webhook code path.

---

## 8. Known limitations

- **GitHub webhooks need a public URL.** Without a tunnel, use
  `npm run demo:github` to exercise the identical server-side path.
- **Email requires SMTP credentials.** With none configured the app runs
  normally and logs `Email skipped (SMTP not configured)`.
- **Autopilot AI requires a provider key.** Without one, risk detection and
  recommendations still work; only contextual reasoning is unavailable.
- **GitHub identity linking requires an OAuth App.** Without it the
  "developer matches assignee" check reports *indeterminate* rather than
  passing or failing.
