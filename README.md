# llmctl

Local viewer for the session files written by local LLM CLIs and IDEs — **Claude Code,
Codex (GPT), Gemini CLI, Cursor (IDE + CLI), and Antigravity CLI** — in one tabbed UI,
plus a token-usage & cost dashboard. Runs entirely on your machine, **read-only** by default.

## Features

- **Unified session viewer** across 6 sources — one tab per provider (greyed out when not installed).
- **Conversation view**: user / assistant / system / tool messages; collapsible *thinking* and
  *tool-call / tool-result* blocks; markdown + syntax highlighting; per-message model & token
  badges; a divider marking mid-session model changes.
- **Dynamic detection**: providers are detected from on-disk data and installed binaries
  (with version) via `/api/providers`.
- **Usage & cost dashboard** (Claude / Cursor / Codex): tokens by day and model, estimated USD
  cost, a date-range calendar + model filters, and a Recharts bar chart.
- **Session management**: delete file-based sessions to a recoverable trash; hide DB-backed
  (Cursor / Antigravity) sessions app-side without touching their databases.

## Supported sources

| Provider | Location | Tokens | Cost |
|---|---|:---:|:---:|
| Claude Code | `~/.claude/projects/<dir>/*.jsonl` | ✅ | ✅ verified |
| Codex (GPT) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | ⚠️ when logged | ≈ approx |
| Gemini CLI | `~/.gemini/tmp/<hash>/chats/session-*.json` | — | — |
| Cursor (IDE) | `…/Cursor/User/globalStorage/state.vscdb` (SQLite) | ✅ | ✅ / ≈ by model |
| Cursor CLI | `~/.cursor/chats/**/store.db` (SQLite) | — | — |
| Antigravity CLI | `~/.gemini/antigravity-cli/history.jsonl` (prompts only) | — | — |

Paths resolve with env/OS awareness (`$CLAUDE_CONFIG_DIR`, `$CODEX_HOME`, `$XDG_CONFIG_HOME`,
and macOS/Linux/Windows Cursor locations).

## Requirements

- **Node.js 20+**
- **`sqlite3` CLI** on `PATH` (used to read Cursor's SQLite stores; preinstalled on macOS).

## Setup

```bash
git clone git@github.com:adanbae-dev/llmctl.git
cd llmctl
npm install
```

## Run

```bash
npm run dev      # http://127.0.0.1:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm run test`.

> `dev` and `start` bind to **`127.0.0.1`** on purpose — the app can surface secrets from your
> sessions, so it is not exposed on your LAN. To expose it intentionally, pass `-H 0.0.0.0` yourself.

## Security

This tool reads local LLM session files, which may contain **secrets, tokens, API keys, and file
contents**. It is meant to run locally only:

- **Bound to `127.0.0.1`** by default (not `0.0.0.0`). Makes **no outbound / telemetry** calls.
- **Read-only** of provider session files — the app never writes to them.
- **Path-traversal guarded** — the single-session API only reads paths inside the requested
  provider's own root (`isWithin`).
- **SQL-injection guarded** — Cursor composer IDs are validated against a strict pattern before
  any query; the usage queries contain no user input.
- **Delete is recoverable** — file-based sessions move to `~/.llmctl/trash/<provider>/` (not
  hard-deleted); Cursor / Antigravity sessions are hidden via `~/.llmctl/config.json` (their
  databases are never modified).
- **CSRF guard** — state-changing `DELETE` requests reject browser cross-origin calls (same-origin only).
- **No authentication** — anyone with access to the machine and the port can read transcripts.
  Don't run it on a shared or exposed host.

## Cost estimates

Costs are **estimates** (cache read ≈ 0.1× input, cache write ≈ 1.25×, 5-minute TTL assumption).
Claude rates are verified; GPT / Gemini and unknown-model (Cursor `default` / `composer-1`) rates
are **approximate** and marked with `≈`. Adjust any rate in `lib/pricing.ts`.

## Architecture

- `lib/adapters/*` — one adapter per provider (`discover` / `parse` / `tail`), normalized into the
  shared model in `lib/adapters/types.ts`. Each adapter exposes a `tail()` seam + `appendable`
  flag so live-watch (v2) can be added without a rewrite.
- `lib/usage.ts` — per-provider token aggregation by (date, model); `lib/pricing.ts` — cost.
- `lib/paths.ts` — env/OS-aware path resolution; `lib/store.ts` — trash + hide-list.
- `app/api/*` — Node-runtime Route Handlers that read the filesystem / SQLite.
- `components/*` — tabs, sidebar, conversation view, usage dashboard, date-range picker.

## Notes & limitations

- **Antigravity CLI** stores responses as protobuf — only user prompts (from `history.jsonl`) are shown.
- **Codex tokens** appear only for sessions that logged `token_count` events (longer sessions).
- **Cursor `default`** = Auto-mode sessions don't pin a model; shown as `default` with approximate cost.
- **Large Codex rollouts** (100s of MB+) are windowed (start + recent ~4 MB) with a "truncated" banner.

## Roadmap

- **v2 — real-time watch**: tail active sessions live via `chokidar` + SSE (the `tail()` seam and
  `appendable` flag are already in place).
