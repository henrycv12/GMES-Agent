# Deployment Costs and Tools Required

## Overview
The GMES Agent core RAG system is complete and operational (Azure OpenAI, AI Search, Table Storage, Copilot Studio, multi-turn history, citations). The following items are needed to complete full deployment per the DX project scope.

---

## 1. Recurring Failure Analytics & Cross-Line Pattern Queries

**Description**: Aggregated analytics to answer questions like "Which lines had the most diverter jam failures in Q1?" or "What are the top 3 recurring failures in EPS shop in the last 90 days?" These require aggregation logic beyond semantic search.

**Technical Approach**:
- Add aggregation endpoints to the Azure Functions API
- Use Azure AI Search facets or Azure SQL for grouped queries
- Option A: Extend Azure AI Search with faceted search (no additional cost)
- Option B: Add Azure SQL Database for complex aggregations (additional cost)

**Costs**:
- **Option A (AI Search facets)**: No additional cost — uses existing Azure AI Search
- **Option B (Azure SQL)**: ~$50-100/month for DTU-based tier (depends on query volume)

**Tools Needed**:
- Azure Functions API updates (Python)
- Azure AI Search facet configuration OR Azure SQL Database provisioning
- No additional Power Platform licenses required

**Priority**: High — directly tied to DX KPIs (-20% unplanned downtime, +10pp PM compliance)

---

## 2. Create PM Task Output Action

**Description**: Generate a PM task or export a list/file based on the current work order database to facilitate preventive maintenance planning.

**Technical Approach**:
- Power Automate flow to query work order database and generate PM task record
- Export formatted list (Excel/CSV) of recommended PM tasks based on failure patterns
- Action button in Copilot Studio response to trigger the export

**Costs**:
- **Power Automate Premium**: ~$15-20/user/month (per seat license)
- Required for advanced flow actions and file generation

**Tools Needed**:
- Power Automate Premium license
- Access to work order database (Azure AI Search or Azure SQL)
- Copilot Studio action button configuration

**Priority**: Low — nice-to-have, not critical for initial deployment

---

## 3. Export Summary Output Action

**Description**: Generate a formatted summary of cited work orders ready to share with the team (e.g., PDF, Excel, or email).

**Technical Approach**:
- Power Automate Premium flow to format and send/export
- Document generation service (e.g., Azure Functions with Python libraries)

**Costs**:
- **Power Automate Premium**: ~$15-20/user/month (per seat license)
- No additional Azure costs if using existing Functions

**Tools Needed**:
- Power Automate Premium license
- Document generation libraries (Python)

**Priority**: Medium — useful for demos and knowledge sharing

---

## 4. Teams Integration (Publish Bot to Teams Channel)

**Description**: Make the Copilot Studio bot available in Microsoft Teams for PE engineers.

**Technical Approach**:
- Publish Copilot Studio bot to Teams channel
- Requires Copilot Studio subscription for publishing

**Costs**:
- **Copilot Studio subscription**: ~$20-50/month (per bot or per user, depending on license tier)
- Required to publish bots to Teams and other channels

**Tools Needed**:
- Copilot Studio subscription
- Copilot Studio Teams channel configuration

**Priority**: High — primary front-end for users, currently blocked by billing issue in LGE Power Platform tenant

**Status**: BLOCKED — Copilot Studio publish to Teams blocked by billing issue in LGE Power Platform tenant. Requires Copilot Studio subscription resolution.

---

## Summary of Costs

| Item | Tool/Service | Estimated Cost | Priority | Status |
|---|---|---|---|---|
| Recurring failure analytics (Option A) | Azure AI Search facets | $0 | High | Ready to implement |
| Recurring failure analytics (Option B) | Azure SQL Database | $50-100/month | High | Requires provisioning |
| Create PM Task action | Power Automate Premium | $15-20/user/month | Low | Requires license |
| Export Summary action | Power Automate Premium | $15-20/user/month | Medium | Requires license |
| Teams integration | Copilot Studio subscription | $20-50/month | High | BLOCKED by billing |

**Minimum cost to complete deployment**: $0 (using Azure AI Search facets for analytics, deferring output actions and Teams integration until licensing resolved)

**Recommended cost for full deployment**: ~$85-170/month (Azure SQL + Power Automate Premium + Copilot Studio subscription)

---

## Notes

- **Nightly GMES sync**: Excluded from this analysis — depends on HQ API service availability, not IT
- **Current Azure services**: Azure OpenAI, AI Search, Table Storage, and basic Copilot Studio are already provisioned and operational
- **Licensing**: Power Automate Premium is a per-seat license — need to determine number of users. Copilot Studio subscription is per-bot or per-user depending on license tier.
- **Power Apps licensing**: If using Power Apps with custom connector (GMES Agent API), requires Power Apps per user plan, per app plan, or pay-as-you-go plan for playback.
- **Azure SQL**: Only needed if AI Search facets are insufficient for complex aggregations — can start with Option A and upgrade to Option B if needed
