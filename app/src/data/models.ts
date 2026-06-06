import type { Model } from './types'

// §5 Canonical 시드 정본 (models 10 · usageRank) — id·name·kind·rank 그대로.
export const models: Model[] = [
  { id: 'm1', name: 'Llama 3 70B', kind: 'LLM', description: '메타 Llama 3 70B 범용 대화·추론 모델.', addons: ['주피터', 'API', '파인튜닝'], license: 'Llama 3 Community', recommendedGpu: 'H100 ×2 (cluster)', params: '70B', usageRank: 1, usageCount: 184200 },
  { id: 'm2', name: 'Qwen2.5-72B', kind: 'LLM', description: '알리바바 Qwen2.5 72B 다국어 LLM.', addons: ['주피터', 'API'], license: 'Qwen License', recommendedGpu: 'H100 ×2 (cluster)', params: '72B', usageRank: 2, usageCount: 162800 },
  { id: 'm3', name: 'DeepSeek-V3', kind: 'LLM', description: 'DeepSeek-V3 MoE 대형 추론 모델.', addons: ['API'], license: 'DeepSeek License', recommendedGpu: 'H100 ×4 (cluster)', params: '671B (MoE)', usageRank: 3, usageCount: 141500 },
  { id: 'm7', name: 'Qwen2.5-Coder 32B', kind: 'Code', description: '코드 생성·리뷰 특화 모델.', addons: ['주피터', 'API'], license: 'Apache-2.0', recommendedGpu: 'H100 ×1 (3g 슬라이스)', params: '32B', usageRank: 4, usageCount: 98700 },
  { id: 'm5', name: 'Qwen2.5-VL 7B', kind: 'Vision-Language', description: '이미지 이해·문서 VQA 멀티모달 모델.', addons: ['API'], license: 'Qwen License', recommendedGpu: 'H100 1g 슬라이스', params: '7B', usageRank: 5, usageCount: 76300 },
  { id: 'm4', name: 'Mistral Small 24B', kind: 'LLM', description: '경량 고효율 LLM.', addons: ['API'], license: 'Apache-2.0', recommendedGpu: 'H100 1g 슬라이스', params: '24B', usageRank: 6, usageCount: 61200 },
  { id: 'm8', name: 'SDXL', kind: 'Image', description: 'Stable Diffusion XL 이미지 생성.', addons: ['주피터'], license: 'CreativeML OpenRAIL++', recommendedGpu: 'H100 1g 슬라이스', params: '3.5B', usageRank: 7, usageCount: 52400 },
  { id: 'm6', name: 'Gemma2 27B', kind: 'LLM', description: '구글 Gemma2 27B 오픈 LLM.', addons: ['API'], license: 'Gemma License', recommendedGpu: 'H100 2g 슬라이스', params: '27B', usageRank: 8, usageCount: 38900 },
  { id: 'm9', name: 'Whisper Large v3', kind: 'STT', description: '다국어 음성 인식(STT) 모델.', addons: ['API'], license: 'MIT', recommendedGpu: 'H100 1g 슬라이스', params: '1.5B', usageRank: 9, usageCount: 27600 },
  { id: 'm10', name: 'BGE-M3', kind: 'Embedding', description: '다국어 임베딩·리트리버 모델.', addons: ['API'], license: 'MIT', recommendedGpu: 'H100 1g 슬라이스', params: '0.6B', usageRank: 10, usageCount: 19400 },
]

export const modelById = (id: string): Model | undefined =>
  models.find((m) => m.id === id)
