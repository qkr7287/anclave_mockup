import { FoundationPage } from '../components/FoundationPage'

// G3 · 할당 관리 — 4.8 신청 관리 · 4.11 변경·확장·이전·회수. (4.9·4.10=approvals)

export function Requests() {
  return (
    <FoundationPage
      screen="4.8"
      title="신청 관리"
      desc="API · GPU 번들 · 게시 신청 작성, 상태 추적 (B=C)."
      group={2}
      roles={['A', 'B', 'C']}
      planned={['Tabs[API / GPU 번들 / 게시]', 'GPU 마법사(세로 스텝 · 공문 첨부)', '내 신청 테이블 + 상태 배지']}
    />
  )
}

export function GpuChange() {
  return (
    <FoundationPage
      screen="4.11"
      title="변경 · 확장 · 이전 · 회수"
      desc="변경 신청 → 4케이스 승인·결과, 직접 회수 (B=C 신청 · A 승인)."
      group={2}
      roles={['A', 'B', 'C']}
      planned={['신청 폼', '4케이스(expand/migrate/change/reclaim) 결과', '자원맵 전/후 비교', '직접 회수(유휴 탐지)']}
    />
  )
}
