# SynergySphere Frontend

SynergySphere is a team collaboration and project-management application. The
frontend is a Vite-served React single-page application that provides the
authenticated workspace, task workflows, project reporting, discussions, live
presence, notifications, and GitHub proof-of-work UI.

The backend API is documented in [`../backend/README.md`](../backend/README.md).

## Table of contents

- [Architecture and technology](#architecture-and-technology)
- [Setup](#setup)
- [Commands](#commands)
- [Environment and configuration](#environment-and-configuration)
- [Routes and user workflows](#routes-and-user-workflows)
- [Feature guide](#feature-guide)
- [Data, authentication, and API communication](#data-authentication-and-api-communication)
- [Real-time updates](#real-time-updates)
- [GitHub and proof of work](#github-and-proof-of-work)
- [Styling and responsive design](#styling-and-responsive-design)
- [Project structure](#project-structure)
- [Testing and troubleshooting](#testing-and-troubleshooting)

## Architecture and technology

| Technology | Purpose |
| --- | --- |
| React 18 and React DOM | Component-based UI |
| TypeScript | Static typing for components, API data, and utilities |
| Vite | Development server, proxy, and production bundling |
| React Router 6 | Public/authenticated route selection and parameterized pages |
| TanStack React Query | Query client and server-state defaults |
| Zustand | Available state-management dependency for local stores |
| `AuthProvider` and local storage | Session restoration and user state |
| Fetch helpers in `src/lib/api.ts` | Authenticated REST communication, refresh, pagination, and ID normalization |
| Socket.IO client | Live task, project, discussion, notification, and presence updates |
| React Hook Form and Zod | Form handling and schema-oriented validation support |
| Tailwind CSS, PostCSS, `clsx`, `tailwind-merge`, CVA | Utility styling and composable variants |
| Radix UI, Lucide, and Tabler icons | Accessible primitives and icons |
| Framer Motion, `date-fns`, `react-day-picker`, `cobe` | Motion, dates, date selection, and landing-page visualizations |
| Vite PWA and Workbox | Auto-updating service worker and installable PWA assets |
| Vitest, Testing Library, MSW, Cypress | Unit/component tests, mocked API development, and E2E tooling |

`src/main.tsx` composes `BrowserRouter`, `QueryClientProvider`,
`AuthProvider`, and `ToastProvider`. `App.tsx` switches between public routes
and the authenticated `Layout`; unauthenticated navigation is redirected to
the landing page and authenticated navigation defaults to the dashboard.

## Setup

Requirements: Node.js/npm compatible with the repository toolchain, plus a
running SynergySphere backend and MongoDB for real API use.

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The Vite server listens on `http://localhost:5173` and proxies `/api` to
`VITE_API_BASE_URL`. Set that value to the actual backend URL (the checked-in
example uses `http://localhost:8000`; the backend example configuration uses
port `5000`, so choose one port and keep the values consistent).

For a production-like local preview:

```powershell
npm run build
npm run preview
```

## Commands

All commands are defined in `frontend/package.json`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite in development mode |
| `npm run build` | Type-check with `tsc`, then create the Vite production build |
| `npm run preview` | Serve the built output locally |
| `npm run lint` | Run ESLint for TypeScript/TSX |
| `npm run lint:fix` | Apply ESLint fixes |
| `npm run type-check` | Run TypeScript without emitting files |
| `npm test` / `npm run test:watch` | Run Vitest once or in watch mode |
| `npm run test:coverage` | Run Vitest with coverage |
| `npm run e2e` | Open Cypress |
| `npm run format` / `npm run format:check` | Format or check source formatting |

## Environment and configuration

Copy `.env.example` to `.env`. Vite exposes only variables prefixed with
`VITE_`; do not put credentials in this file.

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Backend origin used by the Vite `/api` proxy and direct GitHub webhook configuration UI |
| `VITE_WS_URL` | Socket.IO origin; falls back to the browser origin when unset |
| `VITE_APP_NAME` | Application name available to the frontend |
| `VITE_USE_MOCKS` | Set to the literal `true` in development to start MSW handlers; keep `false` for real API use |

`vite.config.ts` fixes the development port at `5173`, enables the `@`
alias for `src`, proxies `/api`, and generates PWA assets. The application
starts in dark mode and persists the selection under
`synergysphere-ui-theme`.

## Routes and user workflows

### Public workflow

- `/` — landing page with product overview and entry points.
- `/login` — email/password login.
- `/register` — account registration.

Successful login or registration stores the access token, refresh token, and
user profile in local storage and opens the authenticated workspace. On a
reload, `AuthProvider` refreshes the access token and reloads
`/api/users/profile`; an invalid session is cleared. Logout calls the backend,
clears local session data, disconnects Socket.IO, and returns to public routes.

### Authenticated workspace

| Route | Page and workflow |
| --- | --- |
| `/dashboard` | Assigned-task summary, active projects, recent activity, GitHub activity, and notifications |
| `/projects` | List, search, create, edit, and delete projects |
| `/projects/:id` | Project overview, members, task summary, repository configuration, invitations, and tabs |
| `/projects/:id/tasks` | Filterable/sortable project task list and task creation |
| `/projects/:id/kanban` | Status-column board for moving and reviewing tasks |
| `/projects/:id/timeline` | Date-oriented task timeline with filters |
| `/projects/:id/health` | Project health indicators calculated by the backend |
| `/projects/:id/activity` | Project activity/history feed |
| `/projects/:id/analytics` | Completion trends, workload/member analytics, and project metrics |
| `/tasks/:id` | Task detail, status, assignee, priority, tags, subtasks, dependencies, comments, attachments, history, proof, and review |
| `/my-tasks` | Current user's assigned tasks |
| `/discussions` | Project discussion index |
| `/projects/:id/discussions` | Project threads, replies, and typing/presence UI |
| `/settings` | Profile and account settings |

Unknown routes redirect to the relevant public or authenticated landing route.

## Feature guide

- **Projects and membership:** project cards and detail tabs expose project
  metadata, tags, deadlines, owner/member roles (`owner`, `manager`, and
  `member`), member management, invitations, and GitHub repository fields.
- **Tasks:** tasks have generated `TASK-n` keys, descriptions, assignees,
  dates, priorities, tags, six backend statuses (`todo`, `in_progress`,
  `blocked`, `ready_for_review`, `changes_requested`, `done`), subtasks,
  dependencies, attachments, proof, and history. The UI provides list,
  personal-task, Kanban, detail, and timeline views.
- **Dependencies:** task detail supports adding/removing dependencies. The
  backend rejects dependency cycles and prevents completion while dependencies
  remain incomplete; the UI reflects the resulting status/action state.
- **Comments and discussions:** task comments support create/edit/delete;
  project discussions support threads and replies. Notifications are surfaced
  in the dashboard/header and can be marked read.
- **Reporting:** project activity, health, dashboard summaries, analytics,
  completion trends, and member workload are rendered by dedicated pages.
- **Attachments:** task detail uploads, downloads, and deletes files through
  the backend. Cloudinary is required by the backend for uploads.
- **Reminders:** due-soon and overdue task notifications appear in the normal
  notification UI when the backend scheduler is enabled.

## Data, authentication, and API communication

`src/lib/api.ts` provides `apiRequest`, paginated fetch helpers, response
normalization, and feature-specific helpers for projects, tasks, analytics,
health, activity, invitations, search, attachments, proof, and dashboard data.
Requests send `Authorization: Bearer <access-token>`. A `401` response uses
the refresh token once, retries the request, and clears the local session when
refresh fails.

Responses from the backend normally have the form:

```json
{
  "success": true,
  "data": {},
  "message": "Optional message",
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

Errors use `success: false` and an `error` message; validation responses may
also include `data` and `errors`. `normalizeIds` converts MongoDB `_id` values
to the frontend's string `id` shape.

## Real-time updates

`src/lib/socket.ts` creates one authenticated Socket.IO connection using
`VITE_WS_URL` and the access token in the handshake. Components reference-count
project and task room subscriptions and clean them up on unmount.

Implemented client events include:

- Project/task rooms: `join-project`, `leave-project`, `join-task`, `leave-task`.
- Task/project changes: `task:created`, `task:updated`,
  `task:deleted`, `task:status-changed`, `task:attachment-changed`,
  and `task:activity`.
- Comments/discussions: `task:comment-added`,
  `task:comment-updated`, `task:comment-deleted`,
  `discussion:thread-created`, `discussion:reply-created`, and
  `discussion:typing`.
- Collaboration: `presence:state`, `presence:changed`, and
  `notification:new`.

The backend authorizes room membership against active project membership.

## GitHub and proof of work

Project detail can associate a project with a GitHub repository. Settings can
start/status-check/unlink verified GitHub identity linking when the backend
OAuth variables are configured. The task detail page's
`GitHubDevelopmentPanel` displays repository evidence, pull-request/commit
metadata, author verification, commit/file/addition/deletion statistics, and
review state.

The proof workflow is intentionally constrained in the UI and backend:

1. The assignee starts or resumes an in-progress task.
2. The assignee submits GitHub evidence, a demo URL, or developer notes.
3. Tasks requiring GitHub evidence must submit a repository-matching GitHub
   pull request or commit.
4. The owner or a project manager approves the proof or requests changes.
5. Verified GitHub identity and webhook evidence are distinguished from
   self-reported proof.

## Styling and responsive design

Global tokens and Tailwind layers are in `src/styles/globals.css`. Reusable
primitives in `src/components/ui` include buttons, cards, badges, inputs,
dialogs, dropdowns, tabs, sheets, separators, skeletons, stat cards, progress
bars, toast notifications, and loading/empty/error states. Layout components
provide desktop sidebar navigation, mobile bottom navigation, header actions,
responsive containers, and theme switching. The light/dark theme is persisted
by `ThemeProvider`; pages use responsive Tailwind breakpoints rather than a
separate mobile application.

## Project structure

```text
frontend/
├─ public/                 Static icons and PWA assets
├─ src/
│  ├─ App.tsx              Public/authenticated route map
│  ├─ main.tsx             Providers and application bootstrap
│  ├─ components/          Layout, project/task/discussion, and UI components
│  ├─ hooks/               Shared hooks such as mobile detection and toasts
│  ├─ lib/                 API, Socket.IO, proof, verification, timeline utilities
│  ├─ mocks/               MSW browser and request handlers
│  ├─ pages/               Auth, landing, dashboard, project, task, discussion, settings pages
│  ├─ providers/           Auth context
│  ├─ styles/              Global CSS and Tailwind layers
│  ├─ types/               Shared frontend domain types
│  └─ env.d.ts             Vite environment type declarations
├─ .env.example
├─ nginx.conf              Static deployment server configuration
├─ package.json
└─ vite.config.ts
```

## Testing and troubleshooting

Focused tests cover API authentication/refresh behavior, timeline utilities,
task status synchronization, proof workflow, verification, utilities, and the
GitHub development panel. Use `npm run test:coverage` when coverage output is
needed. Use `npm run type-check` and `npm run lint` before submitting changes.

Common issues:

- **API requests fail:** verify the backend is running, `VITE_API_BASE_URL`
  matches its `PORT`, and the backend `FRONTEND_URL` is `http://localhost:5173`
  (or the actual frontend origin).
- **Socket.IO does not connect:** verify `VITE_WS_URL`, an unexpired access
  token, and backend CORS configuration. The backend rejects unauthenticated
  socket handshakes.
- **GitHub controls are unavailable:** GitHub OAuth/webhook configuration is
  optional and must be completed in the backend; the frontend cannot enable it
  by itself.
- **Uploads return an error:** Cloudinary variables are optional, but uploads
  are unavailable until all required Cloudinary values are configured.
- **Mock mode masks backend issues:** `VITE_USE_MOCKS=true` only starts MSW in
  development. Set it to `false` for integration testing.
