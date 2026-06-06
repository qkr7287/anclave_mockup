import type { ActivationStat, AuditLog, ModelImport } from './types'

// §5 감사 로그 20+ — 콘솔 세션 · 마켓 API 호출 · 권한·할당 변경 (1년+ 보관)
export const auditLogs: AuditLog[] = [
  { id: 'au-01', actorUserId: 'u-kim', action: '콘솔 접속', target: 'srv-01 / gpu-a01', ip: '10.20.3.11', createdAt: '2026-06-06 15:10' },
  { id: 'au-02', actorUserId: 'u-park', action: 'API 호출', target: 'svc-qwen (ak_live_qwen…4e)', ip: '10.20.4.22', createdAt: '2026-06-06 14:58' },
  { id: 'au-03', actorUserId: 'u-admin', action: 'GPU 신청 승인', target: 'gr-01 / u-kim', ip: '10.20.0.2', createdAt: '2026-06-06 11:42' },
  { id: 'au-04', actorUserId: 'u-admin', action: '게시 신청 승인', target: 'pr-01 / qwen-agent', ip: '10.20.0.2', createdAt: '2026-06-05 18:00' },
  { id: 'au-05', actorUserId: 'u-lee', action: '주피터 접속', target: 'srv-04 / gpu-b01', ip: '10.20.4.18', createdAt: '2026-06-05 17:30' },
  { id: 'au-06', actorUserId: 'u-admin', action: '슬라이스 회수', target: 'srv-06-gpu1 (2g)', ip: '10.20.0.2', createdAt: '2026-06-05 17:22' },
  { id: 'au-07', actorUserId: 'u-jung', action: 'API 호출', target: 'svc-llama (ak_live_llama…15)', ip: '10.20.5.7', createdAt: '2026-06-05 16:40' },
  { id: 'au-08', actorUserId: 'u-admin', action: '권한 변경', target: 'u-manager → 호스팅 활성화', ip: '10.20.0.2', createdAt: '2026-06-05 14:05' },
  { id: 'au-09', actorUserId: 'u-yoon', action: '콘솔 접속', target: 'srv-08 / gpu-c02', ip: '10.20.6.31', createdAt: '2026-06-05 13:12' },
  { id: 'au-10', actorUserId: 'u-admin', action: '모델 반입', target: 'Qwen2.5-72B (safetensors)', ip: '10.20.0.2', createdAt: '2026-06-05 10:50' },
  { id: 'au-11', actorUserId: 'u-park', action: 'API 호출', target: 'svc-doc (ak_live_doc…90)', ip: '10.20.4.22', createdAt: '2026-06-05 09:20' },
  { id: 'au-12', actorUserId: 'u-admin', action: 'GPU 신청 반려', target: 'gr-11 / u-han', ip: '10.20.0.2', createdAt: '2026-06-04 17:25' },
  { id: 'au-13', actorUserId: 'u-kim', action: 'API 키 발급', target: 'svc-code → u-yoon', ip: '10.20.3.11', createdAt: '2026-06-04 15:02' },
  { id: 'au-14', actorUserId: 'u-lee', action: 'API 키 발급', target: 'svc-doc → u-lee', ip: '10.20.4.18', createdAt: '2026-06-04 11:40' },
  { id: 'au-15', actorUserId: 'u-admin', action: '기능 플래그 변경', target: 'MIG 메뉴 노출 ON', ip: '10.20.0.2', createdAt: '2026-06-03 16:18' },
  { id: 'au-16', actorUserId: 'u-jung', action: '콘솔 접속', target: 'srv-02 / gpu-a02', ip: '10.20.5.7', createdAt: '2026-06-03 14:30' },
  { id: 'au-17', actorUserId: 'u-admin', action: '변경 신청 승인', target: 'cr-01 / code-assist 확장', ip: '10.20.0.2', createdAt: '2026-06-01 09:35' },
  { id: 'au-18', actorUserId: 'u-han', action: 'API 호출', target: 'svc-stt (요청 반려)', ip: '10.20.7.9', createdAt: '2026-06-01 11:10' },
  { id: 'au-19', actorUserId: 'u-admin', action: '사용자 역할 변경', target: 'u-choi 알림 채널 설정', ip: '10.20.0.2', createdAt: '2026-05-31 10:05' },
  { id: 'au-20', actorUserId: 'u-yoon', action: '주피터 접속', target: 'srv-08 / gpu-c02', ip: '10.20.6.31', createdAt: '2026-05-30 18:22' },
  { id: 'au-21', actorUserId: 'u-admin', action: '인프라 연동 점검', target: 'DCGM Exporter', ip: '10.20.0.2', createdAt: '2026-05-30 09:14' },
  { id: 'au-22', actorUserId: 'u-park', action: '콘솔 접속', target: 'srv-04 / gpu-b01', ip: '10.20.4.22', createdAt: '2026-05-29 16:50' },
]

// §5 활성화 귀속 = 모델×소비자×시간 — 4.20
export const activationStats: ActivationStat[] = [
  { serviceId: 'svc-qwen', modelId: 'm2', consumerUserId: 'u-park', tokens: 4820000, calls: 1620, period: '2026-06' },
  { serviceId: 'svc-qwen', modelId: 'm2', consumerUserId: 'u-choi', tokens: 1240000, calls: 410, period: '2026-06' },
  { serviceId: 'svc-llama', modelId: 'm1', consumerUserId: 'u-jung', tokens: 3610000, calls: 1120, period: '2026-06' },
  { serviceId: 'svc-llama', modelId: 'm1', consumerUserId: 'u-han', tokens: 980000, calls: 320, period: '2026-06' },
  { serviceId: 'svc-code', modelId: 'm7', consumerUserId: 'u-yoon', tokens: 2150000, calls: 810, period: '2026-06' },
  { serviceId: 'svc-doc', modelId: 'm10', consumerUserId: 'u-lee', tokens: 1320000, calls: 510, period: '2026-06' },
  { serviceId: 'svc-stt', modelId: 'm9', consumerUserId: 'u-kim', tokens: 760000, calls: 240, period: '2026-06' },
]

// 4.14 신규 모델 반입 보안 점검 (safetensors·scan·checksum)
export const modelImports: ModelImport[] = [
  { id: 'mi-01', fileName: 'qwen2.5-72b.safetensors', format: 'safetensors', scan: 'pass', checksum: 'sha256:9f2a…c41e', status: 'approved', createdAt: '2026-06-05 10:50' },
  { id: 'mi-02', fileName: 'deepseek-v3.safetensors', format: 'safetensors', scan: 'pass', checksum: 'sha256:1b77…0a2f', status: 'approved', createdAt: '2026-06-02 14:20' },
  { id: 'mi-03', fileName: 'custom-lora.bin', format: 'other', scan: 'fail', checksum: 'sha256:—', status: 'rejected', createdAt: '2026-06-04 09:10' },
  { id: 'mi-04', fileName: 'gemma2-27b.safetensors', format: 'safetensors', scan: 'pending', checksum: '계산 중', status: 'pending', createdAt: '2026-06-06 09:40' },
]
