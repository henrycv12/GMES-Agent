"use client";

import { useContext } from "react";
import {
  Thread,
  useMessage,
  useComposerRuntime,
  AssistantMessageContent,
} from "@assistant-ui/react";
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

  const handleClick = () => {
    composer.setText(text);
    composer.send();
  };

  return (
    <button
      onClick={handleClick}
      className="text-left px-4 py-2 rounded-xl border text-sm transition-colors hover:bg-[#EDE9DF]"
      style={{
        borderColor: "#E0DDD5",
        color: "#7A7568",
        backgroundColor: "#ffffff",
      }}
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

function CustomAssistantMessage() {
  const message = useMessage();
  const { woMap } = useContext(GmesContext);
  const wos = message.id ? (woMap[message.id] ?? []) : [];

  return (
    <div>
      <AssistantMessageContent />
      <WoCards workOrders={wos} />
    </div>
  );
}

export function GmesThread() {
  return (
    <Thread
      welcome={{
        message: <WelcomeScreen />,
      }}
      components={{
        AssistantMessage: CustomAssistantMessage,
      }}
    />
  );
}
