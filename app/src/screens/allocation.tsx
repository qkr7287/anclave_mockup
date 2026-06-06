import { PageScaffold } from '../components/PageScaffold'

// ② 할당 관리 (4.8 ~ 4.11)

export function Requests() {
  return (
    <PageScaffold
      screen="4.8"
      title="신청 관리"
      desc="API · GPU 번들 · 게시 신청 작성, 상태 추적 (B=C)."
      preview={['Tabs[API / GPU 번들 / 게시]', 'GPU 마법사(세로 스텝 · 공문 첨부)', '내 신청 테이블 + 상태 배지']}
    />
  )
}

export function ApprovalsPublish() {
  return (
    <PageScaffold
      screen="4.9"
      title="게시 승인 관리"
      desc="게시 신청 검토 → 승인(마켓 노출)/반려 (A 전용)."
      preview={['대기 신청 테이블', '상세 드로어', '승인/반려 모달', '앱 내 알림 토스트']}
    />
  )
}

export function ApprovalsGpu() {
  return (
    <PageScaffold
      screen="4.10"
      title="GPU 승인 관리"
      desc="GPU 신청 검토(공문) → 자원맵 서버 선택 할당 (A 전용)."
      preview={['Tabs[대기 / 기 승인·반려]', '검토 드로어', '승인 시 헥사곤 서버 선택', '반려 모달']}
    />
  )
}

export function GpuChange() {
  return (
    <PageScaffold
      screen="4.11"
      title="변경 · 확장 · 이전 · 회수"
      desc="변경 신청 → 4케이스 승인·결과, 직접 회수 (B=C 신청 · A 승인)."
      preview={['신청 폼', '4케이스(expand/migrate/change/reclaim) 결과', '자원맵 전/후 비교', '직접 회수(유휴 탐지)']}
    />
  )
}
