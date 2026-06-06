import { PageScaffold } from '../components/PageScaffold'

// ③ 모델 관리 (4.12 ~ 4.16)

export function ModelCatalog() {
  return (
    <PageScaffold
      screen="4.12"
      title="모델 카탈로그"
      desc="등록 모델 열람·인기·버전, (A)반입 진입 (공통)."
      preview={['모델 테이블(명·종류·사용량·부가)', '검색·필터', '인기 순위', '(A) 신규 반입 버튼']}
    />
  )
}

export function ModelDetail() {
  return (
    <PageScaffold
      screen="4.13"
      title="모델 상세"
      desc="모델 메타·사용량, GPU 신청 시 선택 (공통)."
      preview={['메타데이터 카드(권장 GPU·라이선스)', '사용 추이 라인차트', 'GPU 신청 시 선택 진입']}
    />
  )
}

export function ModelImportNew() {
  return (
    <PageScaffold
      screen="4.14"
      title="신규 모델 반입"
      desc="폐쇄망 오프라인 반입 + 보안 점검 (A 전용)."
      preview={['업로드 영역', '보안 점검 스텝(safetensors·modelscan·picklescan·체크섬)', '진행률', '메타 → 버전']}
    />
  )
}

export function MyModels() {
  return (
    <PageScaffold
      screen="4.15"
      title="내 모델"
      desc="내가 쓰는 모델 목록, 도입은 게시판 문의 (B=C)."
      preview={['내 모델 테이블', '게시판 문의 링크', '빈상태(쓰는 모델 없음)']}
    />
  )
}

export function Agents() {
  return (
    <PageScaffold
      screen="4.16"
      title="데몬 · 에이전트 관리"
      desc="노드 에이전트 상태·자동 배포 (A 전용)."
      preview={['노드별 에이전트 테이블(버전·상태)', '자동 배포 표시', '오프라인 노드 표시']}
    />
  )
}
