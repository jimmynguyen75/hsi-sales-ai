# HSI Sales AI Platform — HPT Vietnam

Unified internal web platform for the HSI (Hybrid Solutions & Infrastructure) sales team at HPT Vietnam. 13 AI-powered modules spanning CRM, proposals, competitive intel, reporting, and more.

## Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind, shadcn-style UI, React Router, TanStack Query
- **Backend**: Node 20, Express, TypeScript, Prisma
- **DB**: PostgreSQL 16
- **AI**: Groq (`llama-3.3-70b-versatile` by default) via `groq-sdk`
- **Embeddings**: local ONNX MiniLM via `@xenova/transformers` (no API key needed)
- **Auth**: JWT, role-based (sales / manager / admin)

## Quick start (Docker)

```bash
cp .env.example .env
# Add your GROQ_API_KEY to .env (get one at https://console.groq.com/keys)
docker compose up -d --build
# Backend auto-runs migrations + seed on first boot
```

Open http://localhost:5173. Demo logins:

| Email            | Password   | Role    |
| ---------------- | ---------- | ------- |
| `jimmy@hpt.vn`   | `demo1234` | sales   |
| `manager@hpt.vn` | `demo1234` | manager |
| `admin@hpt.vn`   | `demo1234` | admin   |

## Quick start (local)

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Backend
cd backend
cp ../.env.example .env
npm install
npx prisma migrate dev
npm run seed
npm run dev           # http://localhost:3002

# 3. Frontend (another terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3002/api" > .env
npm run dev           # http://localhost:5173
```

## Modules

| #  | Module                    | Route                  |
| -- | ------------------------- | ---------------------- |
| 1  | Smart CRM Assistant       | `/crm`                 |
| 2  | Account Health Dashboard  | `/health`              |
| 3  | Meeting Notes             | `/meetings`            |
| 4  | Proposal Generator        | `/proposals`           |
| 5  | Quotation Builder         | `/quotations`          |
| 6  | RFP Response              | `/rfp`                 |
| 7  | Competitor Intel          | `/competitors`         |
| 8  | Market Sizing             | `/market`              |
| 9  | Sales Email Composer      | `/emails`              |
| 10 | Knowledge Chatbot         | `/chat`                |
| 11 | Daily Briefing            | `/briefing`            |
| 12 | Sales Reports             | `/reports`             |
| 13 | Win/Loss Analysis         | `/win-loss`            |

Admin-only screens: `/admin/users` (user management) and `/admin/audit` (audit log viewer).

## Project structure

```
hsi-sales-ai/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # shared schema for all modules
│   │   └── seed.ts             # demo users, accounts, deals, activities
│   └── src/
│       ├── lib/
│       │   ├── ai.ts           # AI Service Layer (Groq wrapper)
│       │   ├── logger.ts       # structured NDJSON logger
│       │   ├── prisma.ts
│       │   └── response.ts
│       ├── middleware/         # auth, rbac, request-context, error
│       ├── routes/             # one file per module + auth/users/audit/import/sys-health
│       ├── services/           # *-ai.ts per module + csv-import, embeddings, audit, email-send, document-export
│       └── index.ts
├── frontend/
│   └── src/
│       ├── components/         # shared UI (BulkImportDialog, Toast, ...)
│       ├── components/ui/      # Button, Input, Card, Badge, ...
│       ├── layouts/Shell.tsx   # role-filtered sidebar
│       ├── modules/            # one folder per module (crm, proposals, quotations, rfp, ...)
│       ├── modules/admin/      # UserAdmin, AuditLog
│       ├── pages/              # Login, ComingSoon
│       ├── hooks/useAuth.tsx
│       └── lib/                # api, types, format, cn
├── docker-compose.yml
└── .env.example
```

## Shared AI Service Layer

All modules call the model through `backend/src/lib/ai.ts`:

- `generateResponse(system, user, opts)` — plain text
- `generateWithRAG(system, user, contextDocs, opts)` — inject context documents
- `generateStructured<T>(system, user, opts)` — typed JSON output with auto-extraction
- `streamResponse(system, user, opts, onChunk)` — SSE streaming for real-time UIs

Every call is logged to the `AILog` table (tokens in/out, latency). Rate-limited to 10 req/min per user.

## Cross-cutting capabilities

- **RBAC** — `requireRole("manager", "admin")` middleware; `ownerId` guards on per-user data (sales see only their own accounts/deals; managers & admins see all).
- **Audit log** — every mutation on deals / quotations / proposals / emails / imports is written to `AuditLog` with denormalized user email + role. Viewer at `/admin/audit` (admin-only).
- **Bulk CSV import** — `/api/import/accounts` and `/api/import/products` with two-step flow (dry-run preview → commit). Reusable `BulkImportDialog` component, sample CSV downloads at `/api/import/sample/*.csv`.
- **Observability** — every request gets an `X-Request-Id` (echoed in response header and included in error bodies). Structured NDJSON logs with auto-propagated `requestId` + `userId` via AsyncLocalStorage. `GET /api/health` reports DB / AI / SMTP / embedding / uptime.
- **Exports** — proposals and quotations export to PDF via pdfkit and DOCX via docx.
- **Email send** — SMTP via nodemailer (any provider); falls back to drafts if SMTP not configured.
- **Vector RAG** — local MiniLM embeddings power semantic search for the Knowledge Chatbot (M10) over product catalog + competitor intel.

## Conventions

- **API response shape**: `{ success: boolean, data?, error?, requestId?, meta? }`
- **AI calls**: always go through `backend/src/lib/ai.ts`, never call `groq-sdk` directly from routes
- **Validation**: Zod schemas at route boundaries
- **Error handling**: custom `AppError`, global error middleware
- **Timezone**: `Asia/Ho_Chi_Minh`, dates via `vi-VN` locale
- **UI language**: Vietnamese by default

## Environment variables

| Var              | Required | Default                       | Notes                                              |
| ---------------- | -------- | ----------------------------- | -------------------------------------------------- |
| `GROQ_API_KEY`   | yes      | —                             | https://console.groq.com/keys                      |
| `DATABASE_URL`   | yes      | compose sets it               | Postgres                                           |
| `JWT_SECRET`     | yes      | —                             | any strong random string                           |
| `GROQ_MODEL`     | no       | `llama-3.3-70b-versatile`     |                                                    |
| `PORT`           | no       | `3002`                        | backend HTTP port                                  |
| `FRONTEND_URL`   | no       | `http://localhost:5173`       | CORS origin                                        |
| `VITE_API_URL`   | no       | `http://localhost:3002/api`   | frontend → backend                                 |
| `LOG_LEVEL`      | no       | `info`                        | `debug` \| `info` \| `warn` \| `error`             |
| `APP_VERSION`    | no       | `dev`                         | surfaced by `/api/health`                          |
| `SMTP_HOST`      | no       | —                             | enables real email send; otherwise drafts only     |
| `SMTP_PORT`      | no       | `587`                         |                                                    |
| `SMTP_USER`      | no       | —                             |                                                    |
| `SMTP_PASS`      | no       | —                             |                                                    |
| `SMTP_FROM`      | no       | `SMTP_USER`                   | From: address                                      |
