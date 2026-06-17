"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { type WorkOrder } from "@/lib/api";

interface WoCardsProps {
  workOrders: WorkOrder[];
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 font-medium" style={{ color: "#7A7568" }}>{label}</span>
      <span style={{ color: "#1A1A1A" }}>{value}</span>
    </div>
  );
}

function WoModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6"
        style={{ backgroundColor: "#FAFAF7", border: "1px solid #E0DDD5" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-[#EDE9DF] transition-colors"
          style={{ color: "#7A7568" }}
        >
          <X size={18} />
        </button>

        <div className="mb-4">
          <p className="text-xs font-medium mb-1" style={{ color: "#A8785A" }}>WORK ORDER</p>
          <h2 className="text-xl font-bold" style={{ color: "#1A1A1A" }}>
            #{wo.wo_no}
          </h2>
        </div>

        <div
          className="rounded-xl p-4 mb-4 space-y-2"
          style={{ backgroundColor: "#F5F3EE", border: "1px solid #E0DDD5" }}
        >
          <Field label="Equipment" value={wo.equipment} />
          <Field label="Date" value={wo.date} />
          <Field label="Technician" value={wo.technician} />
          <Field label="Line" value={wo.line} />
          <Field label="Group" value={wo.group} />
          <Field label="Type" value={wo.maint_type} />
          <Field label="Source" value={wo.source} />
        </div>

        {wo.content && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "#7A7568" }}>DESCRIPTION</p>
            <div
              className="rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #E0DDD5",
                color: "#1A1A1A",
              }}
            >
              {wo.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WoCards({ workOrders }: WoCardsProps) {
  const [selected, setSelected] = useState<WorkOrder | null>(null);

  if (!workOrders || workOrders.length === 0) return null;

  return (
    <>
      <details className="mt-3">
        <summary
          className="text-xs cursor-pointer select-none"
          style={{ color: "#7A7568" }}
        >
          📋 {workOrders.length} work order{workOrders.length !== 1 ? "s" : ""} referenced — click to expand
        </summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {workOrders.map((wo, idx) => (
            <button
              key={wo.wo_no ?? idx}
              onClick={() => setSelected(wo)}
              className="text-left rounded-xl border p-3 text-sm transition-colors hover:border-[#A8785A] hover:shadow-sm"
              style={{ backgroundColor: "#ffffff", borderColor: "#E0DDD5" }}
            >
              <div className="font-semibold mb-1 truncate" style={{ color: "#1A1A1A" }}>
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
                  <span className="font-medium">Tech:</span> {wo.technician}
                </div>
                <div style={{ color: "#7A7568" }}>
                  <span className="font-medium">Type:</span> {wo.maint_type}
                </div>
              </div>
              <div className="mt-2 text-xs" style={{ color: "#A8785A" }}>
                View full work order →
              </div>
            </button>
          ))}
        </div>
      </details>

      {selected && <WoModal wo={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
