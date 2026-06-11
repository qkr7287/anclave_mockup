import { FoundationPage } from '../components/FoundationPage'

// G9 · 마켓 사용자 액션 — 4.19 API 신청 관리(B·소유자) · 4.29 서비스 게시 신청(B=C). (4.20 활성화 대시보드는 제거됨)

export function ApiApprovals() {
  return (
    <FoundationPage
      screen="4.19"
      title="API 신청 관리"
      desc="내가 마켓에 올린 서비스에 대해 다른 사용자가 요청한 API key 신청을 승인·관리 (B · 소유자)."
      group={4}
      roles={['A', 'B']}
      planned={['요약: 내 서비스별 발급 key 수(어떤 서비스에 몇 개)·총 발급·대기 신청', '받은 API key 신청 테이블(요청자·대상 서비스·신청일·상태)', '승인 → key 발급·복사 / 반려', '서비스별 발급 현황']}
    />
  )
}

export function PublishRequest() {
  return (
    <FoundationPage
      screen="4.29"
      title="서비스 게시 신청"
      desc="내가 배포한 서비스를 마켓에 게시 신청하고, 내 신청 현황을 확인 (B=C). → 관리자 게시 승인(4.9)."
      group={4}
      roles={['A', 'B', 'C']}
      planned={['내 게시 신청 목록(서비스·신청일·상태 대기/승인/반려) — 자원 신청현황처럼 깔끔', '신규 게시 신청(내 배포 서비스 선택 + 게시 정보 입력)', '상태 배지·반려 사유 확인']}
    />
  )
}
