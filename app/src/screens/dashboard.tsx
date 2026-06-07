import { FoundationPage } from '../components/FoundationPage'

// ① 대시보드 · 관제 (4.2 ~ 4.7)

export function ResourceMap() {
  return (
    <FoundationPage
      screen="4.2"
      title="전체 서버 모니터링"
      desc="모든 서버 헬스·MIG 현황·이벤트를 한눈에 — 자원맵 Step 1 (A 전용)."
      group={1}
      roles={['A']}
      planned={['좌: 헥사곤 자원맵(서버 8 타일 + GPU4 미니)', '우상: 전체 MIG 슬라이스 현황(전체/서버별 토글)', '우하: 전체 서버 이벤트 로그', '크리티컬 알람 센터 오버레이']}
    />
  )
}

export function ServerDetail() {
  return (
    <FoundationPage
      screen="4.3"
      title="단일 서버 모니터링"
      desc="서버 1대 GPU 전체의 슬라이스 분할·할당·KPI — 자원맵 Step 2 (A 전용)."
      group={1}
      roles={['A']}
      planned={['좌: 서버 GPU 4장 헥사곤', '우상: CPU·RAM·GPU KpiStat + 라인차트', '우하: GPU 테이블 + 올라간 서비스', '플로팅(콘솔·주피터·이벤트) · Step 뒤로']}
    />
  )
}

export function GpuDetail() {
  return (
    <FoundationPage
      screen="4.4"
      title="GPU 상세 모니터링"
      desc="GPU 1대 상세·슬라이스·올라간 서비스 — 자원맵 Step 3 (A 전용)."
      group={1}
      roles={['A']}
      planned={['KPI 꺾은선(작업률·VRAM·온도·전력)', '슬라이스 분할(사용자·모델·컨테이너)', '최근 활동 타임라인', '올라간 서비스 · 워크스페이스 버튼']}
    />
  )
}

export function MyResources() {
  return (
    <FoundationPage
      screen="4.5"
      title="내 할당 자원"
      desc="호스팅 보유자 본인의 할당 자원 종합 모니터링 (B=C)."
      group={1}
      roles={['A', 'B', 'C']}
      planned={['KpiStat(작업률·VRAM·CPU·MEM)', '토큰 사용량 라인차트', '워크로드·로그', '콘솔·주피터 버튼 · 빈상태→신청현황']}
    />
  )
}

export function RequestStatus() {
  return (
    <FoundationPage
      screen="4.6"
      title="자원 신청현황"
      desc="호스팅 전 사용자가 신청 상태·반려 사유 확인 (B=C)."
      group={1}
      roles={['A', 'B', 'C']}
      planned={['신청 테이블(대기/승인/반려) + 상태 배지', '반려 사유 모달', '신청하러 가기 CTA · 빈상태']}
    />
  )
}

export function AdminMonitoring() {
  return (
    <FoundationPage
      screen="4.7"
      title="관제 모니터링"
      desc="관제실 빅스크린 — 전체 종합 실시간 (A 전용)."
      group={1}
      roles={['A']}
      planned={['헬스 히트맵', 'KpiStat 종합', '부하·알럿 라인차트', '빅스크린 그리드 레이아웃']}
    />
  )
}
