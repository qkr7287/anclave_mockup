import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { useTheme } from '../lib/theme'
import { QaPolish } from './qa-polish'
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
  KeyIcon,
} from '@heroicons/react/24/outline'

// G8 · 4.17 마켓플레이스 · 4.18 서비스(AI) 상세 — Figma 매칭(fileKey iqVQ2GEDCRj9cK3EBOwBJV,
// 4.17=node 1:2, 4.18=node 3:11938). 셸은 우리 것, 콘텐츠만 Figma.
// 상세는 행 클릭 → 모달 팝업(Figma 상세 카드). 필터·검색·정렬은 목업이지만 실제 동작.

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// ───────────────────────── Figma 팔레트(테마 인지) ─────────────────────────
interface Palette {
  filter: string; panel: string; card: string; modalCard: string; inset: string; chip: string
  border: string; borderStrong: string; divider: string; heading: string; text: string; muted: string; chipText: string
  accent: string; accentSoft: string
  ok: string; okSoft: string; warn: string; warnSoft: string; danger: string; dangerSoft: string
  dim: string; shadow: string
}
function usePalette(): Palette {
  const { theme } = useTheme()
  if (theme !== 'light') {
    // 표면 명도 단계를 벌려 섹션 구분을 또렷하게(패널 < 모달 < 인셋·칩).
    return {
      filter: '#19212F', panel: '#171F2C', card: '#161E2C', modalCard: '#1D2738', inset: '#243044', chip: '#26334A',
      border: '#34415A', borderStrong: '#41506C', divider: '#303C53', heading: '#F4F6FA', text: '#DDE2EC', muted: '#9AA4B6', chipText: '#C2CADA',
      accent: '#3B8DFF', accentSoft: 'rgba(59,141,255,0.16)',
      ok: '#34C759', okSoft: 'rgba(52,199,89,0.16)', warn: '#E8B033', warnSoft: 'rgba(232,176,51,0.16)',
      danger: '#FF6B57', dangerSoft: 'rgba(255,107,87,0.16)',
      dim: 'rgba(4,7,13,0.72)', shadow: '0 30px 80px rgba(0,0,0,0.62)',
    }
  }
  return {
    filter: 'var(--c-card2)', panel: 'var(--c-card2)', card: 'var(--c-card2)', modalCard: 'var(--c-card2)', inset: 'var(--c-soft)', chip: 'var(--c-soft)',
    border: 'var(--c-border)', borderStrong: 'var(--c-border)', divider: 'var(--c-border)', heading: 'var(--c-text)', text: 'var(--c-text)', muted: 'var(--c-muted)', chipText: 'var(--c-muted)',
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
    id: 'qwen-agent', name: '설비점검 업무 도우미', kind: '업무 자동화', provider: '전력연구원 AI랩', model: 'Qwen2.5-72B', api: 'REST API',
    owner: '김민준', rating: 4.8, status: '정상', hue: 212, icon: CpuChipIcon,
    responseTime: '0.92s', tier: 'Enterprise', monthlyReq: '142.8K', usage: '142.8K', usageNum: 142800, delta: '▲ 18%', up: true,
    reqFull: '142,820건', success: '99.82%', deltaPct: '+18.4%', lastCall: '12초 전', tags: ['설비점검', '업무자동화', '보고서'],
    desc: '현장 설비점검 절차 안내와 점검보고서 작성을 자동화하는 에이전트입니다.',
    overview: 'Qwen2.5-72B 기반 업무 에이전트로 설비점검 체크리스트 안내·이상소견 정리·점검보고서 초안 작성을 자동화합니다. 사내 설비대장·점검매뉴얼과 연동됩니다.',
    apiDesc: 'RESTful 에이전트 엔드포인트로 점검 task 등록·실행·상태 조회를 제공합니다. JSON 요청/응답에 SSE 스트리밍을 지원하며 인증은 Bearer Token을 사용합니다.',
    features: ['점검 절차·체크리스트 안내', '이상소견 자동 정리', '점검보고서 초안 생성', '설비대장·매뉴얼 연동(RAG)', '작업 이력·감사 추적'],
    opsNotes: ['2024-05-22: 변전설비 점검 템플릿 추가', '2024-05-18: 컨텍스트 윈도우 128K로 확장', '동시 작업 한도 초과 시 큐잉됩니다.'],
  },
  {
    id: 'speech-text', name: '고객센터 음성인식(STT)', kind: '음성 인식', provider: '고객서비스처', model: 'Whisper Large v3', api: 'REST API',
    owner: '윤서연', rating: 4.6, status: '정상', hue: 168, icon: MicrophoneIcon,
    responseTime: '1.10s', tier: 'Standard', monthlyReq: '41.0K', usage: '41.0K', usageNum: 41000, delta: '▲ 9%', up: true,
    reqFull: '40,980건', success: '99.41%', deltaPct: '+9.2%', lastCall: '47초 전', tags: ['음성인식', '고객센터', 'STT'],
    desc: '123 고객센터 상담 통화를 실시간 텍스트로 변환합니다.',
    overview: 'Whisper Large v3 기반 음성 인식으로 상담 통화를 실시간 전사합니다. 잡음 환경에서도 높은 정확도를 유지하며 상담사·고객 화자 분리를 제공합니다.',
    apiDesc: '오디오 업로드 또는 스트리밍 소켓으로 전사 결과를 받습니다. 타임스탬프·신뢰도 점수를 포함한 JSON을 반환합니다.',
    features: ['상담 통화 실시간 전사', '상담사·고객 화자 분리', '단어 단위 타임스탬프', '잡음 억제 전처리', '상담 요약 연동'],
    opsNotes: ['2024-05-20: 실시간 스트리밍 지연 30% 개선', '2024-05-12: 전력 용어 사전 추가', '통화 최대 25분/요청 제한이 있습니다.'],
  },
  {
    id: 'image-gen-studio', name: '홍보 이미지 생성 스튜디오', kind: '이미지 생성', provider: '커뮤니케이션실', model: 'Stable Diffusion XL', api: '콘솔',
    owner: '정우성', rating: 4.5, status: '주의', hue: 286, icon: PhotoIcon,
    responseTime: '2.40s', tier: 'Premium', monthlyReq: '1.78M', usage: '1.78M', usageNum: 1780000, delta: '▼ 7%', up: false,
    reqFull: '1,782,400건', success: '98.10%', deltaPct: '-7.1%', lastCall: '4초 전', tags: ['이미지생성', '홍보', '스튜디오'],
    desc: '캠페인·안내용 홍보 이미지를 생성하는 워크스페이스입니다.',
    overview: 'Stable Diffusion XL 기반 이미지 생성 스튜디오로 에너지 절약 캠페인·사내 공지용 비주얼을 생성합니다. 웹 콘솔에서 브랜드 스타일 프리셋과 시드 고정을 지원합니다.',
    apiDesc: '',
    features: ['텍스트→이미지 / 이미지→이미지', '브랜드 스타일 프리셋', '업스케일·인페인팅', '배치 생성 큐', '유해 콘텐츠 안전 필터'],
    opsNotes: ['2024-05-21: 생성 큐 적체로 평균 대기 상승(모니터링 중)', '2024-05-10: 모델 가중치 업데이트', '피크 시간대 처리량이 제한될 수 있습니다.'],
  },
  {
    id: 'doc-summary', name: '사내문서 요약 서비스', kind: '문서 요약', provider: '디지털변환처', model: 'EXAONE 3.0', api: 'REST API',
    owner: '박지호', rating: 4.7, status: '정상', hue: 28, icon: DocumentTextIcon,
    responseTime: '1.05s', tier: 'Premium', monthlyReq: '1.23M', usage: '1.23M', usageNum: 1230000, delta: '▲ 5%', up: true,
    reqFull: '1,234,560건', success: '99.63%', deltaPct: '+5.2%', lastCall: '9초 전', tags: ['문서요약', '규정', '보고서'],
    desc: '규정·기술보고서·계약서를 요약하고 핵심을 추출합니다.',
    overview: 'EXAONE 3.0 기반 문서 처리 서비스로 장문 규정·기술보고서 요약과 핵심 추출, 보고서 초안 생성을 제공합니다. 표·인용을 보존하며 한국어에 최적화되어 있습니다.',
    apiDesc: 'PDF·HWP·DOCX를 업로드하면 구조화된 요약 JSON을 반환합니다. 요약 길이·톤·출력 포맷을 파라미터로 제어합니다.',
    features: ['장문(200K 토큰) 요약', '핵심 문장·키워드 추출', '표·인용 보존', '보고서 템플릿 자동 채움', '출처 페이지 매핑'],
    opsNotes: ['2024-05-19: 표 추출 정확도 개선', '2024-05-11: HWP 파서 연동', '대용량 문서는 분할 처리됩니다.'],
  },
  {
    id: 'translate-pro', name: '다국어 민원 번역', kind: '번역', provider: '고객서비스처', model: 'HyperCLOVA X', api: 'REST API',
    owner: '이수민', rating: 4.4, status: '정상', hue: 150, icon: LanguageIcon,
    responseTime: '0.88s', tier: 'Standard', monthlyReq: '856K', usage: '856K', usageNum: 856000, delta: '▲ 3%', up: true,
    reqFull: '856,200건', success: '99.55%', deltaPct: '+3.1%', lastCall: '21초 전', tags: ['번역', '민원', '다국어'],
    desc: '외국인 고객 민원·안내문을 다국어로 번역합니다.',
    overview: 'HyperCLOVA X 기반 번역 서비스로 외국인 고객 민원과 안내문을 문맥·어조를 보존해 번역합니다. 전력 용어집과 도메인 적응을 지원합니다.',
    apiDesc: '소스/타깃 언어와 텍스트를 전송하면 번역문과 대안 표현을 반환합니다. 용어집 ID를 함께 넘겨 일관성을 강제할 수 있습니다.',
    features: ['문맥·어조 보존 번역', '전력 용어집 적용', '실시간 스트리밍 번역', '서식(HTML/MD) 보존', '품질 점수 반환'],
    opsNotes: ['2024-05-18: 전력·법무 용어집 확장', '2024-05-09: 스트리밍 번역 베타 공개', '용어집은 요청당 1개만 적용됩니다.'],
  },
  {
    id: 'vector-search', name: '기술자료 검색', kind: '검색', provider: 'ICT기획처', model: 'BGE-M3', api: 'gRPC',
    owner: '한도윤', rating: 4.3, status: '불안정', hue: 196, icon: MagnifyingGlassIcon,
    responseTime: '1.62s', tier: 'Developer', monthlyReq: '642K', usage: '642K', usageNum: 642000, delta: '▼ 2%', up: false,
    reqFull: '642,100건', success: '97.20%', deltaPct: '-2.6%', lastCall: '2초 전', tags: ['검색', '기술자료', '벡터'],
    desc: '기술도서·도면·표준을 의미 기반으로 검색합니다.',
    overview: 'BGE-M3 임베딩 기반 시맨틱 검색으로 기술자료·도면·표준의 의미 유사도 검색과 하이브리드(키워드+벡터) 랭킹을 제공합니다. 대규모 인덱스를 지원합니다.',
    apiDesc: 'gRPC 스트림으로 임베딩·업서트·질의를 처리합니다. top-k·필터·리랭킹 옵션을 지원하며 결과에 유사도 점수를 포함합니다.',
    features: ['하이브리드(키워드+벡터) 검색', '문서 권한 필터', '리랭킹(Cross-Encoder)', '증분 인덱싱', 'p99 지연 모니터링'],
    opsNotes: ['2024-05-22: 인덱스 샤드 리밸런싱 중(간헐적 지연)', '2024-05-08: 리랭커 모델 교체', '대량 업서트는 배치 권장.'],
  },
  {
    id: 'code-copilot', name: '사내 개발 코파일럿', kind: '코딩', provider: 'ICT기획처', model: 'Qwen2.5-Coder 32B', api: 'REST API',
    owner: '김민준', rating: 4.7, status: '정상', hue: 256, icon: CodeBracketSquareIcon,
    responseTime: '0.74s', tier: 'Enterprise', monthlyReq: '512K', usage: '512K', usageNum: 512000, delta: '▲ 12%', up: true,
    reqFull: '512,340건', success: '99.71%', deltaPct: '+12.3%', lastCall: '6초 전', tags: ['코딩', '개발', 'IDE'],
    desc: '사내 시스템 개발 코드 작성·리뷰를 지원합니다.',
    overview: 'Qwen2.5-Coder 32B 기반 코딩 어시스턴트로 사내 시스템 개발의 코드 자동완성·리뷰·테스트 생성을 제공합니다. 사내 레포 컨텍스트를 이해합니다.',
    apiDesc: 'completion·chat·edit 엔드포인트로 코드 생성과 인라인 수정을 제공합니다. FIM(fill-in-the-middle)과 스트리밍을 지원합니다.',
    features: ['코드 자동완성(FIM)', '레포 컨텍스트 리뷰', '테스트·문서 자동 생성', '취약점 정적 점검', 'IDE 플러그인 연동'],
    opsNotes: ['2024-05-20: 레포 인덱싱 속도 2배 개선', '2024-05-13: 보안 점검 룰셋 추가', '레포 최대 50만 LOC까지 인덱싱.'],
  },
  {
    id: 'rag-knowledge', name: '사내규정 Q&A', kind: '규정 검색(RAG)', provider: '감사실', model: 'EXAONE 3.0 + BGE-M3', api: 'REST API',
    owner: '박지호', rating: 4.5, status: '정상', hue: 320, icon: CircleStackIcon,
    responseTime: '1.18s', tier: 'Standard', monthlyReq: '388K', usage: '388K', usageNum: 388000, delta: '▲ 6%', up: true,
    reqFull: '388,420건', success: '99.34%', deltaPct: '+6.0%', lastCall: '33초 전', tags: ['규정', '질의응답', 'RAG'],
    desc: '사내 규정·지침에 근거한 질의응답을 제공합니다.',
    overview: 'BGE-M3 임베딩과 EXAONE 3.0 생성으로 구성된 RAG 파이프라인으로, 사내 규정·지침에 근거한 정확한 답변과 출처(조항)를 제공합니다. 권한 기반 검색을 지원합니다.',
    apiDesc: '질의를 전송하면 근거 조항·출처와 함께 생성 답변을 반환합니다. 컬렉션·필터·인용 모드를 파라미터로 제어합니다.',
    features: ['출처 조항 인용 답변', '권한 기반 문서 필터', '근거 하이라이트', '환각 억제(grounding)', '규정 개정 반영'],
    opsNotes: ['2024-05-19: 인용 정확도 개선', '2024-05-10: 규정 동기화 주기 단축', '컬렉션당 문서 100만 건 한도.'],
  },
  {
    id: 'sentiment-lens', name: '민원 감성 분석', kind: '감성 분석', provider: '고객서비스처', model: 'KoBERT', api: 'REST API',
    owner: '최예린', rating: 4.2, status: '주의', hue: 8, icon: FaceSmileIcon,
    responseTime: '0.96s', tier: 'Developer', monthlyReq: '274K', usage: '274K', usageNum: 274000, delta: '▼ 4%', up: false,
    reqFull: '274,050건', success: '98.66%', deltaPct: '-4.0%', lastCall: '18초 전', tags: ['감성분석', '민원', 'VOC'],
    desc: '고객 민원·상담 텍스트의 감성과 불만 유형을 분류합니다.',
    overview: 'KoBERT 기반 감성·의도 분석으로 민원·상담 텍스트를 긍정/부정/중립과 불만 유형으로 분류합니다. 한국어 구어체에 강합니다.',
    apiDesc: '텍스트 배열을 전송하면 감성 라벨·점수·유형 태그를 반환합니다. 커스텀 라벨 스키마를 등록할 수 있습니다.',
    features: ['감성 3분류 + 강도 점수', '불만 유형 태깅', '커스텀 라벨 스키마', '배치 분류', '시계열 트렌드 집계'],
    opsNotes: ['2024-05-21: 구어체 오탐 감소 튜닝(검증 중)', '2024-05-09: 유형 분류기 업데이트', '배치 최대 1,000건/요청.'],
  },
  {
    id: 'video-caption', name: '회의록·자막 생성', kind: '영상 자막', provider: '디지털변환처', model: 'Whisper + EXAONE 3.0', api: '콘솔',
    owner: '윤서연', rating: 4.4, status: '정상', hue: 188, icon: VideoCameraIcon,
    responseTime: '2.05s', tier: 'Premium', monthlyReq: '198K', usage: '198K', usageNum: 198000, delta: '▲ 8%', up: true,
    reqFull: '198,300건', success: '99.18%', deltaPct: '+8.4%', lastCall: '52초 전', tags: ['영상자막', '회의록', '교육'],
    desc: '회의·교육 영상의 자막과 회의록을 자동 생성하는 워크스페이스입니다.',
    overview: 'Whisper 전사와 EXAONE 3.0 후처리를 결합해 회의·교육 영상의 자막·챕터·회의록을 생성합니다. 웹 콘솔에서 화자 라벨링과 핵심 안건 추출을 지원합니다.',
    apiDesc: '',
    features: ['자동 자막(SRT/VTT)', '회의록·안건 요약', '챕터·하이라이트 추출', '화자 라벨링', '교육 영상 검색'],
    opsNotes: ['2024-05-18: 챕터 경계 정확도 개선', '2024-05-12: 회의록 템플릿 추가', '영상 최대 2시간/요청.'],
  },
  {
    id: 'tts-voice', name: '안내방송 음성합성(TTS)', kind: '음성 합성', provider: '고객서비스처', model: 'VITS Multilingual', api: 'REST API',
    owner: '정우성', rating: 4.6, status: '정상', hue: 44, icon: SpeakerWaveIcon,
    responseTime: '0.81s', tier: 'Standard', monthlyReq: '156K', usage: '156K', usageNum: 156000, delta: '▲ 15%', up: true,
    reqFull: '156,720건', success: '99.77%', deltaPct: '+15.1%', lastCall: '15초 전', tags: ['음성합성', '안내방송', 'TTS'],
    desc: '정전 안내·ARS 음성을 자연스럽게 합성합니다.',
    overview: 'VITS Multilingual 기반 음성 합성으로 정전·점검 안내와 ARS 음성을 자연스러운 억양으로 생성합니다. SSML 제어를 지원합니다.',
    apiDesc: '텍스트와 voice ID·SSML을 전송하면 스트리밍 오디오를 반환합니다. 포맷·샘플레이트·속도를 파라미터로 제어합니다.',
    features: ['다국어 자연 음성', '감정·억양 SSML 제어', '안내 멘트 프리셋', '실시간 스트리밍 출력', '발음 사전 등록'],
    opsNotes: ['2024-05-20: 한국어 운율 모델 개선', '2024-05-11: 스트리밍 첫 음성 지연 단축', '안내 멘트는 검수 후 배포됩니다.'],
  },
  {
    id: 'anomaly-guard', name: '설비 이상감지', kind: '이상 탐지', provider: '전력계통처', model: 'LSTM + XGBoost', api: 'gRPC',
    owner: '한도윤', rating: 4.1, status: '점검 중', hue: 350, icon: ShieldExclamationIcon,
    responseTime: '1.34s', tier: 'Developer', monthlyReq: '92K', usage: '92K', usageNum: 92000, delta: '▼ 1%', up: false,
    reqFull: '92,140건', success: '98.02%', deltaPct: '-1.2%', lastCall: '점검 중', tags: ['이상감지', '설비', '관제'],
    desc: '변압기·차단기 센서 스트림에서 이상 징후를 탐지합니다.',
    overview: 'LSTM과 XGBoost를 결합한 이상 탐지로 변압기·차단기 센서 스트림의 이상 패턴을 실시간 감지합니다. 임계값 자동 학습을 지원합니다.',
    apiDesc: 'gRPC 스트림으로 센서 시계열을 전송하면 이상 점수와 기여 피처를 반환합니다. 관제 알림 webhook과 임계값 정책을 설정합니다.',
    features: ['실시간 이상 점수', '임계값 자동 학습', '기여 피처 설명(XAI)', '계절성 보정', '관제 알림 연동'],
    opsNotes: ['2024-05-22: 정기 점검 — 모델 재학습 진행 중', '2024-05-07: 계절성 보정 로직 추가', '점검 중에는 탐지가 지연될 수 있습니다.'],
  },
  {
    id: 'ocr-extract', name: '검침 OCR 판독', kind: '문서 OCR', provider: '배전계획처', model: 'PaddleOCR', api: 'REST API',
    owner: '이수민', rating: 4.5, status: '정상', hue: 96, icon: DocumentTextIcon,
    responseTime: '0.68s', tier: 'Standard', monthlyReq: '321K', usage: '321K', usageNum: 321000, delta: '▲ 7%', up: true,
    reqFull: '321,400건', success: '99.50%', deltaPct: '+7.0%', lastCall: '11초 전', tags: ['검침', 'OCR', '판독'],
    desc: '계량기 검침 사진에서 지침값을 자동 판독합니다.',
    overview: 'PaddleOCR 기반으로 계량기 검침 사진·스캔 장부에서 지침값·고객번호를 고정확도로 판독합니다. 손글씨와 다양한 계량기 양식을 지원합니다.',
    apiDesc: '이미지를 업로드하면 좌표·신뢰도를 포함한 판독 결과 JSON을 반환합니다. 계량기 유형별 템플릿을 지정할 수 있습니다.',
    features: ['지침값 자동 판독', '손글씨 인식', '계량기 유형별 템플릿', '좌표·신뢰도 반환'],
    opsNotes: ['2024-05-19: 디지털계량기 인식 정확도 개선', '2024-05-08: 손글씨 모델 업데이트'],
  },
  {
    id: 'recommend-engine', name: '에너지 절약 추천', kind: '수요관리', provider: '수요관리처', model: 'Wide&Deep', api: 'gRPC',
    owner: '최예린', rating: 4.3, status: '정상', hue: 330, icon: DocumentChartBarIcon,
    responseTime: '0.42s', tier: 'Enterprise', monthlyReq: '2.10M', usage: '2.10M', usageNum: 2100000, delta: '▲ 11%', up: true,
    reqFull: '2,104,800건', success: '99.68%', deltaPct: '+11.2%', lastCall: '1초 전', tags: ['수요관리', '추천', 'DR'],
    desc: '고객별 에너지 절약·수요반응(DR) 프로그램을 추천합니다.',
    overview: 'Wide&Deep 기반 추천 엔진으로 고객 사용패턴에 맞는 에너지 절약 팁과 수요반응(DR) 프로그램을 개인화 추천합니다. A/B 테스트를 지원합니다.',
    apiDesc: 'gRPC로 고객 컨텍스트를 전송하면 점수화된 추천 리스트를 반환합니다. 후보 생성·랭킹 단계를 분리 제공합니다.',
    features: ['개인화 절약 추천', 'DR 프로그램 매칭', 'A/B 테스트 슬롯', '신규 고객 콜드스타트 대응'],
    opsNotes: ['2024-05-20: 피처 스토어 지연 단축', '2024-05-10: 콜드스타트 정책 개선'],
  },
  {
    id: 'chatbot-cs', name: '고객상담 챗봇', kind: '상담 챗봇', provider: '고객서비스처', model: 'HyperCLOVA X', api: 'REST API',
    owner: '박지호', rating: 4.6, status: '정상', hue: 204, icon: ChatBubbleLeftRightIcon,
    responseTime: '0.78s', tier: 'Standard', monthlyReq: '1.42M', usage: '1.42M', usageNum: 1420000, delta: '▲ 14%', up: true,
    reqFull: '1,421,300건', success: '99.59%', deltaPct: '+14.0%', lastCall: '3초 전', tags: ['챗봇', '고객상담', 'CS'],
    desc: '요금·정전·신청 문의를 자동 응대하는 챗봇입니다.',
    overview: 'HyperCLOVA X 기반 상담 챗봇으로 요금조회·정전안내·각종 신청 문의를 자동 응대합니다. 사내 고객시스템·지식베이스에 연결됩니다.',
    apiDesc: '세션 기반 대화 엔드포인트로 컨텍스트를 유지합니다. 상담사 핸드오프 시 라우팅 이벤트를 발생시킵니다.',
    features: ['멀티턴 상담', '요금·정전 조회 연동', '상담사 핸드오프', '감정 기반 에스컬레이션'],
    opsNotes: ['2024-05-18: 핸드오프 정확도 개선', '2024-05-09: 지식베이스 동기화 자동화'],
  },
  {
    id: 'fraud-detect', name: '전기 부정사용 탐지', kind: '부정사용 탐지', provider: '영업처', model: 'XGBoost + GNN', api: 'gRPC',
    owner: '한도윤', rating: 4.2, status: '주의', hue: 12, icon: ShieldExclamationIcon,
    responseTime: '0.55s', tier: 'Enterprise', monthlyReq: '724K', usage: '724K', usageNum: 724000, delta: '▼ 3%', up: false,
    reqFull: '724,600건', success: '98.40%', deltaPct: '-3.1%', lastCall: '5초 전', tags: ['부정사용', '리스크', '계량'],
    desc: '전력 사용 패턴에서 부정사용(도전) 의심 건을 탐지합니다.',
    overview: 'XGBoost와 GNN을 결합한 탐지로 전력 사용 패턴·계량 데이터에서 부정사용(도전·계량 조작) 의심 건의 리스크 점수를 실시간 산출합니다.',
    apiDesc: 'gRPC 스트림으로 사용 이벤트를 전송하면 리스크 점수·사유를 반환합니다. 임계값과 룰을 콘솔에서 관리합니다.',
    features: ['실시간 리스크 점수', '룰 + ML 결합', '사유 설명(reason codes)', '임계값 정책 관리'],
    opsNotes: ['2024-05-21: 오탐 룰 튜닝 중(모니터링)', '2024-05-07: 계량 패턴 피처 추가'],
  },
  {
    id: 'embed-multilingual', name: '문서 임베딩 서비스', kind: '임베딩', provider: 'ICT기획처', model: 'BGE-M3', api: 'REST API',
    owner: '김민준', rating: 4.7, status: '정상', hue: 268, icon: CircleStackIcon,
    responseTime: '0.31s', tier: 'Standard', monthlyReq: '3.05M', usage: '3.05M', usageNum: 3050000, delta: '▲ 21%', up: true,
    reqFull: '3,051,200건', success: '99.91%', deltaPct: '+21.4%', lastCall: '1초 전', tags: ['임베딩', '벡터', '검색기반'],
    desc: '사내 문서를 벡터로 변환해 검색·분류에 활용합니다.',
    overview: 'BGE-M3 기반 다국어 임베딩으로 사내 문서·규정을 dense·sparse 벡터로 변환합니다. 검색·분류·클러스터링 파이프라인의 기반으로 사용됩니다.',
    apiDesc: '텍스트 배열을 전송하면 정규화된 임베딩 벡터를 반환합니다. dense/sparse/ColBERT 출력을 선택할 수 있습니다.',
    features: ['다국어 문서 임베딩', 'dense·sparse 동시 출력', '배치 고속 처리', '정규화 옵션'],
    opsNotes: ['2024-05-20: 배치 처리량 40% 증가', '2024-05-11: sparse 출력 추가'],
  },
  {
    id: 'tabular-forecast', name: '전력수요 예측', kind: '수요 예측', provider: '전력계통처', model: 'Chronos + Prophet', api: 'REST API',
    owner: '윤서연', rating: 4.4, status: '정상', hue: 56, icon: DocumentChartBarIcon,
    responseTime: '1.22s', tier: 'Standard', monthlyReq: '184K', usage: '184K', usageNum: 184000, delta: '▲ 4%', up: true,
    reqFull: '184,200건', success: '99.22%', deltaPct: '+4.3%', lastCall: '38초 전', tags: ['수요예측', '부하', '시계열'],
    desc: '지역·시간대별 전력 수요와 부하를 예측합니다.',
    overview: 'Chronos와 Prophet 앙상블 시계열 예측으로 지역·시간대별 전력 수요와 부하를 확률 구간과 함께 예측합니다. 기상·계절성 외생 변수를 반영합니다.',
    apiDesc: '시계열과 예측 구간을 전송하면 점추정과 분위수 예측을 반환합니다. 기상 등 외생 변수를 함께 넘길 수 있습니다.',
    features: ['확률 구간 예측', '계절성·기상 반영', '외생 변수 지원', '백테스트 리포트'],
    opsNotes: ['2024-05-19: 분위수 예측 정확도 개선', '2024-05-10: 기상 데이터 연동 확장'],
  },
  {
    id: 'moderation-guard', name: '민원 콘텐츠 검수', kind: '콘텐츠 검수', provider: '커뮤니케이션실', model: 'KoBERT', api: 'REST API',
    owner: '정우성', rating: 4.5, status: '정상', hue: 160, icon: ShieldExclamationIcon,
    responseTime: '0.36s', tier: 'Developer', monthlyReq: '612K', usage: '612K', usageNum: 612000, delta: '▲ 6%', up: true,
    reqFull: '612,800건', success: '99.74%', deltaPct: '+6.2%', lastCall: '7초 전', tags: ['검수', '민원', '안전'],
    desc: '게시판·민원 글의 유해·악성 콘텐츠를 검수합니다.',
    overview: 'KoBERT 기반으로 사내 게시판·고객 민원 글의 유해성(욕설·악성·개인정보 노출 등)을 다중 카테고리로 분류·차단합니다. 정책 임계값을 지원합니다.',
    apiDesc: '콘텐츠를 전송하면 카테고리별 점수와 차단 여부를 반환합니다. 정책 프로파일을 적용할 수 있습니다.',
    features: ['멀티 카테고리 분류', '욕설·개인정보 탐지', '정책 임계값', '근거 스니펫 반환'],
    opsNotes: ['2024-05-18: 개인정보 탐지 모델 추가', '2024-05-09: 한국어 비속어 사전 확장'],
  },
  {
    id: 'pdf-parser', name: '계약문서 파싱', kind: '문서 파싱', provider: '구매처', model: 'Layout Parser', api: '콘솔',
    owner: '박지호', rating: 4.3, status: '정상', hue: 36, icon: DocumentTextIcon,
    responseTime: '1.48s', tier: 'Standard', monthlyReq: '128K', usage: '128K', usageNum: 128000, delta: '▲ 2%', up: true,
    reqFull: '128,400건', success: '99.05%', deltaPct: '+2.1%', lastCall: '24초 전', tags: ['문서파싱', '계약', '시방서'],
    desc: '계약서·시방서를 구조화 데이터로 파싱하는 워크스페이스입니다.',
    overview: 'Layout Parser 기반 문서 파싱으로 계약서·시방서·내역서(PDF·HWP)를 제목·표·항목 등 구조화 요소로 분해합니다. 콘솔에서 일괄 처리합니다.',
    apiDesc: '',
    features: ['레이아웃 인식 분해', '표·내역 추출', '항목 메타데이터', 'RAG 인덱싱 연동'],
    opsNotes: ['2024-05-17: HWP 파서 추가', '2024-05-08: 표 경계 정확도 개선'],
  },
  {
    id: 'voice-clone', name: '재난방송 음성생성', kind: '음성 합성', provider: '안전관리처', model: 'VITS v3', api: 'REST API',
    owner: '정우성', rating: 4.4, status: '점검 중', hue: 312, icon: SpeakerWaveIcon,
    responseTime: '1.05s', tier: 'Premium', monthlyReq: '74K', usage: '74K', usageNum: 74000, delta: '▼ 2%', up: false,
    reqFull: '74,200건', success: '98.30%', deltaPct: '-2.0%', lastCall: '점검 중', tags: ['재난방송', '음성합성', '비상'],
    desc: '재난·비상 안내방송용 음성을 생성합니다.',
    overview: 'VITS v3 기반 음성 합성으로 재난·비상 상황 안내방송 음성을 생성합니다. 지정 성우 음색과 다국어 안내, 승인 절차를 적용합니다.',
    apiDesc: '안내 문안과 voice ID를 전송하면 합성 오디오를 반환합니다. 비상 방송은 승인 토큰이 필요합니다.',
    features: ['비상 안내 음성 생성', '다국어 안내', '지정 성우 음색', '승인 절차·로그'],
    opsNotes: ['2024-05-22: 정기 점검 — 음색 안정화 작업', '2024-05-09: 승인 절차 강화'],
  },
]
const serviceById = (id?: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0]

const KINDS = [...new Set(SERVICES.map((s) => s.kind))]
const MODELS = [...new Set(SERVICES.map((s) => s.model))]
const STATUSES = ['정상', '주의', '불안정', '점검 중']

interface RankItem {
  rank: number; name: string; model: string; usage: string; delta: string; up: boolean
  chips: [string, string, string]; status: string; tone: Tone; icon: Icon; hue: number; seed: string; serviceId: string
}
// serviceId = 클릭 시 열 대표 서비스(상세 모달 재사용)
const RANKING: RankItem[] = [
  { rank: 1, name: '고객상담 챗봇', model: 'HyperCLOVA X', usage: '2.48M', delta: '▲ 12.4%', up: true, chips: ['API', 'HyperCLOVA X', '종합형'], status: '정상', tone: 'ok', icon: ChatBubbleLeftRightIcon, hue: 204, seed: 'chatbot-cs', serviceId: 'chatbot-cs' },
  { rank: 2, name: '전기 부정사용 탐지', model: 'XGBoost + GNN', usage: '1.78M', delta: '▼ 8.7%', up: false, chips: ['API', 'GNN', '관제형'], status: '주의', tone: 'warn', icon: ShieldExclamationIcon, hue: 12, seed: 'fraud-detect', serviceId: 'fraud-detect' },
  { rank: 3, name: '전력수요 예측', model: 'Chronos + Prophet', usage: '1.23M', delta: '▲ 5.2%', up: true, chips: ['API', 'Chronos', '종합형'], status: '정상', tone: 'ok', icon: DocumentChartBarIcon, hue: 56, seed: 'tabular-forecast', serviceId: 'tabular-forecast' },
  { rank: 4, name: '다국어 민원 번역', model: 'HyperCLOVA X', usage: '856K', delta: '▲ 3.1%', up: true, chips: ['API', 'HyperCLOVA X', '개발형'], status: '정상', tone: 'ok', icon: LanguageIcon, hue: 150, seed: 'translate-pro', serviceId: 'translate-pro' },
  { rank: 5, name: '기술자료 검색', model: 'BGE-M3', usage: '642K', delta: '▼ 2.6%', up: false, chips: ['API', 'BGE-M3', '개발형'], status: '불안정', tone: 'danger', icon: MagnifyingGlassIcon, hue: 196, seed: 'vector-search', serviceId: 'vector-search' },
  { rank: 6, name: '사내 개발 코파일럿', model: 'Qwen2.5-Coder', usage: '512K', delta: '▲ 9.3%', up: true, chips: ['API', 'Qwen2.5', '개발형'], status: '정상', tone: 'ok', icon: CodeBracketSquareIcon, hue: 256, seed: 'code-copilot', serviceId: 'code-copilot' },
  { rank: 7, name: '사내규정 Q&A', model: 'EXAONE 3.0', usage: '388K', delta: '▲ 4.4%', up: true, chips: ['API', 'EXAONE 3.0', '개발형'], status: '정상', tone: 'ok', icon: CircleStackIcon, hue: 320, seed: 'rag-knowledge', serviceId: 'rag-knowledge' },
]

// 필터 태그 예시 — 전 서비스 태그 풀(클릭 시 태그 필터)
const ALL_TAGS = [...new Set(SERVICES.flatMap((s) => s.tags))].slice(0, 18)

// ───────────────────────── 필터 상태 ─────────────────────────
type ApiMode = 'all' | 'yes' | 'no'
type SortKey = 'usage' | 'recent' | 'name'
interface Filters {
  query: string; kind: string; model: string; api: ApiMode; statuses: Set<string>; tag: string
}
const emptyFilters = (): Filters => ({ query: '', kind: 'all', model: 'all', api: 'all', statuses: new Set(), tag: '' })
const filtersActive = (f: Filters) =>
  !!f.query || f.kind !== 'all' || f.model !== 'all' || f.api !== 'all' || f.statuses.size > 0 || !!f.tag

function applyFilters(f: Filters, sort: SortKey): Service[] {
  const q = f.query.trim().toLowerCase()
  const tag = f.tag.trim().toLowerCase()
  const out = SERVICES.filter((s) => {
    if (q && !`${s.name} ${s.kind} ${s.model} ${s.provider} ${s.desc} ${s.tags.join(' ')}`.toLowerCase().includes(q)) return false
    if (f.kind !== 'all' && s.kind !== f.kind) return false
    if (f.model !== 'all' && s.model !== f.model) return false
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
      style={{ padding: '3px 10px', fontSize: 14, fontWeight: 700, color: toneColor(p, tone), background: toneSoft(p, tone) }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />{status}
    </span>
  )
}

function MetaChip({ label, value }: { label?: string; value: string }) {
  const p = usePalette()
  return (
    <span className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
      style={{ padding: '2px 8px', fontSize: 14, background: p.chip, border: `1px solid ${p.border}` }}>
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

const PANEL_SHADOW = '0 2px 10px rgba(0,0,0,0.18)'

// 4.17 좌 — 서비스 탐색 가이드(필터, 실제 동작)
function FilterPanel({ f, set, onReset, fill }: { f: Filters; set: (patch: Partial<Filters>) => void; onReset: () => void; fill: boolean }) {
  const p = usePalette()
  const toggleStatus = (st: string) => {
    const next = new Set(f.statuses)
    next.has(st) ? next.delete(st) : next.add(st)
    set({ statuses: next })
  }
  return (
    <section className={`rounded-xl min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}
      style={{ background: p.filter, border: `1px solid ${p.border}`, boxShadow: PANEL_SHADOW }}>
      <div className={`flex flex-col ${fill ? 'flex-1 min-h-0 overflow-auto' : ''}`} style={{ gap: 18, padding: 20 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <div className="flex items-center justify-between gap-2">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: p.heading }}>서비스 탐색 가이드</h3>
            {filtersActive(f) && (
              <button type="button" onClick={onReset} className="flex items-center gap-1 shrink-0" style={{ fontSize: 14, color: p.accent }}>
                <ArrowPathIcon width={12} height={12} /> 초기화
              </button>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: p.muted }}>
            동료가 할당받은 GPU에 배포한 AI 서비스를 탐색·비교하고, 호출에 필요한 API 키를 요청해 보세요.
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

        <FilterGroup label="상태">
          <CheckRow label="전체" checked={f.statuses.size === 0} onClick={() => set({ statuses: new Set() })} />
          {STATUSES.map((st) => <CheckRow key={st} label={st} checked={f.statuses.has(st)} onClick={() => toggleStatus(st)} />)}
        </FilterGroup>

        <FilterGroup label="태그">
          <span className="flex items-center gap-2 rounded-lg" style={{ padding: '8px 11px', background: p.chip, border: `1px solid ${p.border}` }}>
            <input value={f.tag} onChange={(e) => set({ tag: e.target.value })}
              className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14, color: p.text }} placeholder="태그 선택 또는 입력" aria-label="태그 필터" />
            {f.tag && (
              <button type="button" onClick={() => set({ tag: '' })} aria-label="태그 지우기" className="shrink-0" style={{ color: p.muted }}>
                <XMarkIcon width={14} height={14} />
              </button>
            )}
          </span>
          <div className="flex flex-wrap" style={{ gap: 7, marginTop: 2 }}>
            {ALL_TAGS.map((t) => {
              const on = f.tag.toLowerCase() === t.toLowerCase()
              return (
                <button key={t} type="button" onClick={() => set({ tag: on ? '' : t })}
                  className="rounded-full whitespace-nowrap transition-colors"
                  style={{ padding: '4px 10px', fontSize: 14, fontWeight: 500,
                    background: on ? p.accentSoft : p.chip, color: on ? p.accent : p.chipText,
                    border: `1px solid ${on ? p.accent : p.border}` }}>
                  #{t}
                </button>
              )
            })}
          </div>
        </FilterGroup>
      </div>
    </section>
  )
}

// 서비스 목록 항목 = 세로형 그리드 카드(로고+상태 / 이름·제공사 / 설명 2줄 / 칩 / 푸터)
function ServiceCard({ s, onOpen }: { s: Service; onOpen: (s: Service) => void }) {
  const p = usePalette()
  const tone = toneOf(s.status)
  return (
    <button type="button" onClick={() => onOpen(s)}
      className="flex flex-col text-left rounded-2xl transition-colors h-full"
      style={{ padding: 18, gap: 13, background: p.filter, border: `1px solid ${p.border}` }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.background = p.inset }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.background = p.filter }}>
      <div className="flex items-start gap-3">
        <Logo id={s.id} hue={s.hue} icon={s.icon} size={48} radius={12} />
        <div className="flex flex-col min-w-0 flex-1" style={{ gap: 2 }}>
          <span className="truncate" style={{ fontSize: 16, fontWeight: 700, color: p.heading, letterSpacing: '-0.2px' }}>{s.name}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{s.provider} · {s.model}</span>
        </div>
        <StatusBadge status={s.status} tone={tone} />
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: p.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}>{s.desc}</p>
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        <span className="rounded-md whitespace-nowrap" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 500, background: p.chip, color: p.chipText }}>{s.kind}</span>
        <span className="rounded-md whitespace-nowrap" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 500, background: p.chip, color: hasApiOf(s) ? p.chipText : p.muted }}>{hasApiOf(s) ? s.api : '미제공'}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2" style={{ paddingTop: 12, borderTop: `1px solid ${p.divider}` }}>
        <div className="flex flex-col">
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.4px', color: p.heading }}>{s.usage}</span>
          <span style={{ fontSize: 14, color: p.muted }}>API 호출</span>
        </div>
        <div className="flex flex-col items-end" style={{ gap: 3 }}>
          <span className="flex items-center" style={{ gap: 2, fontSize: 14, fontWeight: 700, color: p.warn }}><StarIcon width={13} height={13} /> {s.rating.toFixed(1)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: deltaColor(p, s.up) }}>{s.delta}</span>
        </div>
      </div>
    </button>
  )
}

// 4.17 중앙 — 서비스 목록(카드 스택, 외곽 패널 없음). fill 시 헤더 고정 + 카드 내부 스크롤.
function AIList({ services, total, sort, onSort, onOpen, onReset, fill }: {
  services: Service[]; total: number; sort: SortKey; onSort: (s: SortKey) => void; onOpen: (s: Service) => void; onReset: () => void; fill: boolean
}) {
  const p = usePalette()
  return (
    <section className={`min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}>
      <header className="shrink-0 flex items-center justify-between gap-3" style={{ paddingBottom: 12 }}>
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 style={{ fontSize: 18, fontWeight: 700, color: p.heading }}>서비스 목록</h3>
          <span className="rounded-full self-center" style={{ padding: '1px 8px', fontSize: 14, fontWeight: 700, color: p.accent, background: p.accentSoft }}>{services.length}{services.length !== total ? `/${total}` : ''}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>탐색 · 검색 · 태그</span>
        </div>
        <span className="relative flex items-center shrink-0">
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)}
            className="appearance-none outline-none cursor-pointer" style={{ padding: '4px 22px 4px 8px', fontSize: 14, color: p.muted, background: 'transparent', border: `1px solid ${p.border}`, borderRadius: 8 }}>
            <option value="recent" style={{ color: '#111' }}>최신순</option>
            <option value="usage" style={{ color: '#111' }}>사용량순</option>
            <option value="name" style={{ color: '#111' }}>이름순</option>
          </select>
          <ChevronDownIcon width={13} height={13} className="absolute right-2 pointer-events-none" style={{ color: p.muted }} />
        </span>
      </header>

      {services.length === 0 ? (
        <div className={`flex flex-col items-center justify-center text-center rounded-2xl ${fill ? 'flex-1 min-h-0' : ''}`} style={{ padding: '56px 20px', gap: 10, background: p.filter, border: `1px solid ${p.border}` }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: p.inset, color: p.muted }}>
            <MagnifyingGlassIcon width={22} height={22} />
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: p.heading }}>조건에 맞는 서비스가 없어요</span>
          <span style={{ fontSize: 14, color: p.muted }}>필터를 조정하거나 검색어를 바꿔 보세요.</span>
          <button type="button" onClick={onReset} className="mt-1 flex items-center gap-1.5 rounded-lg" style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, color: p.accent, background: p.accentSoft }}>
            <ArrowPathIcon width={13} height={13} /> 필터 초기화
          </button>
        </div>
      ) : (
        <div className={`grid ${fill ? 'flex-1 min-h-0 overflow-auto' : ''}`}
          style={{ gap: 14, paddingRight: fill ? 4 : 0, alignContent: 'start',
            gridTemplateColumns: fill ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {services.map((s) => <ServiceCard key={s.id} s={s} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  )
}

// 랭킹 카드
function RankCard({ item, onOpen }: { item: RankItem; onOpen: (s: Service) => void }) {
  const p = usePalette()
  const medal = item.rank === 1 ? '#F4C71A' : item.rank === 2 ? '#C7CFDB' : item.rank === 3 ? '#E08A4C' : p.chip
  const medalFg = item.rank <= 3 ? '#10131c' : p.muted
  return (
    <button type="button" onClick={() => onOpen(serviceById(item.serviceId))}
      className="rounded-xl w-full text-left transition-colors flex flex-col"
      style={{ background: p.inset, border: `1px solid ${p.border}`, flexGrow: 1, flexShrink: 0, flexBasis: 'auto' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.background = p.chip }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.background = p.inset }}>
      <div className="flex flex-1 items-center gap-2.5" style={{ padding: '11px 12px 9px' }}>
        <span className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: 999, background: medal, color: medalFg, fontSize: 14, fontWeight: 800 }}>{item.rank}</span>
        <Logo id={item.seed} hue={item.hue} icon={item.icon} size={30} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: p.heading }}>{item.name}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{item.model}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span style={{ fontSize: 14, fontWeight: 800, color: p.heading }}>{item.usage}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: deltaColor(p, item.up) }}>{item.delta}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2" style={{ padding: '8px 12px', borderTop: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {item.chips.map((c) => (
            <span key={c} className="rounded-md whitespace-nowrap" style={{ padding: '2px 7px', fontSize: 14, color: p.muted, background: p.card, border: `1px solid ${p.border}` }}>{c}</span>
          ))}
        </div>
        <StatusBadge status={item.status} tone={item.tone} />
      </div>
    </button>
  )
}

// 4.17·4.18 우 — 실시간 서비스 랭킹(검색 동작). fill 시 헤더·버튼 고정 + 카드 내부 스크롤.
function RankingPanel({ fill, onOpen }: { fill: boolean; onOpen: (s: Service) => void }) {
  const p = usePalette()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const v = q.trim().toLowerCase()
    return v ? RANKING.filter((r) => `${r.name} ${r.model}`.toLowerCase().includes(v)) : RANKING
  }, [q])
  return (
    <section className={`rounded-xl min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}
      style={{ background: p.panel, border: `1px solid ${p.border}`, boxShadow: PANEL_SHADOW, padding: 16, gap: 14 }}>
      <div className="shrink-0 flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-center justify-between gap-2">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: p.heading }}>실시간 서비스 랭킹</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 700, color: p.ok, background: p.okSoft }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />LIVE
          </span>
        </div>
        <span className="flex items-center gap-2 rounded-lg" style={{ padding: '8px 11px', background: p.chip, border: `1px solid ${p.border}` }}>
          <MagnifyingGlassIcon width={15} height={15} className="shrink-0" style={{ color: p.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14, color: p.text }} placeholder="서비스 검색" aria-label="랭킹 검색" />
        </span>
        <span className="flex items-center justify-between gap-2 rounded-lg" style={{ padding: '8px 11px', fontSize: 14, background: p.chip, border: `1px solid ${p.border}` }}>
          <span style={{ fontWeight: 600, color: p.text }}>필터</span>
          <span className="flex items-center gap-1 truncate" style={{ color: p.muted }}>종류 · API · 모델 · 상태 <ChevronDownIcon width={14} height={14} className="shrink-0" /></span>
        </span>
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: p.text }}>최대 사용량 서비스 순위</span>
          <span className="flex items-center gap-1" style={{ fontSize: 14, color: p.muted }}><ArrowPathIcon width={12} height={12} /> 1분 전 업데이트</span>
        </div>
      </div>
      <div className={`flex flex-col ${fill ? 'flex-1 min-h-0 overflow-auto' : ''}`} style={{ gap: 10 }}>
        {list.length === 0
          ? <p className="text-center" style={{ fontSize: 14, color: p.muted, padding: '18px 0' }}>검색 결과가 없어요.</p>
          : list.map((r) => <RankCard key={r.rank} item={r} onOpen={onOpen} />)}
      </div>
      <Button variant="outline" className="justify-center w-full shrink-0">전체 랭킹 보기 <ChevronRightIcon width={14} height={14} /></Button>
    </section>
  )
}

// ───────────────────────── 4.18 서비스 상세 카드(모달 내용) ─────────────────────────
function StatCard({ icon: Ico, label, value }: { icon: Icon; label: string; value: string }) {
  const p = usePalette()
  return (
    <div className="flex items-center gap-3 rounded-xl" style={{ padding: '13px 14px', background: p.inset, border: `1px solid ${p.border}` }}>
      <span className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 10, background: p.accentSoft, color: p.accent }}><Ico width={19} height={19} /></span>
      <div className="flex flex-col min-w-0">
        <span className="truncate" style={{ fontSize: 14, color: p.muted, lineHeight: 1.3 }}>{label}</span>
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
        <li key={i} className="flex items-start gap-2.5" style={{ fontSize: 14, lineHeight: 1.5, color: p.muted }}>
          <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: p.accent, marginTop: 7 }} />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  )
}

// 접속 정보 URL 행 — 라벨 + accent URL. 닫힌망 목업이라 링크 이동 대신 표시·복사용.
function UrlRow({ label, url }: { label: string; url: string }) {
  const p = usePalette()
  const copy = () => { navigator.clipboard?.writeText(url) }
  return (
    <div className="flex items-center gap-3 rounded-lg" style={{ padding: '10px 12px', background: p.inset, border: `1px solid ${p.border}` }}>
      <span className="shrink-0" style={{ fontSize: 14, color: p.muted, width: 84 }}>{label}</span>
      <span className="truncate flex-1 min-w-0" style={{ fontSize: 14, color: p.accent }}>{url}</span>
      <button type="button" onClick={copy} aria-label={`${label} 복사`} className="shrink-0 transition-transform active:scale-90" style={{ color: p.muted }}>
        <ClipboardIcon p={p} />
      </button>
    </div>
  )
}

// 인라인 복사 아이콘(heroicons clipboard outline 경량 path)
function ClipboardIcon({ p }: { p: { muted: string } }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={p.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={9} y={9} width={11} height={11} rx={2} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ServiceDetailCard({ service: s, narrow, reserveClose }: { service: Service; narrow: boolean; reserveClose?: boolean }) {
  const p = usePalette()
  const navigate = useNavigate()
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
        <div className="flex items-start justify-between gap-4 flex-wrap" style={{ paddingRight: reserveClose ? 44 : 0 }}>
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
            <span style={{ fontSize: 14, color: p.muted }}>사용자 평점</span>
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

      {/* 접속 정보 — 서비스 URL · 데모 URL (명세서 동일 항목) */}
      <div className="flex flex-col" style={{ gap: 11 }}>
        <SectionTitle>접속 정보</SectionTitle>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <UrlRow label="서비스 URL" url={`http://svc.anclave.local/${s.id}`} />
          {apiAvailable && <UrlRow label="데모 URL" url={`http://svc.anclave.local/${s.id}/playground`} />}
        </div>
      </div>

      {divider}

      {/* 소유자 안내 + 액션(API 키 요청 = 버튼만, 발급은 추후) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="flex items-center gap-2" style={{ fontSize: 14, color: p.muted }}>
          <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 18, height: 18, background: p.accentSoft, color: p.accent }}>
            <CheckIcon width={11} height={11} strokeWidth={3} />
          </span>
          소유자 <b style={{ color: p.text }}>{s.owner}</b> 님이 GPU에 배포한 서비스 · 내부 사용자에게만 제공
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="outline">서비스 문의</Button>
          {apiAvailable
            ? <Button onClick={() => navigate(`/marketplace/api-request/${s.id}`)}><KeyIcon width={15} height={15} /> API 키 요청</Button>
            : <Button>워크스페이스 열기</Button>}
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
      <style>{`@keyframes mkFadeIn{from{opacity:0}to{opacity:1}}@keyframes mkPopIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}.mk-close:hover{filter:brightness(1.35)}`}</style>
      <div className="w-full rounded-2xl relative"
        style={{ maxWidth: 900, background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: `${p.shadow}, inset 0 1px 0 rgba(255,255,255,0.05)`, animation: 'mkPopIn .24s cubic-bezier(.2,.7,.2,1) both' }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${service.name} 상세`}>
        <button type="button" onClick={onClose} aria-label="닫기" className="mk-close absolute flex items-center justify-center rounded-lg z-10 transition"
          style={{ top: 16, right: 16, width: 32, height: 32, color: p.text, background: p.inset, border: `1px solid ${p.borderStrong}` }}>
          <XMarkIcon width={17} height={17} />
        </button>
        <div style={{ padding: narrow ? 20 : 28 }}>
          <ServiceDetailCard service={service} narrow={narrow} reserveClose />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 4.17 마켓플레이스 ─────────────────────────
export function Marketplace() {
  const p = usePalette()
  const narrow = useNarrow()
  const fill = !narrow // 넓은 화면: 무스크롤 fill(3패널 같은 높이·하단 정렬·목록 내부 스크롤)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<SortKey>('recent') // 기본 = Figma 노출 순서(시드순)
  const [selected, setSelected] = useState<Service | null>(null)
  const [params, setParams] = useSearchParams()
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const reset = () => setFilters(emptyFilters())
  const results = useMemo(() => applyFilters(filters, sort), [filters, sort])

  // ?service=<id> 진입 시 해당 서비스 상세 팝업 자동 오픈(예: API 키 요청 완료 → 서비스 상세로).
  useEffect(() => {
    const sid = params.get('service')
    if (!sid) return
    const found = SERVICES.find((s) => s.id === sid)
    if (found) setSelected(found)
  }, [params])
  const closeDetail = () => {
    setSelected(null)
    if (params.get('service')) {
      params.delete('service')
      setParams(params, { replace: true })
    }
  }

  return (
    <div data-qa className="anim-fade flex flex-col min-w-0" style={{ gap: 14, height: fill ? '100%' : 'auto', overflow: fill ? 'hidden' : 'visible' }}>
      <QaPolish />
      {/* 상단 검색바(동작) */}
      <div className="shrink-0 flex items-center gap-3 rounded-xl" style={{ padding: '11px 14px', background: p.card, border: `1px solid ${p.border}` }}>
        <span className="flex items-center gap-2.5 flex-1 min-w-0">
          <MagnifyingGlassIcon width={18} height={18} className="shrink-0" style={{ color: p.muted }} />
          <input value={filters.query} onChange={(e) => set({ query: e.target.value })}
            className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14.5, color: p.text }} placeholder="서비스를 검색해 보세요" aria-label="서비스 검색" />
          {filters.query && (
            <button type="button" onClick={() => set({ query: '' })} aria-label="검색어 지우기" className="shrink-0" style={{ color: p.muted }}>
              <XMarkIcon width={16} height={16} />
            </button>
          )}
        </span>
        <Button className="shrink-0"><MagnifyingGlassIcon width={15} height={15} /> 검색</Button>
      </div>

      {/* 좌 필터 · 중앙 목록 · 우 랭킹 — 같은 높이로 하단까지 채움 */}
      <div className="grid min-w-0"
        style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : '316px minmax(0, 1fr) 340px', flex: fill ? '1 1 0%' : undefined, minHeight: 0 }}>
        <FilterPanel f={filters} set={set} onReset={reset} fill={fill} />
        <AIList services={results} total={SERVICES.length} sort={sort} onSort={setSort} onOpen={setSelected} onReset={reset} fill={fill} />
        <RankingPanel fill={fill} onOpen={setSelected} />
      </div>

      {selected && <DetailModal service={selected} onClose={closeDetail} />}
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
    <div data-qa className="anim-fade flex flex-col min-w-0" style={{ gap: 14 }}>
      <QaPolish />
      <button type="button" onClick={() => navigate('/marketplace')} className="flex items-center gap-1.5 self-start" style={{ fontSize: 14, color: p.muted }}>
        <ChevronRightIcon width={15} height={15} style={{ transform: 'rotate(180deg)' }} /> 마켓플레이스로
      </button>
      <div className="w-full mx-auto rounded-2xl" style={{ maxWidth: 900, background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', padding: narrow ? 20 : 28 }}>
        <ServiceDetailCard service={service} narrow={narrow} />
      </div>
    </div>
  )
}
