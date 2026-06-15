---
/new-session
---

Run this at the start of every work session.

1. Run `git pull` — sync latest changes from remote before doing anything else
2. Read `CONTEXT.md` — understand current project state and what's pending
3. Read `AGENTS.md` — refresh architecture knowledge (RAG pipeline, module map)
4. Read `vault/known-issues/` — check for active bugs or workarounds
5. Check `chroma_db/` exists — if not, remind user to run `python ingest_excel.py` first
6. Check `.env` exists with `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_EMBED_DEPLOYMENT` — if missing, warn that embedding will fall back to Ollama (slow)
7. Ask the user: what are we working on today?
8. Load the relevant skill from `.devin/skills/` based on the task type

