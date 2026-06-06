import { PageScaffold } from '../components/PageScaffold'

// ⑤ 이벤트 · 알림 (4.21 ~ 4.22)

export function Events() {
  return (
    <PageScaffold
      screen="4.21"
      title="에러 · 이벤트 관제"
      desc="알럿 → 이벤트 → 상세 → 문제 GPU 추적 (A·B)."
      preview={['타임라인(심각도 4분류) + 검색·필터 칩', '상세 드로어(상태·담당·조치)', '문제 GPU 링크', '빈상태']}
    />
  )
}

export function Notifications() {
  return (
    <PageScaffold
      screen="4.22"
      title="알림 센터"
      desc="앱 내 알림 3종 확인 (공통 · 메일 미사용)."
      preview={['알림 목록(할당·승인 / 헬스·에러 / 회수 권고)', '모두 읽음', '항목 클릭 → 해당 화면', '빈상태']}
    />
  )
}
