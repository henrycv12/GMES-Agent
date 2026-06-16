import base64
import os
import time
import chromadb
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

# --- Source: ChromaDB ---
CHROMA_DIR      = "./chroma_db"
WO_COLLECTION   = "work_orders"

# --- Target: Azure AI Search ---
SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT", "")
SEARCH_KEY      = os.getenv("AZURE_SEARCH_KEY", "")
SEARCH_INDEX    = os.getenv("AZURE_SEARCH_INDEX", "work-orders")

BATCH_SIZE      = 500


def create_index(index_client: SearchIndexClient) -> None:
    fields = [
        SimpleField(name="id",          type=SearchFieldDataType.String, key=True, filterable=True),
        SearchableField(name="content",  type=SearchFieldDataType.String, analyzer_name="en.microsoft"),
        SearchableField(name="wo_no",    type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="source",       type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="date",         type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="date_ts",      type=SearchFieldDataType.Int64,  filterable=True, sortable=True),
        SearchableField(name="equipment", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="equip_id",     type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="line",         type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="group",        type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="maint_type",   type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="technician", type=SearchFieldDataType.String, filterable=True),
    ]

    semantic_config = SemanticConfiguration(
        name="default",
        prioritized_fields=SemanticPrioritizedFields(
            content_fields=[SemanticField(field_name="content")],
            keywords_fields=[
                SemanticField(field_name="equipment"),
                SemanticField(field_name="wo_no"),
            ],
        ),
    )

    index = SearchIndex(
        name=SEARCH_INDEX,
        fields=fields,
        semantic_search=SemanticSearch(configurations=[semantic_config]),
    )

    try:
        index_client.get_index(SEARCH_INDEX)
        print(f"  Index '{SEARCH_INDEX}' already exists — skipping creation.")
    except Exception:
        index_client.create_index(index)
        print(f"  Created index '{SEARCH_INDEX}'.")


def migrate():
    if not SEARCH_ENDPOINT or not SEARCH_KEY:
        print("❌ Missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY in .env")
        return

    credential = AzureKeyCredential(SEARCH_KEY)
    index_client = SearchIndexClient(endpoint=SEARCH_ENDPOINT, credential=credential)
    search_client = SearchClient(endpoint=SEARCH_ENDPOINT, index_name=SEARCH_INDEX, credential=credential)

    # --- Create index if needed ---
    print(f"\nStep 1: Ensure index '{SEARCH_INDEX}' exists...")
    create_index(index_client)

    # --- Wait for storage quota to free up (Free tier GC lag after index delete) ---
    print(f"\nStep 1b: Checking storage quota...")
    for attempt in range(12):
        stats = index_client.get_service_statistics()
        used_mb  = stats.counters.storage_size_counter.usage / 1024 / 1024
        limit_mb = stats.counters.storage_size_counter.quota / 1024 / 1024
        print(f"  Storage: {used_mb:.1f} MB used of {limit_mb:.0f} MB limit")
        if used_mb < limit_mb * 0.8:
            print("  Quota OK — proceeding.")
            break
        print(f"  Quota still high (deleted index GC pending) — waiting 30s... ({attempt+1}/12)")
        time.sleep(30)
    else:
        print("❌ Storage quota still exceeded after 6 minutes. Try again later or upgrade SKU.")
        return

    # --- Read all records from ChromaDB ---
    print(f"\nStep 2: Reading all records from ChromaDB ({CHROMA_DIR})...")
    chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
    collection = chroma_client.get_collection(WO_COLLECTION)
    total = collection.count()
    print(f"  Found {total:,} records in ChromaDB.")

    # --- Check what's already in Azure AI Search ---
    print(f"\nStep 3: Checking existing records in Azure AI Search...")
    try:
        result = search_client.search(search_text="*", select=["id"], top=1, include_total_count=True)
        existing_count = result.get_count()
        print(f"  Azure AI Search currently has {existing_count:,} records.")
    except Exception:
        existing_count = 0
        print("  Index appears empty.")

    if existing_count >= total:
        print(f"\n✅ Azure AI Search already has {existing_count:,} records — nothing to migrate.")
        return

    # --- Fetch and push in batches ---
    print(f"\nStep 4: Migrating {total:,} records to Azure AI Search...")
    FETCH_BATCH = 500
    pushed = 0

    for offset in range(0, total, FETCH_BATCH):
        res = collection.get(
            limit=FETCH_BATCH,
            offset=offset,
            include=["documents", "metadatas"],
        )
        docs  = res["documents"]
        metas = res["metadatas"]
        ids   = res["ids"]

        batch = []
        for doc_id, doc, meta in zip(ids, docs, metas):
            batch.append({
                "id":         base64.urlsafe_b64encode(doc_id.encode()).decode().rstrip("="),
                "content":    doc,
                "source":     meta.get("source", ""),
                "wo_no":      meta.get("wo_no", ""),
                "date":       meta.get("date", ""),
                "date_ts":    int(meta.get("date_ts", 0)),
                "equipment":  meta.get("equipment", ""),
                "equip_id":   meta.get("equip_id", ""),
                "line":       meta.get("line", ""),
                "group":      meta.get("group", ""),
                "maint_type": meta.get("maint_type", ""),
                "technician": meta.get("technician", ""),
            })

        for start in range(0, len(batch), BATCH_SIZE):
            search_client.upload_documents(documents=batch[start:start + BATCH_SIZE])
            pushed += len(batch[start:start + BATCH_SIZE])
            print(f"  Pushed {pushed}/{total}...")

    print(f"\n✅ Migration complete — {pushed:,} records in Azure AI Search index '{SEARCH_INDEX}'.")
    print("   You can now run ingest_excel.py for future incremental ingestion to AI Search.")


if __name__ == "__main__":
    migrate()
