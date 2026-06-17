# Date-Filter & Failure-Type Search for Recency Queries

Improve recency queries (e.g. "last time Die Cushion on PR2-1 failed") by adding Azure Search `$filter` + `$orderby` so old work orders are always surfaced correctly regardless of data volume.

---

## Problem

Current recency flow:
1. Semantic search retrieves top 30 records by **relevance**
2. Client-side sort by `date_ts` desc → top 10 sent to LLM

**Gap:** High-frequency equipment (hundreds of WOs/year) will bury old failures. The 2-year-old failure WO may never appear in the top 30 semantic results.

---

## Prerequisite — Confirm Azure Search Index Fields

Before implementing, verify these fields are marked **filterable** and **sortable** in the Azure AI Search index (`work-orders`):

| Field | Need |
|---|---|
| `date_ts` | `sortable: true` |
| `maint_type` | `filterable: true` |

**How to check:** Azure Portal → AI Search → Indexes → `work-orders` → Fields tab.

If not set, update the index definition in Azure Portal (or via `ingest_excel.py` index creation code) and re-index.

---

## Step 1 — Confirm `maint_type` values for failures

Check your GMES Excel export for the exact strings in the `"Maint. Type"` column that represent failures. Expected values (confirm before coding):

- `"Breakdown"` or `"BM"`
- `"Corrective Maintenance"` or `"CM"`

These will become the `FAILURE_MAINT_TYPES` constant.

---

## Step 2 — Update `searchWorkOrders` in `route.ts` and `function_app.py`

For **recency queries** (`"last"`, `"most recent"`, `"who last"`, etc.):

```typescript
// route.ts change
const FAILURE_MAINT_TYPES = ["Breakdown", "Corrective Maintenance"]; // adjust to real values
const failureFilter = FAILURE_MAINT_TYPES.map(t => `maint_type eq '${t}'`).join(" or ");

// In searchWorkOrders, for recency queries:
{
  queryType: "semantic",
  semanticSearchOptions: { configurationName: "default" },
  top: COUNT_FETCH_K,           // 50 — semantic max
  orderBy: ["date_ts desc"],    // DB-level sort → guarantees most recent first
  filter: failureFilter,        // Only breakdown / corrective maintenance
  includeTotalCount: true,
  select: [...],
}
```

- Remove the existing client-side `items.sort()` for recency (DB handles it)
- Keep client-side sort as fallback if `orderBy` throws (wrap in try/catch → retry without filter/orderBy)

---

## Step 3 — Direct WO number lookup

When the query contains a WO number pattern (`WO #1234` or just `#1234`), skip semantic search entirely:

```typescript
const woMatch = query.match(/#?(\d{3,6})\b/);
if (woMatch) {
  // Use $filter=wo_no eq '1234' with top:1
  // Return that single WO directly
}
```

Requires `wo_no` to be `filterable: true` in the index.

---

## Step 4 — Sync to `function_app.py`

Mirror all changes to the Python backend:
- `FAILURE_MAINT_TYPES` set
- `order_by=["date_ts desc"]` and `filter=...` on recency queries
- Graceful fallback if filter fails

---

## Step 5 — Update system prompt

Add note: *"For 'last time X failed' queries, results are pre-sorted by date descending and filtered to breakdown/corrective maintenance types only."*

---

## Files to edit

| File | Change |
|---|---|
| `frontend/app/api/query/route.ts` | Steps 2, 3 |
| `api/function_app.py` | Step 4 |
| Azure Portal | Step 1 prerequisite (index fields) |

---

## Risks

- If `maint_type` / `date_ts` are not filterable/sortable → filter call throws → fallback to current behavior (graceful)
- `orderBy` with semantic search: Azure AI Search supports this but semantic reranking score is overridden by the sort field — acceptable for recency queries where date matters more than semantic score
- If `maint_type` values differ from expected strings → filter returns 0 results → need to confirm exact values from CSV first (Step 1)
