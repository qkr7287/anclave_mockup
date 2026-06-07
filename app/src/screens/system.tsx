import { FoundationPage } from '../components/FoundationPage'

// ⑧ 시스템 설정 (4.26 ~ 4.28 · A 전용)

export function Capabilities() {
  return (
    <FoundationPage
      screen="4.26"
      title="능력 탐지 · 기능 플래그"
      desc="GPU·MIG 탐지·지원 매트릭스·기능 on/off (A 전용)."
      group={8}
      roles={['A']}
      planned={['요약 KPI(지원 세대·MIG 지원율·켜진 플래그)', '지원 매트릭스 테이블', '기능 플래그 그리드(토글)', '최근 탐지/변경 로그']}
    />
  )
}

export function UsersAdmin() {
  return (
    <FoundationPage
      screen="4.27"
      title="사용자 · 역할 관리"
      desc="사용자·역할 관리, 알림 채널 (A 전용)."
      group={8}
      roles={['A']}
      planned={['요약 KPI(사용자·역할 분포·호스팅 보유)', '사용자 테이블 + 역할 셀렉트', '역할/권한 요약 패널', '알림 채널 설정']}
    />
  )
}

export function InfraIntegrationScreen() {
  return (
    <FoundationPage
      screen="4.28"
      title="인프라 연동"
      desc="DCGM·Prometheus·오케스트레이터 연동 (A 전용)."
      group={8}
      roles={['A']}
      planned={['요약 KPI(연동 수·정상·끊김)', '연동 카드 그리드(상태 배지)', '엔드포인트 표시', '최근 헬스체크/이벤트 로그']}
    />
  )
}
