import { FoundationPage } from '../components/FoundationPage'

// ① 대시보드 · 관제 — 4.2~4.4(자원맵 3계층)은 screens/resourcemap.tsx.

export function MyResources() {
  return (
    <FoundationPage
      screen="4.5"
      title="내 할당 자원"
      desc="호스팅 보유자 본인의 할당 자원 종합 모니터링 (B=C)."
      group={1}
      roles={['A', 'B', 'C']}
      planned={['KpiStat(작업률·VRAM·CPU·MEM)', '토큰 사용량 라인차트', '워크로드·로그', '콘솔·주피터 버튼 · 빈상태→신청현황']}
    />
  )
}

export function RequestStatus() {
  return (
    <FoundationPage
      screen="4.6"
      title="자원 신청현황"
      desc="호스팅 전 사용자가 신청 상태·반려 사유 확인 (B=C)."
      group={1}
      roles={['A', 'B', 'C']}
      planned={['신청 테이블(대기/승인/반려) + 상태 배지', '반려 사유 모달', '신청하러 가기 CTA · 빈상태']}
    />
  )
}

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
