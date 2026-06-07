import type { Service } from './types'

// §5 Canonical 시드 정본 (services 7) — id·name·model·api·owner 그대로.
export const services: Service[] = [
  { id: 'svc-qwen', name: 'qwen-agent', kind: 'LLM 에이전트', hasApi: true, model: 'm2', serviceUrl: 'http://svc.anclave.local/qwen-agent', testUrl: 'http://svc.anclave.local/qwen-agent/playground', description: 'Qwen2.5-72B 기반 업무 자동화 에이전트.', manualUrl: '/board?post=manual-qwen', ownerUserId: 'u-kim', tags: ['LLM', 'API', '에이전트'], usageCount: 142800, usageRank: 1 },
  { id: 'svc-llama', name: 'llama-chat', kind: '챗봇', hasApi: true, model: 'm1', serviceUrl: 'http://svc.anclave.local/llama-chat', testUrl: 'http://svc.anclave.local/llama-chat/playground', description: 'Llama 3 70B 기반 사내 대화 챗봇.', manualUrl: '/board?post=manual-llama', ownerUserId: 'u-lee', tags: ['LLM', 'API', '챗봇'], usageCount: 121300, usageRank: 2 },
  { id: 'svc-code', name: 'code-assist', kind: '코딩', hasApi: true, model: 'm7', serviceUrl: 'http://svc.anclave.local/code-assist', testUrl: 'http://svc.anclave.local/code-assist/playground', description: 'Qwen2.5-Coder 기반 코드 어시스턴트.', ownerUserId: 'u-kim', tags: ['Code', 'API'], usageCount: 87600, usageRank: 3 },
  { id: 'svc-doc', name: 'doc-search', kind: 'RAG 검색', hasApi: true, model: 'm10', serviceUrl: 'http://svc.anclave.local/doc-search', testUrl: 'http://svc.anclave.local/doc-search/playground', description: 'BGE-M3 임베딩 기반 문서 검색(RAG).', ownerUserId: 'u-park', tags: ['Embedding', 'RAG', 'API'], usageCount: 64200, usageRank: 4 },
  { id: 'svc-stt', name: 'speech-text', kind: '음성→텍스트', hasApi: true, model: 'm9', serviceUrl: 'http://svc.anclave.local/speech-text', testUrl: 'http://svc.anclave.local/speech-text/playground', description: 'Whisper Large v3 기반 음성 인식.', ownerUserId: 'u-yoon', tags: ['STT', 'API'], usageCount: 41900, usageRank: 5 },
  { id: 'svc-sd', name: 'sd-image', kind: '이미지 생성', hasApi: false, model: 'm8', serviceUrl: 'http://svc.anclave.local/sd-image', testUrl: 'http://svc.anclave.local/sd-image/playground', description: 'SDXL 기반 이미지 생성 워크스페이스.', ownerUserId: 'u-jung', tags: ['Image'], usageCount: 33500, usageRank: 6 },
  { id: 'svc-vqa', name: 'vision-qa', kind: '이미지 Q&A', hasApi: false, model: 'm5', serviceUrl: 'http://svc.anclave.local/vision-qa', testUrl: 'http://svc.anclave.local/vision-qa/playground', description: 'Qwen2.5-VL 기반 이미지 질의응답.', ownerUserId: 'u-lee', tags: ['Vision-Language'], usageCount: 22100, usageRank: 7 },
]

// 올린 사용자(deployer) = 소유자(시드). 4.3 "올라간 서비스" 패널에서 누가·사용량 표시.
services.forEach((s) => { s.deployerUserId = s.ownerUserId })

export const serviceById = (id: string): Service | undefined =>
  services.find((s) => s.id === id)
