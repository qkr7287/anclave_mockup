import type {
  ApiKeyUsage,
  ApiRequest,
  GpuChangeRequest,
  GpuRequest,
  PublishRequest,
} from './types'

// §5 GPU 신청 12 — 승인 7 · 대기 3 · 반려 2 · 공문 첨부 일부
export const gpuRequests: GpuRequest[] = [
  { id: 'gr-01', requesterUserId: 'u-kim', capacity: 4, capacityUnit: 'card', models: ['m1'], env: 'Ubuntu 22.04 · CUDA 12.4', addons: ['주피터', 'API'], serviceName: 'llama-train', purpose: 'Llama 3 70B 사내 도메인 파인튜닝', attachmentUrl: '/docs/공문-gr01.pdf', status: 'approved', createdAt: '2026-05-21 10:12' },
  { id: 'gr-02', requesterUserId: 'u-lee', capacity: 3, capacityUnit: 'slice', models: ['m5'], env: 'Ubuntu 22.04 · CUDA 12.4', addons: ['API'], serviceName: 'vision-qa', purpose: '이미지 문서 QA 추론 서비스', status: 'approved', createdAt: '2026-05-23 14:30' },
  { id: 'gr-03', requesterUserId: 'u-park', capacity: 2, capacityUnit: 'slice', models: ['m10'], env: 'Ubuntu 22.04', addons: ['API'], serviceName: 'doc-search', purpose: 'RAG 문서 검색 임베딩', attachmentUrl: '/docs/공문-gr03.pdf', status: 'approved', createdAt: '2026-05-24 09:05' },
  { id: 'gr-04', requesterUserId: 'u-jung', capacity: 1, capacityUnit: 'slice', models: ['m8'], env: 'Ubuntu 22.04', addons: ['주피터'], serviceName: 'sd-image', purpose: 'SDXL 이미지 생성 워크스페이스', status: 'approved', createdAt: '2026-05-25 16:48' },
  { id: 'gr-05', requesterUserId: 'u-yoon', capacity: 1, capacityUnit: 'slice', models: ['m9'], env: 'Ubuntu 22.04', addons: ['API'], serviceName: 'speech-text', purpose: 'Whisper STT 추론', status: 'approved', createdAt: '2026-05-27 11:20' },
  { id: 'gr-06', requesterUserId: 'u-kim', capacity: 3, capacityUnit: 'slice', models: ['m7'], env: 'Ubuntu 22.04 · CUDA 12.4', addons: ['주피터', 'API'], serviceName: 'code-assist', purpose: '코드 어시스턴트 추론', attachmentUrl: '/docs/공문-gr06.pdf', status: 'approved', createdAt: '2026-05-29 13:02' },
  { id: 'gr-07', requesterUserId: 'u-lee', capacity: 2, capacityUnit: 'slice', models: ['m1'], env: 'Ubuntu 22.04', addons: ['API'], serviceName: 'llama-chat', purpose: '사내 대화 챗봇', status: 'approved', createdAt: '2026-05-30 10:41' },
  { id: 'gr-08', requesterUserId: 'u-choi', capacity: 2, capacityUnit: 'slice', models: ['m4'], env: 'Ubuntu 22.04', addons: ['주피터'], serviceName: 'mistral-svc', purpose: 'Mistral 경량 LLM 시범', attachmentUrl: '/docs/공문-gr08.pdf', status: 'pending', createdAt: '2026-06-02 09:33' },
  { id: 'gr-09', requesterUserId: 'u-han', capacity: 1, capacityUnit: 'slice', models: ['m6'], env: 'Ubuntu 22.04', addons: ['API'], serviceName: 'gemma-svc', purpose: 'Gemma2 문서 요약', status: 'pending', createdAt: '2026-06-03 15:10' },
  { id: 'gr-10', requesterUserId: 'u-user', capacity: 1, capacityUnit: 'slice', models: ['m3'], env: 'Ubuntu 22.04', addons: ['주피터'], serviceName: 'deepseek-test', purpose: 'DeepSeek-V3 추론 검증', status: 'pending', createdAt: '2026-06-04 11:55' },
  { id: 'gr-11', requesterUserId: 'u-han', capacity: 4, capacityUnit: 'card', models: ['m3'], env: 'Ubuntu 22.04 · CUDA 12.4', addons: ['주피터', 'API'], serviceName: 'deepseek-train', purpose: 'DeepSeek 대형 학습', status: 'rejected', rejectReason: '요청 용량이 가용 자원을 초과해요. 슬라이스 단위로 다시 신청해 주세요.', createdAt: '2026-05-26 17:22' },
  { id: 'gr-12', requesterUserId: 'u-choi', capacity: 2, capacityUnit: 'card', models: ['m2'], env: 'Ubuntu 20.04', addons: [], serviceName: 'qwen-test', purpose: '테스트', status: 'rejected', rejectReason: '사용 목적·공문이 불충분해요. 결재 공문을 첨부해 주세요.', createdAt: '2026-05-28 12:08' },
]

// §5 API 신청 6 — 승인 4 · 대기 1 · 반려 1 (key 발급)
export const apiRequests: ApiRequest[] = [
  { id: 'ar-01', requesterUserId: 'u-park', serviceId: 'svc-qwen', model: 'm2', targetServiceUrl: 'http://app.anclave.local/park-rag', status: 'approved', apiKey: 'ak_live_qwen_8f2a1c9d4e', createdAt: '2026-05-22 10:00' },
  { id: 'ar-02', requesterUserId: 'u-jung', serviceId: 'svc-llama', model: 'm1', targetServiceUrl: 'http://app.anclave.local/jung-bot', status: 'approved', apiKey: 'ak_live_llama_3b7e0a2f15', createdAt: '2026-05-24 14:20' },
  { id: 'ar-03', requesterUserId: 'u-yoon', serviceId: 'svc-code', model: 'm7', targetServiceUrl: 'http://app.anclave.local/yoon-ide', status: 'approved', apiKey: 'ak_live_code_a91d4f7c20', createdAt: '2026-05-29 09:45' },
  { id: 'ar-04', requesterUserId: 'u-lee', serviceId: 'svc-doc', model: 'm10', targetServiceUrl: 'http://app.anclave.local/lee-search', status: 'approved', apiKey: 'ak_live_doc_5c8b2e3a90', createdAt: '2026-05-31 16:30' },
  { id: 'ar-05', requesterUserId: 'u-choi', serviceId: 'svc-qwen', model: 'm2', targetServiceUrl: 'http://app.anclave.local/choi-agent', status: 'pending', createdAt: '2026-06-03 13:12' },
  { id: 'ar-06', requesterUserId: 'u-han', serviceId: 'svc-stt', model: 'm9', targetServiceUrl: 'http://app.anclave.local/han-stt', status: 'rejected', rejectReason: '대상 서비스 URL이 사내망에서 확인되지 않아요.', createdAt: '2026-06-01 11:08' },
]

// §5 게시 신청 4 — 승인 2(마켓 노출) · 대기 1 · 반려 1
export const publishRequests: PublishRequest[] = [
  { id: 'pr-01', requesterUserId: 'u-kim', serviceName: 'qwen-agent', serviceUrl: 'http://svc.anclave.local/qwen-agent', demoUrl: 'http://svc.anclave.local/qwen-agent/playground', meta: 'LLM 에이전트 · Qwen2.5-72B', status: 'approved', createdAt: '2026-05-20 09:00' },
  { id: 'pr-02', requesterUserId: 'u-lee', serviceName: 'llama-chat', serviceUrl: 'http://svc.anclave.local/llama-chat', demoUrl: 'http://svc.anclave.local/llama-chat/playground', meta: '챗봇 · Llama 3 70B', status: 'approved', createdAt: '2026-05-22 15:40' },
  { id: 'pr-03', requesterUserId: 'u-park', serviceName: 'doc-search', serviceUrl: 'http://svc.anclave.local/doc-search', demoUrl: 'http://svc.anclave.local/doc-search/playground', meta: 'RAG 검색 · BGE-M3', status: 'pending', createdAt: '2026-06-03 10:25' },
  { id: 'pr-04', requesterUserId: 'u-jung', serviceName: 'sd-image', serviceUrl: 'http://svc.anclave.local/sd-image', demoUrl: 'http://svc.anclave.local/sd-image/playground', meta: '이미지 생성 · SDXL', status: 'rejected', rejectReason: '데모 URL이 응답하지 않아요. 점검 후 다시 신청해 주세요.', createdAt: '2026-05-30 14:05' },
]

// §5 변경·회수 3 — expand 1 · migrate 1 · reclaim 1 (관리자 직접 회수 = 유휴 탐지)
export const gpuChangeRequests: GpuChangeRequest[] = [
  { id: 'cr-01', requesterUserId: 'u-kim', type: 'expand', reason: 'code-assist 호출량 증가로 슬라이스 1개 확장 필요', status: 'approved', createdAt: '2026-06-01 09:30' },
  { id: 'cr-02', requesterUserId: 'u-lee', type: 'migrate', reason: 'srv-05 응답 지연으로 vision-qa를 srv-08로 이전 요청', status: 'pending', createdAt: '2026-06-04 16:12' },
  { id: 'cr-03', requesterUserId: 'u-admin', type: 'reclaim', reason: 'srv-06 유휴 슬라이스 탐지 → 관리자 직접 회수(가용화)', status: 'approved', createdAt: '2026-06-05 11:48' },
]

// API key 호출량(받은 신청 승인분) — 4.19
export const apiKeyUsages: ApiKeyUsage[] = [
  { keyId: 'ak_live_qwen_8f2a1c9d4e', serviceId: 'svc-qwen', calls: [820, 910, 1180, 1340, 1290, 1510, 1620], connections: 6 },
  { keyId: 'ak_live_llama_3b7e0a2f15', serviceId: 'svc-llama', calls: [640, 720, 690, 880, 940, 1010, 1120], connections: 4 },
  { keyId: 'ak_live_code_a91d4f7c20', serviceId: 'svc-code', calls: [410, 520, 600, 580, 720, 760, 810], connections: 3 },
  { keyId: 'ak_live_doc_5c8b2e3a90', serviceId: 'svc-doc', calls: [220, 280, 310, 360, 420, 470, 510], connections: 2 },
]

export const allRequestCount =
  gpuRequests.length +
  apiRequests.length +
  publishRequests.length +
  gpuChangeRequests.length // = 25
