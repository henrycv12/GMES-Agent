# Known Issues

## [RESOLVED] Embedding bottleneck
- **Problem:** `ollama.embeddings()` called one record at a time — 7,475 records took hours
- **Fix:** Switched to batch embedding → then removed embeddings entirely; Azure AI Search handles BM25 + semantic ranking natively
- **Status:** ✅ Resolved

## [RESOLVED] Wrong dates on recency queries
- **Problem:** LLM referenced old records when asked for "most recent" — no date sorting
- **Fix:** Store `date_ts` epoch in index; client-sort by `date_ts` desc when recency keywords detected
- **Status:** ✅ Resolved

## [RESOLVED] Windows asyncio error
- **Problem:** `ConnectionResetError` on Windows with streaming calls
- **Fix:** `stream=False` in all LLM calls; removed Ollama dependency entirely
- **Status:** ✅ Resolved

## [RESOLVED] Analytics 500 error
- **Problem:** Pagination loop hit Azure AI Search free-tier limit (skip+top ≤ 1000)
- **Fix:** Switched to server-side facet aggregation (`top=0`); requires `facetable=True` on relevant fields
- **Status:** ✅ Resolved — re-migration required after schema change (already done)

## [RESOLVED] WO badge click opened nothing
- **Problem:** `wos.find()` failed due to "35734.0" vs "35734" format mismatch (pandas float serialization)
- **Fix:** `normalize_wo_no()` in migration; flexible match in click handler (exact, `.0` strip, parseInt)
- **Status:** ✅ Resolved

## [RESOLVED] React hydration mismatch
- **Problem:** `useState` initializer read localStorage on server, caused client/server HTML mismatch
- **Fix:** Start with blank conversation in `useState`; load from localStorage in `useEffect`
- **Status:** ✅ Resolved

## [RESOLVED] "Composer is not available" error on suggestion chips
- **Problem:** `useComposerRuntime()` inside `AssistantMessage` resolved to the message edit composer (not available for assistant messages)
- **Fix:** Use `useThreadRuntime().composer` instead to access the thread-level composer
- **Status:** ✅ Resolved

## [ACTIVE] Manual GMES export required
- **Problem:** No automated nightly sync — engineer must manually export Excel/BAK and re-run migration
- **Workaround:** Run `python migrate_to_search.py` after each export (incremental, safe to repeat)
- **Blocker:** Requires HQ GMES API access — not an internal IT decision
- **Status:** ⛔ Pending — architectural dependency on HQ

## [ACTIVE] Azure AI Search storage ceiling
- **Problem:** Free tier capped at 50MB. ~47K WOs currently fit; significant growth may exceed limit
- **Options:**
  - **Upgrade to Basic** (~$73/month, 2GB) — no code changes required
  - **Field pruning** — reduce `content` field size in `row_to_content()` to shrink index
- **Status:** ⚠️ Monitor — not blocking yet; revisit when index approaches 40MB

## [ACTIVE] No authentication
- **Problem:** Frontend has no login — anyone on the network can access it
- **Plan:** NextAuth.js + Azure AD (Entra ID); requires IT to create App Registration
- **Status:** ⛔ Blocked on IT action
