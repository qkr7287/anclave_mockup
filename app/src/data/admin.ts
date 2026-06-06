import type {
  AccessPolicy,
  Agent,
  BoardPost,
  Capability,
  InfraIntegration,
} from './types'

// 4.16 데몬·에이전트 (노드별 · 자동 배포)
export const agents: Agent[] = [
  { id: 'ag-01', nodeId: 'node-a01', serverId: 'srv-01', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-02', nodeId: 'node-a02', serverId: 'srv-02', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-03', nodeId: 'node-a03', serverId: 'srv-03', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-04', nodeId: 'node-b01', serverId: 'srv-04', version: 'v1.8.1', status: 'stale', deployedAt: '2026-05-21 02:10' },
  { id: 'ag-05', nodeId: 'node-b02', serverId: 'srv-05', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-06', nodeId: 'node-b03', serverId: 'srv-06', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-07', nodeId: 'node-c01', serverId: 'srv-07', version: 'v1.8.2', status: 'down', deployedAt: '2026-06-04 02:10' },
  { id: 'ag-08', nodeId: 'node-c02', serverId: 'srv-08', version: 'v1.8.2', status: 'active', deployedAt: '2026-06-04 02:10' },
]

// 4.23 게시판 — 공지/문의·Q&A/매뉴얼
export const boardPosts: BoardPost[] = [
  { id: 'bp-01', tab: 'notice', title: '[공지] 6월 정기 점검 안내 (srv-07 드라이버 교체)', body: '6/7 02:00~04:00 srv-07 점검이 예정돼 있어요.', authorId: 'u-admin', answered: false, createdAt: '2026-06-06 09:00' },
  { id: 'bp-02', tab: 'notice', title: '[공지] 신규 모델 Qwen2.5-72B 반입 완료', body: '카탈로그에서 확인할 수 있어요.', authorId: 'u-admin', answered: false, createdAt: '2026-06-05 11:00' },
  { id: 'bp-03', tab: 'qna', title: '[문의] DeepSeek-V3 도입 가능할까요?', body: '대형 학습용으로 DeepSeek-V3 도입 문의드려요.', authorId: 'u-han', answered: true, createdAt: '2026-06-04 14:20' },
  { id: 'bp-04', tab: 'qna', title: '[문의] API 키 재발급 절차', body: '키를 분실했는데 재발급은 어떻게 하나요?', authorId: 'u-choi', answered: true, createdAt: '2026-06-03 10:35' },
  { id: 'bp-05', tab: 'qna', title: '[문의] 슬라이스 확장 신청 위치', body: '확장 신청은 어느 메뉴에서 하나요?', authorId: 'u-user', answered: false, createdAt: '2026-06-06 13:10' },
  { id: 'bp-06', tab: 'manual', title: '[매뉴얼] qwen-agent 사용 가이드', body: 'qwen-agent API 연동·플레이그라운드 사용법.', authorId: 'u-kim', answered: false, createdAt: '2026-05-28 09:00' },
  { id: 'bp-07', tab: 'manual', title: '[매뉴얼] GPU 신청 마법사 작성법', body: '용량·모델·환경·목적 단계별 작성 안내.', authorId: 'u-admin', answered: false, createdAt: '2026-05-25 09:00' },
]

// 4.25 접근통제·권한 (역할별 정책)
export const accessPolicies: AccessPolicy[] = [
  { id: 'ap-01', role: 'admin', resource: '전체 자원맵 / 관제 모니터링', allow: true },
  { id: 'ap-02', role: 'admin', resource: 'GPU·게시 승인 / 회수', allow: true },
  { id: 'ap-03', role: 'admin', resource: '신규 모델 반입(보안 점검)', allow: true },
  { id: 'ap-04', role: 'admin', resource: '감사 로그 / 시스템 설정', allow: true },
  { id: 'ap-05', role: 'user', resource: '마켓·모델 카탈로그 열람', allow: true },
  { id: 'ap-06', role: 'user', resource: 'GPU·API·게시 신청(보내기)', allow: true },
  { id: 'ap-07', role: 'user', resource: '받은 API 신청 승인(자기 서비스)', allow: true },
  { id: 'ap-08', role: 'user', resource: '전체 자원맵 / 관제 모니터링', allow: false },
  { id: 'ap-09', role: 'user', resource: '신규 모델 반입 / 감사 로그', allow: false },
]

// 4.26 능력 탐지·기능 플래그 (지원 매트릭스)
export const capabilities: Capability[] = [
  { gpuGen: 'H100 (Hopper)', migSupported: true, orchestrator: 'Kubernetes + GPU Operator', enabledFeatures: ['MIG', 'NVLink', 'DCGM', 'Time-Slicing'] },
  { gpuGen: 'A100 (Ampere)', migSupported: true, orchestrator: 'Kubernetes + GPU Operator', enabledFeatures: ['MIG', 'NVLink', 'DCGM'] },
  { gpuGen: 'L40S (Ada)', migSupported: false, orchestrator: 'Kubernetes', enabledFeatures: ['DCGM', 'Time-Slicing'] },
  { gpuGen: 'RTX 6000 (Ada)', migSupported: false, orchestrator: '미지원', enabledFeatures: ['DCGM'] },
]

// 4.28 인프라 연동 (DCGM·Prometheus·오케스트레이터)
export const infraIntegrations: InfraIntegration[] = [
  { id: 'in-01', kind: 'dcgm', name: 'DCGM Exporter', endpoint: 'http://dcgm.anclave.local:9400/metrics', status: 'connected' },
  { id: 'in-02', kind: 'prometheus', name: 'Prometheus', endpoint: 'http://prom.anclave.local:9090', status: 'connected' },
  { id: 'in-03', kind: 'metrics', name: 'Metrics Gateway', endpoint: 'http://metrics.anclave.local:8428', status: 'connected' },
  { id: 'in-04', kind: 'orchestrator', name: 'Kubernetes API', endpoint: 'https://k8s.anclave.local:6443', status: 'down' },
]
