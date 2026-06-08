import { FoundationPage } from '../components/FoundationPage'

// G5 · 4.12 모델 카탈로그 · 4.13 모델 상세 (공통)

export function ModelCatalog() {
  return (
    <FoundationPage
      screen="4.12"
      title="모델 카탈로그"
      desc="등록 모델 열람·인기·버전, (A)반입 진입 (공통)."
      group={3}
      roles={['A', 'B', 'C']}
      planned={['모델 테이블(명·종류·사용량·부가)', '검색·필터', '인기 순위', '(A) 신규 반입 버튼']}
    />
  )
}

export function ModelDetail() {
  return (
    <FoundationPage
      screen="4.13"
      title="모델 상세"
      desc="모델 메타·사용량, GPU 신청 시 선택 (공통)."
      group={3}
      roles={['A', 'B', 'C']}
      planned={['메타데이터 카드(권장 GPU·라이선스)', '사용 추이 라인차트', 'GPU 신청 시 선택 진입']}
    />
  )
}
