# System Configuration

## Active settings

| Setting | Value |
|---|---|
| LLM model | `gpt-4o` (`AZURE_OPENAI_LLM_DEPLOYMENT`) |
| Rewrite / suggestion model | `gpt-4o` (`AZURE_OPENAI_REWRITE_DEPLOYMENT` — set to `gpt-4o-mini` to reduce cost) |
| Azure resource | `hcol-mqfq4gia-eastus2` |
| Azure AI Search index | `work-orders` |
| Semantic configuration | `default` |
| TOP_K (standard queries) | 25 |
| COUNT_FETCH_K (count queries) | 50 |
| WO_TEXT_LIMIT | 300 chars (truncated for LLM context) |
| History window | 6 messages |
| max_tokens (answer) | 800 |
| max_tokens (suggestions) | 120 |
| Migration batch size | 1000 docs per Azure AI Search request |
| Migration threads | 4 parallel upload workers |

## Query intelligence

| Query type | Detection | Fetch limit | Special behaviour |
|---|---|---|---|
| Recency | `RECENCY_KEYWORDS` | 75 | Client-sort by `date_ts` desc, return top 25 |
| Count | `COUNT_KEYWORDS` | 50 | `includeTotalCount=true`, inject total + optional date window into LLM context |
| Count + time window | `COUNT_KEYWORDS` + `parseDateWindow()` | 50 | Inject cutoff date — LLM counts only records ≥ that date |
| Standard | default | 25 | Semantic search |

## Analytics endpoints

| Endpoint | Technique | Azure Search limit used |
|---|---|---|
| `/api/analytics` | Facets (`top=0`) | None — server aggregates |
| `/api/mtbf` | Fetch docs (`top=1000`, sorted) | 1000 doc cap |
| `/api/anomaly` | Two parallel facet calls | None |
| `/api/extract` | Semantic search (`top=50`) + LLM | 50 doc cap |

## Excel / BAK column mapping

| Constant | GMES Column |
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
| `COL_FAIL_CAUSE` | `Failure Cause` |
| `COL_ACTION` | `Action Info` |

## Dark mode

| Key | Storage | Values |
|---|---|---|
| `gmes-theme` | localStorage | `"light"` \| `"dark"` |

Set via `data-theme` attribute on `<html>`. Falls back to `prefers-color-scheme`. CSS variables defined in `frontend/app/globals.css` under `:root` and `[data-theme="dark"]`.

## localStorage keys

| Key | Contents |
|---|---|
| `gmes-conversations` | `Conversation[]` — messages, woMap, suggestionsMap per conversation |
| `gmes-active-id` | Active conversation UUID |
| `gmes-pinned-queries` | `string[]` — pinned query strings (max 10) |
| `gmes-theme` | `"light"` \| `"dark"` |
