// Metric glossary — plain, non-exaggerated "what it means / good-or-bad" copy
// surfaced via <InfoDot>. Estimation & source disclosure lives here too so the
// dashboard speaks with one voice instead of scattered footnotes.
export const GLOSSARY = {
  cost: '제공자 공개 단가로 계산한 추정 비용입니다. 실제 청구액과 다를 수 있습니다.',
  costApprox:
    '단가 미검증 모델(GPT·Gemini, 또는 모델 미기록 Cursor→Opus 단가 가정)이 포함되어 ‘≈’로 표시됩니다.',
  estimateMethod: '추정 방법: 캐시 read 0.1× · write 1.25×, 5분 TTL 가정. 단가는 lib/pricing.ts에서 조정.',
  output: '모델이 실제로 생성한 토큰. ‘생성량’의 가장 정확한 지표입니다.',
  input: '모델에 보낸 토큰. 매 턴 컨텍스트가 재전송돼 합계가 부풀려질 수 있어, 생성량은 출력을 보세요.',
  cacheRead: '캐시에서 재사용된 입력 토큰. 단가가 낮아(0.1×) 비용을 줄입니다.',
  cacheHit: '전체 입력 중 캐시로 충당된 비율. 높을수록 비용 효율이 좋습니다.',
  cacheSaved: '캐시 read를 정가 입력으로 환산한 대비 절약한 추정 금액입니다.',
  outInRatio: '입력 대비 출력 토큰 비율. 낮으면 큰 컨텍스트에 짧게 답한 셈입니다.',
  truncation: 'max_tokens 등으로 응답이 잘린 비율. 높으면(>5%) 출력 한도를 늘릴 여지가 있습니다.',
  toolError: '차단·실패한 도구 결과 비율(차단된 hook 호출 포함). 높은 도구는 워크플로 점검 대상입니다.',
  wholeRange: '전체 기간 기준 — 위의 기간 필터와 무관합니다.',
} as const
