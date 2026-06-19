/**
 * Anomaly surfacing: compare failure counts per equipment for a recent window
 * vs. the same window one year prior. Returns equipment where recent activity
 * is significantly higher than the historical baseline.
 */
import { NextRequest, NextResponse } from "next/server";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT!;
const SEARCH_KEY = process.env.AZURE_SEARCH_KEY!;
const SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX ?? "work-orders";

interface WODoc {
  [key: string]: unknown;
}

let _sc: SearchClient<WODoc> | null = null;
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

export interface AnomalyResult {
  equipment: string;
  recent_count: number;
  prior_count: number;
  change_pct: number | null;    // null when prior_count == 0 (new failure pattern)
  is_new: boolean;              // true when prior_count == 0
}

async function countByEquipment(
  sc: SearchClient<WODoc>,
  fromTs: number,
  toTs: number,
  extraFilter?: string
): Promise<Map<string, number>> {
  const filters = [
    `date_ts ge ${fromTs}`,
    `date_ts le ${toTs}`,
  ];
  if (extraFilter) filters.push(extraFilter);

  const result = await sc.search("*", {
    filter: filters.join(" and "),
    top: 0,
    facets: ["equipment,count:500,sort:count"],
  });
  // consume iterator so facets are populated
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of result.results) { /* top=0 */ }

  const map = new Map<string, number>();
  const buckets = ((result.facets ?? {}) as Record<string, { value?: unknown; count?: number }[]>)["equipment"] ?? [];
  for (const b of buckets) {
    map.set(String(b.value ?? "Unknown"), b.count ?? 0);
  }
  return map;
}

export async function POST(req: NextRequest) {
  let body: {
    window_days?: number;    // default 90
    min_recent?: number;     // minimum recent failures to flag (default 2)
    min_change_pct?: number; // minimum % increase to flag (default 50)
    line?: string;
    group?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const windowDays = body.window_days ?? 90;
  const minRecent = body.min_recent ?? 2;
  const minChangePct = body.min_change_pct ?? 50;

  const now = Math.floor(Date.now() / 1000);
  const windowSec = windowDays * 86400;

  const recentFrom = now - windowSec;
  const recentTo = now;
  const priorFrom = recentFrom - 365 * 86400;
  const priorTo = recentTo - 365 * 86400;

  const extraFilters: string[] = [];
  if (body.line) extraFilters.push(`line eq '${body.line.replace(/'/g, "''")}'`);
  if (body.group) extraFilters.push(`group eq '${body.group.replace(/'/g, "''")}'`);
  const extraFilter = extraFilters.join(" and ") || undefined;

  try {
    const sc = getSc();
    const [recentMap, priorMap] = await Promise.all([
      countByEquipment(sc, recentFrom, recentTo, extraFilter),
      countByEquipment(sc, priorFrom, priorTo, extraFilter),
    ]);

    const results: AnomalyResult[] = [];
    for (const [equipment, recentCount] of recentMap) {
      if (recentCount < minRecent) continue;
      const priorCount = priorMap.get(equipment) ?? 0;

      if (priorCount === 0) {
        // New pattern — no prior history
        results.push({ equipment, recent_count: recentCount, prior_count: 0, change_pct: null, is_new: true });
        continue;
      }

      const changePct = ((recentCount - priorCount) / priorCount) * 100;
      if (changePct >= minChangePct) {
        results.push({ equipment, recent_count: recentCount, prior_count: priorCount, change_pct: Math.round(changePct), is_new: false });
      }
    }

    // Sort by absolute recent count desc (most active anomalies first)
    results.sort((a, b) => b.recent_count - a.recent_count);

    return NextResponse.json({ results, window_days: windowDays });
  } catch (err) {
    console.error("anomaly route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
