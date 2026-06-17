"use client";

import { useContext } from "react";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { GmesContext } from "@/components/runtime-provider";

function formatDate(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChatSidebar() {
  const { conversations, activeId, newConversation, switchConversation, deleteConversation } =
    useContext(GmesContext);

  return (
    <div
      className="flex flex-col w-56 shrink-0 border-r h-full"
      style={{ backgroundColor: "#F5F3EE", borderColor: "#E0DDD5" }}
    >
      <div className="p-3 border-b" style={{ borderColor: "#E0DDD5" }}>
        <button
          onClick={newConversation}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[#EDE9DF]"
          style={{ color: "#1A1A1A" }}
        >
          <Plus size={15} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {conversations.length === 0 && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: "#A09990" }}>
            No conversations yet
          </div>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <div
              key={conv.id}
              className="group flex items-start gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-colors"
              style={{ backgroundColor: isActive ? "#EDE9DF" : "transparent" }}
              onClick={() => switchConversation(conv.id)}
            >
              <MessageSquare
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: isActive ? "#A8785A" : "#A09990" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-medium truncate leading-snug"
                  style={{ color: isActive ? "#1A1A1A" : "#4A4540" }}
                >
                  {conv.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#A09990" }}>
                  {formatDate(conv.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#DDD9D0] transition-all shrink-0 mt-0.5"
                style={{ color: "#7A7568" }}
                title="Delete conversation"
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t text-xs" style={{ borderColor: "#E0DDD5", color: "#A09990" }}>
        {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
