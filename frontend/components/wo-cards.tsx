"use client";

import { type WorkOrder } from "@/lib/api";

interface WoCardsProps {
  workOrders: WorkOrder[];
}

export function WoCards({ workOrders }: WoCardsProps) {
  if (!workOrders || workOrders.length === 0) return null;

  return (
    <details className="mt-3">
      <summary
        className="text-xs cursor-pointer select-none"
        style={{ color: "#7A7568" }}
      >
        📋 {workOrders.length} work order{workOrders.length !== 1 ? "s" : ""} referenced
      </summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {workOrders.map((wo, idx) => (
          <div
            key={wo.wo_no ?? idx}
            className="bg-white rounded-xl border p-3 text-sm"
            style={{ borderColor: "#E0DDD5" }}
          >
            <div className="font-semibold mb-1" style={{ color: "#1A1A1A" }}>
              {wo.equipment}
            </div>
            <div className="space-y-0.5">
              <div style={{ color: "#7A7568" }}>
                <span className="font-medium">WO#:</span> {wo.wo_no}
              </div>
              <div style={{ color: "#7A7568" }}>
                <span className="font-medium">Date:</span> {wo.date}
              </div>
              <div style={{ color: "#7A7568" }}>
                <span className="font-medium">Line:</span> {wo.line}
              </div>
              <div style={{ color: "#7A7568" }}>
                <span className="font-medium">Tech:</span> {wo.technician}
              </div>
              <div style={{ color: "#7A7568" }}>
                <span className="font-medium">Type:</span> {wo.maint_type}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
