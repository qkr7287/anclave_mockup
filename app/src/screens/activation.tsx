import { FoundationPage } from '../components/FoundationPage'

// G9 · 마켓 사용자 액션 — 4.19 API 연동(B·소유자) · 4.29 서비스 게시 신청(B=C). (4.20 활성화 대시보드는 제거됨)

export function ApiApprovals() {
  return (
    <FoundationPage
      screen="4.19"
      title="API 연동"
      desc="받은 API 신청 승인·key 발급·관리 (B · 소유자)."
      group={4}
      roles={['A', 'B']}
      planned={['받은 신청 테이블', '승인/반려 → key 발급·복사', '호출량 라인차트', '사용 가이드']}
    />
  )
}

export function PublishRequest() {
  return (
    <FoundationPage
      screen="4.29"
      title="서비스 게시 신청"
      desc="내가 배포한 AI 서비스를 마켓플레이스에 게시 신청 (B=C). → 관리자 게시 승인(4.9)으로."
      group={4}
      roles={['A', 'B', 'C']}
      planned={['내 배포 서비스 선택(올라간 서비스)', '게시 정보 입력(소개·태그·공개 범위·요금)', '신청 → 게시 승인 대기', '내 게시 신청 상태(대기/승인/반려) 목록']}
    />
  )
}
