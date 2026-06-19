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

export async function POST(req: NextRequest) {
  let body: {
    group_by?: string;
    date_from?: string;
    date_to?: string;
    top_n?: number;
    filter?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupBy = typeof body.group_by === "string" ? body.group_by : "line";
  const dateFrom = body.date_from;
  const dateTo = body.date_to;
  const topN = Math.min(body.top_n ?? 10, 1000);
  const filterText = body.filter ?? "";

  // Build OData date-range filter
  const filters: string[] = [];
  try {
    if (dateFrom) filters.push(`date_ts ge ${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
    if (dateTo)   filters.push(`date_ts le ${Math.floor(new Date(dateTo).getTime() / 1000)}`);
  } catch (err) {
    return NextResponse.json({ error: `Invalid date: ${err}` }, { status: 400 });
  }
  const filterQuery = filters.length ? filters.join(" and ") : undefined;

  try {
    const sc = getSc();

    // Single facet call — server-side aggregation, no pagination needed.
    // Requires the field to have facetable=True in the index schema.
    const searchResult = await sc.search(filterText || "*", {
      filter: filterQuery,
      top: 0,
      facets: [`${groupBy},count:${topN},sort:count`],
    });

    // Consume the (empty) results iterator so the SDK populates .facets
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of searchResult.results) { /* top=0, nothing here */ }

    const buckets = ((searchResult.facets ?? {}) as Record<string, { value?: unknown; count?: number }[]>)[groupBy] ?? [];

    const results = buckets.map((b) => ({
      [groupBy]: String(b.value ?? "Unknown"),
      count: b.count ?? 0,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("analytics route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
