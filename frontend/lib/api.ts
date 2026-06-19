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
  suggestions?: string[];
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

export interface MtbfResult {
  equipment: string;
  failure_count: number;
  mtbf_days: number | null;
  first_failure: string;
  last_failure: string;
}

export interface MtbfParams {
  equipment?: string;
  line?: string;
  group?: string;
  date_from?: string;
  date_to?: string;
  top_equipment?: number;
}

export async function queryMtbf(params: MtbfParams): Promise<{ results: MtbfResult[] }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/mtbf`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MTBF failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json() as Promise<{ results: MtbfResult[] }>;
}

export interface AnomalyResult {
  equipment: string;
  recent_count: number;
  prior_count: number;
  change_pct: number | null;
  is_new: boolean;
}

export interface AnomalyParams {
  window_days?: number;
  min_recent?: number;
  min_change_pct?: number;
  line?: string;
  group?: string;
}

export async function queryAnomaly(params: AnomalyParams): Promise<{ results: AnomalyResult[]; window_days: number }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/anomaly`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anomaly failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json() as Promise<{ results: AnomalyResult[]; window_days: number }>;
}

export interface ExtractionGroup {
  label: string;
  count: number;
}

export interface ExtractParams {
  query?: string;
  equipment?: string;
  top?: number;
  date_from?: string;
  date_to?: string;
}

export interface ExtractResponse {
  total_analyzed: number;
  by_root_cause: ExtractionGroup[];
  by_failure_mode: ExtractionGroup[];
  by_component: ExtractionGroup[];
}

export async function queryExtract(params: ExtractParams): Promise<ExtractResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/extract`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Extract failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json() as Promise<ExtractResponse>;
}
