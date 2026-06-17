import json
import logging
import os
import re
from datetime import datetime, timedelta

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
AZURE_LLM_DEPLOY     = os.environ.get("AZURE_OPENAI_LLM_DEPLOYMENT", "gpt-4o")
AZURE_REWRITE_DEPLOY = os.environ.get("AZURE_OPENAI_REWRITE_DEPLOYMENT", AZURE_LLM_DEPLOY)
SEARCH_ENDPOINT    = os.environ["AZURE_SEARCH_ENDPOINT"]
SEARCH_KEY         = os.environ["AZURE_SEARCH_KEY"]
SEARCH_INDEX       = os.environ.get("AZURE_SEARCH_INDEX", "work-orders")

TOP_K = 10
COUNT_FETCH_K = 50
WO_TEXT_LIMIT = 300
RECENCY_KEYWORDS = {"recent", "latest", "last", "newest", "this week", "this month", "who worked", "who last", "last person", "most recent"}
COUNT_KEYWORDS   = {"how many", "count", "total", "number of", "how often", "how much", "times has", "times did", "times was", "occurrences"}

SYSTEM_BASE = (
    "You are an expert maintenance technician assistant for LG Electronics TN Production Engineering. "
    "You have access to historical work order records from GMES. "
    "FORMAT YOUR ANSWERS like a modern AI assistant — use rich markdown:\n"
    "- SECTION HEADERS: always use ### for section titles (e.g., ### Sensor Issues). NEVER use **Bold:** or 'Bold:' as a header — that pattern is forbidden.\n"
    "- Use **bold** only for inline emphasis: equipment names, technician names, key findings within a sentence.\n"
    "- Use `inline code` for WO numbers and part numbers (e.g., `WO #2070`).\n"
    "- Use bullet lists for failures/occurrences; include the date and WO number on each bullet.\n"
    "- Use a markdown table for cross-category summaries (Cause Type | Count | Example Dates). Keep tables concise — max 5 columns.\n"
    "- Do NOT add a redundant 'Insights' or 'Summary' section after a table that already contains the same data.\n"
    "- Keep single-fact answers short (1–3 sentences). Use structure only when the answer has multiple points.\n"
    "MATCH DEPTH TO QUESTION:\n"
    "- WHO/WHEN → 1–3 sentences, bold the name and date. No headers, no table.\n"
    "- WHAT failures/history → ### grouped by cause type, bullets under each, summary table at the end.\n"
    "- HOW TO FIX → numbered step-by-step based on past resolutions.\n"
    "- RECURRENCE → state total count bold, then bullet each occurrence with date + WO + one-line description.\n"
    "- MOST RECENT → single focused answer for the latest entry only.\n"
    "GROUNDING RULE (CRITICAL): You may ONLY reference work orders that appear verbatim in the provided context. "
    "NEVER invent, fabricate, or infer WO numbers, dates, technicians, or equipment names that are not explicitly in the records given to you. "
    "If you are counting work orders, count only those present in the context — never round up or pad the list. "
    "If a field is missing from a record, omit that record from your cited list rather than filling it with placeholders.\n"
    "ALWAYS answer from the work order records provided. Never say 'I'm not sure how to help' — "
    "if work orders are provided, extract the answer from them directly. "
    "NEVER ask the user to clarify or specify — use the conversation history to infer which machine, "
    "work order, or technician they mean. If the previous answer mentioned a specific work order, "
    "assume the follow-up question refers to that same work order. "
    "If no relevant history exists, clearly say so.\n"
    "DATE RULE: Always include the date inline whenever referencing a specific work order or event (e.g., 'On **2024-03-15**, **Kim** replaced...'). Never omit dates.\n"
    "RECURRENCE RULE: For recurrence/frequency questions, state the total count explicitly, then list each occurrence with its date.\n"
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


def is_count_query(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in COUNT_KEYWORDS)


def parse_date_window(query: str):
    """Returns (label, since_date) or None if no time window found."""
    q = query.lower()
    now = datetime.utcnow()
    m = re.search(r'last\s+(\d+)\s+(day|week|month|year)s?', q)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        delta = {"day": timedelta(days=n), "week": timedelta(weeks=n),
                 "month": timedelta(days=n*30), "year": timedelta(days=n*365)}
        since = now - delta[unit]
        return f"last {n} {unit}{'s' if n > 1 else ''}", since
    if "this month" in q:
        return "this month", now.replace(day=1, hour=0, minute=0, second=0)
    if "this year" in q or "ytd" in q or "year to date" in q:
        return "this year", now.replace(month=1, day=1, hour=0, minute=0, second=0)
    if "this week" in q:
        since = now - timedelta(days=now.weekday())
        return "this week", since.replace(hour=0, minute=0, second=0)
    return None


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
        model=AZURE_REWRITE_DEPLOY,
        messages=[{"role": "user", "content": rewrite_prompt}],
        temperature=0,
        max_tokens=80,
    )
    return resp.choices[0].message.content.strip()


def search_work_orders(query: str) -> tuple:
    fetch_k = COUNT_FETCH_K if is_count_query(query) else (TOP_K * 3 if is_recency_query(query) else TOP_K)
    results = _search_client.search(
        search_text=query,
        query_type=QueryType.SEMANTIC,
        semantic_configuration_name="default",
        top=fetch_k,
        include_total_count=True,
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
    total_count = results.get_count() or len(items)
    if is_recency_query(query):
        items = sorted(items, key=lambda x: x["date_ts"], reverse=True)[:TOP_K]
    return items, total_count


def build_messages(query: str, items: list, history: list, total_count: int = 0) -> list:
    context = ""
    for item in items:
        text = item['text']
        snippet = text[:WO_TEXT_LIMIT] + "…" if len(text) > WO_TEXT_LIMIT else text
        context += f"\n--- {item['ref']} ---\n{snippet}\n"
    if is_count_query(query):
        date_window = parse_date_window(query)
        if date_window:
            label, since = date_window
            since_str = since.strftime("%Y-%m-%d")
            date_clause = (f"The user is asking specifically about **{label}** (on or after {since_str}). "
                           f"COUNT ONLY work orders whose date is >= {since_str} from the records below — ignore older ones.")
        else:
            date_clause = (f"Azure AI Search matched **{total_count} total records** in the database for this query. "
                           f"Use {total_count} as the authoritative total count if no time window is specified.")
        count_note = f"\n\nCOUNT METADATA: {date_clause} {len(items)} work orders are provided as context (maximum retrieved for count queries)."
    else:
        count_note = f"\n\n(Showing {len(items)} of {total_count} total matching records in the database.)"
    system_prompt = f"{SYSTEM_BASE}{count_note}\n\nRELEVANT WORK ORDERS FOR THIS QUERY:\n{context}"
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-6:]:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": query})
    return messages


def call_llm(messages: list) -> str:
    resp = _oai_client.chat.completions.create(
        model=AZURE_LLM_DEPLOY,
        messages=messages,
        temperature=0.2,
        max_tokens=800,
    )
    return resp.choices[0].message.content


# ---------------------------------------------------------------------------
# HTTP trigger: POST /api/analytics
@app.route(route="analytics", methods=["POST"])
def analytics_handler(req: func.HttpRequest) -> func.HttpResponse:
    """Aggregate work orders by line, equipment, or failure type using client-side aggregation.
    Supports cross-line pattern queries with multi-field grouping and comparison."""
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON body", status_code=400)

    # Parameters
    group_by = body.get("group_by", "line")  # Can be string or array for multi-field grouping
    date_from = body.get("date_from")  # ISO date string, e.g., "2026-01-01"
    date_to = body.get("date_to")  # ISO date string, e.g., "2026-03-31"
    top_n = body.get("top_n", 10)
    filter_text = body.get("filter", "")  # optional text filter (e.g., "diverter jam"
    compare_lines = body.get("compare_lines", [])  # optional: compare specific lines
    time_group = body.get("time_group", None)  # optional: "week", "month", "quarter" for time-based aggregation

    # Validate and parse dates up front so bad input returns 400, not 500
    try:
        ts_from = int(pd.Timestamp(date_from).timestamp()) if date_from else None
        ts_to   = int(pd.Timestamp(date_to).timestamp())   if date_to   else None
    except (ValueError, TypeError) as exc:
        return func.HttpResponse(f"Invalid date format: {exc}", status_code=400)

    # Build OData filter — escape single quotes in line names to prevent injection
    filters = []
    if ts_from is not None:
        filters.append(f"date_ts ge {ts_from}")
    if ts_to is not None:
        filters.append(f"date_ts le {ts_to}")
    if compare_lines:
        escaped = [line.replace("'", "''") for line in compare_lines]
        line_filter = " or ".join(f"line eq '{l}'" for l in escaped)
        filters.append(f"({line_filter})")

    filter_query = " and ".join(filters) if filters else None

    # Normalize group_by to list once, before the search
    if isinstance(group_by, str):
        group_by = [group_by]

    # Use client-side aggregation. Azure AI Search hard-caps top at 1000;
    # page through with skip to collect all matching documents.
    try:
        all_results = []
        skip = 0
        page_size = 1000
        while True:
            page = list(_search_client.search(
                search_text=filter_text if filter_text else "*",
                filter=filter_query,
                top=page_size,
                skip=skip,
                select=["wo_no", "date", "date_ts", "equipment", "line", "maint_type", "technician", "group"],
            ))
            all_results.extend(page)
            if len(page) < page_size:
                break
            skip += page_size

        # Aggregate — store field values as a tuple (no separator ambiguity)
        counts: dict[tuple, int] = {}
        for r in all_results:
            key_parts = tuple(str(r.get(f) or "Unknown") for f in group_by)

            if time_group:
                date_ts = r.get("date_ts", 0)
                if date_ts:
                    dt = pd.to_datetime(date_ts, unit="s")
                    if time_group == "week":
                        tkey = dt.strftime("%Y-W%W")
                    elif time_group == "month":
                        tkey = dt.strftime("%Y-%m")
                    elif time_group == "quarter":
                        tkey = f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"
                    else:
                        tkey = dt.strftime("%Y-%m-%d")
                    key_parts = (tkey,) + key_parts

            counts[key_parts] = counts.get(key_parts, 0) + 1

        top_keys = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:top_n]

        parsed_results = []
        for key_parts, count in top_keys:
            result: dict = {}
            offset = 0
            if time_group:
                result["time_period"] = key_parts[0]
                offset = 1
            for i, field in enumerate(group_by):
                result[field] = key_parts[offset + i]
            result["count"] = count
            parsed_results.append(result)
        
        return func.HttpResponse(
            json.dumps({
                "group_by": group_by,
                "date_from": date_from,
                "date_to": date_to,
                "filter": filter_text,
                "compare_lines": compare_lines,
                "time_group": time_group,
                "results": parsed_results
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
        items, total_count = search_work_orders(search_query)
        messages           = build_messages(question, items, history, total_count)
        answer       = call_llm(messages)

        work_orders = [
            {
                "ref":        i["ref"],
                "wo_no":      i["wo_no"],
                "date":       i["date"],
                "technician": i["technician"],
                "equipment":  i["equipment"],
                "maint_type": i["maint_type"],
                "line":       i["line"],
                "group":      i.get("group", ""),
                "source":     i.get("source", ""),
                "content":    i["text"],
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
