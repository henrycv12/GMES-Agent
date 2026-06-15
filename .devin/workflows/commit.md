---
/commit
---

Run before every git commit.

1. Review all changed files — summarize what was modified
2. Confirm `streamlit run app.py` starts without import errors
3. Check if `CONTEXT.md` needs updating — update it if project status changed
4. Check if any `vault/` files need updating based on changes made
5. Confirm `.xlsx`, `.csv`, `.pdf`, `.env`, and `chroma_db/` are NOT staged (`git status`)
6. Suggest a commit message in this format:

**[area] short description of what changed**

Examples:
- `[ingest] add incremental upsert to skip already-indexed WOs`
- `[app] add recency re-ranking for latest/recent queries`
- `[vault] update known-issues after fixing embedding bottleneck`
- `[agents] update data flow after adding batch embed`

7. Wait for user confirmation before running `git commit` and `git push`

