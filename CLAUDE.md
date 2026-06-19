# GMES Agent — Claude Code Guidelines

## Code Search & Reading
- **Always use `codegraph_explore` instead of `grep`/`Grep` or `Read` for any codegraph-supported file.**
  Codegraph has a pre-built symbol graph of the entire workspace. One call returns verbatim source + callers + callees — equivalent to Read but with cross-file context. Use it both for searches AND to read source files before editing them.
  - Supported file types (use codegraph, not Read/Grep): `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.py`, `.go`, `.rs`, `.java`, `.cs`, `.php`, `.rb`, `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.swift`, `.kt`, `.kts`, `.scala`, `.sc`, `.dart`, `.svelte`, `.vue`, `.liquid`, `.pas`, `.lua`, `.luau`
  - `Read` is only acceptable for files NOT in the list above (`.json`, `.css`, `.md`, config files, etc.) or when codegraph is unavailable.
  - `Grep` is only acceptable for raw string literals (e.g., an error message) that are not symbols.

## Stack
- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, `@assistant-ui/react`
- AI: Azure OpenAI (`gpt-4o` LLM, `embed-model` embeddings) on resource `hcol-mqfq4gia-eastus2`
- Search: Azure AI Search (free tier, index `work-orders`, ~47K work orders)
- Local dev: `npm run dev` in `frontend/` — API routes at `/api/query` and `/api/analytics`

## Key Conventions
- `NEXT_PUBLIC_API_URL` must be empty for local dev (uses Next.js API routes, not Azure Functions)
- `WO #XXXXX` inline code spans in LLM output are rendered as clickable badges via `WoBadgeOrCode` in `gmes-thread.tsx`
- Work order context per message is stored in `woMap[message.id]` inside `GmesRuntimeProvider`
- Never set `output: "export"` unconditionally in `next.config.mjs` — it disables API routes. Use `STATIC_EXPORT=1` env var to opt in.
