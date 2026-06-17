# RAG Pipeline Architecture

## Ingest pipeline
```
GMES Export (.xlsx or .csv)
  → pandas.read_excel() / pd.read_csv()
  → Sort by Maint. Plan Date DESC
  → row_to_text() → formatted text block per WO
  → Azure OpenAI embed(batch=500) → embeddings[]
  → Azure AI Search index "work-orders" (incremental upsert)
     fields: wo_no, date, date_ts, equipment, equip_id, line, group, maint_type, source, content, technician
```

## Query pipeline (React Frontend)
```
User types question in React UI
  → POST /api/query (Next.js route)
  → rewriteQuery(question, history) → LLM call (REWRITE_DEPLOY)
  → searchWorkOrders(query)
      → Azure AI Search semantic search
      → [count queries: top=50, includeTotalCount=true]
      → [recency queries: top=30, client-sort by date_ts desc]
      → [standard: top=10]
  → buildMessages(query, items, history, totalCount)
      → injects COUNT METADATA or date window for count queries
  → callLlm(messages) → gpt-4o, max_tokens=800
  → Display answer + WoCards (clickable WO citations)
```

## Query pipeline (Copilot Studio)
```
User types question in Copilot Studio
  → Power Automate Flow (GMES Query Flow)
  → Azure Functions API /api/query
      → Same logic as React frontend above
  → Flow returns answer to Copilot Studio
```

## Azure AI Search index schema
- **Index:** `work-orders`
- **Semantic configuration:** `default`
- **Key fields:**
  - `wo_no` (filterable, sortable)
  - `date` (filterable, sortable)
  - `date_ts` (sortable)
  - `equipment` (filterable)
  - `maint_type` (filterable)
  - `technician` (filterable)
  - `content` (searchable, vectorized)
  - `line`, `group`, `source`, `equip_id`

