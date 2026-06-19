"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { GmesContext } from "@/components/runtime-provider";

export function Nav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useContext(GmesContext);

  return (
    <nav
      className="flex items-center justify-between px-6 h-14 border-b"
      style={{
        backgroundColor: "var(--c-surface-1)",
        borderColor: "var(--c-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-base font-bold"
          style={{ backgroundColor: "var(--c-brand)" }}
        >
          🔧
        </div>
        <div>
          <div className="font-bold text-sm leading-tight" style={{ color: "var(--c-text)" }}>
            GMES Agent
          </div>
          <div className="text-xs leading-tight" style={{ color: "var(--c-text-3)" }}>
            LGE TN · Production Engineering
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/"
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/" ? "text-brand" : "text-muted hover:text-[#1A1A1A]"
          )}
          style={
            pathname === "/"
              ? { backgroundColor: "var(--c-surface-2)", color: "var(--c-brand)" }
              : { color: "var(--c-text-3)" }
          }
        >
          💬 Chat
        </Link>
        <Link
          href="/analytics"
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/analytics" ? "text-brand" : "text-muted"
          )}
          style={
            pathname === "/analytics"
              ? { backgroundColor: "var(--c-surface-2)", color: "var(--c-brand)" }
              : { color: "var(--c-text-3)" }
          }
        >
          📊 Analytics
        </Link>

        <button
          onClick={toggleTheme}
          className="ml-2 p-2 rounded-lg transition-colors hover:opacity-80"
          style={{ color: "var(--c-text-3)", backgroundColor: "var(--c-surface-2)" }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </nav>
  );
}
