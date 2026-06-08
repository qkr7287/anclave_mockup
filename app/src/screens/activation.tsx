import { FoundationPage } from '../components/FoundationPage'

// G9 · 4.19 API 연동(B·소유자) · 4.20 활성화 대시보드(공통)

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

export function Activation() {
  return (
    <FoundationPage
      screen="4.20"
      title="활성화 대시보드"
      desc="AI 활성화·토큰을 발행자/소비자/관리자 관점으로 (공통)."
      group={4}
      roles={['A', 'B', 'C']}
      planned={['Tabs[발행자 / 소비자 / 관리자]', 'KPI행(소비자·토큰·호출)', '토큰·호출 추이 라인차트', '상위 서비스·모델 랭킹 + 소비자별 분포']}
    />
  )
}
