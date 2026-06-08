import { FoundationPage } from '../components/FoundationPage'

// G6 · 4.14 신규 모델 반입(A·보안관문) · 4.15 내 모델(B=C)

export function ModelImportNew() {
  return (
    <FoundationPage
      screen="4.14"
      title="신규 모델 반입"
      desc="폐쇄망 오프라인 반입 + 보안 점검 (A 전용)."
      group={3}
      roles={['A']}
      planned={['업로드 영역', '보안 점검 스텝(safetensors·modelscan·picklescan·체크섬)', '진행률', '메타 → 버전']}
    />
  )
}

export function MyModels() {
  return (
    <FoundationPage
      screen="4.15"
      title="내 모델"
      desc="내가 쓰는 모델 목록, 도입은 게시판 문의 (B=C)."
      group={3}
      roles={['A', 'B', 'C']}
      planned={['내 모델 테이블', '게시판 문의 링크', '빈상태(쓰는 모델 없음)']}
    />
  )
}
