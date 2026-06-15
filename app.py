import asyncio
import os
import sys
import streamlit as st
import chromadb
import ollama
from dotenv import load_dotenv

load_dotenv()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

CHROMA_DIR = "./chroma_db"
WO_COLLECTION = "work_orders"
OLLAMA_MODEL = "llama3.2:1b"
EMBED_MODEL = "nomic-embed-text"
TOP_K = 6

# --- Embedding provider (mirrors ingest_excel.py) ---
AZURE_KEY      = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_DEPLOY   = os.getenv("AZURE_OPENAI_EMBED_DEPLOYMENT", "embed-model")
USE_AZURE      = bool(AZURE_KEY and AZURE_ENDPOINT)

if USE_AZURE:
    from openai import AzureOpenAI
    _azure_client = AzureOpenAI(
        api_key=AZURE_KEY,
        azure_endpoint=AZURE_ENDPOINT,
        api_version="2024-12-01-preview",
    )

RECENCY_KEYWORDS = {
    "recent", "latest", "last", "newest", "most recent",
    "this week", "this month", "today", "yesterday", "just", "ago",
}

st.set_page_config(
    page_title="MES Local — Maintenance Agent",
    page_icon="�",
    layout="wide",
)

st.title("� MES Local — Maintenance Agent")
st.caption("AI-powered troubleshooting from your work order history")
st.divider()


@st.cache_resource(show_spinner="Loading work order knowledge base...")
def load_collection():
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_collection(WO_COLLECTION)


def is_recency_query(query):
    q = query.lower()
    return any(kw in q for kw in RECENCY_KEYWORDS)


def embed_query(query):
    if USE_AZURE:
        resp = _azure_client.embeddings.create(model=AZURE_DEPLOY, input=[query])
        return resp.data[0].embedding
    else:
        return ollama.embeddings(model=EMBED_MODEL, prompt=query)["embedding"]


def retrieve_context(query, collection, top_k=TOP_K):
    embedding = embed_query(query)
    # Fetch more candidates when recency is needed so we can re-rank
    fetch_k = top_k * 3 if is_recency_query(query) else top_k
    results = collection.query(
        query_embeddings=[embedding],
        n_results=fetch_k,
        include=["documents", "metadatas"],
    )
    docs = results["documents"][0]
    metas = results["metadatas"][0]
    items = [
        {
            "text": doc,
            "ref": f"WO #{m.get('wo_no','?')} | {m.get('equipment','?')} | {m.get('date','?')} | {m.get('maint_type','?')}",
            "source": m.get("source", ""),
            "date_ts": m.get("date_ts", 0),
            "date": m.get("date", "?"),
        }
        for doc, m in zip(docs, metas)
    ]
    if is_recency_query(query):
        items = sorted(items, key=lambda x: x["date_ts"], reverse=True)[:top_k]
    return items


def build_prompt(query, items):
    context = ""
    for item in items:
        context += f"\n--- {item['ref']} ---\n{item['text']}\n"

    return f"""You are an expert maintenance technician assistant with access to a database of historical work orders from a manufacturing facility.

Use the work order records below to answer the technician's question.
- Identify similar past failures and how they were resolved
- Reference specific work order numbers and equipment IDs
- Suggest likely causes based on historical patterns
- Give step-by-step guidance based on what has worked before
- If no relevant history exists, clearly say so and suggest general troubleshooting steps

HISTORICAL WORK ORDERS:
{context}

TECHNICIAN QUESTION: {query}

EXPERT ANSWER:"""


def call_ollama(prompt, model_name=OLLAMA_MODEL):
    response = ollama.chat(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        stream=False,
    )
    return response["message"]["content"]


# --- Sidebar ---
with st.sidebar:
    st.header("⚙️ Settings")
    model_choice = st.selectbox(
        "Ollama Model",
        ["llama3.2:1b", "llama3.2:3b", "llama3", "mistral", "phi3:mini"],
        index=0,
        help="Must be pulled via: ollama pull <model>",
    )
    top_k = st.slider("Similar work orders (Top K)", min_value=3, max_value=15, value=6)
    st.divider()
    st.header("📂 Knowledge Base")
    st.caption("Add work orders by dropping your Excel export in this folder and running:")
    st.code("python ingest_excel.py", language="bash")
    st.divider()
    if st.button("🗑️ Clear Chat History"):
        st.session_state.messages = []
        st.rerun()

# --- Load collection ---
try:
    collection = load_collection()
    count = collection.count()
    st.sidebar.success(f"✅ {count:,} work orders indexed")
    db_ready = True
except Exception as e:
    db_ready = False
    st.error(
        "⚠️ **No work orders indexed yet.**\n\n"
        "Drop your Excel file in this folder and run:\n```\npython ingest_excel.py\n```\n\n"
        f"Error: `{e}`"
    )

# --- Chat history ---
if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg["role"] == "assistant" and msg.get("items"):
            with st.expander("� Work orders referenced"):
                for item in msg["items"]:
                    st.markdown(f"**{item['ref']}**\n\n{item['text'][:350]}...")

# --- Chat input ---
if db_ready:
    if user_input := st.chat_input("Describe the equipment issue or ask a maintenance question..."):
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        with st.chat_message("assistant"):
            with st.spinner("Searching work order history..."):
                items = retrieve_context(user_input, collection, top_k=top_k)
                prompt = build_prompt(user_input, items)

            try:
                with st.spinner("Generating answer (this may take 20–60 seconds)..."):
                    full_response = call_ollama(prompt, model_name=model_choice)
                st.markdown(full_response)
            except Exception as e:
                full_response = (
                    f"❌ **Ollama error:** `{e}`\n\n"
                    f"Make sure Ollama is running and `{model_choice}` is pulled:\n"
                    f"```\nollama pull {model_choice}\n```"
                )
                st.markdown(full_response)

            with st.expander("� Work orders referenced"):
                for item in items:
                    st.markdown(f"**{item['ref']}**\n\n{item['text'][:350]}...")

        st.session_state.messages.append(
            {"role": "assistant", "content": full_response, "items": items}
        )
