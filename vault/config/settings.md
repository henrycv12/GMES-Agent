# System Configuration

## Active settings

| Setting | Value |
|---|---|
| LLM model | `gpt-4o` (AZURE_LLM_DEPLOY) |
| Rewrite model | `gpt-4o` (AZURE_REWRITE_DEPLOY, can set to `gpt-4o-mini` for cost savings) |
| Embedding model | `text-embedding-3-small` (AZURE_OPENAI_EMBED_DEPLOYMENT) |
| Azure AI Search index | `work-orders` |
| Semantic configuration | `default` |
| TOP_K (standard queries) | 10 |
| COUNT_FETCH_K (count queries) | 50 (semantic max) |
| WO_TEXT_LIMIT | 300 chars (truncated for LLM context) |
| History window | 6 messages |
| max_tokens (answer) | 800 |
| Embed batch size | 500 texts per Azure OpenAI embed call |
| Search insert batch | 500 records per Azure AI Search add() call |

## Query intelligence

| Query type | Detection | Fetch limit | Special behavior |
|---|---|---|---|
| Recency | `RECENCY_KEYWORDS` | 30 (TOP_K×3) | Client-side sort by `date_ts` desc, return TOP_K |
| Count | `COUNT_KEYWORDS` | 50 | `includeTotalCount=true`, inject total into LLM context |
| Count + time window | `COUNT_KEYWORDS` + `parseDateWindow()` | 50 | Inject cutoff date, LLM counts only records ≥ that date |
| Standard | default | 10 | Normal semantic search |

## Excel column mapping

| Constant | Excel Column |
|---|---|
| `COL_NO` | `No` |
| `COL_DATE` | `Maint. Plan Date` |
| `COL_TYPE` | `Maint. Type` |
| `COL_LINE` | `Line` |
| `COL_GROUP` | `Group` |
| `COL_EQUIP_ID` | `ID` |
| `COL_EQUIP` | `Equipment` |
| `COL_TITLE` | `Maint. Title` |
| `COL_CAUSE` | `Cause of failure(reason)` |
| `COL_RESOLUTION` | `Resolution & Result` |
| `COL_PREVENTION` | `Measures to Prevent Recurrence` |
| `COL_TECHNICIAN` | `Result Registrant` |
| `COL_DURATION` | `Maint. Time (Min)` |
| `COL_DOWNTIME` | `Stop Time (Min)` |
| `COL_PARTS` | `Spare Parts` |
| `COL_CATEGORY` | `Categorization Type` |
| `COL_SYMPTOMS` | `Failure symptoms` |
| `COL_FAILURE_CAUSE` | `Failure Cause` |
| `COL_ACTION` | `Action Info` |

