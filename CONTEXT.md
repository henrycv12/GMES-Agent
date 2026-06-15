# Project Context

## What this project does
MES Local is a fully offline AI maintenance assistant for LG Electronics TN Production Engineering. It indexes 7-year historical work order exports from GMES (EMS system) into a local vector database and answers natural-language troubleshooting questions from PE engineers — identifying past failures, root causes, and resolutions without any cloud dependency.

## Current status
- **Working:** Work order ingestion from Excel/CSV (incremental), ChromaDB vector search, Streamlit chat UI, Azure OpenAI GPT-4o LLM answering, recency-aware retrieval, Azure OpenAI `text-embedding-3-small` batch embedding, ~2–5 sec response time
- **In progress:** Response quality validation with PE team; recurring failure analytics
- **Broken:** Nothing known
- **Pending:** Export summary feature, PM checklist generator, recurring failures dashboard (top-N by line/shop/date range), Teams integration

## Tech stack
- **LLM:** Azure OpenAI `gpt-4o` (cloud, fast) — falls back to Ollama `llama3.2:1b` if no `.env`
- **Embeddings:** Azure OpenAI `text-embedding-3-small` (auto-detected from `.env`; falls back to Ollama `nomic-embed-text`)
- **Vector DB:** ChromaDB (persistent local, `./chroma_db/`)
- **UI:** Streamlit
- **Data source:** GMES export (`.xlsx` or `.csv`) — 19,000+ work orders
- **Python:** 3.13.3 on Windows

## Key file map
- **Entry point:** `app.py` — Streamlit chat UI
- **Ingestion:** `ingest_excel.py` — reads Excel/CSV, embeds via Azure OpenAI, stores in ChromaDB (incremental)
- **Config:** `.env` — Azure OpenAI credentials (gitignored)
- **Legacy:** `ingest.py` — PDF ingestion (FIKE manual, not in active use)
- **DB:** `./chroma_db/` — persistent vector store (gitignored)
- **Data:** `Excel_Export_[...].xlsx/.csv` — GMES work order export (gitignored)

## Known issues
- Full ingest of 19,000+ records takes ~4–5 min with Azure OpenAI; ~45 min with Ollama CPU fallback
- Azure GPT-4o response time ~2–5 sec; Ollama `llama3.2:1b` fallback ~15–25 sec
- ChromaDB `get()` with offset used to detect existing IDs — may be slow on very large collections
- Windows asyncio ProactorEventLoop bug mitigated with `WindowsSelectorEventLoopPolicy`
- Azure OpenAI key stored in `.env` — must be rotated if exposed; never commit `.env`
- PowerShell backtick multiline `Set-Content` corrupts `.env` — use here-string + `Add-Content` instead

