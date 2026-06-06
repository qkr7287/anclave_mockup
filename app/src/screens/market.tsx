import { PageScaffold } from '../components/PageScaffold'

// ④ 마켓플레이스 (4.17 ~ 4.20)

export function Marketplace() {
  return (
    <PageScaffold
      screen="4.17"
      title="마켓플레이스"
      desc="AI 서비스 탐색·검색, API 요청 (공통)."
      preview={['서비스 테이블 + 검색·필터·태그', '최대 사용량 순위', 'API 요청 버튼', '빈상태(필터 결과 없음)']}
    />
  )
}

export function ServiceDetail() {
  return (
    <PageScaffold
      screen="4.18"
      title="서비스(AI) 상세"
      desc="서비스 상세 + 플레이그라운드 체험 (공통)."
      preview={['메타·매뉴얼', 'key별 사용량 라인차트', '플레이그라운드(입력→더미 응답)']}
    />
  )
}

export function ApiApprovals() {
  return (
    <PageScaffold
      screen="4.19"
      title="API 연동"
      desc="받은 API 신청 승인·key 발급·관리 (B · 소유자)."
      preview={['받은 신청 테이블', '승인/반려 → key 발급·복사', '호출량 라인차트', '사용 가이드']}
    />
  )
}

export function Activation() {
  return (
    <PageScaffold
      screen="4.20"
      title="활성화 대시보드"
      desc="AI 활성화·토큰을 발행자/소비자/관리자 관점으로 (공통)."
      preview={['Tabs[발행자 / 소비자 / 관리자]', 'KpiStat · 라인차트', '관리자 귀속(모델×소비자×시간)']}
    />
  )
}
