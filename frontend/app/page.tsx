import { GmesThread } from "@/components/gmes-thread";
import { ChatSidebar } from "@/components/chat-sidebar";

export default function ChatPage() {
  return (
    <div className="flex h-full">
      <ChatSidebar />
      <div className="flex-1 min-w-0">
        <GmesThread />
      </div>
    </div>
  );
}
