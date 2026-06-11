import { FoundationPage } from '../components/FoundationPage'

// G4 · 4.9 게시 승인 관리 · 4.10 GPU 승인 관리 (A 전용)

export function ApprovalsPublish() {
  return (
    <FoundationPage
      screen="4.9"
      title="게시 승인 관리"
      desc="마켓플레이스 게시(서비스 노출) 신청 검토 → 승인/반려 (A 전용)."
      group={4}
      roles={['A']}
      planned={['대기 게시 신청 테이블', '상세 드로어(서비스 메타)', '승인=마켓 노출 / 반려=사유', '앱 내 알림 토스트']}
    />
  )
}

export function ApprovalsGpu() {
  return (
    <FoundationPage
      screen="4.10"
      title="승인 관리"
      desc="GPU 자원 신청 검토 → 승인/반려·서버 할당 (A 전용) · 4.6 자원 신청현황의 관리자 버전."
      group={2}
      roles={['A']}
      planned={['stat 카드(대기/승인/반려/오늘)', '검색·필터 바', '신청 목록 테이블(신청자·자원·사유·상태·검토)', '검토 드로어 → 승인 시 헥사곤 서버 선택 / 반려 사유', '토스트 + 대기수 감소']}
    />
  )
}
