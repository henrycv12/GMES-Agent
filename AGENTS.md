# Architecture

## Overview
GMES Agent is a Retrieval-Augmented Generation (RAG) system deployed on Azure. Work order records are embedded into Azure AI Search at ingest time. At query time, the user's question is embedded, the top-K most semantically similar work orders are retrieved, and Azure OpenAI generates an answer grounded in those records.

**Two interfaces exist:**
- **Copilot Studio** (original) — via Power Automate → Azure Functions (`api/function_app.py`)
- **React Frontend** (new) — Next.js app in `frontend/` with direct Azure AI calls via API routes

## Module responsibilities

| File | Role |
|---|---|
| `api/function_app.py` | Azure Functions HTTP trigger: query rewriting, Azure AI Search retrieval, Azure OpenAI LLM call, Table Storage history management |
| `api/openapi.json` | OpenAPI spec for custom connector (Power Automate) |
| `ingest_excel.py` | Reads Excel exports, sorts by date, embeds in batches, stores in Azure AI Search |
| `migrate_to_search.py` | Migrates local ChromaDB data to Azure AI Search (one-time migration) |
| `mq.yaml` / `fb.yaml` | Copilot Studio topic YAMLs (Maintenance Query and Fallback) — patched via Dataverse API |
| `frontend/` | Next.js 14 React frontend — direct Azure AI integration, chat UI, analytics |

## Frontend (`frontend/`)

Next.js 14 app with App Router. Runs locally with `npm run dev` from `frontend/`.

| File | Role |
|---|---|
| `app/layout.tsx` | Root layout — wraps all pages with `GmesRuntimeProvider` |
| `app/page.tsx` | Chat page — renders `ChatSidebar` + `GmesThread` |
| `app/analytics/page.tsx` | Analytics page |
| `app/api/query/route.ts` | Next.js API route — replicates Azure Functions query logic |
| `app/api/analytics/route.ts` | Next.js API route — aggregation queries |
| `components/runtime-provider.tsx` | Multi-conversation state manager with localStorage persistence |
| `components/gmes-thread.tsx` | Chat UI using `@assistant-ui/react` Primitives API |
| `components/chat-sidebar.tsx` | Conversation history sidebar (localStorage-backed) |
| `components/wo-cards.tsx` | Cited work order cards — click opens full WO modal |
| `lib/api.ts` | API client types and `queryWorkOrders()` fetch helper |

### Frontend env vars (`frontend/.env.local`)
```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o
AZURE_OPENAI_REWRITE_DEPLOYMENT=gpt-4o   # set to gpt-4o-mini to reduce cost
AZURE_OPENAI_EMBED_DEPLOYMENT=embed-model
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=
AZURE_SEARCH_INDEX=work-orders
NEXT_PUBLIC_API_URL=
```

## Data flow

```
GMES Export (.xlsx or .csv)
    → ingest_excel.py
        → pd.read_excel() / pd.read_csv() → sort by date desc
        → Azure OpenAI embed(batch=500) → embeddings[]
        → Azure AI Search index "work-orders" (incremental upsert)

User query (React Frontend)
    → POST /api/query (Next.js route)
        → rewriteQuery(question, history)   ← LLM call (REWRITE_DEPLOY)
        → searchWorkOrders(query)
            → Azure AI Search semantic search
            → [count queries: top=50, includeTotalCount=true]
            → [recency queries: top=30, client-sort by date_ts desc]
        → buildMessages(query, items, history, totalCount)
            → injects COUNT METADATA or date window for count queries
        → callLlm(messages)                 ← gpt-4o, max_tokens=800
        → returns { answer, work_orders, query_used, card }

User query (Copilot Studio) — unchanged
    → Power Automate → Azure Functions /api/query → same logic as above
```

## Query intelligence (both backends)

| Query type | Detection | Behaviour |
|---|---|---|
| **Recency** | `RECENCY_KEYWORDS` | Fetch TOP_K×3, sort by `date_ts` desc, return TOP_K |
| **Count** | `COUNT_KEYWORDS` | Fetch 50 (semantic max), `includeTotalCount=true` |
| **Count + time window** | `COUNT_KEYWORDS` + `parseDateWindow()` | Inject cutoff date — LLM counts only records ≥ that date |
| **Standard** | default | Fetch TOP_K=10 |

## Key constants (both `api/function_app.py` and `frontend/app/api/query/route.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `TOP_K` | 10 | Work orders retrieved for standard queries |
| `COUNT_FETCH_K` | 50 | Max retrieved for count/recency queries |
| `WO_TEXT_LIMIT` | 300 | Chars of WO content sent to LLM (truncated for token savings) |
| `RECENCY_KEYWORDS` | set | Triggers date re-rank |
| `COUNT_KEYWORDS` | set | Triggers count mode + total count injection |
| `AZURE_LLM_DEPLOY` | `gpt-4o` | Main chat model |
| `AZURE_REWRITE_DEPLOY` | env var | Rewrite model (can be `gpt-4o-mini` to save cost) |

## Key constants (ingest_excel.py)
- `EMBED_BATCH = 500` — texts per embed API call
- `BATCH_SIZE = 500` — records per Azure AI Search add() call
- Sort: `Maint. Plan Date` descending before embedding

## Pending: date-filter recency search
See plan: `date-filter-recency-search-45f700.md`
- Add `$orderby=date_ts desc` + `$filter` for breakdown/corrective maintenance types to recency queries
- Requires confirming `maint_type` and `date_ts` are filterable/sortable in Azure Search index
- Direct WO number lookup (`$filter=wo_no eq 'X'`) also planned

## TODO: Microsoft OAuth (Azure AD)
Authentication via NextAuth.js + Entra ID App Registration — requires IT to create App Registration in Azure Portal. Planned for when frontend goes to production.

## Code navigation
This project has `.codegraph/` initialized.
**Always use CodeGraph MCP tools instead of grep/read loops** — see `.devin/rules/codegraph.md`.

| Key symbols | Kind | File |
|---|---|---|
| `query_handler` | function | `api/function_app.py` |
| `rewrite_query` / `rewriteQuery` | function | `api/function_app.py`, `frontend/app/api/query/route.ts` |
| `build_messages` / `buildMessages` | function | both |
| `call_llm` / `callLlm` | function | both |
| `search_work_orders` / `searchWorkOrders` | function | both |
| `is_count_query` / `isCountQuery` | function | both |
| `parse_date_window` / `parseDateWindow` | function | both |
| `GmesRuntimeProvider` | component | `frontend/components/runtime-provider.tsx` |
| `ChatSidebar` | component | `frontend/components/chat-sidebar.tsx` |
| `WoCards` / `WoModal` | component | `frontend/components/wo-cards.tsx` |
| `ingest_excel` | function | `ingest_excel.py` |

## Deployment target
Azure Functions (Linux Consumption plan). Deployed via:
```bash
cd api
func azure functionapp publish gmes-agent-api --python
```

## Power Platform operations
See `.devin/rules/azure.md` for detailed guidance on:
- PAC connector operations (`pac connector download/update`)
- Power Automate flow patching (via management API, not Dataverse)
- Copilot Studio topic YAML patching (via Dataverse API)
- Azure CLI authentication patterns

