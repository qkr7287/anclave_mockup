import { PageScaffold } from '../components/PageScaffold'

// ⑧ 시스템 설정 (4.26 ~ 4.28 · A 전용)

export function Capabilities() {
  return (
    <PageScaffold
      screen="4.26"
      title="능력 탐지 · 기능 플래그"
      desc="GPU·MIG 탐지·지원 매트릭스·기능 on/off (A 전용)."
      preview={['지원 매트릭스 테이블', '기능 토글 스위치(MIG 메뉴 등)', '미지원 GPU/오케스트레이터 ❌ 표시']}
    />
  )
}

export function UsersAdmin() {
  return (
    <PageScaffold
      screen="4.27"
      title="사용자 · 역할 관리"
      desc="사용자·역할 관리, 알림 채널 (A 전용)."
      preview={['사용자 테이블(사용자·역할)', '역할 셀렉트', '알림 채널 설정']}
    />
  )
}

export function InfraIntegrationScreen() {
  return (
    <PageScaffold
      screen="4.28"
      title="인프라 연동"
      desc="DCGM·Prometheus·오케스트레이터 연동 (A 전용)."
      preview={['연동 카드 목록', '상태 배지(connected/down)', '엔드포인트 표시']}
    />
  )
}
