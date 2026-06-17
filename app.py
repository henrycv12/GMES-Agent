import asyncio
import os
import sys
import streamlit as st
import chromadb
import pandas as pd
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

CHROMA_DIR = "./chroma_db"
WO_COLLECTION = "work_orders"
TOP_K = 15

AZURE_KEY        = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_ENDPOINT   = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_DEPLOY     = os.getenv("AZURE_OPENAI_EMBED_DEPLOYMENT", "embed-model")
AZURE_LLM_DEPLOY = os.getenv("AZURE_OPENAI_LLM_DEPLOYMENT", "gpt-4o")

if not (AZURE_KEY and AZURE_ENDPOINT):
    st.error("❌ **Azure OpenAI credentials missing.** Set `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT` in your `.env` file.")
    st.stop()

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
    page_title="GMES Agent — Maintenance Agent",
    page_icon="🔧",
    layout="wide",
)

st.title("🔧 GMES Agent — Maintenance Agent")
st.caption("AI-powered troubleshooting from your work order history")
st.divider()


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

@st.cache_resource(show_spinner="Loading work order knowledge base...")
def load_collection():
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_collection(WO_COLLECTION)


@st.cache_data(show_spinner="Loading analytics data...", ttl=300)
def load_metadata_df(_collection) -> pd.DataFrame:
    """Fetch all metadata from ChromaDB and return as a DataFrame."""
    total = _collection.count()
    all_meta = []
    batch = 1000
    for offset in range(0, total, batch):
        res = _collection.get(limit=batch, offset=offset, include=["metadatas"])
        all_meta.extend(res["metadatas"])
    df = pd.DataFrame(all_meta)
    if "date_ts" in df.columns:
        df["date_parsed"] = pd.to_datetime(df["date_ts"], unit="s", errors="coerce")
    return df


# ---------------------------------------------------------------------------
# Chat helpers
# ---------------------------------------------------------------------------

def is_recency_query(query):
    q = query.lower()
    return any(kw in q for kw in RECENCY_KEYWORDS)


def rewrite_query(user_input, history):
    if len(history) < 2:
        return user_input
    last_turns = history[-4:]
    context = ""
    for msg in last_turns:
        role = "User" if msg["role"] == "user" else "Assistant"
        context += f"{role}: {msg['content'][:400]}\n"
    rewrite_prompt = (
        "You are a search query rewriter for a maintenance work order database.\n"
        "Given the conversation history and the latest user message, rewrite the "
        "latest message into a fully self-contained search query that resolves any "
        "references like 'same machine', 'that equipment', 'last issue', 'same problem'.\n"
        "Return ONLY the rewritten query, nothing else.\n\n"
        f"Conversation history:\n{context}\n"
        f"Latest message: {user_input}\n"
        "Rewritten query:"
    )
    resp = _azure_client.chat.completions.create(
        model=AZURE_LLM_DEPLOY,
        messages=[{"role": "user", "content": rewrite_prompt}],
        temperature=0,
        max_tokens=100,
    )
    return resp.choices[0].message.content.strip()


def embed_query(query):
    resp = _azure_client.embeddings.create(model=AZURE_DEPLOY, input=[query])
    return resp.data[0].embedding


def retrieve_context(query, collection, top_k=TOP_K):
    embedding = embed_query(query)
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
            "wo_no": m.get("wo_no", "?"),
            "equipment": m.get("equipment", "?"),
            "maint_type": m.get("maint_type", "?"),
            "line": m.get("line", "?"),
            "group": m.get("group", "?"),
        }
        for doc, m in zip(docs, metas)
    ]
    if is_recency_query(query):
        items = sorted(items, key=lambda x: x["date_ts"], reverse=True)[:top_k]
    return items


SYSTEM_BASE = (
    "You are an expert maintenance technician assistant for LG Electronics TN Production Engineering. "
    "You have access to historical work order records from GMES. "
    "When answering: identify similar past failures and resolutions, reference specific WO numbers and equipment IDs, "
    "suggest likely causes based on historical patterns, give step-by-step guidance based on what has worked before. "
    "If no relevant history exists, clearly say so."
)


def render_wo_cards(items):
    for i, item in enumerate(items):
        with st.container():
            cols = st.columns([1, 3])
            with cols[0]:
                st.markdown(f"### WO #{item['wo_no']}")
                st.caption(item['date'])
                st.markdown(f"**{item['maint_type']}**")
            with cols[1]:
                st.markdown(f"🔧 **Equipment:** {item['equipment']}")
                st.markdown(f"🏭 **Line:** {item['line']} &nbsp;|&nbsp; **Group:** {item['group']}")
                st.markdown(item['text'][:400] + ("..." if len(item['text']) > 400 else ""))
            if i < len(items) - 1:
                st.divider()


def build_messages(query, items, history):
    context = ""
    for item in items:
        context += f"\n--- {item['ref']} ---\n{item['text']}\n"
    system_prompt = f"{SYSTEM_BASE}\n\nRELEVANT WORK ORDERS FOR THIS QUERY:\n{context}"
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": query})
    return messages


def call_llm(messages, model_name=None):
    resp = _azure_client.chat.completions.create(
        model=model_name or AZURE_LLM_DEPLOY,
        messages=messages,
        temperature=0.2,
        max_tokens=1500,
    )
    return resp.choices[0].message.content


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

with st.sidebar:
    st.header("⚙️ Settings")
    model_choice = st.selectbox(
        "Azure LLM Model",
        ["gpt-4o", "gpt-4o-mini"],
        index=0,
        help="Azure OpenAI deployment name",
    )
    st.caption("🟢 Azure OpenAI (embeddings + LLM)")
    top_k = st.slider("Similar work orders (Top K)", min_value=3, max_value=30, value=15)
    st.divider()
    st.header("📂 Knowledge Base")
    st.caption("Add work orders by dropping your Excel/CSV export in this folder and running:")
    st.code("python ingest_excel.py", language="bash")
    st.divider()
    if st.button("🗑️ Clear Chat History"):
        st.session_state.messages = []
        st.rerun()

# ---------------------------------------------------------------------------
# Load collection
# ---------------------------------------------------------------------------

try:
    collection = load_collection()
    count = collection.count()
    st.sidebar.success(f"✅ {count:,} work orders indexed")
    db_ready = True
except Exception as e:
    db_ready = False
    collection = None
    st.error(
        "⚠️ **No work orders indexed yet.**\n\n"
        "Drop your Excel file in this folder and run:\n```\npython ingest_excel.py\n```\n\n"
        f"Error: `{e}`"
    )

# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------

tab_chat, tab_analytics = st.tabs(["💬 Chat", "📊 Analytics"])

# ---------------------------------------------------------------------------
# Tab 1 — Chat
# ---------------------------------------------------------------------------

with tab_chat:
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            if msg["role"] == "assistant" and msg.get("items"):
                with st.expander(f"📋 {len(msg['items'])} work orders referenced"):
                    render_wo_cards(msg["items"])

    if db_ready:
        if user_input := st.chat_input("Describe the equipment issue or ask a maintenance question..."):
            st.session_state.messages.append({"role": "user", "content": user_input})
            with st.chat_message("user"):
                st.markdown(user_input)

            with st.chat_message("assistant"):
                with st.spinner("Searching work order history..."):
                    history_so_far = st.session_state.messages[:-1]
                    search_query = rewrite_query(user_input, history_so_far)
                    items = retrieve_context(search_query, collection, top_k=top_k)
                    messages = build_messages(user_input, items, history_so_far)

                try:
                    with st.spinner("Generating answer..."):
                        full_response = call_llm(messages, model_name=model_choice)
                    st.markdown(full_response)
                except Exception as e:
                    full_response = f"❌ **Azure OpenAI error:** `{e}`"
                    st.markdown(full_response)

                with st.expander(f"📋 {len(items)} work orders referenced"):
                    render_wo_cards(items)

            st.session_state.messages.append(
                {"role": "assistant", "content": full_response, "items": items}
            )

# ---------------------------------------------------------------------------
# Tab 2 — Analytics
# ---------------------------------------------------------------------------

with tab_analytics:
    if not db_ready:
        st.warning("No work orders indexed yet. Run `python ingest_excel.py` first.")
        st.stop()

    df_full = load_metadata_df(collection)

    GROUP_LABELS = {
        "line":       "Line",
        "group":      "Shop / Group",
        "equipment":  "Equipment",
        "maint_type": "Maintenance Type",
    }

    # --- Controls ---
    col1, col2, col3, col4 = st.columns([2, 2, 2, 2])
    with col1:
        group_field = st.selectbox(
            "Group by",
            options=list(GROUP_LABELS.keys()),
            format_func=lambda k: GROUP_LABELS[k],
        )
    with col2:
        top_n = st.slider("Top N", min_value=3, max_value=25, value=10)
    with col3:
        date_min = df_full["date_parsed"].min().date() if "date_parsed" in df_full.columns else None
        date_max = df_full["date_parsed"].max().date() if "date_parsed" in df_full.columns else None
        date_from = st.date_input("From", value=date_min, min_value=date_min, max_value=date_max)
    with col4:
        date_to = st.date_input("To", value=date_max, min_value=date_min, max_value=date_max)

    keyword = st.text_input(
        "Keyword filter (optional)",
        placeholder="e.g. diverter jam, vacuum, motor...",
        help="Filters rows where any text field contains this word",
    )

    st.divider()

    # --- Apply filters ---
    df = df_full.copy()
    if "date_parsed" in df.columns:
        df = df[df["date_parsed"].dt.date.between(date_from, date_to)]
    if keyword.strip():
        kw = keyword.strip().lower()
        text_cols = [c for c in ["equipment", "maint_type", "line", "group"] if c in df.columns]
        mask = df[text_cols].apply(lambda col: col.str.lower().str.contains(kw, na=False)).any(axis=1)
        df = df[mask]

    if df.empty:
        st.info("No work orders match the current filters.")
        st.stop()

    # --- Aggregate ---
    if group_field not in df.columns:
        st.error(f"Field '{group_field}' not found in indexed data.")
        st.stop()

    counts = (
        df[group_field]
        .fillna("Unknown")
        .value_counts()
        .head(top_n)
        .rename_axis(GROUP_LABELS[group_field])
        .rename("Work Orders")
    )

    # --- Chart ---
    st.subheader(f"Top {top_n} by {GROUP_LABELS[group_field]}")
    st.caption(f"{len(df):,} work orders in selected range · {date_from} → {date_to}"
               + (f" · keyword: '{keyword}'" if keyword.strip() else ""))
    st.bar_chart(counts)

    # --- Table ---
    with st.expander("📋 Full table", expanded=False):
        st.dataframe(
            counts.reset_index().rename(columns={"index": GROUP_LABELS[group_field]}),
            use_container_width=True,
            hide_index=True,
        )

    # --- Trend over time (monthly) ---
    if "date_parsed" in df.columns and group_field in df.columns:
        st.divider()
        st.subheader(f"Monthly trend — top 5 {GROUP_LABELS[group_field]}")
        top5 = counts.head(5).index.tolist()
        trend_df = df[df[group_field].isin(top5)].copy()
        trend_df["month"] = trend_df["date_parsed"].dt.to_period("M").dt.to_timestamp()
        pivot = (
            trend_df.groupby(["month", group_field])
            .size()
            .unstack(fill_value=0)
            .sort_index()
        )
        st.line_chart(pivot)
