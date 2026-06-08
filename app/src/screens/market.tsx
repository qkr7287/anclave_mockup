import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge } from '../components/ui'
import type { Tone } from '../components/ui'
import {
  MagnifyingGlassIcon,
  CpuChipIcon,
  MicrophoneIcon,
  PhotoIcon,
  DocumentTextIcon,
  LanguageIcon,
  ChatBubbleLeftRightIcon,
  DocumentChartBarIcon,
  ClockIcon,
  CodeBracketIcon,
  StarIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

// G8 · 4.17 마켓플레이스 · 4.18 서비스(AI) 상세 — Figma 픽셀 매칭(fileKey iqVQ2GEDCRj9cK3EBOwBJV,
// 4.17=node 1:2, 4.18=node 3:11938). 셸(사이드바·헤더)은 우리 것 유지, 콘텐츠만 Figma.
// 우측 '실시간 서비스 랭킹'은 두 화면 공통 → RankingPanel로 재사용.

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// 1180px 미만이면 3열/2열 → 1열 스택(레이아웃 안정성·Q16 반응형)
function useNarrow(bp = 1180): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [bp])
  return narrow
}

// ───────────────────────── 시드(Figma 텍스트 정본) ─────────────────────────

interface RankItem {
  rank: number
  name: string
  model: string
  usage: string
  delta: string
  up: boolean
  chips: [string, string, string]
  status: string
  tone: Tone
  icon: Icon
  hue: number
}

// 4.17·4.18 우측 랭킹(공통) — 1~5위, 상태칩(정상=ok·주의=warn·불안정=danger).
const RANKING: RankItem[] = [
  { rank: 1, name: '챗봇 서비스', model: 'OpenAI GPT-4o', usage: '2.48M', delta: '▲ 12.4%', up: true, chips: ['API', 'GPT-4o', '종합형'], status: '정상', tone: 'ok', icon: ChatBubbleLeftRightIcon, hue: 212 },
  { rank: 2, name: '이미지 생성 서비스', model: 'Midjourney v6', usage: '1.78M', delta: '▼ 8.7%', up: false, chips: ['API', 'Midjourney v6', '종합형'], status: '주의', tone: 'warn', icon: PhotoIcon, hue: 286 },
  { rank: 3, name: '분석/요약 서비스', model: 'Claude 3.5 Sonnet', usage: '1.23M', delta: '▲ 5.2%', up: true, chips: ['API', 'Claude 3.5', '종합형'], status: '정상', tone: 'ok', icon: DocumentChartBarIcon, hue: 28 },
  { rank: 4, name: '자연어 번역 서비스', model: 'AWS Bedrock', usage: '856K', delta: '▲ 3.1%', up: true, chips: ['API', 'Claude', '개발형'], status: '정상', tone: 'ok', icon: LanguageIcon, hue: 150 },
  { rank: 5, name: '검색 서비스', model: 'Gemini 1.5 Pro', usage: '642K', delta: '▼ 2.6%', up: false, chips: ['API', 'Gemini 1.5 Pro', '개발형'], status: '불안정', tone: 'danger', icon: MagnifyingGlassIcon, hue: 196 },
]

interface ServiceRow {
  id: string
  name: string
  kind: string
  api: string
  model: string
  desc: string
  usage: string
  delta: string
  up: boolean
  icon: Icon
  hue: number
}

// 4.17 중앙 'AI 목록'(6) — 종류·API여부·모델 칩 + 설명 + 사용량 + 델타.
const SERVICES: ServiceRow[] = [
  { id: 'qwen-agent', name: 'qwen-agent', kind: 'LLM 에이전트', api: 'API', model: 'Qwen2.5-72B', desc: '사내 업무 자동화를 위한 지능형 에이전트 서비스입니다.', usage: '142.8K', delta: '▲ 18%', up: true, icon: CpuChipIcon, hue: 212 },
  { id: 'speech-text', name: 'speech-text', kind: '음성 인식', api: 'API', model: 'Whisper Large v3', desc: '실시간 음성 텍스트 변환과 다국어 인식 기능을 제공합니다.', usage: '41.0K', delta: '▲ 9%', up: true, icon: MicrophoneIcon, hue: 168 },
  { id: 'image-gen-studio', name: 'image-gen-studio', kind: '이미지 생성', api: 'API', model: 'Midjourney v6', desc: '텍스트 프롬프트로 고품질 이미지를 생성하는 서비스입니다.', usage: '1.78M', delta: '▼ 7%', up: false, icon: PhotoIcon, hue: 286 },
  { id: 'doc-summary', name: 'doc-summary', kind: '문서 요약', api: 'API', model: 'Claude 3.5 Sonnet', desc: '문서 요약, 핵심 내용 추출, 보고서 자동 생성을 지원합니다.', usage: '1.23M', delta: '▲ 5%', up: true, icon: DocumentTextIcon, hue: 28 },
  { id: 'translate-pro', name: 'translate-pro', kind: '번역', api: 'API', model: 'Gemini 1.5 Pro', desc: '고품질 다국어 번역과 문맥 기반 번역 서비스를 제공합니다.', usage: '856K', delta: '▲ 3%', up: true, icon: LanguageIcon, hue: 150 },
  { id: 'vector-search', name: 'vector-search', kind: '검색', api: 'API', model: 'Bedrock + Embedding', desc: '문서 및 데이터를 벡터 검색과 의미 기반 검색을 제공합니다.', usage: '642K', delta: '▼ 2%', up: false, icon: MagnifyingGlassIcon, hue: 196 },
]

// ───────────────────────── 공통 부품 ─────────────────────────

const deltaColor = (up: boolean) => (up ? 'var(--c-ok)' : 'var(--c-danger)')

// 서비스 아이콘 타일 — hue별 옅은 배경 + 채도 아이콘(Figma 브랜드 아이콘 대체).
function IconTile({ icon: Ico, hue, size = 40 }: { icon: Icon; hue: number; size?: number }) {
  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 12 : 9,
        background: `hsl(${hue}, 60%, 55%, 0.16)`,
        color: `hsl(${hue}, 68%, 64%)`,
      }}
    >
      <Ico width={size * 0.5} height={size * 0.5} />
    </span>
  )
}

// 라벨:값 칩 — 옅은 배경 pill, 라벨 muted.
function MetaChip({ label, value }: { label?: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
      style={{ padding: '2px 8px', fontSize: 13, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
    >
      {label && <span className="text-muted">{label}</span>}
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  )
}

// 셀렉트형 mock(드롭다운 비활성) — 라벨 + 값 + ▾.
function FilterSelect({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex flex-col" style={{ gap: 7 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span
        className="flex items-center justify-between rounded-lg"
        style={{ padding: '9px 12px', fontSize: 14, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
      >
        <span className="text-muted truncate">{value}</span>
        <ChevronDownIcon width={15} height={15} className="text-muted shrink-0" />
      </span>
    </label>
  )
}

// 체크 항목 mock — 체크 시 accent 사각.
function CheckRow({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <span className="flex items-center" style={{ gap: 9, fontSize: 14 }}>
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: checked ? 'var(--c-accent)' : 'transparent',
          border: checked ? '1px solid var(--c-accent)' : '1px solid var(--c-border)',
          color: 'var(--c-onaccent)',
        }}
      >
        {checked && <CheckIcon width={13} height={13} strokeWidth={3} />}
      </span>
      <span style={{ color: checked ? 'var(--c-text)' : 'var(--c-muted)' }}>{label}</span>
    </span>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  )
}

// 4.17 좌 — AI 탐색 가이드(필터).
function FilterPanel() {
  return (
    <Card>
      <div className="flex flex-col" style={{ gap: 20 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>AI 탐색 가이드</h3>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            다양한 AI 서비스를 탐색하고 비교해 보세요. 필터와 태그를 활용해 필요한 서비스를 빠르게 찾을 수 있습니다.
          </p>
        </div>

        <FilterSelect label="종류" value="모든 종류" />

        <FilterGroup label="API 여부">
          <CheckRow label="전체" checked />
          <CheckRow label="API 제공" checked />
          <CheckRow label="API 미제공" />
        </FilterGroup>

        <FilterSelect label="모델" value="모든 모델" />
        <FilterSelect label="소유자" value="모든 소유자" />

        <FilterGroup label="상태">
          <CheckRow label="전체" checked />
          <CheckRow label="정상" checked />
          <CheckRow label="점검 중" />
          <CheckRow label="제한" />
        </FilterGroup>

        <FilterSelect label="태그" value="태그 선택 또는 입력" />
      </div>
    </Card>
  )
}

// 4.17 중앙 — AI 목록 테이블(행 클릭 → 상세).
function AIList() {
  const navigate = useNavigate()
  return (
    <Card flush>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="flex flex-col min-w-0" style={{ gap: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>AI 목록</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>탐색 · 검색 · 태그</span>
        </div>
        <span className="flex items-center gap-1 text-muted shrink-0" style={{ fontSize: 13 }}>
          최신순 <ChevronDownIcon width={14} height={14} />
        </span>
      </header>

      <ul>
        {SERVICES.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => navigate(`/marketplace/${s.id}`)}
              className="flex w-full items-start gap-3 text-left border-b border-line last:border-0 transition-colors hover:bg-[var(--accent-soft)]"
              style={{ padding: '14px 16px' }}
            >
              <IconTile icon={s.icon} hue={s.hue} />
              <div className="flex flex-col min-w-0 flex-1" style={{ gap: 7 }}>
                <div className="flex items-center flex-wrap gap-2">
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</span>
                  <MetaChip label="종류" value={s.kind} />
                  <MetaChip label="API 여부" value={s.api} />
                  <MetaChip label="모델" value={s.model} />
                </div>
                <p className="text-muted truncate" style={{ fontSize: 13.5 }}>{s.desc}</p>
              </div>
              <div className="flex flex-col items-end shrink-0" style={{ gap: 2, minWidth: 86 }}>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>{s.usage}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>API 호출</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: deltaColor(s.up) }}>{s.delta}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// 랭킹 카드 한 장.
function RankCard({ item }: { item: RankItem }) {
  const medal =
    item.rank === 1 ? '#F4C71A' : item.rank === 2 ? '#C7CFDB' : item.rank === 3 ? '#E08A4C' : 'var(--c-track)'
  const medalFg = item.rank <= 3 ? '#10131c' : 'var(--c-muted)'
  return (
    <div className="rounded-xl border border-line" style={{ background: 'var(--c-soft)' }}>
      <div className="flex items-center gap-2.5" style={{ padding: '11px 12px 9px' }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 22, height: 22, borderRadius: 999, background: medal, color: medalFg, fontSize: 12.5, fontWeight: 800 }}
        >
          {item.rank}
        </span>
        <IconTile icon={item.icon} hue={item.hue} size={30} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</span>
          <span className="text-muted truncate" style={{ fontSize: 12 }}>{item.model}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span style={{ fontSize: 14, fontWeight: 800 }}>{item.usage}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor(item.up) }}>{item.delta}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line" style={{ padding: '8px 12px' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {item.chips.map((c) => (
            <span
              key={c}
              className="rounded-md whitespace-nowrap text-muted"
              style={{ padding: '2px 7px', fontSize: 11.5, background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
            >
              {c}
            </span>
          ))}
        </div>
        <Badge tone={item.tone} dot={false}>{item.status}</Badge>
      </div>
    </div>
  )
}

// 4.17·4.18 우 — 실시간 서비스 랭킹(공통).
function RankingPanel() {
  return (
    <Card>
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-center justify-between gap-2">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>실시간 서비스 랭킹</h3>
          <span
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{ padding: '3px 9px', fontSize: 11.5, fontWeight: 700, color: 'var(--c-ok)', background: 'var(--ok-soft)' }}
          >
            <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />
            LIVE
          </span>
        </div>

        <span
          className="flex items-center gap-2 rounded-lg"
          style={{ padding: '8px 11px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          <MagnifyingGlassIcon width={15} height={15} className="text-muted shrink-0" />
          <input
            className="bg-transparent outline-none w-full min-w-0 text-text"
            style={{ fontSize: 13.5 }}
            placeholder="서비스 검색"
            aria-label="서비스 검색"
          />
        </span>

        <span
          className="flex items-center justify-between gap-2 rounded-lg"
          style={{ padding: '8px 11px', fontSize: 13, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          <span style={{ fontWeight: 600 }}>필터</span>
          <span className="flex items-center gap-1 text-muted truncate">
            종류 · API · 모델 · 소유자 · 상태 <ChevronDownIcon width={14} height={14} className="shrink-0" />
          </span>
        </span>

        <div className="flex items-center justify-between gap-2" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>최대 사용량 서비스 순위</span>
          <span className="flex items-center gap-1 text-muted" style={{ fontSize: 11.5 }}>
            <ArrowPathIcon width={12} height={12} /> 1분 전 업데이트
          </span>
        </div>

        <div className="flex flex-col" style={{ gap: 10 }}>
          {RANKING.map((r) => (
            <RankCard key={r.rank} item={r} />
          ))}
        </div>

        <Button variant="outline" className="justify-center w-full">
          전체 랭킹 보기 <ChevronRightIcon width={14} height={14} />
        </Button>
      </div>
    </Card>
  )
}

// ───────────────────────── 4.17 마켓플레이스 ─────────────────────────

export function Marketplace() {
  const narrow = useNarrow()
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16 }}>
      {/* 상단 검색바 */}
      <div
        className="flex items-center gap-3 rounded-xl"
        style={{ padding: '10px 12px', background: 'var(--c-card2)', border: '1px solid var(--c-line, var(--c-border))' }}
      >
        <span className="flex items-center gap-2 flex-1 min-w-0">
          <MagnifyingGlassIcon width={18} height={18} className="text-muted shrink-0" />
          <input
            className="bg-transparent outline-none w-full min-w-0 text-text"
            style={{ fontSize: 14.5 }}
            placeholder="AI 서비스를 검색해 보세요"
            aria-label="AI 서비스 검색"
          />
        </span>
        <Button className="shrink-0">
          <MagnifyingGlassIcon width={15} height={15} /> 검색
        </Button>
      </div>

      {/* 좌 필터 · 중앙 목록 · 우 랭킹 */}
      <div
        className="grid items-start min-w-0"
        style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : '252px minmax(0, 1fr) 332px' }}
      >
        <FilterPanel />
        <AIList />
        <RankingPanel />
      </div>
    </div>
  )
}

// ───────────────────────── 4.18 서비스(AI) 상세 ─────────────────────────

const FEATURES = [
  '자연어 대화 및 질의응답',
  '멀티턴 대화 맥락 유지',
  '함수 호출 (Function Calling) 지원',
  '스트리밍 응답 (SSE)',
  '시스템 프롬프트 및 파라미터 커스터마이징',
]

const USAGE_STATS = [
  ['월간 요청 수', '2,480,315건'],
  ['평균 응답 시간', '1.28초'],
  ['성공률', '99.76%'],
  ['최근 7일 증감율', '+12.4%'],
  ['마지막 호출', '1분 전'],
]

const OPS_NOTES = [
  '2024-05-20: GPT-4o 모델 버전 업데이트 적용 완료',
  '2024-05-15: 응답 속도 최적화 및 타임아웃 정책 조정',
  '일별 요청 한도 초과 시 429 에러가 반환됩니다.',
  '문의: ai-support@lookscout.io',
]

const STAT_CARDS: { icon: Icon; label: string; value: string }[] = [
  { icon: ClockIcon, label: '평균 응답 시간', value: '1.28s' },
  { icon: CodeBracketIcon, label: '호출 방식', value: 'REST API' },
  { icon: StarIcon, label: '모델 등급', value: 'Premium' },
  { icon: ChartBarIcon, label: '월 요청수', value: '2.48M' },
]

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ fontSize: 16, fontWeight: 700 }}>{children}</h3>
}

export function ServiceDetail() {
  const narrow = useNarrow()
  return (
    <div className="anim-fade min-w-0">
      <div
        className="grid items-start min-w-0"
        style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 332px' }}
      >
        {/* 좌 콘텐츠 */}
        <Card>
          <div className="flex flex-col" style={{ gap: 22 }}>
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3.5 min-w-0">
                <IconTile icon={ChatBubbleLeftRightIcon} hue={212} size={52} />
                <div className="flex flex-col min-w-0" style={{ gap: 9 }}>
                  <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px' }}>AI 챗봇 서비스</h2>
                  <div className="flex items-center flex-wrap gap-2">
                    <MetaChip label="제공사" value="OpenAI" />
                    <MetaChip label="API" value="REST API" />
                    <MetaChip label="모델" value="GPT-4o" />
                    <MetaChip label="소유자" value="홍길동" />
                    <Badge tone="ok">정상</Badge>
                  </div>
                </div>
              </div>
              <div
                className="flex flex-col items-center justify-center shrink-0 rounded-xl"
                style={{ padding: '9px 18px', background: 'var(--ok-soft)', border: '1px solid var(--c-border)' }}
              >
                <span className="flex items-center gap-1" style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-ok)' }}>
                  <StarIcon width={16} height={16} /> 4.7
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>사용자 점수</span>
              </div>
            </div>

            {/* 4 스탯 카드 */}
            <div className="grid" style={{ gap: 12, gridTemplateColumns: narrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
              {STAT_CARDS.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-3 rounded-xl border border-line"
                  style={{ padding: '13px 14px', background: 'var(--c-soft)' }}
                >
                  <IconTile icon={c.icon} hue={212} size={36} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{c.label}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{c.value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 서비스 개요 */}
            <div className="flex flex-col" style={{ gap: 9 }}>
              <SectionTitle>서비스 개요</SectionTitle>
              <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.65 }}>
                OpenAI의 최신 GPT-4o 모델을 기반으로 한 대화형 AI 챗봇 서비스입니다. 자연어 이해 및 생성 능력이 뛰어나며,
                다양한 비즈니스 시나리오에 최적화되어 있습니다.
              </p>
            </div>

            {/* API 설명 */}
            <div className="flex flex-col" style={{ gap: 9 }}>
              <SectionTitle>API 설명</SectionTitle>
              <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.65 }}>
                RESTful API 기반의 챗 completions 엔드포인트를 제공합니다. JSON 형식의 요청/응답을 사용하며,
                SSE 스트리밍 응답을 지원합니다. 인증은 Bearer Token 방식을 사용합니다.
              </p>
            </div>

            {/* 주요 기능 */}
            <div className="flex flex-col" style={{ gap: 11 }}>
              <SectionTitle>주요 기능</SectionTitle>
              <ul className="grid" style={{ gap: 9, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5" style={{ fontSize: 14 }}>
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 19, height: 19, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}
                    >
                      <CheckIcon width={12} height={12} strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* 사용 현황 · 운영 메모 */}
            <div className="grid" style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
              <div className="flex flex-col rounded-xl border border-line" style={{ padding: '14px 16px', gap: 11, background: 'var(--c-soft)' }}>
                <SectionTitle>사용 현황</SectionTitle>
                <ul className="flex flex-col" style={{ gap: 8 }}>
                  {USAGE_STATS.map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between gap-2" style={{ fontSize: 13.5 }}>
                      <span className="text-muted">{k}</span>
                      <span style={{ fontWeight: 700 }}>{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col rounded-xl border border-line" style={{ padding: '14px 16px', gap: 11, background: 'var(--c-soft)' }}>
                <SectionTitle>운영 메모</SectionTitle>
                <ul className="flex flex-col" style={{ gap: 8 }}>
                  {OPS_NOTES.map((n) => (
                    <li key={n} className="flex items-start gap-2 text-muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                      <span className="shrink-0" style={{ color: 'var(--c-accent)', marginTop: 1 }}>•</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 내부 사용자 안내 */}
            <div
              className="flex items-center gap-2.5 rounded-lg"
              style={{ padding: '11px 14px', fontSize: 13.5, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}
            >
              <CheckIcon width={16} height={16} strokeWidth={2.5} className="shrink-0" />
              <span>이 서비스는 기업 내부 사용자에게만 제공됩니다.</span>
            </div>

            {/* 액션 */}
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="outline">서비스 문의</Button>
              <Button>설정 관리</Button>
            </div>
          </div>
        </Card>

        {/* 우 랭킹 */}
        <RankingPanel />
      </div>
    </div>
  )
}
