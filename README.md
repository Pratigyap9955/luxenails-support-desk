# 💅 LUXENAILS — AI Customer Support Desk

A full-stack, production-shaped customer support desk built for a premium nail salon. It takes an
inbound customer message and carries it all the way to resolution: AI triage, retrieval over the
salon's own policies, a grounded reply draft, agent approval, live SLA clocks, automatic escalation,
and a Slack alert — with analytics over the whole thing.

**It runs with zero API keys.** Demo Mode swaps every external call for a deterministic local engine,
so the entire workflow — including vector search — works offline. Add an Anthropic key when you want
Claude to do the thinking instead.

---

## The workflow

```
Customer Message
      ↓
AI Triage ─────────► category · priority · sentiment · summary · confidence
      ↓                                    ↓
      ↓                            SLA clock starts (per-priority policy)
      ↓
RAG Search ────────► top-k passages from the knowledge base, by cosine similarity
      ↓
AI Reply Draft ────► grounded in those passages, with citations attached
      ↓
Agent Approval ────► approve as written · edit then send · discard
      ↓
SLA Monitoring ────► background scan: on track → at risk → breached
      ↓
Escalation ────────► L1 senior agent · L2 shift manager · L3 salon director
      ↓
Slack Alert ───────► Block Kit payload to a webhook (or the in-app outbox)
      ↓
Resolution ────────► CSAT, SLA outcome recorded, escalations closed
```

Every arrow is a real endpoint with a button behind it. Nothing is mocked in the UI.

---

## Quick start

**Prerequisites:** Node 20+ and a PostgreSQL 14+ database.

```bash
# 1. Get a database running (skip if you already have Postgres)
docker compose up -d

# 2. Configure
cp .env.example backend/.env          # every default already works

# 3. Install, create the schema, and load demo data
npm install                            # root (concurrently, for `npm run dev`)
npm run setup                          # installs both apps + db push + seed

# 4. Run both apps
npm run dev
```

Open **http://localhost:5173**.

| Account | Password | Role |
|---|---|---|
| `owner@luxenails.com` | `luxe1234` | Admin — Owner |
| `amara@luxenails.com` | `luxe1234` | Admin — Salon Director |
| `priya@luxenails.com` | `luxe1234` | Manager — Client Care Manager |
| `sofia@luxenails.com` | `luxe1234` | Agent — Senior Client Care |
| `leo@luxenails.com` | `luxe1234` | Agent |
| `hannah@luxenails.com` | `luxe1234` | Agent |

The login screen lists these and fills them in on click.

### No Docker?

Point `DATABASE_URL` in `backend/.env` at any PostgreSQL instance — local, Homebrew, Neon, Supabase,
Railway — then run `npm run db:setup`.

---

## Demo Mode

Demo Mode is **on by default**, and turns on automatically whenever `ANTHROPIC_API_KEY` is empty.
It is not a set of stubs — each capability has a real local implementation:

| Capability | Demo Mode | Live Mode |
|---|---|---|
| Triage | Weighted keyword scoring, sentiment lexicon with negation and intensifiers, priority rules over tier + urgency signals | Claude with structured outputs (Zod-validated schema) |
| Embeddings | Hashed bag-of-words, unigrams + bigrams, sublinear TF, L2-normalised, 512-dim | Same — the local embedder is used in both modes |
| RAG search | Real cosine similarity over stored `float8[]` vectors, blended with lexical overlap | Same |
| Reply drafting | Composes from the retrieved passages, tone selected by sentiment and tier | Claude, grounded on the same passages |
| Slack | Alert persisted as `SIMULATED`, full Block Kit payload viewable in the app | POSTed to your webhook |

Because the retrieval path is identical in both modes, the citations shown on a draft are honest
either way.

**Going live:**

```bash
# backend/.env
DEMO_MODE=false
ANTHROPIC_API_KEY=sk-ant-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Restart the API. If a Claude call fails for any reason — bad key, rate limit, network, a refusal —
the request falls back to the local engine and the response is tagged so the UI can say which engine
answered. A workflow never breaks because the AI is unavailable.

---

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Live KPI row, "needs attention" queue, activity feed, Slack outbox |
| **Tickets** | Filter, search, sort by SLA urgency or priority; compose a new inbound message |
| **Ticket detail** | Conversation, AI analysis panel, the draft approval gate with citations, SLA panel, customer context, full audit trail |
| **AI Triage** | Triage queue, batch triage, low-confidence review, approval queue, and a live playground that classifies arbitrary text and shows what RAG would retrieve |
| **Knowledge Base** | Article CRUD, per-article chunk inspector, and a vector search playground showing real similarity scores |
| **Customers** | Profiles with tier, lifetime value, allergy flags, and full ticket history |
| **SLA Monitor** | Three-column board (breached / at risk / on track), live countdowns, compliance rate, policy table, manual scan trigger |
| **Escalations** | Escalations by status with acknowledge and close actions, plus the Slack outbox and the exact Block Kit payload |
| **Analytics** | Volume trend, category/priority/sentiment breakdowns, agent leaderboard, AI acceptance rate, knowledge usage, and a table view of every chart |
| **Settings** | Runtime config, workflow toggles, SLA targets, index health, AI connection test, password change |

---

## Architecture

```
customer desk/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          15 models, 12 enums
│   │   └── seed.ts                demo data — runs the real classifier
│   └── src/
│       ├── config/env.ts          typed env + Demo Mode resolution
│       ├── middleware/            JWT auth, role guards, error mapping
│       ├── services/
│       │   ├── ai.service.ts      Claude, with guaranteed local fallback
│       │   ├── demo-engine.ts     the offline classifier and drafter
│       │   ├── embedding.service.ts  vectors, cosine, chunking
│       │   ├── rag.service.ts     indexing and retrieval
│       │   ├── workflow.service.ts   intake → triage → draft → approve → resolve
│       │   ├── sla.service.ts     policies, snapshots, background scanner
│       │   ├── escalation.service.ts
│       │   ├── slack.service.ts   Block Kit, live or simulated
│       │   └── analytics.service.ts
│       └── routes/                10 routers under /api
└── frontend/
    └── src/
        ├── components/            UI primitives, app shell, ticket components
        ├── context/               auth + toasts
        ├── lib/                   API client, formatters, design tokens
        └── pages/                 10 pages
```

**Stack:** React 18 · TypeScript · Tailwind CSS · Vite · TanStack Query · Recharts · Node · Express ·
PostgreSQL · Prisma · Anthropic Claude (`claude-opus-5`).

### How RAG works here

Articles are chunked on paragraph boundaries with overlap, embedded, and stored as PostgreSQL
`float8[]` on `KnowledgeChunk.embedding`. Retrieval scores every chunk with

```
score = 0.7 × cosine(query, chunk) + 0.3 × lexical_overlap(query, chunk)
```

and returns at most one chunk per article so citations stay diverse. The lexical term is a corrective
for hashed-vector collisions. An exact scan is the right call for a corpus of salon policies — tens
of articles, not millions — and it avoids requiring the `pgvector` extension. For a corpus large
enough to need an index, swap in `pgvector` with an IVFFlat or HNSW index; the retrieval interface in
`rag.service.ts` is the only thing that would change.

### How SLA works here

Each priority has a policy (first-response minutes, resolution minutes, auto-escalate grace period).
Triage stamps absolute deadlines on the ticket, measured from creation — so re-prioritising an old
ticket correctly accounts for time already spent. `computeSla()` is a pure function used by every
read endpoint, and a background scanner (`SLA_SCAN_INTERVAL_SECONDS`) re-evaluates open tickets,
raising warnings at the threshold, marking breaches once, and escalating past the grace period.
Escalation is idempotent per trigger, so the scanner cannot spam Slack.

---

## API

All routes are under `/api`. Everything except `/api/health`, `/api/auth/login` and
`/api/auth/demo-accounts` requires `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Status, database, Demo Mode — public |
| POST | `/auth/login` | Sign in (rate limited) |
| GET | `/auth/me` · `/auth/users` | Current user · team list |
| POST | `/auth/users` | Create a user (admin) |
| POST | `/auth/change-password` | Change your password |
| GET | `/tickets` | List with filters, search, sort, pagination |
| POST | `/tickets` | **Intake** — creates the ticket and runs triage |
| GET/PATCH | `/tickets/:id` | Read / update a ticket |
| POST | `/tickets/:id/triage` | **Re-run AI triage** |
| POST | `/tickets/:id/draft` | **RAG search + AI reply draft** |
| POST | `/tickets/:id/messages` | Send a reply or internal note |
| POST | `/tickets/drafts/:id/approve` | **Approve or edit-and-send** |
| POST | `/tickets/drafts/:id/reject` | Discard a draft |
| GET | `/tickets/drafts/pending` | Approval queue |
| POST | `/tickets/:id/escalate` | **Manual escalation + Slack alert** |
| POST | `/tickets/:id/resolve` | **Resolution** with optional CSAT |
| GET | `/triage/queue` | Triage board |
| POST | `/triage/preview` | Classify text without creating a ticket |
| POST | `/triage/batch` | Triage everything untriaged |
| GET/POST/PATCH/DELETE | `/knowledge` | Article CRUD (auto-reindexes) |
| POST | `/knowledge/search` | **Vector search** |
| POST | `/knowledge/reindex` | Rebuild the whole index |
| GET | `/customers` · `/customers/:id` | Profiles and history |
| GET | `/sla/monitor` · `/sla/policies` | SLA board and targets |
| POST | `/sla/scan` | Run the monitor now |
| GET | `/escalations` | With summary by trigger |
| POST | `/escalations/:id/acknowledge` · `/resolve` | Escalation actions |
| GET | `/escalations/slack/alerts` | Slack outbox |
| POST | `/escalations/slack/test` | Send a test alert |
| GET | `/analytics/overview` · `/analytics/dashboard` · `/analytics?days=` | Metrics |
| GET/POST | `/notifications` | List, mark read, mark all read |
| GET/PUT | `/settings` · `/settings/preferences` | Runtime config and toggles |
| POST | `/settings/test-ai` | Verify AI credentials |

### Try the whole workflow with curl

```bash
API=http://localhost:4000/api
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"sofia@luxenails.com","password":"luxe1234"}' | jq -r .token)

# 1. Inbound message → AI triage
TICKET=$(curl -s -X POST $API/tickets -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "subject":"Gel lifted after three days and I am furious",
    "body":"I paid £52 on Saturday and by Tuesday four nails had lifted. I want a refund.",
    "customerEmail":"isabella.fontaine@gmail.com"}')
echo "$TICKET" | jq '.ticket | {number, category, priority, sentiment, aiConfidence, isEscalated}'

ID=$(echo "$TICKET" | jq -r .ticket.id)

# 2. RAG search + AI draft
curl -s -X POST $API/tickets/$ID/draft -H "Authorization: Bearer $TOKEN" \
  | jq '{engine, confidence: .draft.confidence, sources: [.citations[].title]}'

# 3. Approve it, 4. escalate, 5. resolve
DRAFT=$(curl -s $API/tickets/$ID -H "Authorization: Bearer $TOKEN" | jq -r '.ticket.drafts[0].id')
curl -s -X POST $API/tickets/drafts/$DRAFT/approve -H "Authorization: Bearer $TOKEN" | jq .draft.status
curl -s -X POST $API/tickets/$ID/escalate -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"reason":"VIP client, refund requested"}' | jq .escalation.level
curl -s -X POST $API/tickets/$ID/resolve -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"csatScore":5}' | jq '.ticket | {status, sla: .sla.state}'
```

---

## Environment

Every variable is documented in [`.env.example`](.env.example). The ones that matter:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | local docker | Any PostgreSQL 14+ |
| `JWT_SECRET` | dev placeholder | **Change in production** |
| `DEMO_MODE` | `true` | Forced on when no Anthropic key is set |
| `ANTHROPIC_API_KEY` | empty | Optional; enables Claude |
| `ANTHROPIC_MODEL` | `claude-opus-5` | |
| `AI_EFFORT` | `medium` | `low` … `max` — reasoning depth vs. cost |
| `SLACK_WEBHOOK_URL` | empty | Optional; alerts simulate without it |
| `SLACK_CHANNEL` | `"#luxenails-support"` | **Keep the quotes** — dotenv reads a bare `#` as a comment |
| `SLA_SCAN_INTERVAL_SECONDS` | `60` | Background monitor cadence |
| `SLA_WARNING_THRESHOLD` | `0.75` | Warn at 75% of the window elapsed |
| `RAG_TOP_K` | `4` | Passages per draft |
| `RAG_MIN_SCORE` | `0.12` | Below this, the drafter says it will check rather than guess |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install both apps, push the schema, seed demo data |
| `npm run dev` | Run the API and the web app together |
| `npm run dev:api` / `npm run dev:web` | Run one of them |
| `npm run seed` | Reload demo data (destructive — clears and rebuilds) |
| `npm run create:admin --prefix backend -- <email> "<Name>" [password] [role]` | Add or promote a user **without** wiping anything |
| `npm run build` | Production build of both |
| `npm run prisma:studio --prefix backend` | Browse the database |

---

## Design notes

The palette is a cream and blush ground (`#FDF7F2`, `#FAE6E6`) with deep plum (`#5C233A`) for
emphasis and a muted gold accent — Fraunces for display type, Manrope for text. Every enum in the
system has one visual definition in `frontend/src/lib/tokens.ts`, so a priority chip looks the same
on the dashboard, in a list, and on a ticket.

Chart colours are a separate, validated categorical palette rather than brand tints: six hues checked
for lightness banding, chroma, colour-vision separation and 3:1 contrast against the chart surface.
Priority uses a single-hue sequential ramp because it encodes severity; sentiment uses a diverging
scale with a neutral midpoint because it encodes polarity. Charts with two or more series always
carry a legend, and the Analytics page has a "View data" toggle that renders the same numbers as
tables.

The layout is responsive from 360px up: the sidebar becomes a drawer, filter rails scroll
horizontally, tables scroll inside their own container, and modals dock to the bottom of the screen
on small viewports.

---

## Notes and limitations

- **Demo Mode's triage is a keyword-and-lexicon classifier**, not a language model. It is genuinely
  good on the kinds of messages a salon receives, and its reasoning string tells you exactly which
  signals fired — but it will not match Claude on unusual or indirect phrasing. Set an API key to see
  the difference.
- **Retrieval is an exact scan.** Correct and fast at this corpus size; see the RAG section above for
  what to change if the knowledge base grows by orders of magnitude.
- **Seeded relative timestamps** mean the demo data keeps looking fresh, but re-running the seed
  resets everything, including anything you created while exploring.
- **The SLA scanner is in-process.** One API instance is assumed. Running several would need the scan
  moved to a single worker or guarded with an advisory lock.
