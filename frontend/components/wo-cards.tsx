"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { type WorkOrder } from "@/lib/api";

interface WoCardsProps {
  workOrders: WorkOrder[];
  onSelect?: (wo: WorkOrder) => void;
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 font-medium" style={{ color: "var(--c-text-3)" }}>{label}</span>
      <span style={{ color: "var(--c-text)" }}>{value}</span>
    </div>
  );
}

export function WoModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--c-overlay)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6"
        style={{ backgroundColor: "var(--c-card-alt)", border: "1px solid var(--c-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors hover:opacity-70"
          style={{ color: "var(--c-text-3)", backgroundColor: "var(--c-surface-2)" }}
        >
          <X size={18} />
        </button>

        <div className="mb-4">
          <p className="text-xs font-medium mb-1" style={{ color: "var(--c-wo)" }}>WORK ORDER</p>
          <h2 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>
            #{wo.wo_no}
          </h2>
        </div>

        <div
          className="rounded-xl p-4 mb-4 space-y-2"
          style={{ backgroundColor: "var(--c-bg)", border: "1px solid var(--c-border)" }}
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
            <p className="text-xs font-medium mb-2" style={{ color: "var(--c-text-3)" }}>DESCRIPTION</p>
            <div
              className="rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed"
              style={{
                backgroundColor: "var(--c-card)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text)",
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

export function WoCards({ workOrders, onSelect }: WoCardsProps) {
  const [internalSelected, setInternalSelected] = useState<WorkOrder | null>(null);
  const handleSelect = onSelect ?? setInternalSelected;

  if (!workOrders || workOrders.length === 0) return null;

  return (
    <>
      <details className="mt-3">
        <summary
          className="text-xs cursor-pointer select-none"
          style={{ color: "var(--c-text-3)" }}
        >
          📋 {workOrders.length} work order{workOrders.length !== 1 ? "s" : ""} cited — click to expand
        </summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {workOrders.map((wo, idx) => (
            <button
              key={wo.wo_no ?? idx}
              onClick={() => handleSelect(wo)}
              className="text-left rounded-xl border p-3 text-sm transition-colors hover:shadow-sm"
              style={{ backgroundColor: "var(--c-card)", borderColor: "var(--c-border)" }}
            >
              <div className="font-semibold mb-1 truncate" style={{ color: "var(--c-text)" }}>
                {wo.equipment}
              </div>
              <div className="space-y-0.5">
                <div style={{ color: "var(--c-text-3)" }}>
                  <span className="font-medium">WO#:</span> {wo.wo_no}
                </div>
                <div style={{ color: "var(--c-text-3)" }}>
                  <span className="font-medium">Date:</span> {wo.date}
                </div>
                <div style={{ color: "var(--c-text-3)" }}>
                  <span className="font-medium">Tech:</span> {wo.technician}
                </div>
                <div style={{ color: "var(--c-text-3)" }}>
                  <span className="font-medium">Type:</span> {wo.maint_type}
                </div>
              </div>
              <div className="mt-2 text-xs" style={{ color: "var(--c-wo)" }}>
                View full work order →
              </div>
            </button>
          ))}
        </div>
      </details>

      {!onSelect && internalSelected && (
        <WoModal wo={internalSelected} onClose={() => setInternalSelected(null)} />
      )}
    </>
  );
}
