---
description: Code navigation — use CodeGraph tools instead of grep/read to save tokens
activation: always_on
---

# CodeGraph Navigation Rules

This project has `.codegraph/` initialized. Use CodeGraph MCP tools for ALL code exploration.
**Never use grep or read-file loops to explore code structure — CodeGraph already indexed it.**

## Tool selection

| Intent | Tool |
|---|---|
| "How does X work?" / architecture / feature area | `codegraph_context` — always start here |
| "How does X reach Y?" / call path | `codegraph_trace` |
| View source of several related symbols at once | `codegraph_explore` |
| Find a symbol by name | `codegraph_search` |
| What calls this function? | `codegraph_callers` |
| What does this function call? | `codegraph_callees` |
| What breaks if I change this? | `codegraph_impact` |
| Single symbol source / signature | `codegraph_node` |
| Project file structure | `codegraph_files` |

## Rules
- Call `codegraph_context` FIRST for any task involving code — it composes search + node + callers + callees in one call
- Source returned by CodeGraph tools is verbatim live file content — treat it as already read, do not re-open
- Use `codegraph_explore` to survey multiple related symbols in ONE call instead of separate reads
- Only fall back to raw Read/Grep to confirm a specific detail CodeGraph didn't cover
- After any code change, run `codegraph sync` to keep the index current

## Re-index commands
```
codegraph index --force   # full re-index
codegraph sync            # incremental update (after edits)
codegraph status          # check index health
```
