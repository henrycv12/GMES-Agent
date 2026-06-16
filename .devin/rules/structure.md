# Project Structure Rules

## Where new files go
- New ingestion scripts → root folder, named `ingest_*.py`
- New UI pages or tabs → extend `app.py` (single-file Streamlit app)
- New vault entries → appropriate `vault/` subfolder
- Workflow files → `.devin/workflows/`

## Folder purposes
- `./` — Python source files and entry point
- `./chroma_db/` — ChromaDB persistent storage (DO NOT edit manually, gitignored)
- `./vault/` — institutional memory: decisions, config, known issues
- `./.devin/rules/` — AI coding conventions for this project
- `./.devin/skills/<name>/SKILL.md` — task-specific skills, each in its own subdirectory
- `./.devin/workflows/` — repeatable procedures (commit, session start, audit)
- `./.codegraph/` — CodeGraph index (auto-generated, gitignored, do not edit)

## What does NOT belong in this repo
- `.xlsx` or `.xls` work order exports (may contain sensitive operational data)
- `.pdf` manuals
- `chroma_db/` vector database (large, regenerated locally)
- `.codegraph/` CodeGraph index (regenerated via `codegraph index --force`)
- `.env` files or credentials
- Any file with employee names, equipment IDs, or production data

