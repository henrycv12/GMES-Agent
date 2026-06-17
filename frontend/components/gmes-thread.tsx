"use client";

import { useContext } from "react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useMessage,
  useComposerRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Send } from "lucide-react";
import { WoCards } from "@/components/wo-cards";
import { GmesContext } from "@/components/runtime-provider";

const SUGGESTIONS = [
  "What failures has the EPS vacuum pump had?",
  "Most common failures in the last 90 days",
  "Who last worked on the diverter in Line 3?",
  "Top recurring failures in EPS shop",
];

function SuggestionButton({ text }: { text: string }) {
  const composer = useComposerRuntime();
  return (
    <button
      onClick={() => { composer.setText(text); composer.send(); }}
      className="text-left px-4 py-2 rounded-xl border text-sm transition-colors hover:bg-[#EDE9DF]"
      style={{ borderColor: "#E0DDD5", color: "#7A7568", backgroundColor: "#ffffff" }}
    >
      {text}
    </button>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-12">
      <div className="text-5xl">🔧</div>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2" style={{ color: "#1A1A1A" }}>
          What can I help you with?
        </h2>
        <p className="text-sm" style={{ color: "#7A7568" }}>
          Ask about equipment failures, past repairs, recurring issues...
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s) => (
          <SuggestionButton key={s} text={s} />
        ))}
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-4 py-2">
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2 text-sm"
        style={{ backgroundColor: "#A8785A", color: "#ffffff" }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const message = useMessage();
  const { woMap } = useContext(GmesContext);
  const wos = message.id ? (woMap[message.id] ?? []) : [];
  return (
    <MessagePrimitive.Root className="flex justify-start px-4 py-2">
      <div className="md-content max-w-[85%] text-sm" style={{ color: "#1A1A1A" }}>
        <MessagePrimitive.Content
          components={{ Text: MarkdownTextPrimitive }}
        />
        <WoCards workOrders={wos} />
      </div>
    </MessagePrimitive.Root>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start px-4 py-2">
      <div
        className="flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm"
        style={{ backgroundColor: "#F5F3EE", color: "#7A7568" }}
      >
        <span className="text-xs" style={{ color: "#A09990" }}>Thinking</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                backgroundColor: "#A8785A",
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
    <ThreadPrimitive.Root className="flex flex-col h-full bg-white">
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

      <div className="border-t p-4" style={{ borderColor: "#E0DDD5" }}>
        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border px-4 py-2" style={{ borderColor: "#E0DDD5" }}>
          <ComposerPrimitive.Input
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[#A09990] min-h-[24px] max-h-[120px]"
            placeholder="Ask about equipment, failures, repairs..."
            rows={1}
          />
          <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40" style={{ backgroundColor: "#A8785A", color: "#ffffff" }}>
            <Send size={14} />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}
