import { FoundationPage } from '../components/FoundationPage'

// ⑦ 감사 · 보안 (4.24 ~ 4.25 · A 전용)

export function AuditLogScreen() {
  return (
    <FoundationPage
      screen="4.24"
      title="감사 로그"
      desc="콘솔·API·권한 변경 행위 추적·보관 (A 전용)."
      group={7}
      roles={['A']}
      planned={['요약 KPI(로그·세션·권한 변경)', '행위 테이블(시간·사용자·행위·대상)', '검색·필터', '1년+ 보관 표시 · 빈상태']}
    />
  )
}

export function AccessControl() {
  return (
    <FoundationPage
      screen="4.25"
      title="접근통제 · 권한"
      desc="관리자/사용자 분리·권한 정책 (A 전용)."
      group={7}
      roles={['A']}
      planned={['요약(정책 수·역할별 허용/거부)', '역할별 정책 2열', '역할별 토글', '최근 권한 변경 로그']}
    />
  )
}
