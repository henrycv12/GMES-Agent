# Architecture

## Overview
GMES Agent is a Retrieval-Augmented Generation (RAG) system deployed on Azure. Work order records are embedded into Azure AI Search at ingest time. At query time, the user's question (via Copilot Studio) is embedded, the top-K most semantically similar work orders are retrieved, and Azure OpenAI generates an answer grounded in those records. Multi-turn conversation history is maintained in Azure Table Storage.

## Module responsibilities

| File | Role |
|---|---|
| `api/function_app.py` | Azure Functions HTTP trigger: query rewriting, Azure AI Search retrieval, Azure OpenAI LLM call, Table Storage history management |
| `api/openapi.json` | OpenAPI spec for custom connector (Power Automate) |
| `ingest_excel.py` | Reads Excel exports, sorts by date, embeds in batches, stores in Azure AI Search |
| `migrate_to_search.py` | Migrates local ChromaDB data to Azure AI Search (one-time migration) |
| `mq.yaml` / `fb.yaml` | Copilot Studio topic YAMLs (Maintenance Query and Fallback) — patched via Dataverse API |

## Data flow

```
GMES Export (.xlsx or .csv)
    → ingest_excel.py
        → pd.read_excel() / pd.read_csv() → sort by date desc
        → Azure OpenAI embed(batch=500) → embeddings[]
        → Azure AI Search index "work-orders" (incremental upsert)

User query (Copilot Studio)
    → Power Automate Flow (GMES Query Flow)
        → Azure Functions API /api/query
            → Azure OpenAI embed(query) → query vector
            → Azure AI Search semantic search(top_k) → matching WO chunks
            → [recency re-rank if "recent/latest/last" in query]
            → rewrite_query(question, history from Table Storage)
            → build_messages(query, items, history)
            → Azure OpenAI gpt-4o chat → answer text + inline citations
            → Table Storage: update conversation history
        → Flow returns answer to Copilot Studio
    → Copilot Studio displays answer to user
```

## External dependencies
- **Azure OpenAI** — primary provider for both embeddings and LLM. Credentials in Azure Function App Settings.
  - `text-embedding-3-small` via `embed-model` deployment
  - `gpt-4o` via `gpt-4o` deployment
- **Azure AI Search** — vector search with semantic ranking
  - Index: `work-orders`
  - Semantic configuration: `default`
- **Azure Table Storage** — persistent conversation history
  - Table: `convhistory`
  - PartitionKey: `h`, RowKey: sanitized conversation ID
- **Azure Functions** — serverless API hosting
  - App: `gmes-agent-api`
  - Trigger: HTTP POST `/api/query`
- **Power Automate** — connector between Copilot Studio and Azure Functions
  - Flow: `GMES Query Flow` (ID: `c4f53174-9a69-f111-ab0c-6045bd1e831e`)
  - Custom connector: `GMES Agent API`
- **Copilot Studio** — conversational UI
  - Bot: `GMES Maintenance Agent` (ID: `cr981_GMESMaintenanceAgent`)
  - Topics: Maintenance Query, Fallback
- **GMES** — source of work order exports (manual export, `.xlsx` or `.csv`)

## Key constants (api/function_app.py)
- `SEARCH_INDEX = "work-orders"` — Azure AI Search index name
- `AZURE_LLM_DEPLOY = "gpt-4o"` — Azure OpenAI chat deployment
- `TOP_K = 15` — work orders retrieved per query
- `RECENCY_KEYWORDS` — triggers date re-ranking when matched in query
- `_HISTORY_TABLE = "convhistory"` — Azure Table Storage table name
- `_STORAGE_CONN` — AzureWebJobsStorage connection string (auto-set)

## Key constants (ingest_excel.py)
- `EMBED_BATCH = 500` — texts per embed API call
- `BATCH_SIZE = 500` — records per Azure AI Search add() call
- Sort: `Maint. Plan Date` descending before embedding

## Code navigation
This project has `.codegraph/` initialized.
**Always use CodeGraph MCP tools instead of grep/read loops** — see `.devin/rules/codegraph.md`.

| Key symbols | Kind | File |
|---|---|---|
| `query_handler` | function | `api/function_app.py` |
| `rewrite_query` | function | `api/function_app.py` |
| `build_messages` | function | `api/function_app.py` |
| `call_llm` | function | `api/function_app.py` |
| `search_work_orders` | function | `api/function_app.py` |
| `build_card` | function | `api/function_app.py` |
| `_get_history` | function | `api/function_app.py` |
| `_set_history` | function | `api/function_app.py` |
| `_safe_row_key` | function | `api/function_app.py` |
| `ingest_excel` | function | `ingest_excel.py` |
| `row_to_text` | function | `ingest_excel.py` |

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

