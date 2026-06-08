import { FoundationPage } from '../components/FoundationPage'

// G8 · 4.17 마켓플레이스 · 4.18 서비스(AI) 상세 (공통). (4.19·4.20=activation)

export function Marketplace() {
  return (
    <FoundationPage
      screen="4.17"
      title="마켓플레이스"
      desc="AI 서비스 탐색·검색, API 요청 (공통)."
      group={4}
      roles={['A', 'B', 'C']}
      planned={['서비스 테이블 + 검색·필터·태그', '최대 사용량 순위', 'API 요청 버튼', '빈상태(필터 결과 없음)']}
    />
  )
}

export function ServiceDetail() {
  return (
    <FoundationPage
      screen="4.18"
      title="서비스(AI) 상세"
      desc="서비스 상세 + 플레이그라운드 체험 (공통)."
      group={4}
      roles={['A', 'B', 'C']}
      planned={['메타·매뉴얼', 'key별 사용량 라인차트', '플레이그라운드(입력→더미 응답)']}
    />
  )
}
