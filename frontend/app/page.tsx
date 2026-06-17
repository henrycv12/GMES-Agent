"use client";

import { GmesRuntimeProvider } from "@/components/runtime-provider";
import { GmesThread } from "@/components/gmes-thread";

export default function ChatPage() {
  return (
    <GmesRuntimeProvider>
      <div className="h-full">
        <GmesThread />
      </div>
    </GmesRuntimeProvider>
  );
}
