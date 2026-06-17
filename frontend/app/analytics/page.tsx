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
import { queryAnalytics, type AnalyticsResult } from "@/lib/api";

const GROUP_OPTIONS = [
  { value: "line", label: "Line" },
  { value: "equipment", label: "Equipment" },
  { value: "maint_type", label: "Maint Type" },
  { value: "group", label: "Group" },
];

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-1"
      style={{ backgroundColor: "#ffffff", borderColor: "#E0DDD5" }}
    >
      <div className="text-xs font-medium" style={{ color: "#7A7568" }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: "#1A1A1A" }}>
        {value}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
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
      const data = await queryAnalytics({
        group_by: groupBy,
        top_n: topN,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        filter: keyword || undefined,
      });
      setResults(data.results ?? []);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalCount = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const topResult = results[0];
  const topLabel = topResult ? String(topResult[groupBy] ?? topResult["name"] ?? "—") : "—";
  const topCount = topResult ? topResult.count : 0;
  const groupLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy;

  const chartData = results.map((r) => ({
    name: String(r[groupBy] ?? r["name"] ?? "Unknown"),
    count: r.count,
  }));

  return (
    <div
      className="h-full overflow-y-auto p-6"
      style={{ backgroundColor: "#F5F4EF" }}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#1A1A1A" }}>
            Analytics
          </h1>
          <p className="text-sm mt-1" style={{ color: "#7A7568" }}>
            Aggregate work order data by various dimensions
          </p>
        </div>

        {/* Controls */}
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: "#ffffff", borderColor: "#E0DDD5" }}
        >
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#7A7568" }}>
                Group by
              </label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "#D0CCC0", color: "#1A1A1A" }}
              >
                {GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#7A7568" }}>
                Top N
              </label>
              <input
                type="number"
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                min={1}
                max={100}
                className="rounded-lg border px-3 py-1.5 text-sm w-20"
                style={{ borderColor: "#D0CCC0", color: "#1A1A1A" }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#7A7568" }}>
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "#D0CCC0", color: "#1A1A1A" }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#7A7568" }}>
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "#D0CCC0", color: "#1A1A1A" }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#7A7568" }}>
                Keyword
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Filter..."
                className="rounded-lg border px-3 py-1.5 text-sm w-32"
                style={{ borderColor: "#D0CCC0", color: "#1A1A1A" }}
              />
            </div>

            <button
              onClick={handleRun}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#CC785C" }}
            >
              {loading ? "Running..." : "Run"}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl border p-4 text-sm"
            style={{
              backgroundColor: "#FEF2F2",
              borderColor: "#FECACA",
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        )}

        {hasRun && results.length > 0 && (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="Work Orders" value={totalCount} />
              <MetricCard label={`Top ${groupLabel}`} value={topLabel} />
              <MetricCard label="WOs (top)" value={topCount} />
            </div>

            {/* Bar Chart */}
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: "#ffffff", borderColor: "#E0DDD5" }}
            >
              <h2 className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>
                Work Orders by {groupLabel}
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#7A7568" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: "#7A7568" }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #E0DDD5",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="#CC785C" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data Table */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "#E0DDD5" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#EEECE3" }}>
                    <th
                      className="text-left px-4 py-2 font-medium"
                      style={{ color: "#7A7568" }}
                    >
                      {groupLabel}
                    </th>
                    <th
                      className="text-right px-4 py-2 font-medium"
                      style={{ color: "#7A7568" }}
                    >
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-t"
                      style={{ borderColor: "#E0DDD5" }}
                    >
                      <td className="px-4 py-2" style={{ color: "#1A1A1A" }}>
                        {String(r[groupBy] ?? r["name"] ?? "—")}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-medium"
                        style={{ color: "#CC785C" }}
                      >
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {hasRun && results.length === 0 && !loading && (
          <div
            className="rounded-xl border p-8 text-center text-sm"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#E0DDD5",
              color: "#7A7568",
            }}
          >
            No results found for the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
