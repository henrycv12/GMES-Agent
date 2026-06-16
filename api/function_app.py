import json
import logging
import os
import re

import pandas as pd
import azure.functions as func
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableServiceClient, UpdateMode
from azure.search.documents import SearchClient
from azure.search.documents.models import QueryType
from openai import AzureOpenAI

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

_STORAGE_CONN  = os.environ.get("AzureWebJobsStorage", "")
_HISTORY_TABLE = "convhistory"

def _safe_row_key(conv_id: str) -> str:
    """Remove characters illegal in Azure Table Storage RowKey: / \\ # ? and control chars."""
    return re.sub(r'[/\\#?\x00-\x1f\x7f]', '_', conv_id)[:256]

def _get_history(conv_id: str) -> list:
    try:
        svc = TableServiceClient.from_connection_string(_STORAGE_CONN)
        tbl = svc.create_table_if_not_exists(_HISTORY_TABLE)
        entity = tbl.get_entity(partition_key="h", row_key=_safe_row_key(conv_id))
        return json.loads(entity.get("data", "[]"))
    except ResourceNotFoundError:
        return []
    except Exception as exc:
        logging.warning("_get_history error: %s", exc)
        return []

def _set_history(conv_id: str, history: list) -> None:
    try:
        svc = TableServiceClient.from_connection_string(_STORAGE_CONN)
        tbl = svc.create_table_if_not_exists(_HISTORY_TABLE)
        tbl.upsert_entity(
            {"PartitionKey": "h", "RowKey": _safe_row_key(conv_id), "data": json.dumps(history, ensure_ascii=False)},
            mode=UpdateMode.REPLACE,
        )
    except Exception as exc:
        logging.warning("_set_history error: %s", exc)

# --- Config from environment ---
AZURE_OAI_KEY      = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_OAI_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_EMBED_DEPLOY = os.environ.get("AZURE_OPENAI_EMBED_DEPLOYMENT", "embed-model")
AZURE_LLM_DEPLOY   = os.environ.get("AZURE_OPENAI_LLM_DEPLOYMENT", "gpt-4o")
SEARCH_ENDPOINT    = os.environ["AZURE_SEARCH_ENDPOINT"]
SEARCH_KEY         = os.environ["AZURE_SEARCH_KEY"]
SEARCH_INDEX       = os.environ.get("AZURE_SEARCH_INDEX", "work-orders")

TOP_K = 15
RECENCY_KEYWORDS = {"recent", "latest", "last", "newest", "this week", "this month", "who worked", "who last", "last person", "most recent"}

SYSTEM_BASE = (
    "You are an expert maintenance technician assistant for LG Electronics TN Production Engineering. "
    "You have access to historical work order records from GMES. "
    "CRITICAL — Match your answer length and style to the question being asked:\n"
    "- If asked WHO worked on something or WHEN: give a direct 1-3 sentence answer naming the technician, date, and WO reference. Do NOT give a full history.\n"
    "- If asked WHAT happened or WHAT failures exist: give a structured summary.\n"
    "- If asked HOW TO FIX something: give step-by-step guidance based on past resolutions.\n"
    "- If asked about the LAST or MOST RECENT work: sort by date and report only the most recent entry.\n"
    "ALWAYS answer from the work order records provided. Never say 'I'm not sure how to help' — "
    "if work orders are provided, extract the answer from them directly. "
    "NEVER ask the user to clarify or specify — use the conversation history to infer which machine, "
    "work order, or technician they mean. If the previous answer mentioned a specific work order, "
    "assume the follow-up question refers to that same work order. "
    "If no relevant history exists, clearly say so.\n"
    "After your answer, always append a blank line followed by:\n"
    "---\n"
    "📋 **Cited Work Orders**\n"
    "Then list each work order you actually used as: `• WO #[number] | [date] | [technician] | [equipment]`\n"
    "Only list WOs that were genuinely relevant to the answer. Maximum 5 entries."
)

# --- Clients (initialized once per cold start) ---
_oai_client = AzureOpenAI(
    api_key=AZURE_OAI_KEY,
    azure_endpoint=AZURE_OAI_ENDPOINT,
    api_version="2024-12-01-preview",
)
_search_client = SearchClient(
    endpoint=SEARCH_ENDPOINT,
    index_name=SEARCH_INDEX,
    credential=AzureKeyCredential(SEARCH_KEY),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_recency_query(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in RECENCY_KEYWORDS)


def rewrite_query(user_input: str, history: list) -> str:
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
        "latest message into a fully self-contained search query.\n"
        "Rules:\n"
        "1. Resolve explicit references: 'same machine', 'that equipment', 'it', 'that one', 'the work order', 'that WO' → use the specific name/number from history.\n"
        "2. Carry implicit equipment context: if the conversation has been about a specific machine/equipment "
        "and the new question does NOT mention any machine/equipment, ASSUME it is about the SAME machine and add it to the query.\n"
        "3. Resolve work order references: if the previous assistant message mentioned a specific WO number and the user asks about 'the work order' or 'that work order', include that WO number in the rewritten query.\n"
        "4. Carry intent: if the previous question asked 'who worked on it?' and the follow-up is 'what about machine #9?', "
        "rewrite as 'Who last worked on machine #9?'\n"
        "Return ONLY the rewritten query, nothing else.\n\n"
        f"Conversation history:\n{context}\n"
        f"Latest message: {user_input}\n"
        "Rewritten query:"
    )
    resp = _oai_client.chat.completions.create(
        model=AZURE_LLM_DEPLOY,
        messages=[{"role": "user", "content": rewrite_prompt}],
        temperature=0,
        max_tokens=100,
    )
    return resp.choices[0].message.content.strip()


def search_work_orders(query: str) -> list:
    fetch_k = TOP_K * 3 if is_recency_query(query) else TOP_K
    results = _search_client.search(
        search_text=query,
        query_type=QueryType.SEMANTIC,
        semantic_configuration_name="default",
        top=fetch_k,
        select=["wo_no", "date", "date_ts", "equipment", "equip_id",
                "line", "group", "maint_type", "source", "content", "technician"],
    )
    items = []
    for r in results:
        technician = r.get("technician", "") or "Unknown"
        items.append({
            "text":       r["content"],
            "ref":        f"Work order from {r['date']} made by {technician} | {r['equipment']} | {r['maint_type']}",
            "wo_no":      r["wo_no"],
            "date":       r["date"],
            "date_ts":    r.get("date_ts", 0),
            "equipment":  r["equipment"],
            "maint_type": r["maint_type"],
            "line":       r["line"],
            "group":      r["group"],
            "source":     r["source"],
            "technician": technician,
        })
    if is_recency_query(query):
        items = sorted(items, key=lambda x: x["date_ts"], reverse=True)[:TOP_K]
    return items


def build_messages(query: str, items: list, history: list) -> list:
    context = ""
    for item in items:
        context += f"\n--- {item['ref']} ---\n{item['text']}\n"
    system_prompt = f"{SYSTEM_BASE}\n\nRELEVANT WORK ORDERS FOR THIS QUERY:\n{context}"
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-12:]:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": query})
    return messages


def call_llm(messages: list) -> str:
    resp = _oai_client.chat.completions.create(
        model=AZURE_LLM_DEPLOY,
        messages=messages,
        temperature=0.2,
        max_tokens=1500,
    )
    return resp.choices[0].message.content


# ---------------------------------------------------------------------------
# HTTP trigger: POST /api/analytics
@app.route(route="analytics", methods=["POST"])
def analytics_handler(req: func.HttpRequest) -> func.HttpResponse:
    """Aggregate work orders by line, equipment, or failure type using Azure AI Search facets."""
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON body", status_code=400)

    # Parameters
    group_by = body.get("group_by", "line")  # line, equipment, maint_type, group
    date_from = body.get("date_from")  # ISO date string, e.g., "2026-01-01"
    date_to = body.get("date_to")  # ISO date string, e.g., "2026-03-31"
    top_n = body.get("top_n", 10)
    filter_text = body.get("filter", "")  # optional text filter (e.g., "diverter jam")

    # Build filter for date range
    filters = []
    if date_from:
        filters.append(f"date_ts ge {int(pd.Timestamp(date_from).timestamp())}")
    if date_to:
        filters.append(f"date_ts le {int(pd.Timestamp(date_to).timestamp())}")
    if filter_text:
        filters.append(f"content/search.in('{filter_text}', 'simple')")
    
    filter_query = " and ".join(filters) if filters else None

    # Use Azure AI Search facets for aggregation
    try:
        results = _search_client.search(
            search_text="*" if not filter_text else filter_text,
            filter=filter_query,
            facets=[f"{group_by},count:{top_n}"],
            top=0,  # We only need facet counts, not documents
            select=["wo_no", "date", "equipment", "line", "maint_type", "technician"],
        )
        
        # Extract facet results
        facet_results = []
        for result in results:
            if result.get_facets():
                facet_data = result.get_facets().get(group_by, [])
                for facet in facet_data:
                    facet_results.append({
                        "value": facet.value,
                        "count": facet.count
                    })
        
        # Sort by count descending
        facet_results = sorted(facet_results, key=lambda x: x["count"], reverse=True)[:top_n]
        
        return func.HttpResponse(
            json.dumps({
                "group_by": group_by,
                "date_from": date_from,
                "date_to": date_to,
                "filter": filter_text,
                "results": facet_results
            }, ensure_ascii=False),
            mimetype="application/json",
            status_code=200,
        )
        
    except Exception as exc:
        logging.exception("analytics_handler error")
        return func.HttpResponse(
            json.dumps({"error": str(exc)}),
            mimetype="application/json",
            status_code=500,
        )

# ---------------------------------------------------------------------------
# HTTP trigger: POST /api/query
def build_card(items: list) -> str:
    """Build an Adaptive Card JSON string from retrieved work order items."""
    if not items:
        return ""
    facts = []
    seen = set()
    for i in items[:6]:
        wo = i["wo_no"]
        if wo in seen:
            continue
        seen.add(wo)
        facts.append({
            "title": f"WO #{wo} · {i['date']}",
            "value": f"{i['equipment']} · {i['maint_type']} · {i['technician']}"
        })
    card = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [
            {"type": "TextBlock", "text": "📋 Cited Work Orders",
             "weight": "Bolder", "size": "Medium", "color": "Accent"},
            {"type": "FactSet", "facts": facts},
        ]
    }
    return json.dumps(card, ensure_ascii=False)

# ---------------------------------------------------------------------------

@app.route(route="query", methods=["POST"])
def query_handler(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON body", status_code=400)

    question = body.get("question", "").strip()
    raw_history = body.get("history", [])
    conversation_id = None
    if isinstance(raw_history, str):
        try:
            history = json.loads(raw_history)
        except (ValueError, TypeError):
            conversation_id = raw_history.strip() or None
            history = _get_history(conversation_id) if conversation_id else []
    else:
        history = raw_history if isinstance(raw_history, list) else []
    logging.info("CONV conv_id=%s history_len=%d", conversation_id, len(history))

    if not question:
        return func.HttpResponse("Missing 'question' field", status_code=400)

    try:
        search_query = rewrite_query(question, history)
        logging.info("REWRITE '%s' -> '%s'", question[:80], search_query[:80])
        items        = search_work_orders(search_query)
        messages     = build_messages(question, items, history)
        answer       = call_llm(messages)

        work_orders = [
            {
                "ref":        i["ref"],
                "date":       i["date"],
                "technician": i["technician"],
                "equipment":  i["equipment"],
                "maint_type": i["maint_type"],
                "line":       i["line"],
            }
            for i in items
        ]

        new_history = (history + [
            {"role": "user",      "content": question},
            {"role": "assistant", "content": answer},
        ])[-12:]

        if conversation_id:
            _set_history(conversation_id, new_history)

        payload = {
            "answer":      answer,
            "work_orders": work_orders,
            "query_used":  search_query,
            "card":        build_card(items),
        }
        return func.HttpResponse(
            json.dumps(payload, ensure_ascii=False),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as exc:
        logging.exception("query_handler error")
        return func.HttpResponse(
            json.dumps({"error": str(exc)}),
            mimetype="application/json",
            status_code=500,
        )
