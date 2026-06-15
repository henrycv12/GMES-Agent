import fitz  # PyMuPDF
import chromadb
import ollama

PDF_FOLDER = "."   # scans all PDFs in this folder
CHROMA_DIR = "./chroma_db"
COLLECTION_NAME = "fike_manual"
EMBED_MODEL = "nomic-embed-text"
CHUNK_SIZE = 80   # words per chunk
CHUNK_OVERLAP = 10  # words overlap between chunks
MAX_CHARS = 400   # hard cap on characters per chunk


def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    print(f"  Extracted text from {len(pages)} pages")
    return pages


def chunk_text(pages, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    chunks = []
    for page_data in pages:
        text = page_data["text"]
        page_num = page_data["page"]
        words = text.split()
        step = chunk_size - overlap
        for i in range(0, len(words), step):
            chunk = " ".join(words[i : i + chunk_size])
            if chunk.strip():
                chunks.append(
                    {
                        "text": chunk[:MAX_CHARS],
                        "page": page_num,
                        "chunk_id": f"page{page_num}_c{i}",
                    }
                )
    return chunks


def ingest():
    import glob
    pdf_files = glob.glob(f"{PDF_FOLDER}/*.pdf")
    if not pdf_files:
        print("No PDF files found in folder.")
        return

    all_chunks = []
    for pdf_path in pdf_files:
        print(f"Loading PDF: {pdf_path}")
        pages = extract_text_from_pdf(pdf_path)
        source_name = pdf_path.split("\\")[-1].split("/")[-1]
        chunks = chunk_text(pages)
        for c in chunks:
            c["source"] = source_name
            c["chunk_id"] = f"{source_name}_{c['chunk_id']}"
        all_chunks.extend(chunks)

    chunks = all_chunks
    print(f"  Total chunks across all PDFs: {len(chunks)}")

    print(f"Using Ollama embedding model: {EMBED_MODEL}")

    client = chromadb.PersistentClient(path=CHROMA_DIR)

    try:
        client.delete_collection(COLLECTION_NAME)
        print("  Cleared existing collection")
    except Exception:
        pass

    collection = client.create_collection(COLLECTION_NAME)

    print("Embedding and storing chunks (this may take a few minutes)...")
    texts = [c["text"] for c in chunks]
    embeddings = []
    for i, text in enumerate(texts):
        resp = ollama.embeddings(model=EMBED_MODEL, prompt=text)
        embeddings.append(resp["embedding"])
        if (i + 1) % 50 == 0:
            print(f"  Embedded {i + 1}/{len(texts)} chunks...")
    ids = [c["chunk_id"] for c in chunks]
    metadatas = [{"page": c["page"], "source": c.get("source", "unknown")} for c in chunks]

    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas,
    )

    print(f"\n✅ Ingestion complete — {len(chunks)} chunks stored in ChromaDB.")
    print("   You can now run: streamlit run app.py")


if __name__ == "__main__":
    ingest()
