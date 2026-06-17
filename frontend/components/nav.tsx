"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center justify-between px-6 h-14 border-b"
      style={{
        backgroundColor: "#EEECE3",
        borderColor: "#E0DDD5",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-base font-bold"
          style={{ backgroundColor: "#CC785C" }}
        >
          🔧
        </div>
        <div>
          <div className="font-bold text-sm leading-tight" style={{ color: "#1A1A1A" }}>
            GMES Agent
          </div>
          <div className="text-xs leading-tight" style={{ color: "#7A7568" }}>
            LGE TN · Production Engineering
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/"
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/"
              ? "text-brand"
              : "text-muted hover:text-[#1A1A1A]"
          )}
          style={
            pathname === "/"
              ? { backgroundColor: "#EDE9DF", color: "#CC785C" }
              : { color: "#7A7568" }
          }
        >
          💬 Chat
        </Link>
        <Link
          href="/analytics"
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/analytics"
              ? "text-brand"
              : "text-muted hover:text-[#1A1A1A]"
          )}
          style={
            pathname === "/analytics"
              ? { backgroundColor: "#EDE9DF", color: "#CC785C" }
              : { color: "#7A7568" }
          }
        >
          📊 Analytics
        </Link>
      </div>
    </nav>
  );
}
