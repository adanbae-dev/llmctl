// Normalized session model. The UI only ever sees these types; each provider
// adapter maps its on-disk format into this shape.

export type Provider = 'claude' | 'codex' | 'gemini' | 'cursor' | 'cursor-cli' | 'antigravity-cli'
export type Role = 'user' | 'assistant' | 'system' | 'tool'

export interface Usage {
  inputTokens?: number
  outputTokens?: number
}

export type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; output: string; isError?: boolean }

export interface Message {
  id: string
  role: Role
  ts?: string
  model?: string
  usage?: Usage
  blocks: ContentBlock[]
}

export interface SessionSummary {
  id: string
  provider: Provider
  title: string
  projectPath: string
  filePath: string
  startedAt?: string
  updatedAt?: string
  messageCount?: number
  model?: string
  sizeBytes?: number
  truncated?: boolean
  /** Present only in the backup archive (deleted from the live root). */
  archived?: boolean
}

export interface Session extends SessionSummary {
  messages: Message[]
  /** Session token totals, when the provider records them. */
  totalUsage?: Usage
  /** Distinct models seen across the session (for mid-session model changes). */
  modelsUsed?: string[]
}

export interface TailResult {
  messages: Message[]
  nextOffset: number
  truncated?: boolean
  /**
   * Cumulative session token usage as of this chunk, when the provider logs it
   * as a running total (Codex `token_count` events). Absent for providers whose
   * per-message usage lives on the messages themselves (Claude). The live viewer
   * uses it to track Codex token growth, which messages alone don't carry.
   */
  usage?: Usage
}

export interface ProviderStatus {
  id: Provider
  installed: boolean
  sessionCount: number
  dataRoot?: string
  binary?: string
  version?: string
}

export interface ProviderAdapter {
  id: Provider
  readonly appendable: boolean
  discover(): Promise<SessionSummary[]>
  parse(filePath: string): Promise<Session>
  tail(filePath: string, fromOffset: number): Promise<TailResult>
}
