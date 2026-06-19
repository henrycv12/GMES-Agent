"""
Direct Excel/BAK → Azure AI Search migration.
No ChromaDB, no embeddings — just structured metadata.
Azure Search does its own text indexing (BM25 + semantic).

Usage:
  python migrate_to_search.py              # append / update mode (safe to run repeatedly)
  python migrate_to_search.py --recreate   # delete + recreate index (needed for schema changes)
"""
import argparse
import base64
import glob
import os
import time
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    SemanticConfiguration,
    SemanticSearch,
    SemanticPrioritizedFields,
    SemanticField,
)
from azure.core.credentials import AzureKeyCredential

load_dotenv()

# --- Source ---
EXCEL_FOLDER    = "."
FILE_PATTERNS   = ["*.xlsx", "*.xls", "*.csv", "*.bak"]   # .bak = GMES export

# --- Target: Azure AI Search ---
SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT", "")
SEARCH_KEY      = os.getenv("AZURE_SEARCH_KEY", "")
SEARCH_INDEX    = os.getenv("AZURE_SEARCH_INDEX", "work-orders")

UPLOAD_BATCH    = 1000   # Azure Search max per request
MAX_WORKERS     = 4      # Parallel upload threads

# --- Column mapping (GMES export) ---
COL_NO          = "No"
COL_DATE        = "Maint. Plan Date"
COL_TYPE        = "Maint. Type"
COL_LINE        = "Line"
COL_GROUP       = "Group"
COL_EQUIP_ID    = "ID"
COL_EQUIP       = "Equipment"
COL_TITLE       = "Maint. Title"
COL_CAUSE       = "Cause of failure(reason)"
COL_RESOLUTION  = "Resolution & Result"
COL_PREVENTION  = "Measures to Prevent Recurrence"
COL_TECHNICIAN  = "Result Registrant"
COL_DURATION    = "Maint. Time (Min)"
COL_DOWNTIME    = "Stop Time (Min)"
COL_PARTS       = "Spare Parts"
COL_CATEGORY    = "Categorization Type"
COL_SYMPTOMS    = "Failure symptoms"
COL_FAIL_CAUSE  = "Failure Cause"
COL_ACTION      = "Action Info"


def safe(val, default="—"):
    if pd.isna(val) or str(val).strip() in ("", "nan"):
        return default
    return str(val).strip()


def normalize_wo_no(raw: str) -> str:
    """Strip pandas float suffix: '35734.0' → '35734'. Keep non-numeric as-is."""
    try:
        f = float(raw)
        if f == int(f):
            return str(int(f))
    except (ValueError, TypeError):
        pass
    return raw


def row_to_content(row):
    return (
        f"Work Order #{safe(row.get(COL_NO, '?'))} | {safe(row.get(COL_TYPE))} | {safe(row.get(COL_DATE))}\n"
        f"Equipment: {safe(row.get(COL_EQUIP))} ({safe(row.get(COL_EQUIP_ID))}) | "
        f"Group: {safe(row.get(COL_GROUP))} | Line: {safe(row.get(COL_LINE))}\n"
        f"Issue: {safe(row.get(COL_TITLE))}\n"
        f"Cause: {safe(row.get(COL_CAUSE))}\n"
        f"Resolution: {safe(row.get(COL_RESOLUTION))}\n"
        f"Prevention: {safe(row.get(COL_PREVENTION))}\n"
        f"Symptoms: {safe(row.get(COL_SYMPTOMS))} | Failure Cause: {safe(row.get(COL_FAIL_CAUSE))} | "
        f"Action: {safe(row.get(COL_ACTION))}\n"
        f"Parts: {safe(row.get(COL_PARTS))} | Category: {safe(row.get(COL_CATEGORY))}\n"
        f"Technician: {safe(row.get(COL_TECHNICIAN))} | "
        f"Duration: {safe(row.get(COL_DURATION))} min | Downtime: {safe(row.get(COL_DOWNTIME))} min"
    )


def _build_index_schema() -> SearchIndex:
    fields = [
        SimpleField(name="id",            type=SearchFieldDataType.String, key=True, filterable=True),
        SearchableField(name="content",   type=SearchFieldDataType.String, analyzer_name="en.microsoft"),
        SearchableField(name="wo_no",     type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="source",        type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="date",          type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="date_ts",       type=SearchFieldDataType.Int64,  filterable=True, sortable=True),
        SearchableField(name="equipment", type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="equip_id",      type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="line",          type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="group",         type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="maint_type",    type=SearchFieldDataType.String, filterable=True, facetable=True),
        SearchableField(name="technician",type=SearchFieldDataType.String, filterable=True, facetable=True),
    ]
    semantic_config = SemanticConfiguration(
        name="default",
        prioritized_fields=SemanticPrioritizedFields(
            content_fields=[SemanticField(field_name="content")],
            keywords_fields=[SemanticField(field_name="equipment"), SemanticField(field_name="wo_no")],
        ),
    )
    return SearchIndex(
        name=SEARCH_INDEX,
        fields=fields,
        semantic_search=SemanticSearch(configurations=[semantic_config]),
    )


def ensure_index(index_client: SearchIndexClient, recreate: bool) -> None:
    if recreate:
        # Delete, wait for storage reclaim, then recreate.
        try:
            index_client.delete_index(SEARCH_INDEX)
            print(f"  Deleted '{SEARCH_INDEX}'. Waiting for storage to be reclaimed...")
            for attempt in range(24):       # up to 2 minutes
                time.sleep(5)
                stats = index_client.get_service_statistics()
                used_mb = stats.counters.storage_size_counter.usage / 1024 / 1024
                print(f"    {used_mb:.1f} MB remaining (attempt {attempt + 1}/24)")
                if used_mb < 5:
                    break
            else:
                print("  Warning: storage still not fully reclaimed, proceeding anyway.")
        except Exception:
            pass    # index didn't exist — fine

        index_client.create_index(_build_index_schema())
        print(f"  Created index '{SEARCH_INDEX}'.")
    else:
        # Create only if missing; leave existing index untouched.
        try:
            index_client.get_index(SEARCH_INDEX)
            print(f"  Index '{SEARCH_INDEX}' exists — append/update mode.")
        except Exception:
            index_client.create_index(_build_index_schema())
            print(f"  Created index '{SEARCH_INDEX}'.")


def _upload_batch(client: SearchClient, batch: list) -> int:
    # merge_or_upload: updates existing docs (same id), inserts new ones.
    client.merge_or_upload_documents(documents=batch)
    return len(batch)


def migrate(recreate: bool = False) -> None:
    if not SEARCH_ENDPOINT or not SEARCH_KEY:
        print("Missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY in .env")
        return

    credential    = AzureKeyCredential(SEARCH_KEY)
    index_client  = SearchIndexClient(endpoint=SEARCH_ENDPOINT, credential=credential)
    search_client = SearchClient(endpoint=SEARCH_ENDPOINT, index_name=SEARCH_INDEX, credential=credential)

    print(f"\nStep 1: Ensure index '{SEARCH_INDEX}' ({'recreate' if recreate else 'append'} mode)...")
    ensure_index(index_client, recreate)

    # --- Check storage quota ---
    print(f"\nStep 2: Checking storage quota...")
    for attempt in range(12):
        stats    = index_client.get_service_statistics()
        used_mb  = stats.counters.storage_size_counter.usage / 1024 / 1024
        limit_mb = stats.counters.storage_size_counter.quota / 1024 / 1024
        print(f"  Storage: {used_mb:.1f} MB / {limit_mb:.0f} MB")
        if used_mb < limit_mb * 0.8:
            break
        print(f"  Quota high — waiting 30s... ({attempt+1}/12)")
        time.sleep(30)
    else:
        print("Storage quota still exceeded.")
        return

    # --- Find source files ---
    print(f"\nStep 3: Scanning for source files in '{EXCEL_FOLDER}'...")
    files = []
    for pattern in FILE_PATTERNS:
        files += glob.glob(f"{EXCEL_FOLDER}/{pattern}")
    files = sorted(set(files))
    if not files:
        print("No Excel/CSV/BAK files found.")
        return
    for f in files:
        size_mb = os.path.getsize(f) / 1024 / 1024
        print(f"  {f}  ({size_mb:.1f} MB)")

    # --- Read and transform rows ---
    print(f"\nStep 4: Reading and transforming rows...")
    all_docs = []
    for filepath in files:
        filename = os.path.basename(filepath)
        try:
            if filepath.endswith(".csv"):
                df = pd.read_csv(filepath, dtype=str, encoding="utf-8-sig")
            else:
                df = pd.read_excel(filepath)
        except Exception as e:
            print(f"  Skipping {filename}: {e}")
            continue

        df.columns = df.columns.str.strip()
        df[COL_DATE] = pd.to_datetime(df[COL_DATE], errors="coerce")
        print(f"  {filename}: {len(df):,} rows, {len(df.columns)} columns")

        for idx, row in df.iterrows():
            raw_no   = safe(row.get(COL_NO, str(idx)))
            wo_no    = normalize_wo_no(raw_no)          # "35734.0" → "35734"
            date_val = row.get(COL_DATE)
            date_str = str(date_val.date()) if pd.notna(date_val) else "—"
            date_ts  = int(date_val.timestamp()) if pd.notna(date_val) else 0

            # Stable document ID: keyed on WO number so the same record across
            # different export files merges rather than duplicates.
            # Falls back to filename+row when WO number is missing ("—").
            if wo_no != "—":
                chunk_id = f"WO_{wo_no}"
            else:
                chunk_id = f"WO_{filename}_{idx}"
            doc_id = base64.urlsafe_b64encode(chunk_id.encode()).decode().rstrip("=")

            all_docs.append({
                "id":         doc_id,
                "content":    row_to_content(row),
                "source":     filename,
                "wo_no":      wo_no,
                "date":       date_str,
                "date_ts":    date_ts,
                "equipment":  safe(row.get(COL_EQUIP, "")),
                "equip_id":   safe(row.get(COL_EQUIP_ID, "")),
                "line":       safe(row.get(COL_LINE, "")),
                "group":      safe(row.get(COL_GROUP, "")),
                "maint_type": safe(row.get(COL_TYPE, "")),
                "technician": safe(row.get(COL_TECHNICIAN, "")),
            })

    total = len(all_docs)
    print(f"\n  Total documents prepared: {total:,}")
    if total == 0:
        print("No documents to upload.")
        return

    # --- Upload / merge concurrently ---
    action = "Merging/uploading" if not recreate else "Uploading"
    print(f"\nStep 5: {action} to Azure AI Search ({MAX_WORKERS} threads, {UPLOAD_BATCH} docs/batch)...\n")
    batches = [all_docs[i:i+UPLOAD_BATCH] for i in range(0, total, UPLOAD_BATCH)]
    pushed  = 0
    start   = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_upload_batch, search_client, b): b for b in batches}
        for future in as_completed(futures):
            pushed += future.result()
            elapsed = time.time() - start
            rate    = pushed / elapsed if elapsed > 0 else 0
            eta     = (total - pushed) / rate / 60 if rate > 0 else 0
            print(f"  [{pushed:>6}/{total}]  {pushed/total*100:5.1f}%  "
                  f"{rate:6.0f} docs/s  ETA {eta:.1f} min")

    elapsed = time.time() - start
    print(f"\nDone -- {pushed:,} records in {elapsed:.1f}s ({pushed/elapsed:.0f} docs/s)")
    print(f"   Index: '{SEARCH_INDEX}'  |  Endpoint: {SEARCH_ENDPOINT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate GMES work orders to Azure AI Search.")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate the index (use when schema changes). Default: append/update mode.",
    )
    args = parser.parse_args()
    migrate(recreate=args.recreate)
