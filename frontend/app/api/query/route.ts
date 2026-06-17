import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const AZURE_OAI_KEY = process.env.AZURE_OPENAI_API_KEY!;
const AZURE_OAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const LLM_DEPLOY     = process.env.AZURE_OPENAI_LLM_DEPLOYMENT ?? "gpt-4o";
const REWRITE_DEPLOY = process.env.AZURE_OPENAI_REWRITE_DEPLOYMENT ?? LLM_DEPLOY;
const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT!;
const SEARCH_KEY = process.env.AZURE_SEARCH_KEY!;
const SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX ?? "work-orders";

const TOP_K = 10;
const COUNT_FETCH_K = 50;
const COUNT_KEYWORDS = [
  "how many", "count", "total", "number of", "how often", "how much",
  "times has", "times did", "times was", "occurrences",
];
const RECENCY_KEYWORDS = [
  "recent", "latest", "last", "newest", "this week", "this month",
  "who worked", "who last", "last person", "most recent",
];

const SYSTEM_BASE =
  "You are an expert maintenance technician assistant for LG Electronics TN Production Engineering. " +
  "You have access to historical work order records from GMES. " +
  "FORMAT YOUR ANSWERS like a modern AI assistant — use rich markdown:\n" +
  "- SECTION HEADERS: always use ### for section titles (e.g., ### Sensor Issues). NEVER use **Bold:** or 'Bold:' as a header — that pattern is forbidden.\n" +
  "- Use **bold** only for inline emphasis: equipment names, technician names, key findings within a sentence.\n" +
  "- Use `inline code` for WO numbers and part numbers (e.g., `WO #2070`).\n" +
  "- Use bullet lists for failures/occurrences; include the date and WO number on each bullet.\n" +
  "- Use a markdown table for cross-category summaries (Cause Type | Count | Example Dates). Keep tables concise — max 5 columns.\n" +
  "- Do NOT add a redundant 'Insights' or 'Summary' section after a table that already contains the same data.\n" +
  "- Keep single-fact answers short (1–3 sentences). Use structure only when the answer has multiple points.\n" +
  "MATCH DEPTH TO QUESTION:\n" +
  "- WHO/WHEN → 1–3 sentences, bold the name and date. No headers, no table.\n" +
  "- WHAT failures/history → ### grouped by cause type, bullets under each, summary table at the end.\n" +
  "- HOW TO FIX → numbered step-by-step based on past resolutions.\n" +
  "- RECURRENCE → state total count bold, then bullet each occurrence with date + WO + one-line description.\n" +
  "- MOST RECENT → single focused answer for the latest entry only.\n" +
  "GROUNDING RULE (CRITICAL): You may ONLY reference work orders that appear verbatim in the provided context. " +
  "NEVER invent, fabricate, or infer WO numbers, dates, technicians, or equipment names that are not explicitly in the records given to you. " +
  "If you are counting work orders, count only those present in the context — never round up or pad the list. " +
  "If a field is missing from a record, omit that record from your cited list rather than filling it with placeholders. " +
  "The records provided are the top matches retrieved from a larger database — if asked how many records exist in total, say you can only see the top retrieved results and cannot count the full database.\n" +
  "ALWAYS answer from the work order records provided. Never say 'I'm not sure how to help' — " +
  "if work orders are provided, extract the answer from them directly. " +
  "NEVER ask the user to clarify or specify — use the conversation history to infer which machine, " +
  "work order, or technician they mean. If the previous answer mentioned a specific work order, " +
  "assume the follow-up question refers to that same work order. " +
  "If no relevant history exists, clearly say so.\n" +
  "DATE RULE: Always include the date inline whenever referencing a specific work order or event (e.g., 'On **2024-03-15**, **Kim** replaced...'). Never omit dates.\n" +
  "RECURRENCE RULE: For recurrence/frequency questions, state the total count explicitly, then list each occurrence with its date.\n" +
  "After your answer, always append a blank line followed by:\n" +
  "---\n" +
  "📋 **Cited Work Orders**\n" +
  "Then list each work order you actually used as: `• WO #[number] | [date] | [technician] | [equipment]`\n" +
  "Only list WOs that were genuinely relevant to the answer. Maximum 5 entries.";

// ---------------------------------------------------------------------------
// Clients (module-level, reused across requests)
// ---------------------------------------------------------------------------
let _oai: AzureOpenAI | null = null;
let _sc: SearchClient<WODoc> | null = null;

function getOai(): AzureOpenAI {
  if (!_oai) {
    _oai = new AzureOpenAI({
      apiKey: AZURE_OAI_KEY,
      endpoint: AZURE_OAI_ENDPOINT,
      apiVersion: "2024-12-01-preview",
      deployment: LLM_DEPLOY,
    });
  }
  return _oai;
}

function getSc(): SearchClient<WODoc> {
  if (!_sc) {
    _sc = new SearchClient<WODoc>(
      SEARCH_ENDPOINT,
      SEARCH_INDEX,
      new AzureKeyCredential(SEARCH_KEY)
    );
  }
  return _sc;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WODoc {
  wo_no: string;
  date: string;
  date_ts: number;
  equipment: string;
  equip_id: string;
  line: string;
  group: string;
  maint_type: string;
  source: string;
  content: string;
  technician: string;
}

interface HistoryMsg {
  role: "user" | "assistant";
  content: string;
}

interface WOItem {
  text: string;
  ref: string;
  wo_no: string;
  date: string;
  date_ts: number;
  equipment: string;
  maint_type: string;
  line: string;
  group: string;
  source: string;
  technician: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isRecencyQuery(q: string): boolean {
  const ql = q.toLowerCase();
  return RECENCY_KEYWORDS.some((kw) => ql.includes(kw));
}

function isCountQuery(q: string): boolean {
  const ql = q.toLowerCase();
  return COUNT_KEYWORDS.some((kw) => ql.includes(kw));
}

function parseDateWindow(q: string): { label: string; since: Date } | null {
  const ql = q.toLowerCase();
  const now = new Date();

  const lastN = ql.match(/last\s+(\d+)\s+(day|week|month|year)s?/);
  if (lastN) {
    const n = parseInt(lastN[1]);
    const unit = lastN[2];
    const since = new Date(now);
    if (unit === "day")   since.setDate(since.getDate() - n);
    if (unit === "week")  since.setDate(since.getDate() - n * 7);
    if (unit === "month") since.setMonth(since.getMonth() - n);
    if (unit === "year")  since.setFullYear(since.getFullYear() - n);
    return { label: `last ${n} ${unit}${n > 1 ? "s" : ""}`, since };
  }
  if (ql.includes("this month")) {
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    return { label: "this month", since };
  }
  if (ql.includes("this year")) {
    const since = new Date(now.getFullYear(), 0, 1);
    return { label: "this year", since };
  }
  if (ql.includes("this week")) {
    const since = new Date(now);
    since.setDate(since.getDate() - since.getDay());
    since.setHours(0, 0, 0, 0);
    return { label: "this week", since };
  }
  if (ql.includes("ytd") || ql.includes("year to date")) {
    const since = new Date(now.getFullYear(), 0, 1);
    return { label: "year to date", since };
  }
  return null;
}

async function rewriteQuery(input: string, history: HistoryMsg[]): Promise<string> {
  if (history.length < 2) return input;
  const lastTurns = history.slice(-4);
  const context = lastTurns
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
    .join("\n");
  const prompt =
    "You are a search query rewriter for a maintenance work order database.\n" +
    "Given the conversation history and the latest user message, rewrite the " +
    "latest message into a fully self-contained search query.\n" +
    "Rules:\n" +
    "1. Resolve explicit references: 'same machine', 'that equipment', 'it', 'that one', 'the work order', 'that WO' → use the specific name/number from history.\n" +
    "2. Carry implicit equipment context: if the conversation has been about a specific machine/equipment " +
    "and the new question does NOT mention any machine/equipment, ASSUME it is about the SAME machine and add it to the query.\n" +
    "3. Resolve work order references: if the previous assistant message mentioned a specific WO number and the user asks about 'the work order' or 'that work order', include that WO number in the rewritten query.\n" +
    "4. Carry intent: if the previous question asked 'who worked on it?' and the follow-up is 'what about machine #9?', " +
    "rewrite as 'Who last worked on machine #9?'\n" +
    "Return ONLY the rewritten query, nothing else.\n\n" +
    `Conversation history:\n${context}\n` +
    `Latest message: ${input}\n` +
    "Rewritten query:";
  const resp = await getOai().chat.completions.create({
    model: REWRITE_DEPLOY,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 80,
  });
  return resp.choices[0].message.content?.trim() ?? input;
}

async function searchWorkOrders(query: string): Promise<{ items: WOItem[]; totalCount: number }> {
  const fetchK = isCountQuery(query) ? COUNT_FETCH_K : isRecencyQuery(query) ? TOP_K * 3 : TOP_K;
  const sc = getSc();
  const results = await sc.search(query, {
    queryType: "semantic",
    semanticSearchOptions: { configurationName: "default" },
    top: fetchK,
    includeTotalCount: true,
    select: ["wo_no", "date", "date_ts", "equipment", "equip_id", "line", "group", "maint_type", "source", "content", "technician"],
  });
  const items: WOItem[] = [];
  for await (const r of results.results) {
    const doc = r.document;
    const technician = doc.technician || "Unknown";
    items.push({
      text: doc.content,
      ref: `Work order from ${doc.date} made by ${technician} | ${doc.equipment} | ${doc.maint_type}`,
      wo_no: doc.wo_no,
      date: doc.date,
      date_ts: doc.date_ts ?? 0,
      equipment: doc.equipment,
      maint_type: doc.maint_type,
      line: doc.line,
      group: doc.group,
      source: doc.source,
      technician,
    });
  }
  const totalCount = results.count ?? items.length;
  if (isRecencyQuery(query)) {
    items.sort((a, b) => b.date_ts - a.date_ts);
    return { items: items.slice(0, TOP_K), totalCount };
  }
  return { items, totalCount };
}

const WO_TEXT_LIMIT = 300;

function buildMessages(query: string, items: WOItem[], history: HistoryMsg[], totalCount: number) {
  const context = items.map((i) => {
    const snippet = i.text.length > WO_TEXT_LIMIT ? i.text.slice(0, WO_TEXT_LIMIT) + "…" : i.text;
    return `\n--- ${i.ref} ---\n${snippet}`;
  }).join("\n");

  const dateWindow = parseDateWindow(query);
  let countNote: string;
  if (isCountQuery(query)) {
    const dateClause = dateWindow
      ? `The user is asking specifically about **${dateWindow.label}** (on or after ${dateWindow.since.toISOString().slice(0, 10)}). COUNT ONLY work orders whose date is >= ${dateWindow.since.toISOString().slice(0, 10)} from the records below — ignore older ones.`
      : `Azure AI Search matched **${totalCount} total records** in the database for this query. Use ${totalCount} as the authoritative total count if no time window is specified.`;
    countNote = `\n\nCOUNT METADATA: ${dateClause} ${items.length} work orders are provided as context (maximum retrieved for count queries).`;
  } else {
    countNote = `\n\n(Showing ${items.length} of ${totalCount} total matching records in the database.)`;
  }
  const systemPrompt = `${SYSTEM_BASE}${countNote}\n\nRELEVANT WORK ORDERS FOR THIS QUERY:\n${context}`;
  const messages: { role: string; content: string }[] = [{ role: "system", content: systemPrompt }];
  for (const msg of history.slice(-6)) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: "user", content: query });
  return messages;
}

async function callLlm(messages: { role: string; content: string }[]): Promise<string> {
  const resp = await getOai().chat.completions.create({
    model: LLM_DEPLOY,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    temperature: 0.2,
    max_tokens: 800,
  });
  return resp.choices[0].message.content ?? "";
}

function buildCard(items: WOItem[]): string {
  if (!items.length) return "";
  const seen = new Set<string>();
  const facts: { title: string; value: string }[] = [];
  for (const i of items.slice(0, 6)) {
    if (seen.has(i.wo_no)) continue;
    seen.add(i.wo_no);
    facts.push({
      title: `WO #${i.wo_no} · ${i.date}`,
      value: `${i.equipment} · ${i.maint_type} · ${i.technician}`,
    });
  }
  return JSON.stringify({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      { type: "TextBlock", text: "📋 Cited Work Orders", weight: "Bolder", size: "Medium", color: "Accent" },
      { type: "FactSet", facts },
    ],
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: { question?: string; history?: HistoryMsg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Missing 'question' field" }, { status: 400 });
  }
  const history: HistoryMsg[] = Array.isArray(body.history) ? body.history : [];

  try {
    const searchQuery = await rewriteQuery(question, history);
    const { items, totalCount } = await searchWorkOrders(searchQuery);
    const messages = buildMessages(question, items, history, totalCount);
    const answer = await callLlm(messages);

    const workOrders = items.map((i) => ({
      ref: i.ref,
      wo_no: i.wo_no,
      date: i.date,
      technician: i.technician,
      equipment: i.equipment,
      maint_type: i.maint_type,
      line: i.line,
      group: i.group,
      source: i.source,
      content: i.text,
    }));

    return NextResponse.json({
      answer,
      work_orders: workOrders,
      query_used: searchQuery,
      card: buildCard(items),
    });
  } catch (err) {
    console.error("query route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
