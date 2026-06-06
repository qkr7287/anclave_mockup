import { PageScaffold } from '../components/PageScaffold'

// ⑦ 감사 · 보안 (4.24 ~ 4.25 · A 전용)

export function AuditLogScreen() {
  return (
    <PageScaffold
      screen="4.24"
      title="감사 로그"
      desc="콘솔·API·권한 변경 행위 추적·보관 (A 전용)."
      preview={['행위 테이블(시간·사용자·행위·대상)', '검색·필터', '1년+ 보관 표시', '빈상태(필터 결과 없음)']}
    />
  )
}

export function AccessControl() {
  return (
    <PageScaffold
      screen="4.25"
      title="접근통제 · 권한"
      desc="관리자/사용자 분리·권한 정책 (A 전용)."
      preview={['권한 정책 테이블', '역할별 토글']}
    />
  )
}
