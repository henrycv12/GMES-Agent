"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { queryAnalytics, queryMtbf, queryAnomaly, queryExtract, type AnalyticsResult, type MtbfResult, type AnomalyResult, type ExtractionGroup } from "@/lib/api";

const GROUP_OPTIONS = [
  { value: "line", label: "Line" },
  { value: "equipment", label: "Equipment" },
  { value: "maint_type", label: "Maint Type" },
  { value: "group", label: "Group" },
];

// Shared input / select styles
const inputStyle = { borderColor: "var(--c-border-input)", color: "var(--c-text)", backgroundColor: "var(--c-card)" };
const cardStyle = { backgroundColor: "var(--c-card)", borderColor: "var(--c-border)" };
const mutedStyle = { color: "var(--c-text-3)" };
const dimStyle = { color: "var(--c-text-4)" };
const textStyle = { color: "var(--c-text)" };
const brandStyle = { color: "var(--c-brand)" };
const borderStyle = { borderColor: "var(--c-border)" };
const headerRowStyle = { backgroundColor: "var(--c-surface-1)" };
const tabBgStyle = { backgroundColor: "var(--c-surface-1)" };

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={cardStyle}>
      <div className="text-xs font-medium" style={mutedStyle}>{label}</div>
      <div className="text-xl font-bold" style={textStyle}>{value}</div>
    </div>
  );
}

function MtbfBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={dimStyle}>—</span>;
  const color = days < 30 ? "#DC2626" : days < 90 ? "#D97706" : "#16A34A";
  return <span style={{ color, fontWeight: 600 }}>{days}d</span>;
}

function CtrlInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={mutedStyle}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "rounded-lg border px-3 py-1.5 text-sm";

// ---------------------------------------------------------------------------
// Work Orders Tab
// ---------------------------------------------------------------------------
function WorkOrdersTab() {
  const [groupBy, setGroupBy] = useState("line");
  const [topN, setTopN] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<AnalyticsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await queryAnalytics({ group_by: groupBy, top_n: topN, date_from: dateFrom || undefined, date_to: dateTo || undefined, filter: keyword || undefined });
      setResults(data.results ?? []);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalCount = results.reduce((s, r) => s + (r.count ?? 0), 0);
  const topResult = results[0];
  const topLabel = topResult ? String(topResult[groupBy] ?? topResult["name"] ?? "—") : "—";
  const topCount = topResult ? topResult.count : 0;
  const groupLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy;
  const chartData = results.map((r) => ({ name: String(r[groupBy] ?? r["name"] ?? "Unknown"), count: r.count }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4" style={cardStyle}>
        <div className="flex flex-wrap gap-3 items-end">
          <CtrlInput label="Group by">
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={inputCls} style={inputStyle}>
              {GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </CtrlInput>
          <CtrlInput label="Top N">
            <input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value))} min={1} max={100} className={`${inputCls} w-20`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Keyword">
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Filter..." className={`${inputCls} w-32`} style={inputStyle} />
          </CtrlInput>
          <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50" style={{ backgroundColor: "var(--c-brand)" }}>
            {loading ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border p-4 text-sm" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}>{error}</div>}

      {hasRun && results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Work Orders" value={totalCount} />
            <MetricCard label={`Top ${groupLabel}`} value={topLabel} />
            <MetricCard label="WOs (top)" value={topCount} />
          </div>

          <div className="rounded-xl border p-4" style={cardStyle}>
            <h2 className="text-sm font-semibold mb-4" style={textStyle}>Work Orders by {groupLabel}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--c-text-3)" }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "var(--c-text-3)" }} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid var(--c-border)", fontSize: "12px", backgroundColor: "var(--c-card)", color: "var(--c-text)" }} />
                <Bar dataKey="count" fill="var(--c-brand)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border overflow-hidden" style={borderStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={headerRowStyle}>
                  <th className="text-left px-4 py-2 font-medium" style={mutedStyle}>{groupLabel}</th>
                  <th className="text-right px-4 py-2 font-medium" style={mutedStyle}>Count</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} className="border-t" style={borderStyle}>
                    <td className="px-4 py-2" style={textStyle}>{String(r[groupBy] ?? r["name"] ?? "—")}</td>
                    <td className="px-4 py-2 text-right font-medium" style={brandStyle}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasRun && results.length === 0 && !loading && (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ ...cardStyle, ...mutedStyle }}>No results found for the selected filters.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MTBF Tab
// ---------------------------------------------------------------------------
function MtbfTab() {
  const [line, setLine] = useState("");
  const [group, setGroup] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [topN, setTopN] = useState(20);
  const [results, setResults] = useState<MtbfResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await queryMtbf({ line: line || undefined, group: group || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, top_equipment: topN });
      setResults(data.results ?? []);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const withMtbf = results.filter((r) => r.mtbf_days !== null);
  const avgMtbf = withMtbf.length ? Math.round(withMtbf.reduce((s, r) => s + (r.mtbf_days ?? 0), 0) / withMtbf.length) : null;
  const shortest = withMtbf[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4" style={cardStyle}>
        <div className="flex flex-wrap gap-3 items-end">
          <CtrlInput label="Line">
            <input type="text" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. L1" className={`${inputCls} w-24`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Group">
            <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. EPS" className={`${inputCls} w-28`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Top N equipment">
            <input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value))} min={1} max={100} className={`${inputCls} w-20`} style={inputStyle} />
          </CtrlInput>
          <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "var(--c-brand)" }}>
            {loading ? "Calculating..." : "Run"}
          </button>
        </div>
        <p className="text-xs mt-3" style={dimStyle}>
          MTBF = average days between consecutive work orders for the same equipment. Sorted shortest first. Red &lt;30d · Amber &lt;90d · Green ≥90d
        </p>
      </div>

      {error && <div className="rounded-xl border p-4 text-sm" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}>{error}</div>}

      {hasRun && results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Equipment tracked" value={results.length} />
            <MetricCard label="Most frequent failures" value={shortest ? shortest.equipment : "—"} />
            <MetricCard label="Avg MTBF" value={avgMtbf !== null ? `${avgMtbf}d` : "—"} />
          </div>

          <div className="rounded-xl border overflow-hidden" style={borderStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={headerRowStyle}>
                  <th className="text-left px-4 py-2.5 font-medium" style={mutedStyle}>Equipment</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>Failures</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>MTBF</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>First</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>Last</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} className="border-t" style={borderStyle}>
                    <td className="px-4 py-2 font-medium" style={textStyle}>{r.equipment}</td>
                    <td className="px-4 py-2 text-right" style={mutedStyle}>{r.failure_count}</td>
                    <td className="px-4 py-2 text-right"><MtbfBadge days={r.mtbf_days} /></td>
                    <td className="px-4 py-2 text-right text-[11px]" style={dimStyle}>{r.first_failure}</td>
                    <td className="px-4 py-2 text-right text-[11px]" style={dimStyle}>{r.last_failure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasRun && results.length === 0 && !loading && (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ ...cardStyle, ...mutedStyle }}>No results found.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anomaly Tab
// ---------------------------------------------------------------------------
function AnomalyTab() {
  const [windowDays, setWindowDays] = useState(90);
  const [minRecent, setMinRecent] = useState(2);
  const [minChangePct, setMinChangePct] = useState(50);
  const [line, setLine] = useState("");
  const [group, setGroup] = useState("");
  const [results, setResults] = useState<AnomalyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [actualWindow, setActualWindow] = useState(90);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await queryAnomaly({ window_days: windowDays, min_recent: minRecent, min_change_pct: minChangePct, line: line || undefined, group: group || undefined });
      setResults(data.results ?? []);
      setActualWindow(data.window_days);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const newPatterns = results.filter((r) => r.is_new);
  const rising = results.filter((r) => !r.is_new);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4" style={cardStyle}>
        <div className="flex flex-wrap gap-3 items-end">
          <CtrlInput label="Window (days)">
            <input type="number" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} min={7} max={365} className={`${inputCls} w-24`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Min failures">
            <input type="number" value={minRecent} onChange={(e) => setMinRecent(Number(e.target.value))} min={1} max={50} className={`${inputCls} w-20`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Min increase %">
            <input type="number" value={minChangePct} onChange={(e) => setMinChangePct(Number(e.target.value))} min={0} max={1000} className={`${inputCls} w-24`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Line">
            <input type="text" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. L1" className={`${inputCls} w-24`} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="Group">
            <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. EPS" className={`${inputCls} w-28`} style={inputStyle} />
          </CtrlInput>
          <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "var(--c-brand)" }}>
            {loading ? "Scanning..." : "Run"}
          </button>
        </div>
        <p className="text-xs mt-3" style={dimStyle}>
          Compares failure count in the last {windowDays} days vs. the same window one year ago. Flags rising rates and new failure patterns.
        </p>
      </div>

      {error && <div className="rounded-xl border p-4 text-sm" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}>{error}</div>}

      {hasRun && results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Anomalies detected" value={results.length} />
            <MetricCard label="Rising failure rate" value={rising.length} />
            <MetricCard label="New failure patterns" value={newPatterns.length} />
          </div>

          <div className="rounded-xl border overflow-hidden" style={borderStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={headerRowStyle}>
                  <th className="text-left px-4 py-2.5 font-medium" style={mutedStyle}>Equipment</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>Recent ({actualWindow}d)</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>Prior year</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={mutedStyle}>Change</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => {
                  const changeEl = r.is_new
                    ? <span style={{ color: "#7C3AED", fontWeight: 600 }}>NEW</span>
                    : <span style={{ color: "#DC2626", fontWeight: 600 }}>+{r.change_pct}%</span>;
                  return (
                    <tr key={idx} className="border-t" style={borderStyle}>
                      <td className="px-4 py-2 font-medium" style={textStyle}>{r.equipment}</td>
                      <td className="px-4 py-2 text-right font-semibold" style={brandStyle}>{r.recent_count}</td>
                      <td className="px-4 py-2 text-right" style={mutedStyle}>{r.prior_count}</td>
                      <td className="px-4 py-2 text-right">{changeEl}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasRun && results.length === 0 && !loading && (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ ...cardStyle, ...mutedStyle }}>No anomalies detected with the current thresholds.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failure Analysis Tab
// ---------------------------------------------------------------------------
function TagTable({ title, rows }: { title: string; rows: ExtractionGroup[] }) {
  if (!rows.length) return null;
  const max = rows[0]?.count ?? 1;
  return (
    <div className="rounded-xl border overflow-hidden" style={borderStyle}>
      <div className="px-4 py-2.5 text-sm font-semibold" style={{ ...headerRowStyle, ...textStyle }}>{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-t" style={borderStyle}>
              <td className="px-4 py-2 w-44" style={textStyle}>{r.label}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "var(--c-surface-1)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: "var(--c-brand)" }} />
                  </div>
                  <span className="text-right w-6 font-medium" style={brandStyle}>{r.count}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureAnalysisTab() {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [top, setTop] = useState(30);
  const [result, setResult] = useState<{ total_analyzed: number; by_root_cause: ExtractionGroup[]; by_failure_mode: ExtractionGroup[]; by_component: ExtractionGroup[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await queryExtract({ query: query.trim(), top, date_from: dateFrom || undefined, date_to: dateTo || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4" style={cardStyle}>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <label className="text-xs font-medium" style={mutedStyle}>Equipment / query</label>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRun()}
              placeholder="e.g. EPS vacuum pump, diverter, Line 3..." className={inputCls} style={inputStyle} />
          </div>
          <CtrlInput label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} style={inputStyle} />
          </CtrlInput>
          <CtrlInput label="WOs to analyze">
            <input type="number" value={top} onChange={(e) => setTop(Number(e.target.value))} min={5} max={50} className={`${inputCls} w-20`} style={inputStyle} />
          </CtrlInput>
          <button onClick={handleRun} disabled={loading || !query.trim()} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "var(--c-brand)" }}>
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
        <p className="text-xs mt-3" style={dimStyle}>
          Uses LLM to classify each retrieved work order by root cause, failure mode, and component. Takes ~5–15s for 30 WOs.
        </p>
      </div>

      {error && <div className="rounded-xl border p-4 text-sm" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}>{error}</div>}

      {result && (
        <>
          <div className="rounded-xl border p-3 text-xs" style={{ ...cardStyle, ...mutedStyle }}>
            Analyzed <strong style={textStyle}>{result.total_analyzed}</strong> work orders
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TagTable title="Root Cause" rows={result.by_root_cause} />
            <TagTable title="Failure Mode" rows={result.by_failure_mode} />
            <TagTable title="Component" rows={result.by_component} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Tab = "workorders" | "mtbf" | "anomaly" | "failures";

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("workorders");

  return (
    <div className="h-full overflow-y-auto p-6" style={{ backgroundColor: "var(--c-bg)" }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={textStyle}>Analytics</h1>
          <p className="text-sm mt-1" style={mutedStyle}>Aggregate work order data by various dimensions</p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl w-fit" style={tabBgStyle}>
          {([
            { id: "workorders", label: "Work Orders" },
            { id: "mtbf", label: "MTBF" },
            { id: "anomaly", label: "Anomalies" },
            { id: "failures", label: "Failure Analysis" },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={tab === id
                ? { backgroundColor: "var(--c-card)", color: "var(--c-text)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                : { color: "var(--c-text-3)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "workorders" && <WorkOrdersTab />}
        {tab === "mtbf" && <MtbfTab />}
        {tab === "anomaly" && <AnomalyTab />}
        {tab === "failures" && <FailureAnalysisTab />}
      </div>
    </div>
  );
}
