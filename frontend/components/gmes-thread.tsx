"use client";

import { createContext, useContext, useState } from "react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useMessage,
  useComposerRuntime,
  useThreadRuntime,
  useThread,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Send, Pin, PinOff } from "lucide-react";
import { WoModal } from "@/components/wo-cards";
import { GmesContext } from "@/components/runtime-provider";
import { type WorkOrder } from "@/lib/api";
import remarkGfm from "remark-gfm";

// Per-message context so the inline code component can open the modal
const WoOpenContext = createContext<{
  wos: WorkOrder[];
  openModal: (wo: WorkOrder) => void;
}>({ wos: [], openModal: () => {} });

// Overrides inline `code` spans: if content matches "WO #XXXXX", render a clickable badge.
function WoBadgeOrCode({
  children,
  className,
  ...props
}: React.ComponentProps<"code">) {
  const { wos, openModal } = useContext(WoOpenContext);
  if (!className) {
    const text = String(children).trim();
    const match = /^WO\s*#(\S+)$/i.exec(text);
    if (match) {
      const woNo = match[1];
      const handleClick = () => {
        const wo = wos.find(
          (w) =>
            w.wo_no === woNo ||
            w.wo_no.replace(/\.0$/, "") === woNo ||
            String(parseInt(w.wo_no, 10)) === woNo
        );
        if (wo) openModal(wo);
      };
      return (
        <button
          onClick={handleClick}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-75 transition-opacity cursor-pointer"
          style={{
            backgroundColor: "var(--c-code-bg)",
            border: "1px solid var(--c-border)",
            color: "var(--c-wo)",
          }}
        >
          {text}
        </button>
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <code className={className} {...(props as any)}>{children}</code>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = (props: any) => (
  <MarkdownTextPrimitive
    {...props}
    remarkPlugins={[remarkGfm]}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components={{ code: WoBadgeOrCode as any }}
  />
);

const DEFAULT_SUGGESTIONS = [
  "What failures has the EPS vacuum pump had?",
  "Most common failures in the last 90 days",
  "Who last worked on the diverter in Line 3?",
  "Top recurring failures in EPS shop",
];

function SuggestionButton({ text, onUnpin }: { text: string; onUnpin?: () => void }) {
  const composer = useComposerRuntime();
  return (
    <div className="relative group">
      <button
        onClick={() => { composer.setText(text); composer.send(); }}
        className="w-full text-left px-4 py-2 rounded-xl border text-sm transition-colors hover:opacity-80 pr-8"
        style={{ borderColor: "var(--c-border)", color: "var(--c-text-3)", backgroundColor: "var(--c-card)" }}
      >
        {text}
      </button>
      {onUnpin && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnpin(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--c-wo)" }}
          title="Unpin"
        >
          <PinOff size={13} />
        </button>
      )}
    </div>
  );
}

function WelcomeScreen() {
  const { pinnedQueries, unpinQuery } = useContext(GmesContext);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-12">
      <div className="text-5xl">🔧</div>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--c-text)" }}>
          What can I help you with?
        </h2>
        <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
          Ask about equipment failures, past repairs, recurring issues...
        </p>
      </div>
      {pinnedQueries.length > 0 && (
        <div className="w-full max-w-lg">
          <p className="text-xs font-medium mb-2 flex items-center gap-1" style={{ color: "var(--c-wo)" }}>
            <Pin size={11} /> Pinned
          </p>
          <div className="flex flex-col gap-1.5">
            {pinnedQueries.map((q) => (
              <SuggestionButton key={q} text={q} onUnpin={() => unpinQuery(q)} />
            ))}
          </div>
        </div>
      )}
      <div className="w-full max-w-lg">
        {pinnedQueries.length > 0 && (
          <p className="text-xs font-medium mb-2" style={{ color: "var(--c-text-4)" }}>Suggestions</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEFAULT_SUGGESTIONS.map((s) => (
            <SuggestionButton key={s} text={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserMessage() {
  const message = useMessage();
  const { pinnedQueries, pinQuery, unpinQuery } = useContext(GmesContext);

  const text = (() => {
    if (!message.content) return "";
    for (const part of message.content) {
      if (typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part) {
        return String((part as { type: string; text: unknown }).text);
      }
    }
    return "";
  })();

  const isPinned = pinnedQueries.includes(text);

  return (
    <MessagePrimitive.Root className="flex justify-end items-center gap-1 px-4 py-2 group">
      <button
        onClick={() => isPinned ? unpinQuery(text) : pinQuery(text)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
        style={{ color: isPinned ? "var(--c-wo)" : "var(--c-text-4)" }}
        title={isPinned ? "Unpin" : "Pin this query"}
      >
        {isPinned ? <Pin size={13} fill="currentColor" /> : <Pin size={13} />}
      </button>
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2 text-sm"
        style={{ backgroundColor: "var(--c-brand)", color: "#ffffff" }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function SuggestionChip({ text }: { text: string }) {
  const thread = useThreadRuntime();
  return (
    <button
      onClick={() => { thread.composer.setText(text); thread.composer.send(); }}
      className="text-left px-3 py-1.5 rounded-full border text-xs transition-colors hover:opacity-80 shrink-0"
      style={{ borderColor: "var(--c-border)", color: "var(--c-text-3)", backgroundColor: "var(--c-card)" }}
    >
      {text}
    </button>
  );
}

function AssistantMessage() {
  const message = useMessage();
  const thread = useThread();
  const { woMap, suggestionsMap } = useContext(GmesContext);
  const wos = message.id ? (woMap[message.id] ?? []) : [];
  const suggestions = message.id ? (suggestionsMap[message.id] ?? []) : [];
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);

  const isLast = thread.messages[thread.messages.length - 1]?.id === message.id;

  return (
    <WoOpenContext.Provider value={{ wos, openModal: setSelectedWo }}>
      <MessagePrimitive.Root className="flex justify-start px-4 py-2">
        <div className="md-content max-w-[85%] text-sm" style={{ color: "var(--c-text)" }}>
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        </div>
      </MessagePrimitive.Root>
      {isLast && suggestions.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => <SuggestionChip key={s} text={s} />)}
        </div>
      )}
      {selectedWo && (
        <WoModal wo={selectedWo} onClose={() => setSelectedWo(null)} />
      )}
    </WoOpenContext.Provider>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start px-4 py-2">
      <div
        className="flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm"
        style={{ backgroundColor: "var(--c-surface-1)", color: "var(--c-text-3)" }}
      >
        <span className="text-xs" style={{ color: "var(--c-text-4)" }}>Thinking</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                backgroundColor: "var(--c-brand)",
                animationDelay: `${i * 150}ms`,
                animationDuration: "900ms",
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function GmesThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full" style={{ backgroundColor: "var(--c-card)" }}>
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <WelcomeScreen />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{ UserMessage, AssistantMessage }}
        />
        <ThreadPrimitive.If running>
          <ThinkingIndicator />
        </ThreadPrimitive.If>
      </ThreadPrimitive.Viewport>

      <div className="border-t p-4" style={{ borderColor: "var(--c-border)", backgroundColor: "var(--c-card)" }}>
        <ComposerPrimitive.Root
          className="flex items-end gap-2 rounded-2xl border px-4 py-2"
          style={{ borderColor: "var(--c-border)", backgroundColor: "var(--c-bg)" }}
        >
          <ComposerPrimitive.Input
            className="flex-1 resize-none bg-transparent text-sm outline-none min-h-[24px] max-h-[120px] placeholder-composer"
            style={{ color: "var(--c-text)" }}
            placeholder="Ask about equipment, failures, repairs..."
            rows={1}
          />
          <ComposerPrimitive.Send
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--c-brand)", color: "#ffffff" }}
          >
            <Send size={14} />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}
