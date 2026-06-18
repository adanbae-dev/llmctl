import { Section, InfoDot, BarList } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { fmt, toolColor, shortPath, type ToolGroups, type ToolErrorRow, type CountRow } from './shared'

export function ToolsSection({
  hasTools,
  toolGroups,
  toolErrors,
  skills,
  subagents,
  stopReasons,
  hotFiles,
}: {
  hasTools: boolean
  toolGroups: ToolGroups
  toolErrors: ToolErrorRow[]
  skills: CountRow[]
  subagents: CountRow[]
  stopReasons: CountRow[]
  hotFiles: CountRow[]
}) {
  const hasWorkflowInsights =
    skills.length > 0 || subagents.length > 0 || stopReasons.length > 0 || hotFiles.length > 0
  return (
    <div className="space-y-6">
      <Section title="🔧 도구 사용">
        {!hasTools ? (
          <p className="text-2xs text-fg-faint">이 제공자는 도구 호출 데이터가 없습니다.</p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-fg-muted">
                  기본 도구 <span className="text-fg-faint">· {fmt(toolGroups.builtinTotal)}</span>
                </h3>
                {toolGroups.builtin.length === 0 ? (
                  <p className="text-2xs text-fg-faint">없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {toolGroups.builtin.map((t) => (
                      <div key={t.tool} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate font-mono text-fg-muted" title={t.tool}>
                          {t.tool}
                        </span>
                        <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                          <div
                            className={`h-full rounded ${toolColor(t.tool)}`}
                            style={{ width: `${Math.max((t.count / toolGroups.builtinMax) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">{fmt(t.count)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium text-fg-muted">
                  MCP 도구 <span className="text-fg-faint">· {fmt(toolGroups.mcpTotal)}</span>
                </h3>
                {toolGroups.servers.length === 0 ? (
                  <p className="text-2xs text-fg-faint">MCP 도구 호출 없음</p>
                ) : (
                  <div className="space-y-3">
                    {toolGroups.servers.map((s) => (
                      <div key={s.server}>
                        <div className="mb-1 flex items-center gap-1.5 text-2xs">
                          <span className="font-mono text-data-mcp">{s.server}</span>
                          <span className="text-fg-faint">· {fmt(s.total)}</span>
                        </div>
                        <div className="space-y-1.5">
                          {s.tools.map((x) => (
                            <div key={x.name} className="flex items-center gap-2 text-xs">
                              <span className="w-32 shrink-0 truncate font-mono text-fg-subtle" title={x.name}>
                                {x.name}
                              </span>
                              <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                                <div
                                  className="h-full rounded bg-fuchsia-500"
                                  style={{ width: `${Math.max((x.count / toolGroups.mcpMax) * 100, 2)}%` }}
                                />
                              </div>
                              <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">{fmt(x.count)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {toolErrors.some((t) => t.errors > 0) && (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-2 flex items-center gap-1 text-xs font-medium text-fg-muted">
                  ⚠️ 도구 오류율
                  <span className="text-fg-faint">· 차단·실패 결과 / 전체 결과</span>
                  <InfoDot label={GLOSSARY.toolError} />
                </h3>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {toolErrors
                    .filter((t) => t.errors > 0)
                    .slice(0, 12)
                    .map((t) => {
                      const rate = t.total ? (t.errors / t.total) * 100 : 0
                      return (
                        <div key={t.tool} className="flex items-center gap-2 text-xs">
                          <span className="w-32 shrink-0 truncate font-mono text-fg-muted" title={t.tool}>
                            {t.tool}
                          </span>
                          <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                            <div className="h-full rounded bg-red-500/70" style={{ width: `${Math.max(rate, 2)}%` }} />
                          </div>
                          <span className="w-20 shrink-0 text-right tabular-nums text-fg-muted">
                            {fmt(t.errors)}/{fmt(t.total)} ({rate.toFixed(0)}%)
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {hasWorkflowInsights && (
        <Section title="🧭 워크플로 인사이트" description={GLOSSARY.wholeRange}>
          <div className="grid gap-6 md:grid-cols-2">
            <BarList
              title="스킬 · 슬래시 커맨드"
              total={skills.reduce((s, x) => s + x.count, 0)}
              items={skills.map((c) => ({ label: c.key, value: c.count }))}
              color="bg-amber-500"
            />
            <BarList
              title="서브에이전트"
              total={subagents.reduce((s, x) => s + x.count, 0)}
              items={subagents.map((c) => ({ label: c.key, value: c.count }))}
              color="bg-fuchsia-500"
            />
            <BarList
              title="종료 사유 (stop_reason)"
              items={stopReasons.map((c) => ({ label: c.key, value: c.count }))}
              color="bg-neutral-500"
            />
            <BarList
              title="자주 연 파일 (Read·Edit·Write)"
              total={hotFiles.reduce((s, x) => s + x.count, 0)}
              items={hotFiles.map((c) => ({ label: shortPath(c.key), title: c.key, value: c.count }))}
              color="bg-blue-500"
            />
          </div>
        </Section>
      )}
    </div>
  )
}
