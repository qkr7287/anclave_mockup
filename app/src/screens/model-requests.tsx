import { FoundationPage } from '../components/FoundationPage'

// G6 · 4.14 모델 신청 관리 (A 전용)
// 사용자(B/C)는 카탈로그에 없는 모델 등록을 신청만 하고,
// 관리자(A)가 이 화면에서 검토 → 반입(파일 업로드·보안점검·체크섬) → 카탈로그 등록 / 반려.

export function ModelRequests() {
  return (
    <FoundationPage
      screen="4.14"
      title="모델 신청 관리"
      desc="사용자 모델 등록 신청을 검토하고, 승인 시 반입·보안점검·카탈로그 등록까지 처리 (A 전용)."
      group={3}
      roles={['A']}
      planned={[
        '신청 목록 테이블(신청자·모델명·사유·신청일·상태·액션)',
        '신청 상세/검토 — 승인 시 반입 스텝(safetensors·modelscan·picklescan·체크섬)',
        '보안 점검 진행률 + 메타 → 카탈로그 모델 등록',
        '반려(사유 입력)',
      ]}
    />
  )
}
