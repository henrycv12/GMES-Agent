export interface WorkOrder {
  wo_no: string;
  date: string;
  technician: string;
  equipment: string;
  maint_type: string;
  line: string;
  group?: string;
  source?: string;
  content?: string;
}

export interface QueryResponse {
  answer: string;
  work_orders: WorkOrder[];
  query_used: string;
  card: string;
}

export interface AnalyticsResult {
  [key: string]: string | number;
  count: number;
}

export interface AnalyticsResponse {
  results: AnalyticsResult[];
}

type HistoryMessage = { role: "user" | "assistant"; content: string };

const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const key = process.env.NEXT_PUBLIC_FUNCTION_KEY;
  if (key) {
    headers["x-functions-key"] = key;
  }
  return headers;
};

export async function queryWorkOrders(params: {
  question: string;
  history: HistoryMessage[];
}): Promise<QueryResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/query`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Query failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<QueryResponse>;
}

export interface AnalyticsParams {
  group_by: string;
  date_from?: string;
  date_to?: string;
  top_n?: number;
  filter?: string;
  compare_lines?: boolean;
  time_group?: string;
}

export async function queryAnalytics(
  params: AnalyticsParams
): Promise<AnalyticsResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/analytics`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Analytics failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AnalyticsResponse>;
}
