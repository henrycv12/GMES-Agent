# Project Context

## What this project does
GMES Agent is an AI maintenance assistant for LG Electronics TN Production Engineering. It indexes historical work order exports from GMES into Azure AI Search and answers natural-language troubleshooting questions — identifying past failures, root causes, resolutions, MTBF, and anomalies. ~47K work orders indexed.

## Current status
- **Working:** Work order ingestion from Excel/BAK (incremental upsert, WO-number based IDs), Azure AI Search BM25 + semantic ranking, React chat UI, multi-turn conversation with query rewriting, clickable WO badges, pinned queries, follow-up suggestions, dark mode, Analytics (Work Orders / MTBF / Anomalies / Failure Analysis tabs)
- **In progress:** Nothing active
- **Broken:** Nothing known
- **Pending:** Auth (Azure AD / NextAuth.js — requires IT to create App Registration), automated GMES export sync (requires HQ API access)

## Tech stack
- **LLM:** Azure OpenAI `gpt-4o` on `hcol-mqfq4gia-eastus2`
- **Search:** Azure AI Search free tier — BM25 + semantic ranking, no embeddings needed
- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, `@assistant-ui/react`
- **Charts:** Recharts
- **Data source:** GMES export (`.xlsx`, `.bak`, `.csv`) — ~47K work orders

## Key file map
- **Migration:** `migrate_to_search.py` — reads Excel/BAK exports, normalizes WO numbers, upserts into Azure AI Search (`merge_or_upload_documents`); `--recreate` flag for full rebuild
- **Chat API:** `frontend/app/api/query/route.ts` — query rewrite → semantic search → LLM answer → parallel suggestion generation
- **Analytics API:** `frontend/app/api/analytics/route.ts` — facet aggregation
- **MTBF API:** `frontend/app/api/mtbf/route.ts` — mean days between failures per equipment
- **Anomaly API:** `frontend/app/api/anomaly/route.ts` — compares recent vs. prior-year failure counts
- **Extract API:** `frontend/app/api/extract/route.ts` — LLM root-cause tagging (parallel batches)
- **State:** `frontend/components/runtime-provider.tsx` — conversations, woMap, suggestionsMap, pinnedQueries, theme; all in localStorage
- **Chat UI:** `frontend/components/gmes-thread.tsx` — WoBadgeOrCode, suggestion chips, pin button
- **Config:** `.env` (root, for migration) + `frontend/.env.local` (for Next.js)

## Known constraints
- Azure AI Search free tier: skip+top ≤ 1000 (workaround: use facets for aggregation, top=1000 cap for MTBF)
- Manual GMES export required — no automated sync (HQ API access not available)
- Azure AI Search free tier storage: 50MB — current ~47K WOs fit; adding significantly more records may require upgrade to Basic (~$73/mo)
