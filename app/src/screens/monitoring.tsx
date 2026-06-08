import { FoundationPage } from '../components/FoundationPage'

// G11 · 4.7 관제 모니터링 (관제실 빅스크린)

export function AdminMonitoring() {
  return (
    <FoundationPage
      screen="4.7"
      title="관제 모니터링"
      desc="관제실 빅스크린 — 전체 종합 실시간 (A 전용)."
      group={1}
      roles={['A']}
      planned={['헬스 히트맵', 'KpiStat 종합', '부하·알럿 라인차트', '빅스크린 그리드 레이아웃']}
    />
  )
}
