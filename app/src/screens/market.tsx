import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { useTheme } from '../lib/theme'
import {
  MagnifyingGlassIcon,
  CpuChipIcon,
  MicrophoneIcon,
  PhotoIcon,
  DocumentTextIcon,
  LanguageIcon,
  ChatBubbleLeftRightIcon,
  DocumentChartBarIcon,
  CodeBracketSquareIcon,
  CircleStackIcon,
  FaceSmileIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  ShieldExclamationIcon,
  ClockIcon,
  CodeBracketIcon,
  StarIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// G8 · 4.17 마켓플레이스 · 4.18 서비스(AI) 상세 — Figma 매칭(fileKey iqVQ2GEDCRj9cK3EBOwBJV,
// 4.17=node 1:2, 4.18=node 3:11938). 셸은 우리 것, 콘텐츠만 Figma.
// 상세는 행 클릭 → 모달 팝업(Figma 상세 카드). 필터·검색·정렬은 목업이지만 실제 동작.

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// ───────────────────────── Figma 팔레트(테마 인지) ─────────────────────────
interface Palette {
  filter: string; panel: string; card: string; inset: string; chip: string
  border: string; divider: string; heading: string; text: string; muted: string; chipText: string
  accent: string; accentSoft: string
  ok: string; okSoft: string; warn: string; warnSoft: string; danger: string; dangerSoft: string
  dim: string; shadow: string
}
function usePalette(): Palette {
  const { theme } = useTheme()
  if (theme !== 'light') {
    return {
      filter: '#1A2332', panel: '#181F2D', card: '#161E2E', inset: '#1B2433', chip: '#1F2736',
      border: '#28313F', divider: '#293245', heading: '#F0F2F7', text: '#E7EAF1', muted: '#8B94A3', chipText: '#AEB8C7',
      accent: '#2D85FF', accentSoft: 'rgba(45,133,255,0.14)',
      ok: '#2EBD4D', okSoft: 'rgba(47,212,90,0.13)', warn: '#E0A82E', warnSoft: 'rgba(224,168,46,0.14)',
      danger: '#FB6B4F', dangerSoft: 'rgba(251,107,79,0.14)',
      dim: 'rgba(6,10,18,0.68)', shadow: '0 28px 70px rgba(0,0,0,0.6)',
    }
  }
  return {
    filter: 'var(--c-card2)', panel: 'var(--c-card2)', card: 'var(--c-card2)', inset: 'var(--c-soft)', chip: 'var(--c-soft)',
    border: 'var(--c-border)', divider: 'var(--c-border)', heading: 'var(--c-text)', text: 'var(--c-text)', muted: 'var(--c-muted)', chipText: 'var(--c-muted)',
    accent: 'var(--c-accent)', accentSoft: 'var(--accent-soft)',
    ok: 'var(--c-ok)', okSoft: 'var(--ok-soft)', warn: 'var(--c-warn)', warnSoft: 'var(--warn-soft)', danger: 'var(--c-danger)', dangerSoft: 'var(--danger-soft)',
    dim: 'var(--dim)', shadow: 'var(--shadow-pop)',
  }
}

type Tone = 'ok' | 'warn' | 'danger'
const toneOf = (status: string): Tone => (status === '정상' ? 'ok' : status === '불안정' ? 'danger' : 'warn')

// ───────────────────────── 로고 이미지(DiceBear + 그라데이션 폴백) ─────────────────────────
function Logo({ id, hue, icon: Glyph, size = 40, radius }: { id: string; hue: number; icon: Icon; size?: number; radius?: number }) {
  const [failed, setFailed] = useState(false)
  const r = radius ?? (size >= 48 ? 14 : size >= 36 ? 11 : 9)
  if (failed) {
    return (
      <span className="flex items-center justify-center shrink-0"
        style={{ width: size, height: size, borderRadius: r, background: `linear-gradient(140deg, hsl(${hue},72%,54%), hsl(${(hue + 38) % 360},70%,44%))`, color: '#fff' }}>
        <Glyph width={size * 0.5} height={size * 0.5} />
      </span>
    )
  }
  return (
    <img
      src={`https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(id)}&backgroundType=gradientLinear`}
      width={size} height={size} alt="" loading="lazy" onError={() => setFailed(true)}
      className="shrink-0 object-cover" style={{ borderRadius: r, display: 'block' }}
    />
  )
}

// ───────────────────────── 시드(풍부한 더미) ─────────────────────────
interface Service {
  id: string; name: string; kind: string; provider: string; model: string; api: string
  owner: string; rating: number; status: string; hue: number; icon: Icon
  responseTime: string; tier: string; monthlyReq: string; usage: string; usageNum: number; delta: string; up: boolean
  reqFull: string; success: string; deltaPct: string; lastCall: string; tags: string[]
  desc: string; overview: string; apiDesc: string; features: string[]; opsNotes: string[]
}
const hasApiOf = (s: Service) => s.api !== '콘솔'

const SERVICES: Service[] = [
  {
    id: 'qwen-agent', name: 'qwen-agent', kind: 'LLM 에이전트', provider: 'Alibaba Cloud', model: 'Qwen2.5-72B', api: 'REST API',
    owner: '김민준', rating: 4.8, status: '정상', hue: 212, icon: CpuChipIcon,
    responseTime: '0.92s', tier: 'Enterprise', monthlyReq: '142.8K', usage: '142.8K', usageNum: 142800, delta: '▲ 18%', up: true,
    reqFull: '142,820건', success: '99.82%', deltaPct: '+18.4%', lastCall: '12초 전', tags: ['에이전트', '자동화', 'LLM'],
    desc: '사내 업무 자동화를 위한 지능형 에이전트 서비스입니다.',
    overview: 'Qwen2.5-72B 기반의 자율 업무 에이전트로, 도구 호출과 멀티스텝 추론으로 반복 업무를 자동화합니다. 사내 문서·API와 연결해 복합 워크플로를 처리합니다.',
    apiDesc: 'RESTful 에이전트 엔드포인트로 task 등록·실행·상태 조회를 제공합니다. JSON 요청/응답에 SSE 스트리밍을 지원하며 인증은 Bearer Token을 사용합니다.',
    features: ['도구 호출(Function Calling) 오케스트레이션', '멀티스텝 추론 및 자기 점검', '사내 문서 검색 연동(RAG)', '작업 큐·재시도 정책', '실행 로그 및 감사 추적'],
    opsNotes: ['2024-05-22: 도구 호출 병렬 처리 적용 완료', '2024-05-18: 컨텍스트 윈도우 128K로 확장', '동시 작업 한도 초과 시 큐잉됩니다.'],
  },
  {
    id: 'speech-text', name: 'speech-text', kind: '음성 인식', provider: 'OpenAI', model: 'Whisper Large v3', api: 'REST API',
    owner: '윤서연', rating: 4.6, status: '정상', hue: 168, icon: MicrophoneIcon,
    responseTime: '1.10s', tier: 'Standard', monthlyReq: '41.0K', usage: '41.0K', usageNum: 41000, delta: '▲ 9%', up: true,
    reqFull: '40,980건', success: '99.41%', deltaPct: '+9.2%', lastCall: '47초 전', tags: ['음성', 'STT', '다국어'],
    desc: '실시간 음성 텍스트 변환과 다국어 인식 기능을 제공합니다.',
    overview: 'Whisper Large v3 기반 음성 인식으로 99개 언어의 실시간 전사를 지원합니다. 잡음 환경에서도 높은 정확도를 유지하며 화자 분리를 제공합니다.',
    apiDesc: 'multipart 오디오 업로드 또는 스트리밍 소켓으로 전사 결과를 받습니다. 타임스탬프·신뢰도 점수를 포함한 JSON을 반환합니다.',
    features: ['99개 언어 실시간 전사', '화자 분리(Diarization)', '단어 단위 타임스탬프', '잡음 억제 전처리', '자막(SRT/VTT) 내보내기'],
    opsNotes: ['2024-05-20: 실시간 스트리밍 지연 30% 개선', '2024-05-12: 한국어 도메인 사전 추가', '파일 최대 25분/요청 제한이 있습니다.'],
  },
  {
    id: 'image-gen-studio', name: 'image-gen-studio', kind: '이미지 생성', provider: 'Midjourney', model: 'Midjourney v6', api: '콘솔',
    owner: '정우성', rating: 4.5, status: '주의', hue: 286, icon: PhotoIcon,
    responseTime: '2.40s', tier: 'Premium', monthlyReq: '1.78M', usage: '1.78M', usageNum: 1780000, delta: '▼ 7%', up: false,
    reqFull: '1,782,400건', success: '98.10%', deltaPct: '-7.1%', lastCall: '4초 전', tags: ['이미지', '생성', '스튜디오'],
    desc: '텍스트 프롬프트로 고품질 이미지를 생성하는 워크스페이스입니다.',
    overview: 'Midjourney v6 기반 이미지 생성 스튜디오로, 텍스트·이미지 프롬프트에서 고해상도 비주얼을 생성합니다. 웹 콘솔에서 스타일 레퍼런스와 시드 고정을 지원합니다.',
    apiDesc: '',
    features: ['텍스트→이미지 / 이미지→이미지', '스타일 레퍼런스 및 시드 고정', '업스케일·인페인팅', '배치 생성 큐', '안전 필터(NSFW) 내장'],
    opsNotes: ['2024-05-21: 생성 큐 적체로 평균 대기 상승(모니터링 중)', '2024-05-10: v6 모델 가중치 업데이트', '피크 시간대 처리량이 제한될 수 있습니다.'],
  },
  {
    id: 'doc-summary', name: 'doc-summary', kind: '문서 요약', provider: 'Anthropic', model: 'Claude 3.5 Sonnet', api: 'REST API',
    owner: '박지호', rating: 4.7, status: '정상', hue: 28, icon: DocumentTextIcon,
    responseTime: '1.05s', tier: 'Premium', monthlyReq: '1.23M', usage: '1.23M', usageNum: 1230000, delta: '▲ 5%', up: true,
    reqFull: '1,234,560건', success: '99.63%', deltaPct: '+5.2%', lastCall: '9초 전', tags: ['문서', '요약', '보고서'],
    desc: '문서 요약, 핵심 내용 추출, 보고서 자동 생성을 지원합니다.',
    overview: 'Claude 3.5 Sonnet 기반 문서 처리 서비스로 장문 요약·핵심 추출·보고서 자동 생성을 제공합니다. 표·인용을 보존하며 한국어에 최적화되어 있습니다.',
    apiDesc: 'PDF·DOCX·텍스트를 업로드하면 구조화된 요약 JSON을 반환합니다. 요약 길이·톤·출력 포맷을 파라미터로 제어합니다.',
    features: ['장문(200K 토큰) 요약', '핵심 문장·키워드 추출', '표·인용 보존', '보고서 템플릿 자동 채움', '출처 페이지 매핑'],
    opsNotes: ['2024-05-19: 표 추출 정확도 개선', '2024-05-11: 보고서 템플릿 3종 추가', '대용량 문서는 분할 처리됩니다.'],
  },
  {
    id: 'translate-pro', name: 'translate-pro', kind: '번역', provider: 'Google', model: 'Gemini 1.5 Pro', api: 'REST API',
    owner: '이수민', rating: 4.4, status: '정상', hue: 150, icon: LanguageIcon,
    responseTime: '0.88s', tier: 'Standard', monthlyReq: '856K', usage: '856K', usageNum: 856000, delta: '▲ 3%', up: true,
    reqFull: '856,200건', success: '99.55%', deltaPct: '+3.1%', lastCall: '21초 전', tags: ['번역', '다국어', '문맥'],
    desc: '고품질 다국어 번역과 문맥 기반 번역 서비스를 제공합니다.',
    overview: 'Gemini 1.5 Pro 기반 번역 서비스로 문맥과 어조를 보존하는 다국어 번역을 제공합니다. 용어집과 도메인 적응을 지원합니다.',
    apiDesc: '소스/타깃 언어와 텍스트를 전송하면 번역문과 대안 표현을 반환합니다. 용어집 ID를 함께 넘겨 일관성을 강제할 수 있습니다.',
    features: ['문맥·어조 보존 번역', '도메인별 용어집 적용', '실시간 스트리밍 번역', '서식(HTML/MD) 보존', '품질 점수(신뢰도) 반환'],
    opsNotes: ['2024-05-18: 법률·의료 용어집 확장', '2024-05-09: 스트리밍 번역 베타 공개', '용어집은 요청당 1개만 적용됩니다.'],
  },
  {
    id: 'vector-search', name: 'vector-search', kind: '검색', provider: 'AWS', model: 'Bedrock + Embedding', api: 'gRPC',
    owner: '한도윤', rating: 4.3, status: '불안정', hue: 196, icon: MagnifyingGlassIcon,
    responseTime: '1.62s', tier: 'Developer', monthlyReq: '642K', usage: '642K', usageNum: 642000, delta: '▼ 2%', up: false,
    reqFull: '642,100건', success: '97.20%', deltaPct: '-2.6%', lastCall: '2초 전', tags: ['검색', '벡터', 'RAG'],
    desc: '문서 및 데이터를 벡터 검색과 의미 기반 검색으로 제공합니다.',
    overview: 'AWS Bedrock 임베딩 기반 시맨틱 검색으로 의미 유사도 검색과 하이브리드(키워드+벡터) 랭킹을 제공합니다. 대규모 인덱스를 지원합니다.',
    apiDesc: 'gRPC 스트림으로 임베딩·업서트·질의를 처리합니다. top-k·필터·리랭킹 옵션을 지원하며 결과에 유사도 점수를 포함합니다.',
    features: ['하이브리드(키워드+벡터) 검색', '메타데이터 필터링', '리랭킹(Cross-Encoder)', '증분 인덱싱', 'p99 지연 모니터링'],
    opsNotes: ['2024-05-22: 인덱스 샤드 리밸런싱 중(간헐적 지연)', '2024-05-08: 리랭커 모델 교체', '대량 업서트는 배치 권장.'],
  },
  {
    id: 'code-copilot', name: 'code-copilot', kind: '코딩', provider: 'Alibaba Cloud', model: 'Qwen2.5-Coder 32B', api: 'REST API',
    owner: '김민준', rating: 4.7, status: '정상', hue: 256, icon: CodeBracketSquareIcon,
    responseTime: '0.74s', tier: 'Enterprise', monthlyReq: '512K', usage: '512K', usageNum: 512000, delta: '▲ 12%', up: true,
    reqFull: '512,340건', success: '99.71%', deltaPct: '+12.3%', lastCall: '6초 전', tags: ['코딩', '리뷰', 'IDE'],
    desc: '코드 자동완성·리뷰·리팩토링을 지원하는 어시스턴트입니다.',
    overview: 'Qwen2.5-Coder 32B 기반 코딩 어시스턴트로 자동완성·리뷰·테스트 생성을 제공합니다. 80개 이상 언어를 지원하며 레포 컨텍스트를 이해합니다.',
    apiDesc: 'completion·chat·edit 엔드포인트로 코드 생성과 인라인 수정을 제공합니다. FIM(fill-in-the-middle)과 스트리밍을 지원합니다.',
    features: ['코드 자동완성(FIM)', '레포 컨텍스트 리뷰', '테스트·문서 자동 생성', '취약점 정적 점검', 'IDE 플러그인 연동'],
    opsNotes: ['2024-05-20: 레포 인덱싱 속도 2배 개선', '2024-05-13: 보안 점검 룰셋 추가', '레포 최대 50만 LOC까지 인덱싱.'],
  },
  {
    id: 'rag-knowledge', name: 'rag-knowledge', kind: 'RAG 검색', provider: 'BAAI', model: 'BGE-M3 + Reranker', api: 'REST API',
    owner: '박지호', rating: 4.5, status: '정상', hue: 320, icon: CircleStackIcon,
    responseTime: '1.18s', tier: 'Standard', monthlyReq: '388K', usage: '388K', usageNum: 388000, delta: '▲ 6%', up: true,
    reqFull: '388,420건', success: '99.34%', deltaPct: '+6.0%', lastCall: '33초 전', tags: ['RAG', '지식', '인용'],
    desc: '사내 지식베이스 기반 질의응답(RAG)을 제공합니다.',
    overview: 'BGE-M3 임베딩과 리랭커로 구성된 RAG 파이프라인으로, 사내 문서에 근거한 정확한 답변과 출처를 제공합니다. 권한 기반 검색을 지원합니다.',
    apiDesc: '질의를 전송하면 근거 청크·출처와 함께 생성 답변을 반환합니다. 컬렉션·필터·인용 모드를 파라미터로 제어합니다.',
    features: ['출처 인용(citation) 포함 답변', '권한 기반 문서 필터', '청크 하이라이트', '환각 억제(grounding)', '컬렉션별 라우팅'],
    opsNotes: ['2024-05-19: 인용 정확도 개선', '2024-05-10: 권한 동기화 주기 단축', '컬렉션당 문서 100만 건 한도.'],
  },
  {
    id: 'sentiment-lens', name: 'sentiment-lens', kind: '감성 분석', provider: 'Meta', model: 'Llama 3 70B', api: 'REST API',
    owner: '최예린', rating: 4.2, status: '주의', hue: 8, icon: FaceSmileIcon,
    responseTime: '0.96s', tier: 'Developer', monthlyReq: '274K', usage: '274K', usageNum: 274000, delta: '▼ 4%', up: false,
    reqFull: '274,050건', success: '98.66%', deltaPct: '-4.0%', lastCall: '18초 전', tags: ['감성', '분류', 'CS'],
    desc: '리뷰·CS 텍스트의 감성과 의도를 분류합니다.',
    overview: 'Llama 3 70B 기반 감성·의도 분석으로 리뷰·상담 텍스트를 긍정/부정/중립과 세부 토픽으로 분류합니다. 한국어 구어체에 강합니다.',
    apiDesc: '텍스트 배열을 전송하면 감성 라벨·점수·토픽 태그를 반환합니다. 커스텀 라벨 스키마를 등록할 수 있습니다.',
    features: ['감성 3분류 + 강도 점수', '토픽·키워드 태깅', '커스텀 라벨 스키마', '배치 분류', '시계열 트렌드 집계'],
    opsNotes: ['2024-05-21: 구어체 오탐 감소 튜닝(검증 중)', '2024-05-09: 토픽 분류기 업데이트', '배치 최대 1,000건/요청.'],
  },
  {
    id: 'video-caption', name: 'video-caption', kind: '영상 자막', provider: 'OpenAI', model: 'Whisper + GPT-4o', api: '콘솔',
    owner: '윤서연', rating: 4.4, status: '정상', hue: 188, icon: VideoCameraIcon,
    responseTime: '2.05s', tier: 'Premium', monthlyReq: '198K', usage: '198K', usageNum: 198000, delta: '▲ 8%', up: true,
    reqFull: '198,300건', success: '99.18%', deltaPct: '+8.4%', lastCall: '52초 전', tags: ['영상', '자막', '챕터'],
    desc: '영상에서 자막·챕터·요약을 자동 생성하는 워크스페이스입니다.',
    overview: 'Whisper 전사와 GPT-4o 후처리를 결합해 영상 자막·챕터·요약을 생성합니다. 웹 콘솔에서 다국어 자막과 핵심 장면 추출을 지원합니다.',
    apiDesc: '',
    features: ['자동 자막(SRT/VTT)', '챕터·하이라이트 추출', '다국어 번역 자막', '영상 요약 생성', '화자 라벨링'],
    opsNotes: ['2024-05-18: 챕터 경계 정확도 개선', '2024-05-12: 다국어 자막 6종 추가', '영상 최대 2시간/요청.'],
  },
  {
    id: 'tts-voice', name: 'tts-voice', kind: '음성 합성', provider: 'ElevenLabs', model: 'Multilingual v2', api: 'REST API',
    owner: '정우성', rating: 4.6, status: '정상', hue: 44, icon: SpeakerWaveIcon,
    responseTime: '0.81s', tier: 'Standard', monthlyReq: '156K', usage: '156K', usageNum: 156000, delta: '▲ 15%', up: true,
    reqFull: '156,720건', success: '99.77%', deltaPct: '+15.1%', lastCall: '15초 전', tags: ['음성', 'TTS', '합성'],
    desc: '자연스러운 다국어 음성 합성(TTS)을 제공합니다.',
    overview: 'Multilingual v2 기반 음성 합성으로 자연스러운 억양과 감정 표현을 지원합니다. 보이스 클로닝과 SSML 제어를 제공합니다.',
    apiDesc: '텍스트와 voice ID·SSML을 전송하면 스트리밍 오디오를 반환합니다. 포맷·샘플레이트·속도를 파라미터로 제어합니다.',
    features: ['다국어 자연 음성', '감정·억양 SSML 제어', '보이스 클로닝', '실시간 스트리밍 출력', '발음 사전 등록'],
    opsNotes: ['2024-05-20: 한국어 운율 모델 개선', '2024-05-11: 스트리밍 첫 음성 지연 단축', '클로닝은 동의 절차가 필요합니다.'],
  },
  {
    id: 'anomaly-guard', name: 'anomaly-guard', kind: '이상 탐지', provider: 'AWS', model: 'Lookout + XGBoost', api: 'gRPC',
    owner: '한도윤', rating: 4.1, status: '점검 중', hue: 350, icon: ShieldExclamationIcon,
    responseTime: '1.34s', tier: 'Developer', monthlyReq: '92K', usage: '92K', usageNum: 92000, delta: '▼ 1%', up: false,
    reqFull: '92,140건', success: '98.02%', deltaPct: '-1.2%', lastCall: '점검 중', tags: ['이상탐지', '모니터링', '알림'],
    desc: '메트릭·로그 스트림에서 이상 징후를 탐지합니다.',
    overview: 'AWS Lookout과 XGBoost를 결합한 이상 탐지로 메트릭·로그 스트림의 이상 패턴을 실시간 감지합니다. 임계값 자동 학습을 지원합니다.',
    apiDesc: 'gRPC 스트림으로 시계열을 전송하면 이상 점수와 기여 피처를 반환합니다. 알림 webhook과 임계값 정책을 설정합니다.',
    features: ['실시간 이상 점수', '임계값 자동 학습', '기여 피처 설명(XAI)', '계절성 보정', '알림 webhook 연동'],
    opsNotes: ['2024-05-22: 정기 점검 — 모델 재학습 진행 중', '2024-05-07: 계절성 보정 로직 추가', '점검 중에는 탐지가 지연될 수 있습니다.'],
  },
]
const serviceById = (id?: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0]

const KINDS = [...new Set(SERVICES.map((s) => s.kind))]
const MODELS = [...new Set(SERVICES.map((s) => s.model))]
const OWNERS = [...new Set(SERVICES.map((s) => s.owner))]
const STATUSES = ['정상', '주의', '불안정', '점검 중']

interface RankItem {
  rank: number; name: string; model: string; usage: string; delta: string; up: boolean
  chips: [string, string, string]; status: string; tone: Tone; icon: Icon; hue: number; seed: string
}
const RANKING: RankItem[] = [
  { rank: 1, name: '챗봇 서비스', model: 'OpenAI GPT-4o', usage: '2.48M', delta: '▲ 12.4%', up: true, chips: ['API', 'GPT-4o', '종합형'], status: '정상', tone: 'ok', icon: ChatBubbleLeftRightIcon, hue: 212, seed: 'rank-chatbot' },
  { rank: 2, name: '이미지 생성 서비스', model: 'Midjourney v6', usage: '1.78M', delta: '▼ 8.7%', up: false, chips: ['API', 'Midjourney v6', '종합형'], status: '주의', tone: 'warn', icon: PhotoIcon, hue: 286, seed: 'rank-image' },
  { rank: 3, name: '분석/요약 서비스', model: 'Claude 3.5 Sonnet', usage: '1.23M', delta: '▲ 5.2%', up: true, chips: ['API', 'Claude 3.5', '종합형'], status: '정상', tone: 'ok', icon: DocumentChartBarIcon, hue: 28, seed: 'rank-analysis' },
  { rank: 4, name: '자연어 번역 서비스', model: 'AWS Bedrock', usage: '856K', delta: '▲ 3.1%', up: true, chips: ['API', 'Claude', '개발형'], status: '정상', tone: 'ok', icon: LanguageIcon, hue: 150, seed: 'rank-translate' },
  { rank: 5, name: '검색 서비스', model: 'Gemini 1.5 Pro', usage: '642K', delta: '▼ 2.6%', up: false, chips: ['API', 'Gemini 1.5 Pro', '개발형'], status: '불안정', tone: 'danger', icon: MagnifyingGlassIcon, hue: 196, seed: 'rank-search' },
]

// ───────────────────────── 필터 상태 ─────────────────────────
type ApiMode = 'all' | 'yes' | 'no'
type SortKey = 'usage' | 'recent' | 'name'
interface Filters {
  query: string; kind: string; model: string; owner: string; api: ApiMode; statuses: Set<string>; tag: string
}
const emptyFilters = (): Filters => ({ query: '', kind: 'all', model: 'all', owner: 'all', api: 'all', statuses: new Set(), tag: '' })
const filtersActive = (f: Filters) =>
  !!f.query || f.kind !== 'all' || f.model !== 'all' || f.owner !== 'all' || f.api !== 'all' || f.statuses.size > 0 || !!f.tag

function applyFilters(f: Filters, sort: SortKey): Service[] {
  const q = f.query.trim().toLowerCase()
  const tag = f.tag.trim().toLowerCase()
  const out = SERVICES.filter((s) => {
    if (q && !`${s.name} ${s.kind} ${s.model} ${s.provider} ${s.desc} ${s.tags.join(' ')}`.toLowerCase().includes(q)) return false
    if (f.kind !== 'all' && s.kind !== f.kind) return false
    if (f.model !== 'all' && s.model !== f.model) return false
    if (f.owner !== 'all' && s.owner !== f.owner) return false
    if (f.api === 'yes' && !hasApiOf(s)) return false
    if (f.api === 'no' && hasApiOf(s)) return false
    if (f.statuses.size > 0 && !f.statuses.has(s.status)) return false
    if (tag && !s.tags.some((t) => t.toLowerCase().includes(tag))) return false
    return true
  })
  if (sort === 'usage') out.sort((a, b) => b.usageNum - a.usageNum)
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
  // 'recent' = 시드 순서 유지
  return out
}

// ───────────────────────── 반응형 ─────────────────────────
function useNarrow(bp = 1180): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [bp])
  return narrow
}

// ───────────────────────── 공통 부품 ─────────────────────────
const deltaColor = (p: Palette, up: boolean) => (up ? p.ok : p.danger)
const toneColor = (p: Palette, t: Tone) => (t === 'ok' ? p.ok : t === 'warn' ? p.warn : p.danger)
const toneSoft = (p: Palette, t: Tone) => (t === 'ok' ? p.okSoft : t === 'warn' ? p.warnSoft : p.dangerSoft)

function StatusBadge({ status, tone }: { status: string; tone: Tone }) {
  const p = usePalette()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full whitespace-nowrap"
      style={{ padding: '3px 10px', fontSize: 13, fontWeight: 700, color: toneColor(p, tone), background: toneSoft(p, tone) }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />{status}
    </span>
  )
}

function MetaChip({ label, value }: { label?: string; value: string }) {
  const p = usePalette()
  return (
    <span className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
      style={{ padding: '2px 8px', fontSize: 13, background: p.chip, border: `1px solid ${p.border}` }}>
      {label && <span style={{ color: p.muted }}>{label}</span>}
      <span style={{ fontWeight: 600, color: p.chipText }}>{value}</span>
    </span>
  )
}

// 스타일된 네이티브 select(실제 동작)
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const p = usePalette()
  return (
    <label className="flex flex-col" style={{ gap: 7 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{label}</span>
      <span className="relative flex items-center">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full rounded-lg outline-none cursor-pointer truncate"
          style={{ padding: '9px 30px 9px 12px', fontSize: 14, background: p.chip, border: `1px solid ${p.border}`, color: value === 'all' ? p.muted : p.text }}>
          {options.map((o) => <option key={o.value} value={o.value} style={{ color: '#111', background: '#fff' }}>{o.label}</option>)}
        </select>
        <ChevronDownIcon width={15} height={15} className="absolute right-3 pointer-events-none" style={{ color: p.muted }} />
      </span>
    </label>
  )
}

function CheckRow({ label, checked, onClick }: { label: string; checked?: boolean; onClick?: () => void }) {
  const p = usePalette()
  return (
    <button type="button" onClick={onClick} className="flex items-center text-left" style={{ gap: 9, fontSize: 14 }}>
      <span className="flex items-center justify-center shrink-0"
        style={{ width: 18, height: 18, borderRadius: 5, background: checked ? p.accent : 'transparent', border: `1px solid ${checked ? p.accent : p.border}`, color: '#fff' }}>
        {checked && <CheckIcon width={13} height={13} strokeWidth={3} />}
      </span>
      <span style={{ color: checked ? p.text : p.muted }}>{label}</span>
    </button>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const p = usePalette()
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{label}</span>
      {children}
    </div>
  )
}

function Panel({ children, style, bg }: { children: ReactNode; style?: CSSProperties; bg: string }) {
  const p = usePalette()
  return (
    <section className="rounded-xl min-w-0" style={{ background: bg, border: `1px solid ${p.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', ...style }}>
      {children}
    </section>
  )
}

// 4.17 좌 — AI 탐색 가이드(필터, 실제 동작)
function FilterPanel({ f, set, onReset }: { f: Filters; set: (patch: Partial<Filters>) => void; onReset: () => void }) {
  const p = usePalette()
  const toggleStatus = (st: string) => {
    const next = new Set(f.statuses)
    next.has(st) ? next.delete(st) : next.add(st)
    set({ statuses: next })
  }
  return (
    <Panel bg={p.filter} style={{ padding: 20 }}>
      <div className="flex flex-col" style={{ gap: 18 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <div className="flex items-center justify-between gap-2">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: p.heading }}>AI 탐색 가이드</h3>
            {filtersActive(f) && (
              <button type="button" onClick={onReset} className="flex items-center gap-1 shrink-0" style={{ fontSize: 12.5, color: p.accent }}>
                <ArrowPathIcon width={12} height={12} /> 초기화
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: p.muted }}>
            다양한 AI 서비스를 탐색하고 비교해 보세요. 필터와 태그를 활용해 필요한 서비스를 빠르게 찾을 수 있습니다.
          </p>
        </div>

        <Select label="종류" value={f.kind} onChange={(kind) => set({ kind })}
          options={[{ value: 'all', label: '모든 종류' }, ...KINDS.map((k) => ({ value: k, label: k }))]} />

        <FilterGroup label="API 여부">
          <CheckRow label="전체" checked={f.api === 'all'} onClick={() => set({ api: 'all' })} />
          <CheckRow label="API 제공" checked={f.api === 'yes'} onClick={() => set({ api: 'yes' })} />
          <CheckRow label="API 미제공" checked={f.api === 'no'} onClick={() => set({ api: 'no' })} />
        </FilterGroup>

        <Select label="모델" value={f.model} onChange={(model) => set({ model })}
          options={[{ value: 'all', label: '모든 모델' }, ...MODELS.map((m) => ({ value: m, label: m }))]} />
        <Select label="소유자" value={f.owner} onChange={(owner) => set({ owner })}
          options={[{ value: 'all', label: '모든 소유자' }, ...OWNERS.map((o) => ({ value: o, label: o }))]} />

        <FilterGroup label="상태">
          <CheckRow label="전체" checked={f.statuses.size === 0} onClick={() => set({ statuses: new Set() })} />
          {STATUSES.map((st) => <CheckRow key={st} label={st} checked={f.statuses.has(st)} onClick={() => toggleStatus(st)} />)}
        </FilterGroup>

        <FilterGroup label="태그">
          <span className="flex items-center gap-2 rounded-lg" style={{ padding: '8px 11px', background: p.chip, border: `1px solid ${p.border}` }}>
            <input value={f.tag} onChange={(e) => set({ tag: e.target.value })}
              className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14, color: p.text }} placeholder="태그 선택 또는 입력" aria-label="태그 필터" />
          </span>
        </FilterGroup>
      </div>
    </Panel>
  )
}

// 4.17 중앙 — AI 목록(행 클릭 → 상세 모달)
function AIList({ services, total, sort, onSort, onOpen, onReset }: {
  services: Service[]; total: number; sort: SortKey; onSort: (s: SortKey) => void; onOpen: (s: Service) => void; onReset: () => void
}) {
  const p = usePalette()
  return (
    <Panel bg={p.card}>
      <header className="flex items-center justify-between gap-3" style={{ padding: '13px 16px', borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: p.heading }}>AI 목록</h3>
          <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: p.accent, background: p.accentSoft }}>{services.length}{services.length !== total ? `/${total}` : ''}</span>
          <span className="truncate" style={{ fontSize: 12.5, color: p.muted }}>· 탐색 · 검색 · 태그</span>
        </div>
        <span className="relative flex items-center shrink-0">
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)}
            className="appearance-none outline-none cursor-pointer" style={{ padding: '4px 22px 4px 8px', fontSize: 13, color: p.muted, background: 'transparent', border: `1px solid ${p.border}`, borderRadius: 8 }}>
            <option value="usage" style={{ color: '#111' }}>사용량순</option>
            <option value="recent" style={{ color: '#111' }}>최신순</option>
            <option value="name" style={{ color: '#111' }}>이름순</option>
          </select>
          <ChevronDownIcon width={13} height={13} className="absolute right-2 pointer-events-none" style={{ color: p.muted }} />
        </span>
      </header>

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center" style={{ padding: '56px 20px', gap: 10 }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: p.inset, color: p.muted }}>
            <MagnifyingGlassIcon width={22} height={22} />
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: p.heading }}>조건에 맞는 서비스가 없어요</span>
          <span style={{ fontSize: 13, color: p.muted }}>필터를 조정하거나 검색어를 바꿔 보세요.</span>
          <button type="button" onClick={onReset} className="mt-1 flex items-center gap-1.5 rounded-lg" style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, color: p.accent, background: p.accentSoft }}>
            <ArrowPathIcon width={13} height={13} /> 필터 초기화
          </button>
        </div>
      ) : (
        <ul>
          {services.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s)}
                className="group flex w-full items-start gap-3 text-left transition-colors"
                style={{ padding: '13px 16px', borderBottom: `1px solid ${p.divider}` }}
                onMouseEnter={(e) => (e.currentTarget.style.background = p.accentSoft)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <Logo id={s.id} hue={s.hue} icon={s.icon} size={42} />
                <div className="flex flex-col min-w-0 flex-1" style={{ gap: 7 }}>
                  <div className="flex items-center flex-wrap gap-2">
                    <span style={{ fontSize: 15, fontWeight: 700, color: p.heading }}>{s.name}</span>
                    <MetaChip label="종류" value={s.kind} />
                    <MetaChip label="API 여부" value={hasApiOf(s) ? 'API' : '미제공'} />
                    <MetaChip label="모델" value={s.model} />
                  </div>
                  <p className="truncate" style={{ fontSize: 13.5, color: p.muted }}>{s.desc}</p>
                </div>
                <div className="flex flex-col items-end shrink-0" style={{ gap: 2, minWidth: 88 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', color: p.heading }}>{s.usage}</span>
                  <span style={{ fontSize: 12, color: p.muted }}>API 호출</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: deltaColor(p, s.up) }}>{s.delta}</span>
                </div>
                <ChevronRightIcon width={16} height={16} className="self-center shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: p.muted }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// 랭킹 카드
function RankCard({ item }: { item: RankItem }) {
  const p = usePalette()
  const medal = item.rank === 1 ? '#F4C71A' : item.rank === 2 ? '#C7CFDB' : item.rank === 3 ? '#E08A4C' : p.chip
  const medalFg = item.rank <= 3 ? '#10131c' : p.muted
  return (
    <div className="rounded-xl" style={{ background: p.inset, border: `1px solid ${p.border}` }}>
      <div className="flex items-center gap-2.5" style={{ padding: '11px 12px 9px' }}>
        <span className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: 999, background: medal, color: medalFg, fontSize: 12.5, fontWeight: 800 }}>{item.rank}</span>
        <Logo id={item.seed} hue={item.hue} icon={item.icon} size={30} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: p.heading }}>{item.name}</span>
          <span className="truncate" style={{ fontSize: 12, color: p.muted }}>{item.model}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span style={{ fontSize: 14, fontWeight: 800, color: p.heading }}>{item.usage}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor(p, item.up) }}>{item.delta}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2" style={{ padding: '8px 12px', borderTop: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {item.chips.map((c) => (
            <span key={c} className="rounded-md whitespace-nowrap" style={{ padding: '2px 7px', fontSize: 11.5, color: p.muted, background: p.card, border: `1px solid ${p.border}` }}>{c}</span>
          ))}
        </div>
        <StatusBadge status={item.status} tone={item.tone} />
      </div>
    </div>
  )
}

// 4.17·4.18 우 — 실시간 서비스 랭킹(검색 동작)
function RankingPanel() {
  const p = usePalette()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const v = q.trim().toLowerCase()
    return v ? RANKING.filter((r) => `${r.name} ${r.model}`.toLowerCase().includes(v)) : RANKING
  }, [q])
  return (
    <Panel bg={p.panel} style={{ padding: 16 }}>
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-center justify-between gap-2">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: p.heading }}>실시간 서비스 랭킹</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '3px 9px', fontSize: 11.5, fontWeight: 700, color: p.ok, background: p.okSoft }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />LIVE
          </span>
        </div>
        <span className="flex items-center gap-2 rounded-lg" style={{ padding: '8px 11px', background: p.chip, border: `1px solid ${p.border}` }}>
          <MagnifyingGlassIcon width={15} height={15} className="shrink-0" style={{ color: p.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 13.5, color: p.text }} placeholder="서비스 검색" aria-label="랭킹 검색" />
        </span>
        <span className="flex items-center justify-between gap-2 rounded-lg" style={{ padding: '8px 11px', fontSize: 13, background: p.chip, border: `1px solid ${p.border}` }}>
          <span style={{ fontWeight: 600, color: p.text }}>필터</span>
          <span className="flex items-center gap-1 truncate" style={{ color: p.muted }}>종류 · API · 모델 · 소유자 · 상태 <ChevronDownIcon width={14} height={14} className="shrink-0" /></span>
        </span>
        <div className="flex items-center justify-between gap-2" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: p.text }}>최대 사용량 서비스 순위</span>
          <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: p.muted }}><ArrowPathIcon width={12} height={12} /> 1분 전 업데이트</span>
        </div>
        <div className="flex flex-col" style={{ gap: 10 }}>
          {list.length === 0
            ? <p className="text-center" style={{ fontSize: 13, color: p.muted, padding: '18px 0' }}>검색 결과가 없어요.</p>
            : list.map((r) => <RankCard key={r.rank} item={r} />)}
        </div>
        <Button variant="outline" className="justify-center w-full">전체 랭킹 보기 <ChevronRightIcon width={14} height={14} /></Button>
      </div>
    </Panel>
  )
}

// ───────────────────────── 4.18 서비스 상세 카드(모달 내용) ─────────────────────────
function StatCard({ icon: Ico, label, value }: { icon: Icon; label: string; value: string }) {
  const p = usePalette()
  return (
    <div className="flex items-center gap-3 rounded-xl" style={{ padding: '13px 14px', background: p.inset, border: `1px solid ${p.border}` }}>
      <span className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 10, background: p.accentSoft, color: p.accent }}><Ico width={19} height={19} /></span>
      <div className="flex flex-col min-w-0">
        <span className="truncate" style={{ fontSize: 12.5, color: p.muted, lineHeight: 1.3 }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px', color: p.heading, lineHeight: 1.2 }}>{value}</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  const p = usePalette()
  return <h3 style={{ fontSize: 15.5, fontWeight: 700, color: p.heading, letterSpacing: '-0.2px' }}>{children}</h3>
}

// 점 불릿 리스트(Figma 스타일)
function BulletList({ items }: { items: ReactNode[] }) {
  const p = usePalette()
  return (
    <ul className="flex flex-col" style={{ gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5" style={{ fontSize: 13.5, lineHeight: 1.5, color: p.muted }}>
          <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: p.accent, marginTop: 7 }} />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  )
}

function ServiceDetailCard({ service: s, narrow }: { service: Service; narrow: boolean }) {
  const p = usePalette()
  const tone = toneOf(s.status)
  const apiAvailable = hasApiOf(s)
  const usageStats: [string, string][] = [
    ['월간 요청 수', s.reqFull],
    ['평균 응답시간', s.responseTime.replace('s', '초')],
    ['성공률', s.success],
    ['최근 7일 증감율', s.deltaPct],
    ['마지막 호출', s.lastCall],
  ]
  const ops = [...s.opsNotes, '문의: ai-support@anclave.io']
  const divider = <div style={{ height: 1, background: p.divider }} />
  return (
    <div className="flex flex-col" style={{ gap: narrow ? 18 : 22 }}>
      {/* 헤더 */}
      <div className="flex flex-col" style={{ gap: 18 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5 min-w-0">
            <Logo id={s.id} hue={s.hue} icon={s.icon} size={52} />
            <div className="flex flex-col min-w-0" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', color: p.heading, lineHeight: 1.1 }}>{s.name}</h2>
              <div className="flex items-center flex-wrap gap-2">
                <MetaChip label="제공사" value={s.provider} />
                <MetaChip label="API" value={apiAvailable ? s.api : '미제공'} />
                <MetaChip label="모델" value={s.model} />
                <MetaChip label="소유자" value={s.owner} />
                <StatusBadge status={s.status} tone={tone} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center shrink-0 rounded-xl" style={{ padding: '8px 18px', background: p.okSoft, border: `1px solid ${toneColor(p, 'ok')}33` }}>
            <span className="flex items-center gap-1" style={{ fontSize: 19, fontWeight: 800, color: p.ok, lineHeight: 1.1 }}><StarIcon width={16} height={16} /> {s.rating.toFixed(1)}</span>
            <span style={{ fontSize: 12, color: p.muted }}>사용자 평점</span>
          </div>
        </div>
        {divider}
      </div>

      {/* 4 스탯 카드 */}
      <div className="grid" style={{ gap: 12, gridTemplateColumns: narrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
        <StatCard icon={ClockIcon} label="평균 응답 시간" value={s.responseTime} />
        <StatCard icon={CodeBracketIcon} label="호출 방식" value={apiAvailable ? s.api : '콘솔'} />
        <StatCard icon={StarIcon} label="모델 등급" value={s.tier} />
        <StatCard icon={ChartBarIcon} label="월 요청수" value={s.monthlyReq} />
      </div>

      {/* 개요 */}
      <div className="flex flex-col" style={{ gap: 9 }}>
        <SectionTitle>서비스 개요</SectionTitle>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: p.muted }}>{s.overview}</p>
      </div>

      {/* API 설명(API 제공 시) */}
      {apiAvailable && s.apiDesc && (
        <div className="flex flex-col" style={{ gap: 9 }}>
          <SectionTitle>API 설명</SectionTitle>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: p.muted }}>{s.apiDesc}</p>
        </div>
      )}

      {/* 주요 기능 */}
      <div className="flex flex-col" style={{ gap: 11 }}>
        <SectionTitle>주요 기능</SectionTitle>
        <ul className="grid" style={{ rowGap: 9, columnGap: 24, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
          {s.features.map((feat) => (
            <li key={feat} className="flex items-center gap-2.5" style={{ fontSize: 14, color: p.text }}>
              <span className="flex items-center justify-center shrink-0" style={{ width: 18, height: 18, borderRadius: 999, background: p.accentSoft, color: p.accent }}>
                <CheckIcon width={11} height={11} strokeWidth={3.2} />
              </span>
              {feat}
            </li>
          ))}
        </ul>
      </div>

      {divider}

      {/* 사용 현황 · 운영 메모 — Figma 점 불릿 2열 */}
      <div className="grid" style={{ gap: narrow ? 18 : 28, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
        <div className="flex flex-col" style={{ gap: 11 }}>
          <SectionTitle>사용 현황</SectionTitle>
          <BulletList items={usageStats.map(([k, v]) => (
            <span key={k} className="flex items-baseline justify-between gap-3">
              <span style={{ color: p.muted }}>{k}</span>
              <span className="text-right tabular-nums" style={{ fontWeight: 700, color: p.text, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
            </span>
          ))} />
        </div>
        <div className="flex flex-col" style={{ gap: 11 }}>
          <SectionTitle>운영 메모</SectionTitle>
          <BulletList items={ops} />
        </div>
      </div>

      {divider}

      {/* 안내 + 액션 한 행(Figma) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="flex items-center gap-2" style={{ fontSize: 13.5, color: p.muted }}>
          <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 18, height: 18, background: p.accentSoft, color: p.accent }}>
            <CheckIcon width={11} height={11} strokeWidth={3} />
          </span>
          이 서비스는 기업 내부 사용자에게만 제공됩니다.
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="outline">서비스 문의</Button>
          <Button>설정 관리</Button>
        </div>
      </div>
    </div>
  )
}

// 상세 모달(팝업)
function DetailModal({ service, onClose }: { service: Service; onClose: () => void }) {
  const p = usePalette()
  const narrow = useNarrow(720)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: p.dim, backdropFilter: 'blur(3px)', padding: '4vh 16px', overflowY: 'auto', animation: 'mkFadeIn .18s ease both' }}
      onClick={onClose} role="presentation">
      <style>{`@keyframes mkFadeIn{from{opacity:0}to{opacity:1}}@keyframes mkPopIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      <div className="w-full rounded-2xl relative"
        style={{ maxWidth: 900, background: p.card, border: `1px solid ${p.border}`, boxShadow: p.shadow, animation: 'mkPopIn .24s cubic-bezier(.2,.7,.2,1) both' }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${service.name} 상세`}>
        <button type="button" onClick={onClose} aria-label="닫기" className="absolute flex items-center justify-center rounded-lg z-10"
          style={{ top: 16, right: 16, width: 32, height: 32, color: p.muted, background: p.inset, border: `1px solid ${p.border}` }}>
          <XMarkIcon width={17} height={17} />
        </button>
        <div style={{ padding: narrow ? 20 : 28 }}>
          <ServiceDetailCard service={service} narrow={narrow} />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 4.17 마켓플레이스 ─────────────────────────
export function Marketplace() {
  const p = usePalette()
  const narrow = useNarrow()
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<SortKey>('usage')
  const [selected, setSelected] = useState<Service | null>(null)
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const reset = () => setFilters(emptyFilters())
  const results = useMemo(() => applyFilters(filters, sort), [filters, sort])

  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16 }}>
      {/* 상단 검색바(동작) */}
      <div className="flex items-center gap-3 rounded-xl" style={{ padding: '10px 12px', background: p.card, border: `1px solid ${p.border}` }}>
        <span className="flex items-center gap-2 flex-1 min-w-0">
          <MagnifyingGlassIcon width={18} height={18} className="shrink-0" style={{ color: p.muted }} />
          <input value={filters.query} onChange={(e) => set({ query: e.target.value })}
            className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14.5, color: p.text }} placeholder="AI 서비스를 검색해 보세요" aria-label="AI 서비스 검색" />
          {filters.query && (
            <button type="button" onClick={() => set({ query: '' })} aria-label="검색어 지우기" className="shrink-0" style={{ color: p.muted }}>
              <XMarkIcon width={16} height={16} />
            </button>
          )}
        </span>
        <Button className="shrink-0"><MagnifyingGlassIcon width={15} height={15} /> 검색</Button>
      </div>

      {/* 좌 필터 · 중앙 목록 · 우 랭킹 */}
      <div className="grid items-start min-w-0" style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : '252px minmax(0, 1fr) 332px' }}>
        <FilterPanel f={filters} set={set} onReset={reset} />
        <AIList services={results} total={SERVICES.length} sort={sort} onSort={setSort} onOpen={setSelected} onReset={reset} />
        <RankingPanel />
      </div>

      {selected && <DetailModal service={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ───────────────────────── 4.18 서비스 상세(직접 라우트 — 컨테인드) ─────────────────────────
export function ServiceDetail() {
  const p = usePalette()
  const narrow = useNarrow(760)
  const navigate = useNavigate()
  const { id } = useParams()
  const service = serviceById(id)
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 14 }}>
      <button type="button" onClick={() => navigate('/marketplace')} className="flex items-center gap-1.5 self-start" style={{ fontSize: 13.5, color: p.muted }}>
        <ChevronRightIcon width={15} height={15} style={{ transform: 'rotate(180deg)' }} /> 마켓플레이스로
      </button>
      <div className="w-full mx-auto rounded-2xl" style={{ maxWidth: 900, background: p.card, border: `1px solid ${p.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', padding: narrow ? 20 : 28 }}>
        <ServiceDetailCard service={service} narrow={narrow} />
      </div>
    </div>
  )
}
