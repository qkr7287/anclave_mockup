import type { EventLog, Notification } from './types'

// §5 이벤트 — 7노드 기준(RTX PRO 4500 Blackwell MIG · 컨슈머 GPU 단일) · 심각도 4분류
export const events: EventLog[] = [
  { id: 'ev-01', severity: 'critical', status: 'open', serverId: 'srv-07', gpuId: 'srv-07-gpu0', message: 'XID 79 — GTX 1070 응답 없음(드라이버). 점검 모드 전환', createdAt: '2026-06-06 15:02', read: false, assignee: 'admin', action: '드라이버 재설치 예정' },
  { id: 'ev-02', severity: 'warn', status: 'open', serverId: 'srv-04', gpuId: 'srv-04-gpu0', message: 'RTX 2070 SUPER 온도 78°C — 경고 임계 근접', createdAt: '2026-06-06 14:30', read: false },
  { id: 'ev-03', severity: 'warn', status: 'open', serverId: 'srv-01', gpuId: 'srv-01-gpu0', message: 'RTX PRO 4500 · 16GB 인스턴스 부하 71% — 모니터링', createdAt: '2026-06-06 14:10', read: true },
  { id: 'ev-04', severity: 'info', status: 'resolved', serverId: 'srv-01', gpuId: 'srv-01-gpu0', message: 'RTX PRO 4500 MIG 인스턴스(16GB) llama-chat 할당 완료', createdAt: '2026-06-06 11:40', read: true },
  { id: 'ev-05', severity: 'info', status: 'resolved', serverId: 'srv-02', gpuId: 'srv-02-gpu0', message: 'RTX 5070에 sd-image 단일 GPU 할당 완료', createdAt: '2026-06-06 11:25', read: true },
  { id: 'ev-06', severity: 'info', status: 'resolved', serverId: 'srv-06', gpuId: 'srv-06-gpu0', message: 'RTX 3060 Ti에 vision-qa 단일 GPU 할당 완료', createdAt: '2026-06-06 11:05', read: true },
  { id: 'ev-07', severity: 'info', status: 'resolved', serverId: 'srv-03', gpuId: 'srv-03-gpu0', message: 'RTX 2060 SUPER에 code-assist 단일 GPU 할당 완료', createdAt: '2026-06-06 10:30', read: true },
  { id: 'ev-08', severity: 'warn', status: 'resolved', serverId: 'srv-04', gpuId: 'srv-04-gpu0', message: '전력 205W — 권장 상한 근접', createdAt: '2026-06-06 09:50', read: true, resolution: '워크로드 분산으로 정상화' },
  { id: 'ev-09', severity: 'info', status: 'resolved', serverId: 'srv-05', gpuId: 'srv-05-gpu0', message: 'RTX 2060 유휴 전환 — 미할당 상태', createdAt: '2026-06-05 17:22', read: true },
  { id: 'ev-10', severity: 'recovered', status: 'resolved', serverId: 'srv-03', gpuId: 'srv-03-gpu0', message: 'RTX 2060 SUPER · code-assist 모델 로드 복구 완료', createdAt: '2026-06-05 16:10', read: true, resolution: '컨테이너 재기동' },
  { id: 'ev-11', severity: 'recovered', status: 'resolved', serverId: 'srv-01', gpuId: 'srv-01-gpu0', message: 'RTX PRO 4500 · 16GB 유휴 인스턴스 회수 — 가용 +1', createdAt: '2026-06-05 13:48', read: true },
]

// §5 알림 8 — 할당·승인(alloc) / 헬스·에러(health) / 회수 권고(reclaim) 3종 · 읽음/안읽음 혼합
export const notifications: Notification[] = [
  { id: 'nt-01', category: 'health', message: 'srv-07 GPU XID 79 장애가 발생했어요. 점검이 필요해요.', createdAt: '2026-06-06 15:02', read: false, link: '/events' },
  { id: 'nt-02', category: 'health', message: 'srv-04(RTX 2070 SUPER) 온도 경고가 감지됐어요.', createdAt: '2026-06-06 14:30', read: false, link: '/resource-map/srv-04' },
  { id: 'nt-03', category: 'alloc', message: 'GPU 신청(llama-train)이 승인됐어요.', createdAt: '2026-06-06 11:42', read: false, link: '/requests/status' },
  { id: 'nt-04', category: 'alloc', message: 'API 키가 발급됐어요 — doc-search 연동.', createdAt: '2026-06-06 10:20', read: true, link: '/api-approvals' },
  { id: 'nt-05', category: 'alloc', message: '게시 신청(qwen-agent)이 승인돼 마켓에 노출됐어요.', createdAt: '2026-06-05 18:00', read: true, link: '/marketplace' },
  { id: 'nt-06', category: 'reclaim', message: 'srv-06 유휴 슬라이스 회수를 권고해요.', createdAt: '2026-06-05 17:20', read: false, link: '/requests/gpu-change' },
  { id: 'nt-07', category: 'reclaim', message: 'srv-01(RTX PRO 4500) 신규 할당 대기 인스턴스가 있어요.', createdAt: '2026-06-05 12:10', read: true, link: '/admin/approvals/gpu' },
  { id: 'nt-08', category: 'alloc', message: '변경 신청(code-assist 확장)이 승인됐어요.', createdAt: '2026-06-01 09:35', read: true, link: '/requests/status' },
]
