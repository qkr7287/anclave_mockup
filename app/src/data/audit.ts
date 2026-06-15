import type { ActivationStat, AuditLog, ModelRequest } from './types'

// §5 감사 로그 20+ — 콘솔 세션 · 마켓 API 호출 · 권한·할당 변경 (1년+ 보관)
export const auditLogs: AuditLog[] = [
  { id: 'au-01', actorUserId: 'u-kim', action: '콘솔 접속', target: 'srv-01 / gpu-a01', ip: '10.20.3.11', createdAt: '2026-06-06 15:10' },
  { id: 'au-02', actorUserId: 'u-park', action: 'API 호출', target: 'svc-qwen (ak_live_qwen…4e)', ip: '10.20.4.22', createdAt: '2026-06-06 14:58' },
  { id: 'au-03', actorUserId: 'u-admin', action: 'GPU 신청 승인', target: 'gr-01 / u-kim', ip: '10.20.0.2', createdAt: '2026-06-06 11:42' },
  { id: 'au-04', actorUserId: 'u-admin', action: '게시 신청 승인', target: 'pr-01 / qwen-agent', ip: '10.20.0.2', createdAt: '2026-06-05 18:00' },
  { id: 'au-05', actorUserId: 'u-lee', action: '주피터 접속', target: 'srv-04 / gpu-a04', ip: '10.20.4.18', createdAt: '2026-06-05 17:30' },
  { id: 'au-06', actorUserId: 'u-admin', action: '슬라이스 회수', target: 'srv-05-gpu0 (RTX 2060 · 유휴 회수)', ip: '10.20.0.2', createdAt: '2026-06-05 17:22' },
  { id: 'au-07', actorUserId: 'u-jung', action: 'API 호출', target: 'svc-llama (ak_live_llama…15)', ip: '10.20.5.7', createdAt: '2026-06-05 16:40' },
  { id: 'au-08', actorUserId: 'u-admin', action: '권한 변경', target: 'u-manager → 호스팅 활성화', ip: '10.20.0.2', createdAt: '2026-06-05 14:05' },
  { id: 'au-09', actorUserId: 'u-yoon', action: '콘솔 접속', target: 'srv-08 / gpu-a08', ip: '10.20.6.31', createdAt: '2026-06-05 13:12' },
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
  { id: 'au-20', actorUserId: 'u-yoon', action: '주피터 접속', target: 'srv-08 / gpu-a08', ip: '10.20.6.31', createdAt: '2026-05-30 18:22' },
  { id: 'au-21', actorUserId: 'u-admin', action: '인프라 연동 점검', target: 'DCGM Exporter', ip: '10.20.0.2', createdAt: '2026-05-30 09:14' },
  { id: 'au-22', actorUserId: 'u-park', action: '콘솔 접속', target: 'srv-04 / gpu-a04', ip: '10.20.4.22', createdAt: '2026-05-29 16:50' },
]

// §5 활성화 귀속 = 모델×소비자×시간 — 4.20
export const activationStats: ActivationStat[] = [
  { serviceId: 'svc-qwen', modelId: 'm12', consumerUserId: 'u-park', tokens: 4820000, calls: 1620, period: '2026-06' },
  { serviceId: 'svc-qwen', modelId: 'm12', consumerUserId: 'u-choi', tokens: 1240000, calls: 410, period: '2026-06' },
  { serviceId: 'svc-llama', modelId: 'm11', consumerUserId: 'u-jung', tokens: 3610000, calls: 1120, period: '2026-06' },
  { serviceId: 'svc-llama', modelId: 'm11', consumerUserId: 'u-han', tokens: 980000, calls: 320, period: '2026-06' },
  { serviceId: 'svc-code', modelId: 'm13', consumerUserId: 'u-yoon', tokens: 2150000, calls: 810, period: '2026-06' },
  { serviceId: 'svc-doc', modelId: 'm10', consumerUserId: 'u-lee', tokens: 1320000, calls: 510, period: '2026-06' },
  { serviceId: 'svc-stt', modelId: 'm9', consumerUserId: 'u-kim', tokens: 760000, calls: 240, period: '2026-06' },
]

// 4.14 신규 모델 반입 보안 점검 (safetensors·scan·checksum)
// 4.14 모델 신청 — 사용자가 등록 신청, 관리자가 반입(파일·보안점검·체크섬)·등록 처리.
// stage: requested→scanning→scanned→deployed / rejected. 카탈로그는 deployed 만 노출.
export const modelRequests: ModelRequest[] = [
  // 배포 완료 — registeredModelId 로 카탈로그 등록됨
  { id: 'mr-01', requesterUserId: 'u-kim', modelName: 'Qwen2.5-72B', kind: 'LLM', source: 'huggingface.co/Qwen/Qwen2.5-72B', reason: '코드 자동화 에이전트용 최신 LLM 필요', status: 'approved', stage: 'deployed', createdAt: '2026-06-05 09:30', processedAt: '2026-06-05 10:50', processedBy: 'u-admin', fileName: 'qwen2.5-72b.safetensors', format: 'safetensors', scan: 'pass', checksum: 'sha256:9f2a…c41e', registeredModelId: 'm12' },
  { id: 'mr-02', requesterUserId: 'u-park', modelName: 'DeepSeek-V3', kind: 'LLM', source: 'huggingface.co/deepseek-ai/DeepSeek-V3', reason: 'RAG 추론 품질 개선용', status: 'approved', stage: 'deployed', createdAt: '2026-06-02 11:10', processedAt: '2026-06-02 14:20', processedBy: 'u-admin', fileName: 'deepseek-v3.safetensors', format: 'safetensors', scan: 'pass', checksum: 'sha256:1b77…0a2f', registeredModelId: 'm5' },
  // 스캔 완료 — 명세 작성/등록 대기(미배포)
  { id: 'mr-05', requesterUserId: 'u-park', modelName: 'Phi-3.5-mini', kind: 'LLM', source: 'huggingface.co/microsoft/Phi-3.5-mini-instruct', reason: '소형 온디바이스 추론 실험용', status: 'pending', stage: 'scanned', createdAt: '2026-06-06 08:10', fileName: 'phi-3.5-mini.safetensors', format: 'safetensors', scan: 'pass', checksum: 'sha256:7c3d…b81a' },
  // 스캔 중 — 서버에서 보안 점검 진행 중(미배포)
  { id: 'mr-06', requesterUserId: 'u-kim', modelName: 'Mistral Small 3', kind: 'LLM', source: 'huggingface.co/mistralai/Mistral-Small-3', reason: '한국어 요약 파이프라인용', status: 'pending', stage: 'scanning', createdAt: '2026-06-06 10:20', fileName: 'mistral-small-3.safetensors', format: 'safetensors', scan: 'pending' },
  // 반려 — 보안 점검 실패
  { id: 'mr-03', requesterUserId: 'u-lee', modelName: 'custom-lora (사내 파인튜닝)', reason: '사내 파인튜닝 LoRA 어댑터 적용 필요', status: 'rejected', stage: 'rejected', createdAt: '2026-06-04 08:40', processedAt: '2026-06-04 09:10', processedBy: 'u-admin', fileName: 'custom-lora.bin', format: 'other', scan: 'fail', rejectReason: 'picklescan 검출 — pickle 직렬화 위험 코드 발견. safetensors 포맷으로 재신청 바랍니다.' },
  // 신청됨 — 관리자 검토 전(미배포)
  { id: 'mr-04', requesterUserId: 'u-hwang', modelName: 'Gemma2-27B', kind: 'LLM', source: 'huggingface.co/google/gemma-2-27b', reason: '경량 모델 비교 평가용', status: 'pending', stage: 'requested', createdAt: '2026-06-06 09:40' },
]
