# DX Project — Original Design Reference

Source: `'2026 DX Project_Development of an AI-based Work Order Management and Analytics System.pptx`

## Project Goal
AI-based Work Order Management and Analytics System for LG Electronics TN Production Engineering.
Replace 60–90 min of manual GMES searching with a single natural-language query in under 5 seconds.

---

## Original Proposed Architecture (Azure-native)

```
User Layer       → Microsoft Teams / Copilot Studio
                   PE engineers type natural-language questions
                   SSO via LGE Azure tenant

Retrieval Layer  → Azure AI Search
                   Semantic / vector search over 7-year work-order index
                   Wording-agnostic: "air leak" = "vacuum error" = "suction failure"

Reasoning Layer  → Azure OpenAI (GPT-4)
                   Summarizes cause · action · recurrence · prevention
                   Cites source IDs / dates / lines · suggests PM actions

Data Layer       → Azure SQL Database
                   7-year work-order history, 50,000+ records from GMES
                   Fields: cause · action · prevention · equipment ID · date · technician
                   Refreshed nightly from GMES export
```

### Output Actions (planned)
- **Create PM Task** — one-click handoff to PM checklist
- **Export Summary** — cited records + cause ready to share
- **Open Source WO** — direct link back to original GMES record

---

## What We Built Instead (GMES Agent — current)

| Original | GMES Agent equivalent | Status |
|---|---|---|
| Microsoft Teams | Copilot Studio published to Teams channel | 🟡 Partial — requires Copilot Studio subscription |
| Copilot Studio agent | Azure Functions `/api/query` + Power Automate connector | ✅ Done |
| Azure AI Search (vector) | Azure AI Search (`work-orders` index) + ChromaDB fallback | ✅ Done |
| Azure OpenAI GPT-4 (reasoning) | Azure OpenAI `gpt-4o` | ✅ Done |
| Azure OpenAI embeddings | Azure OpenAI `text-embedding-3-small` (`embed-model` deployment) | ✅ Done |
| Azure SQL Database | GMES `.xlsx`/`.csv` export → ChromaDB + Azure AI Search | 🟡 Partial |
| Multi-turn conversation history | Azure Table Storage (`convhistory` table) + Streamlit session state | ✅ Done |
| Cited work order output | Inline citations in every answer (WO#, date, technician, equipment) | ✅ Done |
| Query disambiguation | GPT-4o query rewriter — resolves pronouns and implicit equipment references | ✅ Done |
| Recency-aware retrieval | Keyword detection + date re-ranking for "recent / latest / last" queries | ✅ Done |
| Nightly automated sync | Manual export from GMES | ❌ Pending |

---

## KPI Targets

| Metric | Baseline | Target |
|---|---|---|
| Search time per task | 90 min | 5 min (−95%) |
| Monthly hours (7 engineers) | 654 hrs | 36 hrs (−94%) |
| Annual cost saved | — | $314,160 (at $40/hr) |
| Manual search time | — | −30% (pilot target) |
| Analysis time | — | −70% (pilot target) |
| Unplanned downtime | — | −20% (post-action target) |
| PM compliance rate | — | +10pp (monitored lines) |
| Answer accuracy | — | ≥90% |
| Avg. response time | — | ≤5 sec per query |

---

## Use Cases Demonstrated in Presentation
1. **Single equipment query** — "What failures has the EPS vacuum pump had in the last 6 months?"
   Returns: failure list with dates, causes, actions, parts used
2. **Cross-line failure pattern** — "Which lines had the most diverter jam failures in Q1?"
   Returns: ranked line list with frequency and last occurrence
3. **Multi-failure PM rollup** — "What are the top 3 recurring failures in EPS shop in the last 90 days?"
   Returns: top 3 by frequency with avg repair time, last occurrence, and PM recommendations — replaces 60–90 min of manual GMES searching

---

## Project Timeline (original plan)
| Phase | Target date |
|---|---|
| Foundation & Environment Setup | ~Mar 19 |
| Requirements & Scope Definition | ~Mar 22 |
| Data & Architecture Setup | ~Apr 25 |
| Core Development | ~May 31 |
| Testing & Feedback | ~Jun 12 |
| Deployment | ~Jun 26 |

---

## IT Progress Tracking (W25)

| NO | Team | Week | Project Title | Current Status | Target | Planned Progress | Actual Progress | Flag | Note/Issue |
|---|---|---|---|---|---|---|---|---|---|
| 6 | PE | W25 | Development of an AI-based Work Order Management and Analytics System | Testing & Feedback | Jun 26 | 90% | 85% | 🟡 | Core RAG system complete: Azure OpenAI `gpt-4o`, Azure AI Search, Azure Functions `/api/query`, Power Automate custom connector, Azure Table Storage multi-turn history, inline WO citations, query rewriting, recency-aware retrieval — all implemented and committed. PE team actively validating response quality. Pending: automated nightly GMES sync (blocked on HQ API), Teams integration (needs Copilot Studio subscription), output actions (Create PM Task, Export Summary, needs Power Automate Premium). **Note**: Teams integration requires a Copilot Studio subscription (Teams Premium is NOT needed — Copilot Studio publishes directly to Teams channel). Automated nightly sync is blocked on HQ GMES API access, not a subscription issue. |

## Gap Analysis — What GMES Agent Still Needs

### ✅ Completed
- [x] **Azure OpenAI embeddings** (`text-embedding-3-small` via `embed-model`) — Jun 15 2026
- [x] **Azure OpenAI LLM** (`gpt-4o`) — Jun 15 2026
- [x] **Response time ≤5 sec** — achieved ~2–5 sec with GPT-4o — Jun 15 2026
- [x] **19,000+ work orders indexed** (1 year of data from GMES) — Jun 15 2026
- [x] **Multi-turn conversation history** — full context via Azure Table Storage (`convhistory` table) + Streamlit session state — Jun 16 2026
- [x] **Azure Functions API** (`/api/query` HTTP POST trigger) — production-ready cloud backend — Jun 16 2026
- [x] **Power Platform custom connector** — OpenAPI spec + connector JSON for Power Automate integration — Jun 16 2026
- [x] **Copilot Studio integration** — agent calls `/api/query` via Power Automate — Jun 16 2026
- [x] **Work order citations** — inline citation block in every answer showing WO number, date, technician, equipment — Jun 16 2026
- [x] **Query rewriting** — GPT-4o resolves pronouns and implicit equipment references across turns — Jun 16 2026
- [x] **Recency-aware retrieval** — keyword detection triggers date re-ranking (recent/latest/last) — Jun 16 2026
- [x] **Adaptive Card responses** — rich card output from Azure Functions for Copilot Studio display — Jun 16 2026
- [x] **Local Streamlit UI** — full-featured chat interface with WO cards and multi-turn state — Jun 16 2026
- [x] **Incremental ingestion** — duplicate detection, skips already-indexed WOs on each run — Jun 16 2026
- [x] **Recurring failure analytics** — `POST /api/analytics` endpoint: group by line/equipment/type, date range, text filter, cross-line comparison, time-based aggregation (week/month/quarter) — Jun 17 2026
- [x] **Cross-line pattern queries** — multi-field grouping (e.g. `["line","maint_type"]`) with frequency ranking — Jun 17 2026

### 🟡 Pending (in priority order)
- [ ] **Create PM Task** output action — one-click handoff to PM checklist (requires Power Automate Premium)
- [ ] **Export Summary** — cited records + cause ready to share with team (requires Power Automate Premium)
- [ ] **Automated nightly sync** from GMES — blocked on HQ GMES API access; manual `.xlsx` export is the current workaround
- [ ] **Teams integration** — Copilot Studio published to Teams channel; requires Copilot Studio subscription (Teams Premium is NOT required)
- [ ] **Open Source WO** — direct link back to original GMES record
