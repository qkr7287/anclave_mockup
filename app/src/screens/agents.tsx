import { FoundationPage } from '../components/FoundationPage'

// G7 · 4.16 데몬 · 에이전트 관리 (A 전용)

export function Agents() {
  return (
    <FoundationPage
      screen="4.16"
      title="데몬 · 에이전트 관리"
      desc="노드 에이전트 상태·자동 배포 (A 전용)."
      group={3}
      roles={['A']}
      planned={['노드별 에이전트 테이블(버전·상태)', '자동 배포 표시', '오프라인 노드 표시']}
    />
  )
}
