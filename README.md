# llmctl

**English** | [한국어](README.ko.md)

Local viewer for the session files written by local LLM CLIs and IDEs — **Claude Code,
Codex (GPT), Gemini CLI, Cursor (IDE + CLI), and Antigravity CLI** — in one tabbed UI,
plus a token-usage & cost dashboard. Runs entirely on your machine, **read-only** by default.

## Security — safe to run, verify in 30 seconds

llmctl reads your private LLM transcripts, so "is this safe?" is the right first question.
Every guarantee below is checkable in your own clone — these aren't promises, they're greppable facts:

- **No outbound network — ever.** Every request hits the app's own `/api/*`; there are no external
  endpoints, telemetry, or analytics.
  → `grep -rnE 'fetch\(|https?://|axios|WebSocket' app lib components` — only relative `/api/...`.
- **Localhost-only.** `dev`/`start` bind to `127.0.0.1`, never `0.0.0.0`, so it's never on your LAN.
  → `npm pkg get scripts.dev scripts.start`.
- **Read-only of your sessions.** Adapters only ever read (`fs.readFile`, `sqlite3 -readonly … immutable=1`);
  the app never writes to `~/.claude`, `~/.codex`, `~/.gemini`, or Cursor's databases.
  → `grep -rn 'readFile|-readonly|immutable=1' lib`.
- **Deletes are recoverable.** "Delete" moves a file to `~/.llmctl/trash/`; Cursor/Antigravity sessions
  are merely hidden in `~/.llmctl/config.json`. Nothing is hard-deleted, and source DBs are never modified.
  → `grep -n 'trashFile|rename' lib/store.ts`.
- **Nothing secret in this repo.** Code only — it reads your home directory at runtime.
  → `git grep -nE 'sk-|ghp_|AKIA'` returns nothing.
- **Telemetry off.** The npm scripts set `NEXT_TELEMETRY_DISABLED=1`.

It can still surface **secrets, tokens, and file contents** from your transcripts, so it stays guarded:

- **Path-traversal guarded** — the single-session API only reads paths inside the requested provider's
  own root (`isWithin`).
- **SQL-injection guarded** — Cursor composer IDs are validated against a strict pattern before any
  query; the usage queries contain no user input.
- **CSRF guard** — state-changing `DELETE` requests reject browser cross-origin calls (same-origin only).
- **No authentication** — anyone with access to the machine and the port can read transcripts. Don't run
  it on a shared or exposed host.

## What you get

Four ways in: **💬 Sessions**, **📊 Usage**, **🔴 Live**, and header-bar **🔍 Search**.

### 💬 Sessions — unified conversation viewer

- **One tab per provider** across 6 sources (greyed out when not installed), detected from on-disk
  data and installed binaries (with version) via `/api/providers`.
- **Conversation view**: user / assistant / system / tool messages; collapsible *thinking* and
  *tool-call / tool-result* blocks; markdown + syntax highlighting; per-message model & token
  badges; a divider marking mid-session model changes.
- **Favorites ⭐, tags, and notes** per session — stored in `~/.llmctl/meta.json`, never written
  into your transcripts — with a "favorites only" sidebar filter.
- **Export** any session to **Markdown** or **JSON**.
- **Session management**: delete file-based sessions to a recoverable trash (`~/.llmctl/trash/`);
  hide DB-backed (Cursor / Antigravity) sessions app-side without touching their databases; an
  archive view surfaces sessions deleted from the live root but kept in the backup.

### 📊 Usage & cost dashboard (Claude / Codex / Cursor)

- **Scope filter** across the whole dashboard: **date range + project**.
- Overview plus sub-tabs — **Cost, Tools, Activity, Sessions, Compare, Security**.
- **Cost**: tokens by day & model, estimated USD, daily cost trend (7-day avg + cumulative),
  per-project / per-branch spend, and a **monthly budget + month-end forecast** (MTD, burn rate,
  threshold colors).
- **Tools**: tool-call counts, **tool error rate** (incl. hook-blocked calls), hottest files
  (Read / Edit / Write).
- **Activity**: a 7×24 hour-of-week heatmap **and** a GitHub-style calendar heatmap over the
  selected range; streak / busiest-day stats.
- **Sessions / Compare**: **session Top-N** by cost & size (cleanup candidates), efficiency cards
  (cache $ saved, output/input ratio, truncation rate), and **model-share trend**.
- **Security**: scans transcripts for secrets / tokens / PII, **split by severity** — 🔴 *exposed*
  (real-looking credential) vs 🟡 *mention* (placeholder / example / masked) — with per-type bars
  and **jump-to-message** (click a match to open the session scrolled to the exact message).
- **CSV export** of the filtered usage rows.

### 🔴 Live — real-time usage viewer

- Auto-detects **currently-active Claude / Codex sessions** (appended in the last 5 min) and
  **streams new messages** as they're written, built on the adapters' offset-based `tail()`.
- **Live token & cost counter** per session and in aggregate (cost marked *approx*).
- **Live insights**: **burn rate** (tokens/min + ~$/hr) with a throughput **sparkline**, live
  **tool-usage** breakdown + a tool-error badge, and a **generating / idle** state badge per session.
- Polls efficiently (list ~7.5 s, per-session tail ~2.5 s) and pauses when the tab is hidden or
  via a manual toggle.

### 🔍 Cross-session search

- Full-text search across **all** sessions from the header, with snippet highlighting and
  **jump-to-message** straight to the matching turn.

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

## Cost estimates

Costs are **estimates** (cache read ≈ 0.1× input, cache write ≈ 1.25×, 5-minute TTL assumption).
Claude rates are verified; GPT / Gemini and unknown-model (Cursor `default` / `composer-1`) rates
are **approximate** and marked with `≈`. Adjust any rate in `lib/pricing.ts`.

## Architecture

- `lib/adapters/*` — one adapter per provider (`discover` / `parse` / `tail`), normalized into the
  shared model in `lib/adapters/types.ts`. Each adapter exposes a `tail()` seam + `appendable`
  flag — the Live viewer is built directly on it.
- `lib/usage.ts` — per-provider token / tool / activity / security / session aggregation, scoped by
  (date, project); `lib/pricing.ts` — cost.
- `lib/search.ts` — cross-session full-text search; `lib/exporters.ts` — Markdown / JSON / CSV;
  `lib/meta.ts` — favorites / tags / notes manifest (`~/.llmctl/meta.json`).
- `lib/live.ts` — active-session discovery for the Live viewer; `lib/live-metrics.ts` — pure
  burn-rate / throughput / tool-count helpers.
- `lib/paths.ts` — env/OS-aware path resolution; `lib/store.ts` — trash + hide-list;
  `lib/backup.ts` — incremental archive mirror.
- `app/api/*` — Node-runtime Route Handlers: `/providers`, `/sessions`, `/usage`, `/search`,
  `/meta`, `/live`, `/live/tail`, `/trash`, `/backup`.
- `components/*` — tabs, sidebar, conversation view, usage dashboard (`components/usage/*`
  sub-sections), Live viewer, search results, and shared primitives in `components/ui/*`.

## Notes & limitations

- **Antigravity CLI** stores responses as protobuf — only user prompts (from `history.jsonl`) are shown.
- **Codex tokens** appear only for sessions that logged `token_count` events (longer sessions).
- **Cursor `default`** = Auto-mode sessions don't pin a model; shown as `default` with approximate cost.
- **Large Codex rollouts** (100s of MB+) are windowed (start + recent ~4 MB) with a "truncated" banner.
- **Live viewer covers Claude & Codex only** — other providers aren't append-tailable (Gemini
  rewrites the whole file; Cursor / Cursor-CLI / Antigravity are SQLite/DB-backed).
- **Live counts are "since you opened the tab"** (by design), and **Claude live cost is approximate**
  because cache tokens aren't carried on the tailed per-message usage.

## Roadmap

- ✅ **Real-time watch (done)** — the 🔴 **Live** tab tails active Claude/Codex sessions via
  offset polling, with live token/cost counters and burn-rate / tool-usage insights.
- Ideas next: local-model (Ollama) ingest; true per-session cumulative live totals; exact Claude
  live cost (carry cache tokens through `tail`).
