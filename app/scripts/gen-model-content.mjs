// model-content.json 생성기 — 모델 description/usageGuide 정본(SoT).
// String.raw 로 백슬래시(curl 줄바꿈 \)·따옴표·줄바꿈을 그대로 보존, JSON.stringify 가 안전 이스케이프.
// 실행: node app/scripts/gen-model-content.mjs  → app/scripts/model-content.json 생성.
// ⚠ m12 usageGuide·m13(description/usageGuide) 은 붙여넣기 누락분 재구성(RECONSTRUCTED) — 확정 시 교체.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const R = String.raw

const content = {
  m11: {
    description: R`Meta가 공개한 80억 파라미터 오픈 LLM으로, 15조 토큰 이상으로 학습돼 동급 최상위 수준의 추론·지시 따르기 성능을 냅니다. 8K 컨텍스트와 GQA 적용으로 16GB MIG 인스턴스 단독 구동이 가능해 챗봇·요약·문서처리 등 범용 생성에 폭넓게 쓰입니다.

• 다국어 대화·요약·분류·추출 등 범용 텍스트 작업에 적합
• 동급 소형 모델 대비 뛰어난 지시 따르기와 한국어 품질
• GQA(Grouped-Query Attention)로 추론 속도·메모리 효율 향상
• LoRA·QLoRA 파인튜닝으로 도메인 특화가 용이
• OpenAI 호환 chat/completions 인터페이스 지원`,
    usageGuide: R`# OpenAI 호환 chat/completions 로 호출합니다.
curl -X POST https://api.anclave.local/v1/chat/completions \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-8b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "안녕하세요, 자기소개 해주세요."}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'

# 실시간 출력은 "stream": true 추가.
# Python: openai SDK 의 base_url 을 https://api.anclave.local/v1 로 교체.`,
  },

  m12: {
    description: R`알리바바가 공개한 70억 파라미터 LLM으로, 최대 128K 토큰의 긴 컨텍스트와 구조화 출력(JSON)·도구 호출에 강점이 있습니다. 18조 토큰 규모로 학습돼 수학·코딩·다국어 성능이 균형 잡혀 있고 에이전트 워크플로에 적합합니다.

• 함수 호출·도구 사용 등 에이전트 작업에 최적화
• 128K 롱컨텍스트로 장문 문서·대화 이력 처리
• JSON 등 구조화 출력 안정성이 높음
• 29개 이상 언어 지원(한국어 포함)
• 소형 GPU에서 효율적으로 동작`,
    // RECONSTRUCTED — 원문 usageGuide 가 "tools":[{"type":"functi 에서 잘림. tools 예시로 완성.
    usageGuide: R`# OpenAI 호환 chat/completions. 도구 호출(tools)도 지원합니다.
curl -X POST https://api.anclave.local/v1/chat/completions \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2-5-7b",
    "messages": [{"role": "user", "content": "서울 날씨 알려줘"}],
    "tools": [{"type": "function", "function": {
      "name": "get_weather",
      "description": "도시의 현재 날씨를 조회",
      "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}
    }}]
  }'

# 모델이 tool_calls 를 반환하면 함수 실행 결과를 role:"tool" 로 다시 전달.
# 긴 입력은 128K 컨텍스트까지 처리.`,
  },

  m13: {
    // RECONSTRUCTED — 붙여넣기에서 m13 헤더·description 누락. Qwen2.5-Coder 7B 기준 작성.
    description: R`알리바바가 공개한 70억 파라미터 코드 특화 LLM으로, 5조 토큰 이상의 코드·수학 데이터로 학습돼 코드 생성·리뷰·디버깅과 FIM(중간 채우기) 자동완성에 강점이 있습니다. 92개 이상 프로그래밍 언어와 최대 128K 컨텍스트를 지원해 리포지터리 단위 작업에 적합합니다.

• 코드 생성·설명·리뷰·버그 수정
• FIM(Fill-in-the-Middle) 자동완성
• 92개 이상 프로그래밍 언어 지원
• 128K 롱컨텍스트로 리포지터리 규모 처리
• OpenAI 호환 chat/completions 인터페이스 지원`,
    usageGuide: R`# 코드 생성·리뷰는 chat/completions 로 호출합니다.
curl -X POST https://api.anclave.local/v1/chat/completions \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2-5-coder-7b",
    "messages": [{"role": "user", "content": "파이썬으로 이진 탐색 함수를 작성해줘"}]
  }'

# FIM 자동완성 토큰 형식:
# <|fim_prefix|>def quicksort(arr):<|fim_suffix|>    return result<|fim_middle|>`,
  },

  m5: {
    description: R`이미지·문서·차트를 이해하는 70억 파라미터 멀티모달 모델로, 텍스트와 이미지를 함께 입력받아 근거 있는 답변을 생성합니다. 문서 VQA·OCR·표/수식 추출과 화면 요소 인식, 동영상 프레임 이해까지 지원해 문서 자동화·시각 질의응답에 적합합니다.

• 문서·차트·스크린샷 해석과 구조 추출(표·레이아웃)
• OCR(다국어)·손글씨·수식 인식
• 객체 위치(grounding)·바운딩 박스 출력
• 동영상 프레임 분석·요약
• 텍스트+이미지 혼합 입력으로 시각 추론`,
    usageGuide: R`# 멀티모달 입력은 content 에 image_url 을 함께 넣습니다.
curl -X POST https://api.anclave.local/v1/chat/completions \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2-5-vl-7b",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "이 이미지에서 표를 추출해줘"},
        {"type": "image_url", "image_url": {"url": "https://.../doc.png"}}
      ]
    }]
  }'

# image_url 에 base64(data:image/png;base64,...) 도 가능.`,
  },

  m8: {
    description: R`Stability AI의 Stable Diffusion XL 이미지 생성 모델로, 1024×1024 고해상도 텍스트→이미지 합성을 지원합니다. Base+Refiner 2단계 파이프라인과 대형 U-Net으로 디테일·구도·텍스트 충실도를 크게 높였습니다.

• 사실적 사진부터 일러스트·아트까지 다양한 스타일
• 1024² 기본, 여러 종횡비 프리셋 지원
• 프롬프트·네거티브 프롬프트로 세밀한 제어
• Refiner 단계로 디테일 보강
• 콘텐츠·에셋·디자인 시안 제작에 활용`,
    usageGuide: R`# 텍스트→이미지 생성은 images/generations 엔드포인트를 씁니다.
curl -X POST https://api.anclave.local/v1/images/generations \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sdxl",
    "prompt": "a cozy reading nook, warm light, detailed, photorealistic",
    "negative_prompt": "blurry, lowres",
    "size": "1024x1024",
    "steps": 30
  }'

# 응답의 data[].b64_json 또는 url 로 이미지를 받습니다.`,
  },

  m9: {
    description: R`OpenAI의 대규모 다국어 음성 인식(STT) 모델로, 680만 시간 오디오로 학습돼 99개 언어의 받아쓰기와 영어 번역을 지원합니다. 잡음·억양·전문 용어에 강인해 회의록·자막·음성 검색 등 음성→텍스트 변환 전반에 활용됩니다.

• 99개 언어 자동 감지·전사
• 영어로의 음성 번역(translate) 지원
• 타임스탬프(문장/단어) 출력으로 자막 제작
• 긴 오디오 분할 처리로 안정적 품질
• 잡음·악센트에 강인한 인식`,
    usageGuide: R`# 오디오 파일을 audio/transcriptions 로 업로드합니다(multipart/form-data).
curl -X POST https://api.anclave.local/v1/audio/transcriptions \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -F "model=whisper-large-v3" \
  -F "file=@meeting.mp3" \
  -F "language=ko" \
  -F "response_format=verbose_json"

# verbose_json 이면 타임스탬프 segment 포함.
# 영어 번역은 /v1/audio/translations 사용.`,
  },

  m10: {
    description: R`BAAI가 공개한 다국어 임베딩·리트리버 모델로, 100개 이상 언어와 최대 8,192 토큰 입력을 지원합니다. Dense·Sparse·Multi-Vector 세 검색을 한 모델에서 제공하는 하이브리드 검색이 특징이며 RAG의 문서 검색·재랭킹에 적합합니다.

• Dense·Sparse·ColBERT(Multi-Vector) 하이브리드 검색
• 100+ 언어 교차 언어 검색(cross-lingual)
• 8,192 토큰 롱 도큐먼트 임베딩
• 의미 기반 유사도·재랭킹 품질 우수
• RAG 파이프라인의 검색 단계에 최적`,
    usageGuide: R`# 텍스트 임베딩은 embeddings 엔드포인트로 생성합니다.
curl -X POST https://api.anclave.local/v1/embeddings \
  -H "Authorization: Bearer $ANCLAVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-m3",
    "input": ["검색할 문장 1", "검색할 문장 2"]
  }'

# 응답 data[].embedding(dense 벡터)으로 코사인 유사도 검색.
# 입력 배열로 여러 개를 한 번에 임베딩 가능.`,
  },
}

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, 'model-content.json')
writeFileSync(out, JSON.stringify(content, null, 2) + '\n', 'utf-8')
console.log('wrote', out, '—', Object.keys(content).length, 'models')
