import glob
import pandas as pd
import chromadb
import ollama

EXCEL_FOLDER = "."           # scans all .xlsx files in this folder
CHROMA_DIR = "./chroma_db"
COLLECTION_NAME = "fike_manual"
EMBED_MODEL = "nomic-embed-text"

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
    excel_files = glob.glob(f"{EXCEL_FOLDER}/*.xlsx") + glob.glob(f"{EXCEL_FOLDER}/*.xls")
    if not excel_files:
        print("No Excel files found in folder.")
        return

    all_records = []
    for filepath in excel_files:
        filename = filepath.split("\\")[-1].split("/")[-1]
        print(f"Reading: {filepath}")
        try:
            df = pd.read_excel(filepath, dtype=str)
        except Exception as e:
            print(f"  ⚠️  Could not read {filepath}: {e}")
            continue

        df.columns = df.columns.str.strip()
        print(f"  Found {len(df)} rows, {len(df.columns)} columns")

        for idx, row in df.iterrows():
            text = row_to_text(row)
            wo_no = safe(row, COL_NO, str(idx))
            all_records.append({
                "text": text,
                "source": filename,
                "chunk_id": f"WO_{filename}_{wo_no}_{idx}",
                "wo_no": wo_no,
                "date": safe(row, COL_DATE),
                "equipment": safe(row, COL_EQUIP),
                "equip_id": safe(row, COL_EQUIP_ID),
                "maint_type": safe(row, COL_TYPE),
            })

    if not all_records:
        print("No records to ingest.")
        return

    print(f"\nTotal work orders to embed: {len(all_records)}")

    # --- Connect to existing ChromaDB (keeps PDF data) ---
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    # Remove any old WO collection to avoid duplicates, keep fike_manual PDF data
    WO_COLLECTION = "work_orders"
    try:
        client.delete_collection(WO_COLLECTION)
        print("  Cleared existing work orders collection")
    except Exception:
        pass

    collection = client.create_collection(WO_COLLECTION)

    print(f"Embedding {len(all_records)} work orders (embedding model: {EMBED_MODEL})...")
    texts     = [r["text"] for r in all_records]
    ids       = [r["chunk_id"] for r in all_records]
    metadatas = [{
        "source":     r["source"],
        "wo_no":      r["wo_no"],
        "date":       r["date"],
        "equipment":  r["equipment"],
        "equip_id":   r["equip_id"],
        "maint_type": r["maint_type"],
    } for r in all_records]

    embeddings = []
    for i, text in enumerate(texts):
        resp = ollama.embeddings(model=EMBED_MODEL, prompt=text[:1500])
        embeddings.append(resp["embedding"])
        if (i + 1) % 100 == 0:
            print(f"  Embedded {i + 1}/{len(texts)}...")

    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas,
    )

    print(f"\n✅ Work order ingestion complete — {len(all_records)} records stored.")
    print("   Restart 'streamlit run app.py' to use the updated knowledge base.")


if __name__ == "__main__":
    ingest_excel()
