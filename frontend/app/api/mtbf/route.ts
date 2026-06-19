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

export interface MtbfResult {
  equipment: string;
  failure_count: number;
  mtbf_days: number | null;
  first_failure: string;
  last_failure: string;
}

export async function POST(req: NextRequest) {
  let body: {
    equipment?: string;
    line?: string;
    group?: string;
    date_from?: string;
    date_to?: string;
    top_equipment?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filters: string[] = [];
  try {
    if (body.date_from)
      filters.push(`date_ts ge ${Math.floor(new Date(body.date_from).getTime() / 1000)}`);
    if (body.date_to)
      filters.push(`date_ts le ${Math.floor(new Date(body.date_to).getTime() / 1000)}`);
    if (body.line) filters.push(`line eq '${body.line.replace(/'/g, "''")}'`);
    if (body.group) filters.push(`group eq '${body.group.replace(/'/g, "''")}'`);
    if (body.equipment) filters.push(`equipment eq '${body.equipment.replace(/'/g, "''")}'`);
  } catch (err) {
    return NextResponse.json({ error: `Filter error: ${err}` }, { status: 400 });
  }
  const filterQuery = filters.length ? filters.join(" and ") : undefined;

  try {
    const sc = getSc();
    // Fetch up to 1000 docs (free tier limit), sorted oldest→newest so intervals are positive.
    // We only need equipment and date_ts — select minimal fields.
    const searchResult = await sc.search("*", {
      filter: filterQuery,
      top: 1000,
      orderBy: ["date_ts asc"],
      select: ["equipment", "date_ts", "date"],
    });

    // Group date_ts values by equipment
    const map = new Map<string, { ts: number; date: string }[]>();
    for await (const r of searchResult.results) {
      const doc = r.document;
      const equip = String(doc.equipment ?? "Unknown").trim() || "Unknown";
      const ts = typeof doc.date_ts === "number" ? (doc.date_ts as number) : 0;
      const date = String(doc.date ?? "—");
      if (!map.has(equip)) map.set(equip, []);
      map.get(equip)!.push({ ts, date });
    }

    const results: MtbfResult[] = [];
    for (const [equipment, events] of map) {
      const sorted = events.sort((a, b) => a.ts - b.ts);
      const count = sorted.length;
      let mtbf_days: number | null = null;
      if (count >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const diffDays = (sorted[i].ts - sorted[i - 1].ts) / 86400;
          if (diffDays > 0) gaps.push(diffDays);
        }
        if (gaps.length > 0) {
          mtbf_days = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }
      }
      results.push({
        equipment,
        failure_count: count,
        mtbf_days,
        first_failure: sorted[0].date,
        last_failure: sorted[sorted.length - 1].date,
      });
    }

    // Sort by MTBF ascending (shortest MTBF = most frequent failures = most attention needed)
    results.sort((a, b) => {
      if (a.mtbf_days === null && b.mtbf_days === null) return b.failure_count - a.failure_count;
      if (a.mtbf_days === null) return 1;
      if (b.mtbf_days === null) return -1;
      return a.mtbf_days - b.mtbf_days;
    });

    const topN = Math.min(body.top_equipment ?? 20, results.length);
    return NextResponse.json({ results: results.slice(0, topN) });
  } catch (err) {
    console.error("mtbf route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
