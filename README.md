# HSI Sales AI Platform — HPT Vietnam

Unified internal web platform for the HSI (Hybrid Solutions & Infrastructure) sales team at HPT Vietnam. 13 AI-powered modules spanning CRM, proposals, competitive intel, reporting, and more.

> **Status**: Phase 1 complete — shared infrastructure + Module 1 (Smart CRM Assistant).

## Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind, shadcn-style UI, React Router, TanStack Query
- **Backend**: Node 20, Express, TypeScript, Prisma
- **DB**: PostgreSQL 16
- **AI**: Groq (`llama-3.3-70b-versatile` by default) via `groq-sdk`
- **Auth**: JWT

## Quick start (Docker)

```bash
cp .env.example .env
# Add your GROQ_API_KEY to .env (get one at https://console.groq.com/keys)
docker compose up -d --build
# Backend auto-runs migrations + seed on first boot
```

Open http://localhost:5173. Demo login:

- Email: `jimmy@hpt.vn`
- Password: `demo1234`

## Quick start (local)

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Backend
cd backend
cp ../.env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev           # http://localhost:3001

# 3. Frontend (another terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3001/api" > .env
npm run dev           # http://localhost:5173
```

## Project structure

```
hsi-sales-ai/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Shared schema for all modules
│   │   └── seed.ts             # Demo accounts, deals, activities
│   └── src/
│       ├── lib/
│       │   ├── claude.ts       # AI Service Layer (shared across modules)
│       │   ├── prisma.ts
│       │   └── response.ts
│       ├── middleware/         # auth, error
│       ├── routes/             # auth, accounts, contacts, deals, activities
│       ├── services/           # crm-ai (Module 1 AI prompts)
│       └── index.ts
├── frontend/
│   └── src/
│       ├── components/ui/      # Button, Input, Card, Badge
│       ├── layouts/Shell.tsx   # Sidebar + top bar
│       ├── modules/crm/        # Module 1 UI
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

## Module 1 — Smart CRM Assistant

Routes live at `/crm` in the frontend:

- **List**: filter by industry/health/size, sort on company/health/updated, quick-stats panel
- **Detail**: header with animated health gauge, tabs for Timeline / Contacts / Deals / AI Insights
- **AI Actions**: one-click summary, next-action suggestions, health assessment (0-100 with factor breakdown)
- **AI Chat sidebar**: conversational Q&A scoped to the account (preset prompts + free-form)

### API

```
POST   /api/auth/login
POST   /api/auth/register
GET    /api/auth/me

GET    /api/accounts?q=&industry=&minHealth=&maxHealth=&size=
POST   /api/accounts
GET    /api/accounts/:id          # with contacts, deals, activities, insights
PUT    /api/accounts/:id
DELETE /api/accounts/:id
GET    /api/accounts/:id/timeline

POST   /api/accounts/:id/ai/summary
POST   /api/accounts/:id/ai/next-action   # also persists as CRMInsight
POST   /api/accounts/:id/ai/health        # updates account.healthScore
POST   /api/accounts/:id/ai/chat          # body: { message }

GET    /api/contacts?accountId=
POST   /api/contacts
PUT    /api/contacts/:id
DELETE /api/contacts/:id

GET    /api/deals?accountId=&stage=&vendor=
POST   /api/deals
PUT    /api/deals/:id
DELETE /api/deals/:id

GET    /api/activities?accountId=&dealId=
POST   /api/activities
PUT    /api/activities/:id
DELETE /api/activities/:id
```

## Roadmap — remaining phases

The Prisma schema already includes Meeting/ActionItem tables so Phase 2 can reuse them.

| Phase | Modules                                                                     |
| ----- | --------------------------------------------------------------------------- |
| 2     | Meeting Notes (M3), Sales Email Composer (M9), Daily Briefing (M11)         |
| 3     | Proposal Generator (M4), Quotation Builder (M5), RFP Response (M6)          |
| 4     | Account Health Dashboard (M2), Competitor Intel (M7), Market Sizing (M8)    |
| 5     | Knowledge Chatbot (M10), Sales Reports (M12), Win/Loss Analysis (M13)       |

All future modules plug into the same AI Service Layer, shell, and auth — no architectural changes needed.

## Conventions

- **API response shape**: `{ success: boolean, data?, error?, meta? }`
- **AI calls**: always go through `backend/src/lib/ai.ts`, never call `groq-sdk` directly from routes
- **Validation**: Zod schemas at route boundaries
- **Error handling**: custom `AppError`, global error middleware
- **Timezone**: `Asia/Ho_Chi_Minh`, dates via `vi-VN` locale

## Environment variables

| Var              | Required | Default                       |
| ---------------- | -------- | ----------------------------- |
| `GROQ_API_KEY`   | yes      | —                             |
| `DATABASE_URL`   | yes      | compose sets it               |
| `JWT_SECRET`     | yes      | —                             |
| `GROQ_MODEL`     | no       | `llama-3.3-70b-versatile`     |
| `PORT`           | no       | `3001`                        |
| `FRONTEND_URL`   | no       | `http://localhost:5173`       |
| `VITE_API_URL`   | no       | `http://localhost:3001/api`   |
