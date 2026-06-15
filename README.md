# MES Local — Maintenance Agent

A fully local AI-powered troubleshooting assistant that learns from your work order history.

## How it works

1. Export work orders from your EMS/MES system as `.xlsx`
2. Run `python ingest_excel.py` to index them into a local vector database
3. Run `streamlit run app.py` to launch the chat interface
4. Ask maintenance questions — the agent finds similar past repairs and explains what was done

## Stack

- **LLM:** [Ollama](https://ollama.com) (local, no cloud)
- **Embeddings:** `nomic-embed-text` via Ollama
- **Vector DB:** ChromaDB (local)
- **UI:** Streamlit

## Setup

### 1. Install Ollama and pull models
```bash
ollama pull nomic-embed-text
ollama pull llama3.2:3b
```

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3. Add your work order Excel export
Drop your `.xlsx` file in this folder. Expected columns:

| Column | Description |
|--------|-------------|
| No | Work order number |
| Maint. Plan Date | Date of maintenance |
| Maint. Type | Corrective / Preventive / Breakdown / Daily |
| Line / Group / ID | Equipment location and ID |
| Equipment | Equipment name |
| Maint. Title | Issue title |
| Cause of failure(reason) | Root cause |
| Resolution & Result | What was done to fix it |
| Measures to Prevent Recurrence | Prevention notes |
| Failure symptoms / Failure Cause / Action Info | Categorization |
| Result Registrant | Technician |
| Maint. Time (Min) / Stop Time (Min) | Duration and downtime |
| Spare Parts | Parts used |

### 4. Index the work orders
```bash
python ingest_excel.py
```

### 5. Launch the agent
```bash
streamlit run app.py
```

## Adding more data

- **New work order exports:** Drop updated `.xlsx` in the folder and re-run `ingest_excel.py`
- **PDFs / manuals:** Use `ingest.py` to index additional PDF documents (optional)
