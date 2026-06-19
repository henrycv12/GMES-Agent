/**
 * Structured failure extraction: fetch WOs for a query/equipment,
 * run LLM to classify each WO's root cause, failure mode, and component,
 * then return aggregated counts.
 */
import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

const AZURE_OAI_KEY = process.env.AZURE_OPENAI_API_KEY!;
const AZURE_OAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const LLM_DEPLOY = process.env.AZURE_OPENAI_LLM_DEPLOYMENT ?? "gpt-4o";
const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT!;
const SEARCH_KEY = process.env.AZURE_SEARCH_KEY!;
const SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX ?? "work-orders";

interface WODoc {
  [key: string]: unknown;
}

let _oai: AzureOpenAI | null = null;
let _sc: SearchClient<WODoc> | null = null;

function getOai() {
  if (!_oai) _oai = new AzureOpenAI({ apiKey: AZURE_OAI_KEY, endpoint: AZURE_OAI_ENDPOINT, apiVersion: "2024-12-01-preview", deployment: LLM_DEPLOY });
  return _oai;
}
function getSc() {
  if (!_sc) _sc = new SearchClient<WODoc>(SEARCH_ENDPOINT, SEARCH_INDEX, new AzureKeyCredential(SEARCH_KEY));
  return _sc;
}

interface ExtractionTag {
  root_cause: string;
  failure_mode: string;
  component: string;
}

const EXTRACT_PROMPT = `You are a maintenance data analyst. Given a work order record, extract three tags:
1. root_cause: The primary cause of the failure (e.g., "Wear", "Contamination", "Operator Error", "Electrical Fault", "Mechanical Fatigue", "Software/Config", "Lubrication", "Corrosion", "Unknown")
2. failure_mode: How it failed (e.g., "Leak", "Breakage", "Overheating", "Jam/Blockage", "Vibration", "Noise", "No Power", "Short Circuit", "Calibration Drift", "Sensor Failure")
3. component: The specific part or sub-system that failed (e.g., "Motor", "Pump", "Sensor", "Valve", "Belt", "Bearing", "PCB", "Cylinder", "Gripper", "Conveyor")

Respond ONLY with a JSON object: {"root_cause": "...", "failure_mode": "...", "component": "..."}
Use the most specific label that fits. If unclear, use the closest match from the examples above.`;

async function extractTags(content: string): Promise<ExtractionTag> {
  const resp = await getOai().chat.completions.create({
    model: LLM_DEPLOY,
    messages: [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: content.slice(0, 600) },
    ],
    temperature: 0,
    max_tokens: 80,
  });
  const raw = resp.choices[0].message.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      root_cause: String(parsed.root_cause ?? "Unknown"),
      failure_mode: String(parsed.failure_mode ?? "Unknown"),
      component: String(parsed.component ?? "Unknown"),
    };
  } catch {
    return { root_cause: "Unknown", failure_mode: "Unknown", component: "Unknown" };
  }
}

function tally(arr: string[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of arr) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function POST(req: NextRequest) {
  let body: { query?: string; equipment?: string; top?: number; date_from?: string; date_to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query || body.equipment || "*";
  const top = Math.min(body.top ?? 30, 50);

  const filters: string[] = [];
  try {
    if (body.date_from) filters.push(`date_ts ge ${Math.floor(new Date(body.date_from).getTime() / 1000)}`);
    if (body.date_to) filters.push(`date_ts le ${Math.floor(new Date(body.date_to).getTime() / 1000)}`);
  } catch (err) {
    return NextResponse.json({ error: `Date filter error: ${err}` }, { status: 400 });
  }
  const filterQuery = filters.length ? filters.join(" and ") : undefined;

  try {
    const sc = getSc();
    const searchResult = await sc.search(query, {
      queryType: "semantic",
      semanticSearchOptions: { configurationName: "default" },
      top,
      filter: filterQuery,
      select: ["content", "equipment", "wo_no", "date"],
    });

    const contents: string[] = [];
    for await (const r of searchResult.results) {
      contents.push(String(r.document.content ?? ""));
    }

    if (contents.length === 0) {
      return NextResponse.json({ results: [], total_analyzed: 0 });
    }

    // Extract tags in parallel (batched to avoid rate limits)
    const CONCURRENCY = 5;
    const tags: ExtractionTag[] = [];
    for (let i = 0; i < contents.length; i += CONCURRENCY) {
      const batch = contents.slice(i, i + CONCURRENCY);
      const batchTags = await Promise.all(batch.map(extractTags));
      tags.push(...batchTags);
    }

    return NextResponse.json({
      total_analyzed: tags.length,
      by_root_cause: tally(tags.map((t) => t.root_cause)),
      by_failure_mode: tally(tags.map((t) => t.failure_mode)),
      by_component: tally(tags.map((t) => t.component)),
    });
  } catch (err) {
    console.error("extract route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
