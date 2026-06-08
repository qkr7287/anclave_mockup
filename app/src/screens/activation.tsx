import { FoundationPage } from '../components/FoundationPage'

// G9 · 4.19 API 연동 (B · 소유자). (4.20 "활성화 대시보드"는 제거됨)

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
