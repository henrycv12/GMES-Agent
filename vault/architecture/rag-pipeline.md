# RAG Pipeline Architecture

## Migration pipeline
```
GMES Export (.xlsx / .bak / .csv)
  → pd.read_excel() / pd.read_csv()
  → df.columns.str.strip()
  → normalize_wo_no() → strip pandas float suffix ("35734.0" → "35734")
  → doc ID = base64(f"WO_{wo_no}")  ← stable; same WO across re-exports merges, not duplicates
  → row_to_content() → formatted text block per WO
  → merge_or_upload_documents() (batch=1000, 4 threads)
     Azure AI Search index "work-orders"
```

Run modes:
- `python migrate_to_search.py` — incremental upsert (safe to run repeatedly)
- `python migrate_to_search.py --recreate` — delete + poll for storage reclaim + recreate index

## Chat query pipeline
```
User question
  → POST /api/query (Next.js route)
  → rewriteQuery(question, history)          ← REWRITE_DEPLOY, resolves "same machine" etc.
  → searchWorkOrders(rewrittenQuery)
      → Azure AI Search semantic search (configurationName: "default")
      → count query:   top=50, includeTotalCount=true
      → recency query: top=75, client-sort date_ts desc → slice top 25
      → standard:      top=25
  → buildMessages(question, items, history, totalCount)
      → injects count metadata or date-window clause for count queries
  → Promise.all([
      callLlm(messages),                     ← gpt-4o, max_tokens=800, temp=0.2
      generateSuggestions(question, items),  ← REWRITE_DEPLOY, max_tokens=120, temp=0.5
    ])
  → { answer, work_orders[], query_used, suggestions[] }
```

## Analytics pipelines

### Work Orders tab (`/api/analytics`)
```
POST { group_by, top_n, date_from, date_to, filter }
  → sc.search("*" | filter, { top: 0, facets: ["{field},count:{n},sort:count"] })
  → consume results iterator (populates .facets)
  → return [{ [groupBy]: label, count }]
```
Requires fields to be `facetable=True` in the index schema.

### MTBF tab (`/api/mtbf`)
```
POST { equipment?, line?, group?, date_from?, date_to?, top_equipment? }
  → sc.search("*", { filter, top: 1000, orderBy: ["date_ts asc"], select: [...] })
  → group events by equipment
  → for each equipment: calc avg days between consecutive events
  → sort by MTBF asc (shortest = most attention-needed first)
  → return [{ equipment, failure_count, mtbf_days, first_failure, last_failure }]
```

### Anomalies tab (`/api/anomaly`)
```
POST { window_days, min_recent, min_change_pct, line?, group? }
  → Promise.all([
      countByEquipment(recentFrom, recentTo),   ← facets, no data limit
      countByEquipment(priorFrom,  priorTo),    ← same window, 1 year earlier
    ])
  → for each equipment in recent: calc % change vs prior
  → flag if change_pct >= min_change_pct OR prior_count == 0 (new pattern)
  → sort by recent_count desc
```

### Failure Analysis tab (`/api/extract`)
```
POST { query, top?, date_from?, date_to? }
  → semantic search top=50
  → for each WO content (batches of 5, parallel):
      LLM extract { root_cause, failure_mode, component }
  → tally → [{ label, count }] sorted desc
  → return { total_analyzed, by_root_cause, by_failure_mode, by_component }
```

## Azure AI Search index schema

| Field | Type | Search | Filter | Sort | Facet |
|---|---|---|---|---|---|
| `id` | String (key) | — | ✓ | — | — |
| `content` | String | ✓ (en.microsoft) | — | — | — |
| `wo_no` | String | ✓ | ✓ | — | — |
| `source` | String | — | ✓ | — | ✓ |
| `date` | String | — | ✓ | — | — |
| `date_ts` | Int64 | — | ✓ | ✓ | — |
| `equipment` | String | ✓ | ✓ | — | ✓ |
| `equip_id` | String | — | ✓ | — | — |
| `line` | String | — | ✓ | — | ✓ |
| `group` | String | — | ✓ | — | ✓ |
| `maint_type` | String | — | ✓ | — | ✓ |
| `technician` | String | ✓ | ✓ | — | ✓ |

Semantic config `default`: content field = `content`; keyword fields = `equipment`, `wo_no`.
