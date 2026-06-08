import { FoundationPage } from '../components/FoundationPage'

// G4 · 4.9 게시 승인 관리 · 4.10 GPU 승인 관리 (A 전용)

export function ApprovalsPublish() {
  return (
    <FoundationPage
      screen="4.9"
      title="게시 승인 관리"
      desc="게시 신청 검토 → 승인(마켓 노출)/반려 (A 전용)."
      group={2}
      roles={['A']}
      planned={['대기 신청 테이블', '상세 드로어', '승인/반려 모달', '앱 내 알림 토스트']}
    />
  )
}

export function ApprovalsGpu() {
  return (
    <FoundationPage
      screen="4.10"
      title="GPU 승인 관리"
      desc="GPU 신청 검토(공문) → 자원맵 서버 선택 할당 (A 전용)."
      group={2}
      roles={['A']}
      planned={['Tabs[대기 / 기 승인·반려]', '검토 드로어', '승인 시 헥사곤 서버 선택', '반려 모달']}
    />
  )
}
