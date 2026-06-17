"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { createContext, useState, useCallback, useEffect } from "react";
import { queryWorkOrders, type WorkOrder } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ThreadMessageLike[];
  woMap: Record<string, WorkOrder[]>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const GmesContext = createContext<{
  woMap: Record<string, WorkOrder[]>;
  conversations: Conversation[];
  activeId: string;
  newConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}>({
  woMap: {},
  conversations: [],
  activeId: "",
  newConversation: () => {},
  switchConversation: () => {},
  deleteConversation: () => {},
});

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_KEY = "gmes-conversations";
const LS_ACTIVE = "gmes-active-id";

function makeConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New chat", createdAt: Date.now(), messages: [], woMap: {} };
}

function initState(): { conversations: Conversation[]; activeId: string } {
  if (typeof window === "undefined") {
    const c = makeConversation();
    return { conversations: [c], activeId: c.id };
  }
  let convs: Conversation[] = [];
  try { convs = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch {}
  if (!convs.length) convs = [makeConversation()];
  const saved = localStorage.getItem(LS_ACTIVE) ?? "";
  const activeId = convs.find((c) => c.id === saved) ? saved : convs[0].id;
  return { conversations: convs, activeId };
}

function getTextFromMessage(msg: ThreadMessageLike): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part) {
        return String((part as { type: string; text: unknown }).text);
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GmesRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [{ conversations, activeId }, setStore] = useState(initState);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(conversations)); } catch {}
  }, [conversations]);

  useEffect(() => {
    if (activeId) try { localStorage.setItem(LS_ACTIVE, activeId); } catch {}
  }, [activeId]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const messages = activeConv?.messages ?? [];
  const woMap = activeConv?.woMap ?? {};

  const updateActive = useCallback((updater: (c: Conversation) => Conversation) => {
    setStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => c.id === prev.activeId ? updater(c) : c),
    }));
  }, []);

  const newConversation = useCallback(() => {
    const conv = makeConversation();
    setStore((prev) => ({ conversations: [conv, ...prev.conversations], activeId: conv.id }));
  }, []);

  const switchConversation = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, activeId: id }));
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setStore((prev) => {
      const remaining = prev.conversations.filter((c) => c.id !== id);
      if (!remaining.length) {
        const fresh = makeConversation();
        return { conversations: [fresh], activeId: fresh.id };
      }
      const newActive = prev.activeId === id ? remaining[0].id : prev.activeId;
      return { conversations: remaining, activeId: newActive };
    });
  }, []);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart && "text" in textPart ? String(textPart.text) : "";

      const userMsg: ThreadMessageLike = {
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
      };

      const currentMessages = activeConv?.messages ?? [];

      updateActive((conv) => ({
        ...conv,
        title: conv.messages.length === 0 ? text.slice(0, 45) : conv.title,
        messages: [...conv.messages, userMsg],
      }));

      setIsRunning(true);

      try {
        const history = currentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: getTextFromMessage(m),
        }));

        const data = await queryWorkOrders({ question: text, history });
        const msgId = crypto.randomUUID();

        const assistantMsg: ThreadMessageLike = {
          id: msgId,
          role: "assistant",
          status: { type: "complete", reason: "stop" },
          content: [{ type: "text", text: data.answer }],
        };

        updateActive((conv) => ({
          ...conv,
          messages: [...conv.messages, assistantMsg],
          woMap: { ...conv.woMap, [msgId]: data.work_orders ?? [] },
        }));
      } catch (err) {
        const errorMsg: ThreadMessageLike = {
          id: crypto.randomUUID(),
          role: "assistant",
          status: { type: "incomplete", reason: "error" },
          content: [{ type: "text", text: `Sorry, something went wrong: ${err instanceof Error ? err.message : String(err)}` }],
        };
        updateActive((conv) => ({ ...conv, messages: [...conv.messages, errorMsg] }));
      } finally {
        setIsRunning(false);
      }
    },
    [activeConv, updateActive]
  );

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    convertMessage: (m: ThreadMessageLike) => m,
  });

  return (
    <GmesContext.Provider value={{ woMap, conversations, activeId, newConversation, switchConversation, deleteConversation }}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </GmesContext.Provider>
  );
}
