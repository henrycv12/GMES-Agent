import { NextRequest, NextResponse } from "next/server";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT!;
const SEARCH_KEY = process.env.AZURE_SEARCH_KEY!;
const SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX ?? "work-orders";

interface WOAnalyticsDoc {
  wo_no: string;
  date: string;
  date_ts: number;
  equipment: string;
  line: string;
  maint_type: string;
  technician: string;
  group: string;
}

let _sc: SearchClient<WOAnalyticsDoc> | null = null;
function getSc(): SearchClient<WOAnalyticsDoc> {
  if (!_sc) {
    _sc = new SearchClient<WOAnalyticsDoc>(
      SEARCH_ENDPOINT,
      SEARCH_INDEX,
      new AzureKeyCredential(SEARCH_KEY)
    );
  }
  return _sc;
}

function getTimePeriodKey(dateTs: number, timeGroup: string): string {
  const dt = new Date(dateTs * 1000);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  if (timeGroup === "week") {
    const start = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((dt.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (timeGroup === "month") return `${year}-${String(month).padStart(2, "0")}`;
  if (timeGroup === "quarter") return `${year}-Q${Math.ceil(month / 3)}`;
  return dt.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  let body: {
    group_by?: string | string[];
    date_from?: string;
    date_to?: string;
    top_n?: number;
    filter?: string;
    compare_lines?: string[];
    time_group?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let groupBy = body.group_by ?? "line";
  const dateFrom = body.date_from;
  const dateTo = body.date_to;
  const topN = body.top_n ?? 10;
  const filterText = body.filter ?? "";
  const compareLines: string[] = body.compare_lines ?? [];
  const timeGroup = body.time_group ?? null;

  // Parse + validate dates
  let tsFrom: number | null = null;
  let tsTo: number | null = null;
  try {
    if (dateFrom) tsFrom = Math.floor(new Date(dateFrom).getTime() / 1000);
    if (dateTo) tsTo = Math.floor(new Date(dateTo).getTime() / 1000);
  } catch (err) {
    return NextResponse.json({ error: `Invalid date format: ${err}` }, { status: 400 });
  }

  // Build OData filter
  const filters: string[] = [];
  if (tsFrom !== null) filters.push(`date_ts ge ${tsFrom}`);
  if (tsTo !== null) filters.push(`date_ts le ${tsTo}`);
  if (compareLines.length) {
    const escaped = compareLines.map((l) => l.replace(/'/g, "''"));
    filters.push(`(${escaped.map((l) => `line eq '${l}'`).join(" or ")})`);
  }
  const filterQuery = filters.length ? filters.join(" and ") : undefined;

  // Normalize group_by to array
  const groupByFields: string[] = Array.isArray(groupBy) ? groupBy : [groupBy];

  try {
    const sc = getSc();
    const allDocs: WOAnalyticsDoc[] = [];
    let skip = 0;
    const pageSize = 1000;

    while (true) {
      const pageIter = await sc.search(filterText || "*", {
        filter: filterQuery,
        top: pageSize,
        skip,
        select: ["wo_no", "date", "date_ts", "equipment", "line", "maint_type", "technician", "group"],
      });
      const page: WOAnalyticsDoc[] = [];
      for await (const r of pageIter.results) {
        page.push(r.document);
      }
      allDocs.push(...page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    // Client-side aggregation
    const counts = new Map<string, number>();
    for (const doc of allDocs) {
      const parts: string[] = [];
      if (timeGroup && doc.date_ts) {
        parts.push(getTimePeriodKey(doc.date_ts, timeGroup));
      }
      for (const field of groupByFields) {
        parts.push(String((doc as Record<string, unknown>)[field] ?? "Unknown"));
      }
      const key = JSON.stringify(parts);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const results = sorted.map(([keyStr, count]) => {
      const parts: string[] = JSON.parse(keyStr);
      const result: Record<string, string | number> = {};
      let offset = 0;
      if (timeGroup) {
        result["time_period"] = parts[0];
        offset = 1;
      }
      for (let i = 0; i < groupByFields.length; i++) {
        result[groupByFields[i]] = parts[offset + i];
      }
      result["count"] = count;
      return result;
    });

    return NextResponse.json({
      group_by: groupByFields,
      date_from: dateFrom,
      date_to: dateTo,
      filter: filterText,
      compare_lines: compareLines,
      time_group: timeGroup,
      results,
    });
  } catch (err) {
    console.error("analytics route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
