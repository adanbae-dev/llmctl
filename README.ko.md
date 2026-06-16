# llmctl

[English](README.md) | **한국어**

로컬 LLM CLI·IDE — **Claude Code, Codex(GPT), Gemini CLI, Cursor(IDE + CLI), Antigravity CLI** —
의 세션 파일을 하나의 탭 UI로 보고, 토큰 사용량·비용 대시보드까지 제공합니다.
전부 당신의 머신에서, 기본 **읽기 전용**으로 동작합니다.

## 보안 — 안심하고 쓰고, 30초 만에 검증

llmctl은 당신의 비공개 LLM 대화를 읽으므로 "이거 안전한가?"가 가장 먼저 들 질문이 맞습니다.
아래 각 보장은 **클론한 저장소에서 직접 확인 가능합니다** — 약속이 아니라 grep으로 드러나는 사실입니다:

- **외부 네트워크 호출 0 — 전부 내부 `/api/*`.** 외부 엔드포인트·텔레메트리·애널리틱스가 없습니다.
  → `grep -rnE 'fetch\(|https?://|axios|WebSocket' app lib components` — 상대경로 `/api/...`만 나옵니다.
- **로컬 전용.** `dev`/`start`가 `127.0.0.1`에 바인딩(절대 `0.0.0.0` 아님) — LAN에 노출되지 않습니다.
  → `npm pkg get scripts.dev scripts.start`.
- **세션 파일 읽기 전용.** 어댑터는 읽기만 합니다(`fs.readFile`, `sqlite3 -readonly … immutable=1`).
  `~/.claude`, `~/.codex`, `~/.gemini`, Cursor DB에 절대 쓰지 않습니다.
  → `grep -rn 'readFile|-readonly|immutable=1' lib`.
- **삭제는 복구 가능.** "삭제"는 파일을 `~/.llmctl/trash/`로 이동하고, Cursor/Antigravity 세션은
  `~/.llmctl/config.json`에서 숨김만 합니다. 하드 삭제 없음, 원본 DB 미변경.
  → `grep -n 'trashFile|rename' lib/store.ts`.
- **저장소에 비밀정보 없음.** 코드만 있고, 런타임에 홈 디렉터리를 읽습니다.
  → `git grep -nE 'sk-|ghp_|AKIA'` — 결과가 없습니다.
- **텔레메트리 off.** npm 스크립트가 `NEXT_TELEMETRY_DISABLED=1`을 설정합니다.

대화 내용엔 **비밀키·토큰·파일 내용**이 들어 있을 수 있어, 가드도 둡니다:

- **경로 traversal 차단** — 단일 세션 API는 해당 제공자 루트 안쪽 경로만 읽습니다(`isWithin`).
- **SQL 인젝션 차단** — Cursor composerId는 엄격한 패턴으로 검증한 뒤에만 쿼리하고, 사용량 쿼리엔
  사용자 입력이 없습니다.
- **CSRF 가드** — 상태를 바꾸는 `DELETE`는 브라우저 교차 출처 요청을 거부합니다(동일 출처만).
- **무인증** — 머신과 포트에 접근 가능한 사람은 전사를 볼 수 있습니다. 공유/노출 호스트에서 실행하지 마세요.

## 기능

- **통합 세션 뷰어** — 6개 소스, 제공자별 탭(미설치 시 회색 비활성).
- **대화 뷰**: user / assistant / system / tool 메시지, 접이식 *thinking*·*tool 호출/결과* 블록,
  마크다운 + 코드 하이라이트, 메시지별 모델·토큰 배지, 세션 중 모델 변경 구분선.
- **동적 탐지**: 디스크 데이터 + 설치 바이너리(버전 포함)를 `/api/providers`에서 탐지.
- **사용량·비용 대시보드** (Claude / Cursor / Codex): 일자·모델별 토큰, **도구 호출 수**, 추정 USD 비용,
  기간 캘린더 + 모델 필터, Recharts 막대 차트.
- **세션 관리**: 파일 기반 세션은 복구 가능한 휴지통으로 삭제, DB 기반(Cursor / Antigravity)은
  DB를 건드리지 않고 앱에서 숨김.

## 지원 소스

| 제공자 | 위치 | 토큰 | 비용 |
|---|---|:---:|:---:|
| Claude Code | `~/.claude/projects/<dir>/*.jsonl` | ✅ | ✅ 검증됨 |
| Codex (GPT) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | ⚠️ 기록 시 | ≈ 근사 |
| Gemini CLI | `~/.gemini/tmp/<hash>/chats/session-*.json` | — | — |
| Cursor (IDE) | `…/Cursor/User/globalStorage/state.vscdb` (SQLite) | ✅ | ✅ / ≈ (모델별) |
| Cursor CLI | `~/.cursor/chats/**/store.db` (SQLite) | — | — |
| Antigravity CLI | `~/.gemini/antigravity-cli/history.jsonl` (프롬프트만) | — | — |

경로는 env/OS 인식으로 해석됩니다(`$CLAUDE_CONFIG_DIR`, `$CODEX_HOME`, `$XDG_CONFIG_HOME`,
macOS/Linux/Windows Cursor 위치).

## 요구사항

- **Node.js 20+**
- **`sqlite3` CLI** (`PATH`에 존재 — Cursor의 SQLite 저장소 읽기에 사용, macOS 기본 설치).

## 설치

```bash
git clone git@github.com:adanbae-dev/llmctl.git
cd llmctl
npm install
```

## 실행

```bash
npm run dev      # http://127.0.0.1:3000
```

기타 스크립트: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm run test`.

> `dev`와 `start`는 일부러 **`127.0.0.1`** 에 바인딩합니다 — 세션의 비밀정보가 화면에 나올 수 있어
> LAN에 노출하지 않습니다. 의도적으로 노출하려면 직접 `-H 0.0.0.0`을 넘기세요.

## 비용 추정

비용은 **추정치**입니다(캐시 read ≈ 0.1× input, write ≈ 1.25×, 5분 TTL 가정).
Claude 단가는 검증되었고, GPT / Gemini 및 모델 미상(Cursor `default` / `composer-1`) 단가는
**근사치**이며 `≈`로 표시됩니다. 단가는 `lib/pricing.ts`에서 조정하세요.

## 아키텍처

- `lib/adapters/*` — 제공자별 어댑터(`discover` / `parse` / `tail`), `lib/adapters/types.ts`의 공통
  모델로 정규화. 각 어댑터는 `tail()` 시접 + `appendable` 플래그를 노출해 실시간 watch(v2)를 무리 없이 추가 가능.
- `lib/usage.ts` — 제공자별 토큰·도구 집계(일자, 모델 기준); `lib/pricing.ts` — 비용.
- `lib/paths.ts` — env/OS 인식 경로 해석; `lib/store.ts` — 휴지통 + 숨김 목록.
- `app/api/*` — 파일시스템 / SQLite를 읽는 Node 런타임 Route Handler.
- `components/*` — 탭, 사이드바, 대화 뷰, 사용량 대시보드, 기간 선택 달력.

## 참고 / 한계

- **Antigravity CLI** 는 응답을 protobuf로 저장 — `history.jsonl`의 사용자 프롬프트만 표시됩니다.
- **Codex 토큰** 은 `token_count` 이벤트를 기록한 세션(긴 세션)에만 나타납니다.
- **Cursor `default`** = Auto 모드 세션은 모델을 고정하지 않아 `default`로 표기, 비용은 근사치.
- **대용량 Codex rollout**(수백 MB+)은 윈도우 처리(시작부 + 최근 ~4MB)되고 "truncated" 배너가 붙습니다.

## 로드맵

- **v2 — 실시간 watch**: 진행 중 세션을 `chokidar` + SSE로 실시간 추적(이미 `tail()` 시접과
  `appendable` 플래그가 준비됨).
