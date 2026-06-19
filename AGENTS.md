# Architecture

## Overview
GMES Agent is a Retrieval-Augmented Generation (RAG) system on Azure. Work order records are indexed into Azure AI Search at migration time. At query time, the user's question is rewritten for context, the top-K most semantically similar work orders are retrieved, and Azure OpenAI generates an answer grounded in those records.

**Single interface:** React frontend in `frontend/` with Next.js API routes calling Azure services directly.

## Module responsibilities

| File | Role |
|---|---|
| `migrate_to_search.py` | GMES export → Azure AI Search; incremental upsert via `merge_or_upload_documents`; `--recreate` for full rebuild |
| `frontend/` | Next.js 14 React app — chat UI, analytics dashboard, all Azure API calls |

## Frontend (`frontend/`)

Next.js 14 App Router. Run locally with `npm run dev` from `frontend/`.

### API routes

| Route | Method | Purpose |
|---|---|---|
| `app/api/query/route.ts` | POST | Query rewrite → semantic search → LLM answer → parallel suggestions |
| `app/api/analytics/route.ts` | POST | Facet aggregation (group by line / equipment / maint_type / group) |
| `app/api/mtbf/route.ts` | POST | Mean Time Between Failures per equipment (up to 1000 docs, sorted by date) |
| `app/api/anomaly/route.ts` | POST | Compare recent vs. prior-year failure counts; flag rising rates + new patterns |
| `app/api/extract/route.ts` | POST | LLM classifies WOs into root_cause / failure_mode / component (parallel batches of 5) |

### Components

| File | Role |
|---|---|
| `app/layout.tsx` | Root layout — theme flash prevention script, wraps with `GmesRuntimeProvider` |
| `app/page.tsx` | Chat page — `ChatSidebar` + `GmesThread` |
| `app/analytics/page.tsx` | Analytics page — Work Orders / MTBF / Anomalies / Failure Analysis tabs |
| `components/runtime-provider.tsx` | Multi-conversation state + localStorage; `woMap`, `suggestionsMap`, `pinnedQueries`, `theme` per active conversation |
| `components/gmes-thread.tsx` | Chat UI — `WoBadgeOrCode` (clickable WO badges), `SuggestionChip` (follow-up chips), pin button on user messages, dark-mode-aware |
| `components/chat-sidebar.tsx` | Conversation history sidebar (localStorage-backed) |
| `components/wo-cards.tsx` | `WoModal` — full WO detail overlay |
| `components/nav.tsx` | Top nav — page links + dark/light mode toggle |
| `lib/api.ts` | TypeScript API client — `queryWorkOrders`, `queryAnalytics`, `queryMtbf`, `queryAnomaly`, `queryExtract` |

### Frontend env vars (`frontend/.env.local`)
```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o
AZURE_OPENAI_REWRITE_DEPLOYMENT=gpt-4o   # set to gpt-4o-mini to reduce cost
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=
AZURE_SEARCH_INDEX=work-orders
NEXT_PUBLIC_API_URL=                      # leave empty for local dev (uses Next.js API routes)
```

## Data flow

### Migration
```
GMES Export (.xlsx / .bak / .csv)
  → migrate_to_search.py
      → pd.read_excel() / pd.read_csv()
      → normalize_wo_no() — strip pandas float suffix ("35734.0" → "35734")
      → doc ID = base64(f"WO_{wo_no}") — stable across re-exports
      → Azure AI Search merge_or_upload_documents() (batch 1000, 4 threads)
         fields: id, wo_no, content, date, date_ts, equipment, equip_id,
                 line, group, maint_type, technician, source
```

### Chat query
```
User question
  → POST /api/query
      → rewriteQuery(question, history)          ← LLM (REWRITE_DEPLOY), resolves references
      → searchWorkOrders(query)
          → Azure AI Search semantic search (configurationName: "default")
          → [count queries]  top=50, includeTotalCount=true
          → [recency queries] top=75, client-sort by date_ts desc, return top 25
          → [standard]       top=25
      → buildMessages(query, items, history, totalCount)
      → Promise.all([
          callLlm(messages),                     ← gpt-4o, max_tokens=800
          generateSuggestions(question, items),  ← REWRITE_DEPLOY, max_tokens=120
        ])
      → returns { answer, work_orders, query_used, suggestions }
```

### Analytics
```
POST /api/analytics  → Azure AI Search facets (server-side aggregation, top=0)
POST /api/mtbf       → Azure AI Search top=1000 orderBy date_ts asc → group by equipment → calc avg gap
POST /api/anomaly    → two parallel facet calls (recent window + prior-year window) → diff
POST /api/extract    → semantic search top=50 → parallel LLM batches (5 at a time) → tally tags
```

## Query intelligence

| Query type | Detection | Fetch limit | Special behaviour |
|---|---|---|---|
| Recency | `RECENCY_KEYWORDS` | 75 | Client-sort by `date_ts` desc, return top 25 |
| Count | `COUNT_KEYWORDS` | 50 | `includeTotalCount=true`, inject total + optional date window |
| Standard | default | 25 | Semantic search |

## Key constants (`frontend/app/api/query/route.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `TOP_K` | 25 | Work orders for standard queries |
| `COUNT_FETCH_K` | 50 | Max for count queries |
| `WO_TEXT_LIMIT` | 300 | Chars of WO content sent to LLM |
| `LLM_DEPLOY` | `gpt-4o` | Main answer model |
| `REWRITE_DEPLOY` | env var | Query rewrite + suggestion model |

## Azure AI Search index schema (`work-orders`)

| Field | Type | Attributes |
|---|---|---|
| `id` | String | key, filterable |
| `content` | String | searchable, analyzer: en.microsoft |
| `wo_no` | String | searchable, filterable |
| `source` | String | filterable, **facetable** |
| `date` | String | filterable |
| `date_ts` | Int64 | filterable, **sortable** |
| `equipment` | String | searchable, filterable, **facetable** |
| `equip_id` | String | filterable |
| `line` | String | filterable, **facetable** |
| `group` | String | filterable, **facetable** |
| `maint_type` | String | filterable, **facetable** |
| `technician` | String | searchable, filterable, **facetable** |

Semantic configuration: `default` — content field: `content`; keyword fields: `equipment`, `wo_no`.

## Dark mode

CSS custom properties (`--c-*`) defined in `globals.css` under `:root` (light) and `[data-theme="dark"]`. Applied via `document.documentElement.setAttribute("data-theme", ...)` in `GmesRuntimeProvider.toggleTheme()`. A blocking inline script in `layout.tsx` reads localStorage before first paint to prevent flash. System `prefers-color-scheme` is used as fallback.

## Code navigation

This project has `.codegraph/` initialized. **Always use `codegraph_explore` instead of Read/Grep for all source files** (`.ts`, `.tsx`, `.py`, etc.) — see `CLAUDE.md`.

| Key symbol | Kind | File |
|---|---|---|
| `rewriteQuery` | function | `frontend/app/api/query/route.ts` |
| `searchWorkOrders` | function | `frontend/app/api/query/route.ts` |
| `buildMessages` | function | `frontend/app/api/query/route.ts` |
| `generateSuggestions` | function | `frontend/app/api/query/route.ts` |
| `callLlm` | function | `frontend/app/api/query/route.ts` |
| `GmesRuntimeProvider` | component | `frontend/components/runtime-provider.tsx` |
| `GmesContext` | context | `frontend/components/runtime-provider.tsx` |
| `WoBadgeOrCode` | component | `frontend/components/gmes-thread.tsx` |
| `WoModal` | component | `frontend/components/wo-cards.tsx` |
| `migrate` | function | `migrate_to_search.py` |
| `normalize_wo_no` | function | `migrate_to_search.py` |
