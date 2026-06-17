"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { createContext, useState, useCallback } from "react";
import { queryWorkOrders, type WorkOrder } from "@/lib/api";

export const GmesContext = createContext<{
  woMap: Record<string, WorkOrder[]>;
}>({ woMap: {} });

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

export function GmesRuntimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [messages, setMessages] = useState<readonly ThreadMessageLike[]>([]);
  const [woMap, setWoMap] = useState<Record<string, WorkOrder[]>>({});
  const [isRunning, setIsRunning] = useState(false);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart && "text" in textPart ? String(textPart.text) : "";

      const userMsg: ThreadMessageLike = {
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
      };

      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next;
      });

      setIsRunning(true);

      try {
        const history = [...messages].map((m) => ({
          role: m.role as "user" | "assistant",
          content: getTextFromMessage(m),
        }));

        const data = await queryWorkOrders({ question: text, history });

        const msgId = crypto.randomUUID();

        const assistantMsg: ThreadMessageLike = {
          id: msgId,
          role: "assistant",
          content: [{ type: "text", text: data.answer }],
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setWoMap((prev) => ({
          ...prev,
          [msgId]: data.work_orders ?? [],
        }));
      } catch (err) {
        const errorMsg: ThreadMessageLike = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Sorry, something went wrong: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsRunning(false);
      }
    },
    [messages]
  );

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
  });

  return (
    <GmesContext.Provider value={{ woMap }}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </GmesContext.Provider>
  );
}
