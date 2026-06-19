# GMES Agent — Maintenance AI Assistant

**LG Electronics — TN Production Engineering**

AI assistant that answers maintenance questions from GMES work order history using Azure OpenAI + Azure AI Search. Engineers ask natural-language questions; the agent retrieves relevant past work orders via semantic search and generates grounded answers.

## How it works

1. Export work orders from GMES as `.xlsx` or `.bak`
2. Run `python migrate_to_search.py` — indexes records into Azure AI Search
3. Ask questions in the React chat UI at `http://localhost:3000`

## Quick start

### React frontend (local development)

```bash
cd frontend
npm install

# Copy .env.local.example → .env.local and fill in:
# AZURE_OPENAI_API_KEY=
# AZURE_OPENAI_ENDPOINT=
# AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o
# AZURE_OPENAI_REWRITE_DEPLOYMENT=gpt-4o
# AZURE_SEARCH_ENDPOINT=
# AZURE_SEARCH_KEY=
# AZURE_SEARCH_INDEX=work-orders
# NEXT_PUBLIC_API_URL=      ← leave empty for local dev

npm run dev
# Open http://localhost:3000
```

### Data migration

```bash
pip install -r requirements.txt

# Append / update mode (safe to run repeatedly):
python migrate_to_search.py

# Full rebuild (after schema changes):
python migrate_to_search.py --recreate
```

Drop your GMES `.xlsx` or `.bak` exports in the project root before running.

## Project structure

| File / Folder | Purpose |
|---|---|
| `migrate_to_search.py` | GMES export → Azure AI Search (incremental upsert, WO-based IDs) |
| `frontend/` | Next.js 14 React app — chat UI, analytics, API routes |
| `frontend/app/api/query/` | Chat query route — rewrite → search → LLM → suggestions |
| `frontend/app/api/analytics/` | Facet aggregation (group by line/equipment/type/group) |
| `frontend/app/api/mtbf/` | Mean Time Between Failures per equipment |
| `frontend/app/api/anomaly/` | Rising failure frequency vs. same period last year |
| `frontend/app/api/extract/` | LLM-based root cause / failure mode / component tagging |
| `frontend/components/` | React components — thread, sidebar, WO modal, nav |
| `AGENTS.md` | Full architecture and module map |
| `vault/` | Institutional memory: config, decisions, known issues |
| `CLAUDE.md` | AI coding rules for this repo |

## Stack

| Component | Tool |
|---|---|
| LLM | Azure OpenAI `gpt-4o` |
| Search | Azure AI Search — BM25 + semantic ranking (no embeddings required) |
| Frontend | Next.js 14 + React 18 + `@assistant-ui/react` + Tailwind CSS |
| Charts | Recharts |
| History | localStorage (multi-conversation, persistent) |
| Data source | GMES export (`.xlsx`, `.bak`, `.csv`) |

## Features

### Chat
- **Semantic search** — top-25 relevant work orders per query
- **Query rewriting** — resolves pronouns and implicit references using conversation history
- **WO badges** — `WO #XXXXX` inline references are clickable → opens full detail modal
- **Pinned queries** — hover a sent message to pin it; pinned queries appear on the welcome screen
- **Follow-up suggestions** — 2–3 contextual chips appear after each answer (parallel LLM call)
- **Recency / count modes** — automatic detection; recency queries sorted newest-first
- **Dark mode** — toggle in nav; respects `prefers-color-scheme`; persists in localStorage

### Analytics (4 tabs)
- **Work Orders** — bar chart + table of WO counts grouped by line/equipment/type/group
- **MTBF** — mean time between failures per equipment, color-coded by severity
- **Anomalies** — equipment with rising failure frequency vs. same window last year; flags new failure patterns
- **Failure Analysis** — LLM classifies retrieved WOs by root cause, failure mode, component

## Maintained by

TN PE Team — henrycv12
