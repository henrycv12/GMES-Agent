---
/bootstrap
---

Run this once when opening a project that has no structure yet.

You are opening a project with NO structure. Your job is to bootstrap it from scratch. Work through every step in order — do not skip any.

## STEP 1 — Read the codebase
Run: `find . -type f | grep -v "__pycache__|.git|node_modules|.env|chroma_db" | sort`

Then read: `app.py`, `ingest_excel.py`, `requirements.txt`, `CONTEXT.md`, `AGENTS.md`.

Build a complete mental model before creating anything. Do not generate placeholder content.

## STEP 2 — Fill CONTEXT.md
Document what this project does, current status, tech stack, key file map, and known issues.

## STEP 3 — Fill AGENTS.md
Document architecture, module responsibilities, data flow, external dependencies, and deployment target.

## STEP 4 — Fill vault/
- `vault/config/` — Azure embed deployment name, Ollama model names, ChromaDB path, column mappings, TOP_K value
- `vault/decisions/` — why Azure OpenAI for embeddings, why llama3.2:1b for LLM
- `vault/known-issues/` — current bugs and workarounds
- `vault/architecture/` — RAG pipeline diagram or description

## STEP 5 — Fill .devin/rules/
Update `coding-style.md`, `workflow.md`, `structure.md` based on conventions already in the codebase.

## STEP 6 — Fill .devin/skills/
Update each skill file so paths, module names, and pitfalls reflect this actual project.

## STEP 7 — Confirm
Run: `find vault/ .devin/ -type f | sort`

Print a one-line summary of every file and its contents.

**Do NOT commit.** The user will review first.

