import base64
import glob
import os
import pandas as pd
import chromadb
from dotenv import load_dotenv
from azure.core.credentials import AzureKeyCredential

load_dotenv()

EXCEL_FOLDER = "."           # scans all .xlsx files in this folder
CHROMA_DIR = "./chroma_db"
WO_COLLECTION = "work_orders"
EMBED_BATCH = 500
BATCH_SIZE = 500

from openai import AzureOpenAI

AZURE_KEY      = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_DEPLOY   = os.getenv("AZURE_OPENAI_EMBED_DEPLOYMENT", "embed-model")

if not (AZURE_KEY and AZURE_ENDPOINT):
    raise RuntimeError("Azure OpenAI credentials missing. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env")

_azure_client = AzureOpenAI(
    api_key=AZURE_KEY,
    azure_endpoint=AZURE_ENDPOINT,
    api_version="2024-12-01-preview",
)

# --- Auto-detect Azure AI Search from .env (optional dual-write) ---
SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT", "")
SEARCH_KEY      = os.getenv("AZURE_SEARCH_KEY", "")
SEARCH_INDEX    = os.getenv("AZURE_SEARCH_INDEX", "work-orders")
USE_SEARCH      = bool(SEARCH_ENDPOINT and SEARCH_KEY)

if USE_SEARCH:
    from azure.search.documents import SearchClient
    _search_client = SearchClient(
        endpoint=SEARCH_ENDPOINT,
        index_name=SEARCH_INDEX,
        credential=AzureKeyCredential(SEARCH_KEY),
    )

# --- Column mapping (exact names from your EMS export) ---
COL_NO              = "No"
COL_DATE            = "Maint. Plan Date"
COL_TYPE            = "Maint. Type"
COL_LINE            = "Line"
COL_GROUP           = "Group"
COL_EQUIP_ID        = "ID"
COL_EQUIP           = "Equipment"
COL_TITLE           = "Maint. Title"
COL_CAUSE           = "Cause of failure(reason)"
COL_RESOLUTION      = "Resolution & Result"
COL_PREVENTION      = "Measures to Prevent Recurrence"
COL_TECHNICIAN      = "Result Registrant"
COL_DURATION        = "Maint. Time (Min)"
COL_DOWNTIME        = "Stop Time (Min)"
COL_PARTS           = "Spare Parts"
COL_CATEGORY        = "Categorization Type"
COL_SYMPTOMS        = "Failure symptoms"
COL_FAILURE_CAUSE   = "Failure Cause"
COL_ACTION          = "Action Info"


def safe(row, col, default="—"):
    val = row.get(col, default)
    if pd.isna(val) or str(val).strip() == "":
        return default
    return str(val).strip()


def row_to_text(row):
    return (
        f"Work Order #{safe(row, COL_NO)} | {safe(row, COL_TYPE)} | {safe(row, COL_DATE)}\n"
        f"Equipment: {safe(row, COL_EQUIP)} ({safe(row, COL_EQUIP_ID)}) | "
        f"Group: {safe(row, COL_GROUP)} | Line: {safe(row, COL_LINE)}\n"
        f"Issue: {safe(row, COL_TITLE)}\n"
        f"Cause: {safe(row, COL_CAUSE)}\n"
        f"Resolution: {safe(row, COL_RESOLUTION)}\n"
        f"Prevention: {safe(row, COL_PREVENTION)}\n"
        f"Failure Symptoms: {safe(row, COL_SYMPTOMS)} | "
        f"Failure Cause: {safe(row, COL_FAILURE_CAUSE)} | "
        f"Action: {safe(row, COL_ACTION)}\n"
        f"Parts Used: {safe(row, COL_PARTS)} | Category: {safe(row, COL_CATEGORY)}\n"
        f"Technician: {safe(row, COL_TECHNICIAN)} | "
        f"Duration: {safe(row, COL_DURATION)} min | Downtime: {safe(row, COL_DOWNTIME)} min"
    )


def ingest_excel():
    excel_files = (
        glob.glob(f"{EXCEL_FOLDER}/*.xlsx") +
        glob.glob(f"{EXCEL_FOLDER}/*.xls") +
        glob.glob(f"{EXCEL_FOLDER}/*.csv")
    )
    if not excel_files:
        print("No Excel/CSV files found in folder.")
        return

    all_records = []
    for filepath in excel_files:
        filename = filepath.split("\\")[-1].split("/")[-1]
        print(f"Reading: {filepath}")
        try:
            if filepath.endswith(".csv"):
                df = pd.read_csv(filepath, dtype=str, encoding="utf-8-sig")
            else:
                df = pd.read_excel(filepath, dtype=str)
        except Exception as e:
            print(f"  ⚠️  Could not read {filepath}: {e}")
            continue

        df.columns = df.columns.str.strip()
        print(f"  Found {len(df)} rows, {len(df.columns)} columns")

        # Sort newest-first so recent WOs are represented first
        df[COL_DATE] = pd.to_datetime(df[COL_DATE], errors="coerce")
        df = df.sort_values(COL_DATE, ascending=False).reset_index(drop=True)

        for idx, row in df.iterrows():
            text = row_to_text(row)
            wo_no = safe(row, COL_NO, str(idx))
            date_val = row.get(COL_DATE)
            date_str = str(date_val.date()) if pd.notna(date_val) else "—"
            date_ts = int(date_val.timestamp()) if pd.notna(date_val) else 0
            all_records.append({
                "text": text,
                "source": filename,
                "chunk_id": f"WO_{filename}_{wo_no}_{idx}",
                "wo_no": wo_no,
                "date": date_str,
                "date_ts": date_ts,
                "equipment": safe(row, COL_EQUIP),
                "equip_id": safe(row, COL_EQUIP_ID),
                "line": safe(row, COL_LINE),
                "group": safe(row, COL_GROUP),
                "maint_type": safe(row, COL_TYPE),
                "technician": safe(row, COL_TECHNICIAN),
            })

    if not all_records:
        print("No records to ingest.")
        return

    print(f"\nTotal work orders in file: {len(all_records)}")

    # --- Connect to existing ChromaDB ---
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    try:
        collection = client.get_collection(WO_COLLECTION)
        existing_count = collection.count()
        print(f"  Existing collection has {existing_count:,} records.")
        # Get all existing IDs to skip duplicates
        existing_ids = set()
        batch = 1000
        for offset in range(0, existing_count, batch):
            res = collection.get(limit=batch, offset=offset, include=[])
            existing_ids.update(res["ids"])
    except Exception:
        collection = client.create_collection(WO_COLLECTION)
        existing_ids = set()
        print("  Created new work orders collection.")

    new_records = [r for r in all_records if r["chunk_id"] not in existing_ids]
    if not new_records:
        print("\n✅ Nothing new to ingest — collection is already up to date.")
        print(f"   {len(all_records):,} work orders already indexed.")
        return

    print(f"  {len(existing_ids):,} already indexed. Embedding {len(new_records):,} new records...")

    texts     = [r["text"] for r in new_records]
    ids       = [r["chunk_id"] for r in new_records]
    metadatas = [{
        "source":     r["source"],
        "wo_no":      r["wo_no"],
        "date":       r["date"],
        "date_ts":    r["date_ts"],
        "equipment":  r["equipment"],
        "equip_id":   r["equip_id"],
        "line":       r["line"],
        "group":      r["group"],
        "maint_type": r["maint_type"],
        "technician": r["technician"],
    } for r in new_records]

    embeddings = []
    total_texts = len(texts)
    print(f"  Embedding provider: Azure OpenAI ({AZURE_DEPLOY})")

    for start in range(0, total_texts, EMBED_BATCH):
        end = min(start + EMBED_BATCH, total_texts)
        batch_texts = [t[:8000] for t in texts[start:end]]
        resp = _azure_client.embeddings.create(model=AZURE_DEPLOY, input=batch_texts)
        embeddings.extend([d.embedding for d in resp.data])
        print(f"  Embedded {end}/{total_texts}...")

    total = len(texts)
    for start in range(0, total, BATCH_SIZE):
        end = min(start + BATCH_SIZE, total)
        collection.add(
            documents=texts[start:end],
            embeddings=embeddings[start:end],
            ids=ids[start:end],
            metadatas=metadatas[start:end],
        )
        print(f"  Stored {end}/{total} records...")

    total_now = len(existing_ids) + total
    print(f"\n✅ ChromaDB ingestion complete — {total} new records added ({total_now:,} total indexed).")

    # --- Dual-write to Azure AI Search (if configured) ---
    if USE_SEARCH:
        print(f"\n  Dual-writing {total} new records to Azure AI Search index '{SEARCH_INDEX}'...")
        search_docs = []
        for r in new_records:
            search_docs.append({
                "id":         base64.urlsafe_b64encode(r["chunk_id"].encode()).decode().rstrip("="),
                "content":    r["text"],
                "source":     r["source"],
                "wo_no":      r["wo_no"],
                "date":       r["date"],
                "date_ts":    int(r["date_ts"]),
                "equipment":  r["equipment"],
                "equip_id":   r["equip_id"],
                "line":       r["line"],
                "group":      r["group"],
                "maint_type": r["maint_type"],
                "technician": r["technician"],
            })
        for start in range(0, len(search_docs), BATCH_SIZE):
            end = min(start + BATCH_SIZE, len(search_docs))
            _search_client.upload_documents(documents=search_docs[start:end])
            print(f"  Azure AI Search: stored {end}/{total}...")
        print(f"  ✅ Azure AI Search sync complete.")
    else:
        print("   (Azure AI Search not configured — skipping. Add AZURE_SEARCH_ENDPOINT + AZURE_SEARCH_KEY to .env to enable.)")

    print("\n   Restart 'streamlit run app.py' to use the updated knowledge base.")


if __name__ == "__main__":
    ingest_excel()
