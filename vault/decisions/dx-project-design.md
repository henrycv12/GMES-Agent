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

## What We Built Instead (MES Local — current)

| Original | MES Local equivalent |
|---|---|
| Microsoft Teams / Copilot Studio | Streamlit chat UI (local) |
| Azure AI Search (vector) | ChromaDB (local persistent vector DB) |
| Azure OpenAI GPT-4 (reasoning) | Ollama `llama3.2:1b` (local LLM) |
| Azure OpenAI embeddings | Azure OpenAI `text-embedding-3-small` ✅ |
| Azure SQL Database | GMES `.xlsx`/`.csv` export (local) |
| Nightly automated sync | Manual export from GMES |

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

## Gap Analysis — What MES Local Still Needs
- [ ] **Create PM Task** output action
- [ ] **Export Summary** (cited records to share)
- [ ] **Recurring failure analytics** (top-N failures by line/shop/date range)
- [ ] **Automated nightly sync** from GMES (currently manual export)
- [ ] **Teams integration** (currently local Streamlit only)
- [ ] **Cross-line pattern queries** (current retrieval is semantic, not aggregated)
- [ ] Response time target ≤5 sec (currently ~15–25 sec due to local Ollama LLM)
