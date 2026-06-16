import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  BeakerIcon,
  CheckCircleIcon,
  CheckIcon,
  CloudArrowUpIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  ShieldCheckIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Button } from '../components/ui'
import { allGpus } from '../data'
import type { Model, ModelKind, ModelRequest } from '../data/types'
import { useRole } from '../lib/role'
import {
  CornerMarks,
  FieldLabel,
  M,
  MorphFrame,
  ModelAvatar,
  MORPH_EASE,
  Pending,
  SectionHead,
  SelectCard,
  SpecSection,
  Stepper,
  inputBase,
} from './model-wizard-ui'
import {
  clearScanStart,
  createModel,
  createRequest,
  getRequest,
  getScanStart,
  patchRequest,
  setScanStart,
  useCatalogModels,
  useModelRequests,
} from './model-requests-shared'

// G5 · 4.14 관리자 모델 반입(A 전용, 별도 페이지) — 처음부터 끝까지 하나의 통합 멀티스텝.
// 1 모델 업로드(드래그앤드롭) → 2 보안 스캔(진행 게이지 → 결과) → 3 명세 → 4 자원 → 5 사용법 → 6 검토·배포.
// 스텝퍼는 업로드 단계부터 항상 노출. g2 request-new 의 좌우+morph 비주얼 체계 통일.

const LIST_PATH = '/models/requests'
const API_HOST = 'https://api.anclave.local' // 추론 게이트웨이 호스트(엔드포인트 전체 URL 예시용)
const SCAN_DURATION = 10000 // 보안 스캔 총 소요(ms) — 백그라운드 진행률 계산 기준
const STEPS = ['모델 업로드', '보안 스캔', '명세 등록', '자원 요건', '사용법', '검토 · 배포']
const KIND_OPTS: ModelKind[] = ['LLM', 'Code', 'Vision-Language', 'Image', 'STT', 'Embedding']
const SCAN_STEPS = ['safetensors 포맷 검증', 'modelscan 악성코드 점검', 'picklescan 직렬화 점검', '체크섬(SHA-256) 산출'] as const

function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function guessModelName(fileName: string): string {
  return fileName.replace(/\.(safetensors|bin|gguf|pt|onnx)$/i, '').replace(/[-_]/g, ' ').trim() || '신규 모델'
}

// 모델명 규모 힌트(72B/27B/7B/mini 등)로 추천 자원 산출 — 목업이지만 일관되게.
interface Recommend { vram: number; ram: number; storage: number; cpu: number }
function recommendResources(name: string): Recommend {
  const n = name.toLowerCase()
  const m = n.match(/(\d+(?:\.\d+)?)\s*b\b/)
  const params = m ? parseFloat(m[1]) : /mini|small|tiny|phi/.test(n) ? 4 : 13
  const vram = Math.max(8, Math.round((params * 2.4) / 8) * 8) // fp16 가중치 ≈ 2GB/1B, 8GB 스텝
  return {
    vram,
    ram: Math.max(16, Math.round((vram * 1.5) / 8) * 8),
    storage: Math.max(40, Math.round((params * 2.2) / 10) * 10 + 20),
    cpu: params >= 60 ? 16 : params >= 20 ? 8 : 4,
  }
}

// 클러스터에서 할당 가능한 GPU 풀 — allGpus 를 모델·VRAM 으로 묶어 카드로 노출(권장 GPU 선택).
interface GpuType { model: string; arch: string; vramGb: number; migCapable: boolean; count: number; label: string }
// 더미 데이터센터 GPU(예시 풀 확장) — 실제 fleet(allGpus)에 더해 선택지를 풍부하게.
const DUMMY_GPUS: GpuType[] = [
  { model: 'NVIDIA GB300 NVL72', arch: 'Blackwell', vramGb: 288, migCapable: true, count: 8, label: 'NVIDIA GB300 NVL72 288GB' },
  { model: 'NVIDIA H200 SXM', arch: 'Hopper', vramGb: 141, migCapable: true, count: 4, label: 'NVIDIA H200 SXM 141GB' },
  { model: 'NVIDIA H100 SXM', arch: 'Hopper', vramGb: 80, migCapable: true, count: 8, label: 'NVIDIA H100 SXM 80GB' },
  { model: 'NVIDIA H100 NVL', arch: 'Hopper', vramGb: 94, migCapable: true, count: 2, label: 'NVIDIA H100 NVL 94GB' },
  { model: 'NVIDIA A100', arch: 'Ampere', vramGb: 80, migCapable: true, count: 6, label: 'NVIDIA A100 80GB' },
  { model: 'NVIDIA A100', arch: 'Ampere', vramGb: 40, migCapable: true, count: 4, label: 'NVIDIA A100 40GB' },
  { model: 'NVIDIA L40S', arch: 'Ada Lovelace', vramGb: 48, migCapable: false, count: 4, label: 'NVIDIA L40S 48GB' },
  { model: 'NVIDIA RTX 6000 Ada', arch: 'Ada Lovelace', vramGb: 48, migCapable: false, count: 2, label: 'NVIDIA RTX 6000 Ada 48GB' },
  { model: 'NVIDIA A40', arch: 'Ampere', vramGb: 48, migCapable: true, count: 3, label: 'NVIDIA A40 48GB' },
]
const GPU_POOL: GpuType[] = (() => {
  const map = new Map<string, GpuType>()
  allGpus.forEach((g) => {
    const key = `${g.model}|${g.vramGb}`
    const ex = map.get(key)
    if (ex) ex.count++
    else map.set(key, { model: g.model, arch: g.arch, vramGb: g.vramGb, migCapable: g.migCapable, count: 1, label: `${g.model} ${g.vramGb}GB` })
  })
  DUMMY_GPUS.forEach((d) => { if (!map.has(`${d.model}|${d.vramGb}`)) map.set(`${d.model}|${d.vramGb}`, d) })
  return Array.from(map.values()).sort((a, b) => b.vramGb - a.vramGb)
})()
const GPU_PAGE_SIZE = 4 // 권장 GPU 예시 카드 페이지당 개수(2열×2행) — 스크롤 없이 페이지네이션
const GPU_TOTAL = GPU_POOL.reduce((a, g) => a + g.count, 0)
const GPU_PAGES = Math.max(1, Math.ceil(GPU_POOL.length / GPU_PAGE_SIZE))

// 자원 슬라이더 범위(min·max·step) — GPU/서버 현실 범위.
const RES_RANGE: Record<'vram' | 'ram' | 'storage' | 'cpu', { min: number; max: number; step: number; unit: string; label: string }> = {
  vram: { min: 4, max: 320, step: 4, unit: 'GB', label: 'VRAM' },
  ram: { min: 8, max: 512, step: 8, unit: 'GB', label: '시스템 RAM' },
  storage: { min: 20, max: 1000, step: 10, unit: 'GB', label: '저장공간' },
  cpu: { min: 2, max: 64, step: 1, unit: '코어', label: 'CPU 코어' },
}

interface SpecForm {
  name: string
  kind: ModelKind
  tags: string[]
  description: string
  imageUrl?: string
  license: string
  params: string
  recommendedGpu: string
  vram: string
  ram: string
  storage: string
  cpu: string
  usageGuide: string
  exampleCode: string
  endpoint: string
}
const EMPTY_SPEC: SpecForm = {
  name: '', kind: 'LLM', tags: [], description: '', license: 'Apache-2.0', params: '', recommendedGpu: '',
  vram: '', ram: '', storage: '', cpu: '', usageGuide: '', exampleCode: '', endpoint: '',
}
function makeForm(req: ModelRequest): SpecForm {
  const rec = recommendResources(req.modelName)
  return {
    name: req.modelName,
    kind: req.kind ?? 'LLM',
    tags: req.kind ? [req.kind] : [],
    description: '',
    license: 'Apache-2.0',
    params: '',
    recommendedGpu: '',
    vram: String(rec.vram), ram: String(rec.ram), storage: String(rec.storage), cpu: String(rec.cpu),
    usageGuide: '',
    exampleCode: '',
    endpoint: `/v1/models/${req.modelName.toLowerCase().replace(/[\s_]+/g, '-')}`,
  }
}
// 배포 완료된 Model → 읽기전용 명세서 폼.
function formFromModel(m: Model): SpecForm {
  return {
    name: m.name,
    kind: m.kind,
    tags: Array.from(new Set([m.kind, ...m.addons])),
    description: m.description,
    license: m.license,
    params: m.params,
    recommendedGpu: m.recommendedGpu,
    vram: String(m.reqVramGb), ram: String(m.reqRamGb), storage: String(m.reqStorageGb), cpu: String(m.reqCpuCores),
    usageGuide: 'OpenAI 호환 chat/completions 엔드포인트로 호출합니다.',
    exampleCode: '',
    endpoint: `/v1/models/${m.name.toLowerCase().replace(/[\s_]+/g, '-')}`,
  }
}

// ── 단계 1: 드래그&드롭 업로드 ──
function UploadBody({ req, onUpload }: { req: ModelRequest | null; onUpload: (fileName: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const take = (list: FileList | null | undefined) => {
    const file = list?.[0]
    if (file) onUpload(file.name)
  }
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ gap: 14 }}>
      {req && (
        <div className="border border-line rounded-[12px] flex items-center gap-3 flex-wrap shrink-0" style={{ padding: '12px 15px', background: 'var(--c-bg)' }}>
          <span className="font-bold truncate" style={{ fontSize: 15, color: 'var(--c-text)' }}>{req.modelName}</span>
          <span className="shrink-0" style={{ fontSize: 14, color: 'var(--c-muted)' }}>신청자 {req.requesterUserId}</span>
          {req.fileName && (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-[6px]" style={{ marginLeft: 'auto', padding: '3px 9px', background: 'var(--ok-soft)', color: 'var(--c-ok)', fontSize: 14, fontWeight: 600 }}>
              <CheckIcon style={{ width: 13, height: 13 }} />
              업로드됨 · <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{req.fileName}</span>
            </span>
          )}
        </div>
      )}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files) }}
        className="flex flex-col items-center justify-center text-center cursor-pointer rounded-[16px] transition-colors flex-1 min-h-0"
        style={{
          minHeight: 200,
          border: `2px dashed ${drag ? M.blue : M.border}`,
          background: drag ? M.activeBg : 'var(--c-bg)',
          padding: 32,
        }}
      >
        <input ref={fileRef} type="file" className="hidden" accept=".safetensors,.bin,.gguf,.pt,.onnx" onChange={(e) => take(e.target.files)} />
        <span className="flex items-center justify-center rounded-full" style={{ width: 72, height: 72, background: M.activeBg, color: M.blue }}>
          <CloudArrowUpIcon style={{ width: 38, height: 38 }} />
        </span>
        <span className="font-bold" style={{ fontSize: 17, color: 'var(--c-text)', marginTop: 18 }}>모델 파일을 끌어다 놓거나 클릭해 선택</span>
        <span style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 8, maxWidth: 420, lineHeight: 1.5 }}>
          업로드 즉시 서버에서 보안 점검(safetensors 검증 · modelscan · picklescan · 체크섬)이 시작됩니다.
        </span>
        <span style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 12, fontFamily: 'var(--font-mono)' }}>.safetensors · .bin · .gguf · .pt · .onnx</span>
      </div>

      {/* DEV 전용 — 실제 파일 없이 업로드→스캔 흐름 테스트 (프로덕션 빌드에선 제거됨) */}
      {import.meta.env.DEV && (
        <div className="flex items-center justify-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => onUpload('Qwen2.5-14B-Instruct.safetensors')}
            className="flex items-center justify-center gap-2 rounded-[10px] transition-colors hover:bg-soft"
            style={{ border: '1px dashed var(--c-border)', background: 'var(--c-soft)', color: 'var(--c-muted)', padding: '9px 16px', fontSize: 14, fontWeight: 500 }}
          >
            <BeakerIcon style={{ width: 15, height: 15 }} />
            테스트 업로드 (정상 · safetensors)
          </button>
          <button
            type="button"
            onClick={() => onUpload('malicious-lora.bin')}
            className="flex items-center justify-center gap-2 rounded-[10px] transition-colors hover:bg-soft"
            style={{ border: '1px dashed var(--c-danger)', background: 'var(--danger-soft)', color: 'var(--c-danger)', padding: '9px 16px', fontSize: 14, fontWeight: 500 }}
          >
            <BeakerIcon style={{ width: 15, height: 15 }} />
            테스트 업로드 (실패 · pickle 위험)
          </button>
        </div>
      )}
    </div>
  )
}

// ── 단계 2: 보안 스캔 진행 게이지 — 시작 시각(영속) 기준 경과로 진행률 계산(백그라운드 유지) ──
function ScanGauge({ req, onDone }: { req: ModelRequest; onDone: () => void }) {
  // 시작 시각: 저장된 값이 있으면 그걸로(나갔다 와도 이어짐), 없으면 지금부터 기록.
  const startRef = useRef<number>(0)
  if (startRef.current === 0) {
    const saved = getScanStart(req.id)
    startRef.current = saved ?? Date.now()
    if (saved == null) setScanStart(req.id, startRef.current)
  }
  const calc = () => Math.min(100, Math.round(((Date.now() - startRef.current) / SCAN_DURATION) * 100))
  const [pct, setPct] = useState(calc)
  const doneRef = useRef(false)
  useEffect(() => {
    const tick = () => {
      const p = calc()
      setPct(p)
      if (p >= 100 && !doneRef.current) {
        doneRef.current = true
        window.clearInterval(t)
        window.setTimeout(onDone, 300)
      }
    }
    const t = window.setInterval(tick, 150)
    tick()
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone])

  const stepState = (i: number): 'done' | 'active' | 'wait' => {
    const lo = i * 25
    if (pct >= lo + 25) return 'done'
    if (pct >= lo) return 'active'
    return 'wait'
  }

  return (
    <div className="flex flex-col w-full" style={{ maxWidth: 580, margin: '0 auto' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 48, height: 48, background: M.activeBg, color: M.blue }}>
            <ShieldCheckIcon style={{ width: 28, height: 28 }} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold truncate" style={{ fontSize: 18, color: 'var(--c-text)' }}>보안을 위해 검토 중입니다</h2>
            <p className="truncate" style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 3 }}>
              {req.modelName} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{req.fileName}</span>
            </p>
          </div>
          <span className="ml-auto shrink-0 tabular-nums font-bold" style={{ fontSize: 26, color: M.blue }}>{pct}%</span>
        </div>

        <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--c-track)', marginTop: 22 }}>
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: M.blue, transition: 'width .3s ease' }} />
        </div>

        <div className="flex flex-col" style={{ gap: 2, marginTop: 22 }}>
          {SCAN_STEPS.map((s, i) => {
            const st = stepState(i)
            return (
              <div key={s} className="flex items-center gap-3" style={{ padding: '11px 0', borderBottom: i < SCAN_STEPS.length - 1 ? '1px solid var(--c-border-s)' : 'none' }}>
                <span
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 24, height: 24,
                    background: st === 'done' ? 'var(--ok-soft)' : st === 'active' ? M.activeBg : 'var(--c-track)',
                    color: st === 'done' ? 'var(--c-ok)' : st === 'active' ? M.blue : 'var(--c-muted)',
                  }}
                >
                  {st === 'done' ? <CheckIcon style={{ width: 14, height: 14 }} /> : st === 'active' ? <span className="scan-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
                </span>
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, color: st === 'wait' ? 'var(--c-muted)' : 'var(--c-text)', fontWeight: st === 'active' ? 600 : 500 }}>{s}</span>
                <span className="shrink-0" style={{ fontSize: 14, color: st === 'done' ? 'var(--c-ok)' : st === 'active' ? M.blue : 'var(--c-muted)' }}>
                  {st === 'done' ? '완료' : st === 'active' ? '진행 중' : '대기'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="rounded-[10px] flex items-start gap-2.5" style={{ marginTop: 20, padding: '12px 14px', background: M.activeBg }}>
          <ExclamationTriangleIcon style={{ width: 17, height: 17, color: M.blue, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 14, color: 'var(--c-text)', lineHeight: 1.5 }}>
            이 검사는 서버에서 진행되며, 이 페이지를 벗어나 다른 작업을 해도 됩니다. 완료되면 신청 목록의 단계가 <b>스캔완료</b>로 바뀝니다.
          </p>
        </div>
      <style>{`.scan-pulse{animation:scanPulse 1s ease-in-out infinite}@keyframes scanPulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}`}</style>
    </div>
  )
}

// ── 결과(배포/반려) 읽기전용 ──
function ResultView({ req }: { req: ModelRequest }) {
  const navigate = useNavigate()
  const deployed = req.stage === 'deployed'
  return (
    <div className="anim-fade flex items-center justify-center" style={{ flex: 1, minHeight: 0 }}>
      <div className="bg-card2 border border-line rounded-[16px] flex flex-col items-center text-center" style={{ padding: '40px 44px', maxWidth: 460, width: '100%', boxShadow: 'var(--shadow-card)' }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: deployed ? 'var(--ok-soft)' : 'var(--danger-soft)', color: deployed ? 'var(--c-ok)' : 'var(--c-danger)' }}>
          {deployed ? <CheckCircleIcon style={{ width: 36, height: 36 }} /> : <XCircleIcon style={{ width: 36, height: 36 }} />}
        </span>
        <h2 className="font-bold" style={{ fontSize: 19, marginTop: 18, color: 'var(--c-text)' }}>{deployed ? '배포가 완료되었습니다' : '반려된 신청입니다'}</h2>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.55, marginTop: 8 }}>
          {deployed ? `${req.modelName} 이(가) 카탈로그와 마켓플레이스에 노출되고 있습니다.` : req.rejectReason ?? '보안 점검 또는 검토 단계에서 반려되었습니다.'}
        </p>
        <div className="flex items-center gap-2" style={{ marginTop: 22 }}>
          <Button variant="outline" onClick={() => navigate(LIST_PATH)}>목록으로</Button>
          {deployed && <Button onClick={() => navigate('/models')}>카탈로그로</Button>}
        </div>
      </div>
    </div>
  )
}

// ── 명세서(우측) — 멀티스텝 입력 실시간 반영 → 검토 시 센터 morph ──
function SheetRow({ label, value, pendingW = '60%', reviewing, last }: { label: string; value?: ReactNode; pendingW?: string; reviewing: boolean; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '9px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 88, fontSize: 14, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 22 }}>
        {empty ? (reviewing ? <span style={{ fontSize: 14, color: M.idle }}>—</span> : <Pending w={pendingW} />)
          : <span className="anim-fade" style={{ fontSize: 14, color: M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}

function ModelSpecSheet({ f, recommend, reviewing, currentStep, onEdit, onDeploy, onBack, canDeploy, readonly, footer }: {
  f: SpecForm
  recommend: Recommend
  reviewing: boolean
  currentStep: number
  onEdit: (i: number) => void
  onDeploy: () => void
  onBack: () => void
  canDeploy: boolean
  readonly?: boolean
  footer?: ReactNode
}) {
  const tagsText = f.tags.length ? f.tags.join(', ') : ''
  const resText = f.vram && f.ram && f.storage && f.cpu
    ? `VRAM ${f.vram}GB · RAM ${f.ram}GB · 저장 ${f.storage}GB · CPU ${f.cpu}코어`
    : ''
  // 호출 예시 — 직접 입력값 우선, 없으면 엔드포인트·모델명으로 curl 자동 생성. 명세서 하단을 채운다.
  const callExample = f.exampleCode.trim() || [
    `curl -X POST ${API_HOST}/v1/chat/completions \\`,
    `  -H "Authorization: Bearer $ANCLAVE_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "model": "${f.name || '모델명'}",`,
    `    "messages": [{ "role": "user", "content": "안녕하세요" }]`,
    `  }'`,
  ].join('\n')
  return (
    <div
      data-morph="sheet"
      className="relative flex flex-col h-full"
      style={{
        background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14,
        boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden',
        width: '100%', maxWidth: reviewing ? 860 : '100%', margin: '0 auto',
        transform: reviewing ? 'scale(1)' : 'scale(0.99)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}`,
      }}
    >
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 120, fontWeight: 900, color: reviewing ? 'var(--c-ok)' : 'var(--c-accent)', opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{reviewing ? '배포' : '명세'}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '15px 18px 13px', borderBottom: `3px double ${M.border}`, background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-center gap-3">
            <ModelAvatar name={f.name || '모델'} img={f.imageUrl} size={46} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold truncate" style={{ fontSize: 17, color: M.text }}>{f.name || '모델 명세서'}</h3>
                <span className="shrink-0 font-semibold rounded-[6px]" style={{ fontSize: 14, padding: '2px 9px', background: M.activeBg, color: M.blue }}>{f.kind}</span>
              </div>
              <p className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 3 }}>카탈로그 등록 명세서 · {f.params || '규모 미정'}</p>
            </div>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-ok)' : M.blue}`, color: reviewing ? 'var(--c-ok)' : M.blue, background: reviewing ? 'var(--ok-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '배포' : '초안'}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '6px 12px 14px' }}>
          <SpecSection title="기본 명세" active={!reviewing && currentStep === 1} reviewing={reviewing} onEdit={readonly ? undefined : () => onEdit(1)}>
            <SheetRow label="태그" value={tagsText ? f.tags.map((t) => (
              <span key={t} className="inline-block rounded-[5px]" style={{ fontSize: 14, padding: '1px 8px', margin: '2px 4px 2px 0', background: M.activeBg, color: M.blue }}>{t}</span>
            )) : ''} pendingW="55%" reviewing={reviewing} />
            <SheetRow label="설명" value={f.description} pendingW="92%" reviewing={reviewing} />
            <SheetRow label="라이선스" value={f.license} pendingW="40%" reviewing={reviewing} last />
          </SpecSection>

          <SpecSection title="자원 요건" active={!reviewing && currentStep === 2} reviewing={reviewing} onEdit={readonly ? undefined : () => onEdit(2)}>
            <SheetRow label="최소 자원" value={resText} pendingW="85%" reviewing={reviewing} />
            <SheetRow label="권장 GPU" value={f.recommendedGpu} pendingW="45%" reviewing={reviewing} last />
          </SpecSection>

          <SpecSection title="사용법" active={!reviewing && currentStep === 3} reviewing={reviewing} onEdit={readonly ? undefined : () => onEdit(3)}>
            <SheetRow label="엔드포인트" value={f.endpoint ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{f.endpoint}</span> : ''} pendingW="70%" reviewing={reviewing} />
            <SheetRow label="가이드" value={f.usageGuide} pendingW="88%" reviewing={reviewing} last />
          </SpecSection>
          {!reviewing && (
            <div className="shrink-0 rounded-[8px]" style={{ margin: '2px 12px 0', padding: '10px 12px', border: '1px dashed var(--c-border)', fontSize: 14, color: M.help, lineHeight: 1.5 }}>
              스캔에서 산출한 추천 자원: VRAM {recommend.vram}GB · RAM {recommend.ram}GB · 저장 {recommend.storage}GB · CPU {recommend.cpu}코어
            </div>
          )}
          {/* 호출 예시 — 명세서 남는 공간을 채운다(직접 입력 또는 자동 생성 curl) */}
          <div className="flex flex-col flex-1 min-h-0" style={{ padding: '6px 12px 0', marginTop: 6, minHeight: 120 }}>
            <SectionHead title="호출 예시" active={false} reviewing={reviewing} onEdit={readonly ? undefined : () => onEdit(3)} />
            <pre className="flex-1 min-h-0 overflow-auto rounded-[8px]" style={{ padding: '12px 13px', background: 'var(--c-bg)', border: `1px solid ${M.border}`, fontSize: 14, fontFamily: 'var(--font-mono)', color: M.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{callExample}</pre>
          </div>
        </div>

        {footer != null ? (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>{footer}</div>
        ) : reviewing && !readonly && (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>
            <p style={{ fontSize: 14, color: M.help, marginBottom: 10, lineHeight: 1.5 }}>배포 시 카탈로그에 모델이 등록되고 마켓플레이스에 노출됩니다.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onBack}>이전</Button>
              <Button onClick={onDeploy} disabled={!canDeploy} className="flex-1 justify-center">배포하기</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인: 통합 멀티스텝 ──
export function ModelImport() {
  const navigate = useNavigate()
  const requests = useModelRequests()
  const catalog = useCatalogModels()
  const [params] = useSearchParams()
  const idParam = params.get('id')
  const { user } = useRole()

  const [createdId, setCreatedId] = useState<string | null>(null)
  const id = idParam ?? createdId
  const req = id ? requests.find((r) => r.id === id) ?? null : null

  // step 커서: 0 업로드 · 1 보안스캔 · 2 명세 · 3 자원 · 4 사용법 · 5 검토. stage 와 분리해 자유 왕복.
  const [step, setStep] = useState<number>(() => (!req || req.stage === 'requested' ? 0 : 1))
  const [tagDraft, setTagDraft] = useState('')
  const [gpuPage, setGpuPage] = useState(0) // 권장 GPU 카드 페이지
  const [rejectReason, setRejectReason] = useState('picklescan 검출 — pickle 직렬화 위험 코드가 발견되었습니다. 안전한 safetensors 포맷으로 재신청 바랍니다.')
  const imgRef = useRef<HTMLInputElement>(null)
  // 스텝 전환 방향(앞으로=오른쪽에서, 뒤로=왼쪽에서 스르륵) — 직전 step 과 비교.
  const prevStepRef = useRef(step)
  useEffect(() => { prevStepRef.current = step }, [step])
  const recommend = useMemo(() => recommendResources(req?.modelName ?? ''), [req?.modelName])
  const [f, setF] = useState<SpecForm>(() => (req && req.stage === 'scanned' ? makeForm(req) : EMPTY_SPEC))
  const set = <K extends keyof SpecForm>(k: K, v: SpecForm[K]) => setF((p) => ({ ...p, [k]: v }))
  // 업로드→스캔 비동기 경로: 스캔 완료(scanned) 시 명세 폼을 1회 채운다(사용자 편집은 보존).
  const initedRef = useRef(req?.stage === 'scanned')
  useEffect(() => {
    if (req?.stage === 'scanned' && !initedRef.current) {
      initedRef.current = true
      setF(makeForm(req))
    }
  }, [req?.stage, req])

  // 스캔 완료 처리 — 포맷에 따라 pass/fail. 진행 중일 때만(중복·역전 방지). 백그라운드 setTimeout/게이지 양쪽에서 호출.
  const finishScan = async (id: string, format: 'safetensors' | 'other') => {
    const cur = getRequest(id)
    if (!cur || cur.stage !== 'scanning') return
    const pass = format === 'safetensors'
    await patchRequest(id, { stage: 'scanned', scan: pass ? 'pass' : 'fail', checksum: 'sha256:' + id.replace(/\D/g, '').padEnd(4, '0') + '…a1f3' })
    clearScanStart(id)
  }

  const onUpload = async (fileName: string) => {
    const format: 'safetensors' | 'other' = /\.safetensors$/i.test(fileName) ? 'safetensors' : 'other'
    const patch: Partial<ModelRequest> = { stage: 'scanning', fileName, format, scan: 'pending' }
    let id: string
    if (req) {
      id = req.id
      await patchRequest(req.id, patch)
    } else {
      // 직접 반입 — 신청 생성(서버 id 발급) 후 scanning 전환(POST→PATCH 2콜).
      const created = await createRequest({
        requesterUserId: user.id, modelName: guessModelName(fileName), kind: 'LLM', reason: '관리자 직접 반입',
      })
      id = created.id
      setCreatedId(id)
      await patchRequest(id, patch)
    }
    setScanStart(id, Date.now())
    // 백그라운드 — 페이지를 벗어나도 SCAN_DURATION 후 자동 완료.
    window.setTimeout(() => void finishScan(id, format), SCAN_DURATION)
    setStep(1) // 업로드 → 보안 스캔 스텝으로 진행
  }
  const onScanDone = () => {
    if (req) void finishScan(req.id, req.format ?? 'safetensors')
  }
  // 보안 점검 실패 → 신청 반려(관리자 입력 사유).
  const reject = () => {
    if (req) void patchRequest(req.id, { stage: 'rejected', status: 'rejected', processedAt: fmtNow(), processedBy: user.id, rejectReason: rejectReason.trim() || '보안 점검 실패로 반려되었습니다.' })
  }

  const addTag = () => {
    const t = tagDraft.trim()
    if (t && !f.tags.includes(t)) set('tags', [...f.tags, t])
    setTagDraft('')
  }
  const pickImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('imageUrl', String(reader.result))
    reader.readAsDataURL(file)
  }
  const deploy = async () => {
    if (!req) return
    // FK 순서: 모델 insert(서버 id 발급) → 그 id 로 신청을 deployed 기록.
    const created = await createModel({
      name: f.name.trim(),
      kind: f.kind,
      description: f.description.trim(),
      addons: f.tags.filter((t) => t !== f.kind),
      license: f.license.trim() || 'Apache-2.0',
      recommendedGpu: f.recommendedGpu.trim() || `VRAM ${f.vram}GB+`,
      params: f.params.trim() || '—',
      reqVramGb: Number(f.vram), reqRamGb: Number(f.ram), reqStorageGb: Number(f.storage), reqCpuCores: Number(f.cpu),
    })
    await patchRequest(req.id, { stage: 'deployed', status: 'approved', processedAt: fmtNow(), processedBy: user.id, scan: 'pass', registeredModelId: created.id })
  }

  // ── 단계 파생 ──
  const uploaded = !!req && req.stage !== 'requested' // scanning|scanned (업로드 완료)
  const scanning = req?.stage === 'scanning'
  const scanned = req?.stage === 'scanned'
  const scanOk = req?.scan !== 'fail'
  const reviewing = step === 5
  const formFor = (reviewing ? 4 : step) - 1 // 명세=1·자원=2·사용법=3 (검토 중엔 직전 사용법 유지)
  const canDeploy = Boolean(f.name.trim() && f.description.trim() && f.vram && f.ram && f.storage && f.cpu)
  // 현재 스텝에서 '다음' 가능 여부
  const canNext =
    step === 0 ? uploaded
      : step === 1 ? (scanned && scanOk)
        : step === 2 ? Boolean(f.name.trim() && f.description.trim())
          : step === 3 ? Boolean(f.vram && f.ram && f.storage && f.cpu)
            : true

  const subtitle =
    step === 0 ? (req ? '신청된 모델 파일을 반입합니다. 업로드 시 보안 점검이 시작됩니다.' : '신규 모델 파일을 반입합니다. 업로드 시 보안 점검이 시작됩니다.')
      : step === 1 ? (scanned ? '보안 점검을 통과했습니다. 다음 단계로 진행하세요.' : '서버에서 보안 점검이 진행 중입니다.')
        : '명세·자원·사용법을 등록하고 배포하세요.'

  // 종료(배포/반려). 배포는 등록된 Model 로 읽기전용 명세서, 반려는 사유 카드.
  const terminal = req && (req.stage === 'deployed' || req.stage === 'rejected')
  const deployedModel = req?.stage === 'deployed' && req.registeredModelId
    ? catalog.find((m) => m.id === req.registeredModelId) ?? null
    : null

  // 자원 슬라이더(게이지 바) — 트랙·채움·추천 마커 + 네이티브 range(투명 트랙·커스텀 thumb).
  const sliderField = (key: 'vram' | 'ram' | 'storage' | 'cpu', rec: number) => {
    const r = RES_RANGE[key]
    const val = Number(f[key]) || 0
    const clamp = (n: number) => Math.min(r.max, Math.max(r.min, n))
    const pct = ((clamp(val) - r.min) / (r.max - r.min)) * 100
    const recPct = ((clamp(rec) - r.min) / (r.max - r.min)) * 100
    return (
      <div>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 9 }}>
          <span className="font-semibold" style={{ fontSize: 14, color: M.text }}>{r.label}</span>
          <span className="tabular-nums"><b style={{ fontSize: 17, color: M.blue, fontWeight: 800 }}>{val}</b> <span style={{ fontSize: 14, color: M.meta }}>{r.unit}</span></span>
        </div>
        <div className="relative" style={{ height: 22 }}>
          <span className="absolute" style={{ left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 6, borderRadius: 3, background: 'var(--c-track)' }} />
          <span className="absolute" style={{ left: 0, width: `${pct}%`, top: '50%', transform: 'translateY(-50%)', height: 6, borderRadius: 3, background: M.blue }} />
          <span className="absolute" title={`추천 ${rec}${r.unit}`} style={{ left: `${recPct}%`, top: 1, bottom: 1, width: 2, borderRadius: 1, background: 'var(--c-warn)', transform: 'translateX(-1px)' }} />
          <input type="range" min={r.min} max={r.max} step={r.step} value={clamp(val)} onChange={(e) => set(key, e.target.value)} className="model-slider absolute inset-0 w-full" aria-label={r.label} />
        </div>
        <div className="flex items-center justify-between" style={{ fontSize: 14, color: M.idle, marginTop: 3 }}>
          <span>{r.min}{r.unit}</span>
          <button type="button" onClick={() => set(key, String(rec))} className="hover:underline" style={{ color: M.blueText, fontWeight: 500 }}>추천 {rec}{r.unit}</button>
          <span>{r.max}{r.unit}</span>
        </div>
      </div>
    )
  }

  const gpuCard = (gt: GpuType) => {
    const active = f.recommendedGpu === gt.label
    const reqV = Number(f.vram) || 0
    const over = reqV > gt.vramGb // 모델 요청 VRAM이 이 GPU 용량 초과
    const usePct = reqV > 0 ? Math.min(100, Math.round((reqV / gt.vramGb) * 100)) : 0 // 요청이 GPU 용량에서 차지하는 비율
    const headroom = gt.vramGb - reqV
    const chip = (label: string, tone: 'neutral' | 'ok') => (
      <span className="rounded-[6px] font-medium" style={{ fontSize: 14, padding: '2px 8px', background: tone === 'ok' ? 'var(--ok-soft)' : 'var(--c-soft)', color: tone === 'ok' ? 'var(--c-ok)' : M.help }}>{label}</span>
    )
    return (
      <button
        key={gt.label}
        type="button"
        onClick={() => set('recommendedGpu', gt.label)}
        className="flex flex-col justify-between text-left rounded-[12px] transition-colors"
        style={{ padding: '14px 15px', minHeight: 104, gap: 12, background: active ? M.activeBg : M.inputBg, border: `1px solid ${active ? M.blue : M.border}` }}
      >
        {/* 헤더 — GPU 아이콘 타일 + 모델명 + 종류 칩 */}
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 38, height: 38, background: active ? 'var(--c-card2)' : 'var(--c-soft)', color: active ? M.blue : M.help }}>
            <CpuChipIcon style={{ width: 21, height: 21 }} />
          </span>
          <div className="flex flex-col min-w-0 flex-1" style={{ gap: 5 }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold truncate" style={{ fontSize: 15, color: M.text }}>{gt.model}</span>
              {active && <CheckCircleIcon style={{ width: 17, height: 17, color: M.blue, flexShrink: 0 }} />}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {chip(gt.arch, 'neutral')}
              {chip(gt.migCapable ? 'MIG 지원' : 'MIG 불가', gt.migCapable ? 'ok' : 'neutral')}
            </div>
          </div>
        </div>

        {/* VRAM 점유 바 — 굵은 바 안에 % 표기. 파란=요청이 GPU 용량에서 차지하는 만큼, 회색=여유 */}
        <div className="w-full">
          <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
            <span className="font-medium" style={{ fontSize: 14, color: M.help }}>요청 VRAM 점유</span>
            <span className="tabular-nums" style={{ fontSize: 14, color: M.text }}>
              <b style={{ fontSize: 16 }}>{reqV || '—'}</b> / {gt.vramGb} GB
            </span>
          </div>
          <div className="relative w-full overflow-hidden" style={{ height: 24, borderRadius: 8, background: 'var(--c-track)' }}>
            <div className="h-full flex items-center justify-end" style={{ width: `${over ? 100 : usePct}%`, minWidth: reqV > 0 ? 42 : 0, padding: '0 10px', background: over ? 'var(--c-danger)' : M.blue, transition: 'width .3s ease' }}>
              {reqV > 0 && <span className="font-bold whitespace-nowrap" style={{ fontSize: 14, color: 'var(--c-onaccent)' }}>{over ? '초과' : `${usePct}%`}</span>}
            </div>
            {reqV > 0 && !over && (
              <span className="absolute flex items-center font-medium" style={{ right: 10, top: 0, bottom: 0, fontSize: 14, color: M.help }}>여유 {headroom}GB</span>
            )}
          </div>
        </div>

        {/* 푸터 — 충족/초과 상태(아이콘) + 가용 대수 */}
        <div className="flex items-center justify-between gap-2 w-full">
          {reqV > 0 ? (
            <span className="font-medium inline-flex items-center gap-1.5" style={{ fontSize: 14, color: over ? 'var(--c-danger)' : 'var(--c-ok)' }}>
              {over ? <XCircleIcon style={{ width: 15, height: 15 }} /> : <CheckCircleIcon style={{ width: 15, height: 15 }} />}
              {over ? `용량 부족 (${reqV - gt.vramGb}GB 초과)` : '요청 충족'}
            </span>
          ) : <span style={{ fontSize: 14, color: M.help }}>요청 자원 미설정</span>}
          <span className="shrink-0" style={{ fontSize: 14, color: M.help }}>{gt.count}대 가용</span>
        </div>
      </button>
    )
  }

  // 좌측 멀티스텝 폼(명세/자원/사용법) — formFor 1/2/3
  const formCard: ReactNode = (
    <div className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex-1 min-h-0 flex flex-col overflow-auto" style={{ padding: '22px 26px' }}>
        {formFor === 1 && (
          <div className="flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 18 }}>카탈로그 명세를 등록해주세요.</h3>
            <FieldLabel text="모델명" required />
            <input value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="예: Qwen2.5-72B" style={{ ...inputBase, marginBottom: 18 }} />
            <FieldLabel text="모델 종류" required />
            <div className="grid grid-cols-3 shrink-0" style={{ gap: 8, marginBottom: 18 }}>
              {KIND_OPTS.map((k) => <SelectCard key={k} label={k} active={f.kind === k} onClick={() => set('kind', k)} />)}
            </div>
            <FieldLabel text="태그" help="모델 특성 태그(쉼표·Enter로 추가)." />
            <div className="flex items-center gap-2 shrink-0" style={{ marginBottom: 8 }}>
              <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} placeholder="예: 추론, 다국어" style={{ ...inputBase, height: 40 }} />
              <Button variant="outline" onClick={addTag} className="shrink-0">추가</Button>
            </div>
            {f.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 shrink-0" style={{ marginBottom: 18 }}>
                {f.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 rounded-[6px]" style={{ fontSize: 14, padding: '3px 8px', background: M.activeBg, color: M.blue }}>
                    {t}
                    <button type="button" onClick={() => set('tags', f.tags.filter((x) => x !== t))} aria-label="태그 제거"><XMarkIcon style={{ width: 13, height: 13 }} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 shrink-0" style={{ gap: 14, marginBottom: 18 }}>
              <div><FieldLabel text="파라미터 규모" /><input value={f.params} onChange={(e) => set('params', e.target.value)} placeholder="예: 72B" style={inputBase} /></div>
              <div><FieldLabel text="라이선스" /><input value={f.license} onChange={(e) => set('license', e.target.value)} placeholder="예: Apache-2.0" style={inputBase} /></div>
            </div>
            <FieldLabel text="프로필 이미지" help="없으면 모델명 이니셜로 자동 생성됩니다. (선택)" />
            <div className="flex items-center gap-3 shrink-0" style={{ marginBottom: 18 }}>
              <ModelAvatar name={f.name || '모델'} img={f.imageUrl} size={52} />
              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => imgRef.current?.click()}><PhotoIcon style={{ width: 15, height: 15 }} />이미지 선택</Button>
              {f.imageUrl && <button type="button" onClick={() => set('imageUrl', undefined)} className="hover:underline" style={{ fontSize: 14, color: M.help }}>제거</button>}
            </div>
            <FieldLabel text="설명" required />
            <textarea value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} placeholder="모델 용도·특징을 한두 문장으로." className="flex-1 min-h-0" style={{ ...inputBase, height: 'auto', minHeight: 88, padding: '12px 14px', resize: 'none', lineHeight: 1.5 }} />
          </div>
        )}

        {formFor === 2 && (
          <div className="flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 4 }}>최소 자원 요건</h3>
            <p className="shrink-0" style={{ fontSize: 14, color: M.help, marginBottom: 16 }}>스캔 추천값(주황 마커)을 기준으로 슬라이더로 조절하세요.</p>
            <div className="grid grid-cols-2 shrink-0" style={{ gap: '20px 22px' }}>
              {sliderField('vram', recommend.vram)}
              {sliderField('ram', recommend.ram)}
              {sliderField('storage', recommend.storage)}
              {sliderField('cpu', recommend.cpu)}
            </div>
            {/* 권장 GPU — 직접 입력 + 등록 서버 GPU 예시(카드 클릭 시 입력) */}
            <div className="shrink-0" style={{ marginTop: 20 }}>
              <FieldLabel text="권장 GPU" help="직접 입력하거나 아래 예시 카드를 누르면 이 칸에 채워집니다. (선택)" />
              <input value={f.recommendedGpu} onChange={(e) => set('recommendedGpu', e.target.value)} placeholder="예: NVIDIA H100 SXM 80GB ×4" style={inputBase} />
            </div>
            <div className="flex items-center justify-between gap-3 shrink-0" style={{ margin: '12px 0 8px' }}>
              <span className="truncate" style={{ fontSize: 14, color: M.help }}>
                <span style={{ color: M.text, fontWeight: 600 }}>등록 서버 GPU 예시</span> · 누르면 위 칸에 입력 <span style={{ color: M.idle }}>(할당 가능 {GPU_TOTAL}대)</span>
              </span>
              {GPU_PAGES > 1 && (
                <span className="flex items-center shrink-0" style={{ gap: 4 }}>
                  <button type="button" aria-label="이전 GPU 페이지" onClick={() => setGpuPage((p) => Math.max(0, p - 1))} disabled={gpuPage === 0}
                    className="flex items-center justify-center rounded-[6px] transition-colors hover:enabled:bg-soft disabled:opacity-40"
                    style={{ width: 24, height: 24, border: `1px solid ${M.border}`, color: M.text, fontSize: 14 }}>‹</button>
                  <span className="tabular-nums" style={{ fontSize: 14, color: M.text, fontWeight: 600, minWidth: 34, textAlign: 'center' }}>{gpuPage + 1} / {GPU_PAGES}</span>
                  <button type="button" aria-label="다음 GPU 페이지" onClick={() => setGpuPage((p) => Math.min(GPU_PAGES - 1, p + 1))} disabled={gpuPage === GPU_PAGES - 1}
                    className="flex items-center justify-center rounded-[6px] transition-colors hover:enabled:bg-soft disabled:opacity-40"
                    style={{ width: 24, height: 24, border: `1px solid ${M.border}`, color: M.text, fontSize: 14 }}>›</button>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 flex-1 min-h-0" style={{ gap: 10, gridAutoRows: 'minmax(0, 1fr)' }}>
              {GPU_POOL.slice(gpuPage * GPU_PAGE_SIZE, gpuPage * GPU_PAGE_SIZE + GPU_PAGE_SIZE).map((gt) => gpuCard(gt))}
            </div>
            <style>{`.model-slider{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;height:22px;outline:none}
.model-slider::-webkit-slider-runnable-track{background:transparent;height:22px}
.model-slider::-moz-range-track{background:transparent;height:22px}
.model-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--c-card2);border:2px solid var(--c-accent);box-shadow:0 1px 4px rgba(0,0,0,.22);margin-top:2px}
.model-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--c-card2);border:2px solid var(--c-accent);box-shadow:0 1px 4px rgba(0,0,0,.22)}
.model-slider:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px var(--accent-soft)}`}</style>
          </div>
        )}

        {formFor === 3 && (
          <div className="flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 16 }}>사용법 안내</h3>
            <FieldLabel text="엔드포인트" help="모델 배포 후 추론 요청을 보낼 API 경로입니다. 게이트웨이 호스트 뒤에 붙어 전체 호출 주소가 됩니다." />
            <input value={f.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="/v1/models/..." className="shrink-0" style={{ ...inputBase, fontFamily: 'var(--font-mono)' }} />
            <div className="flex items-center gap-2 shrink-0 rounded-[8px]" style={{ marginTop: 8, marginBottom: 16, padding: '8px 12px', background: 'var(--c-soft)', border: '1px solid var(--c-border-s)' }}>
              <span className="shrink-0" style={{ fontSize: 14, color: M.help }}>전체 주소 예시</span>
              <span className="truncate" style={{ fontSize: 14, color: M.text, fontFamily: 'var(--font-mono)' }}>{API_HOST}{f.endpoint || '/v1/models/...'}</span>
            </div>
            <FieldLabel text="사용 가이드" help="호출 방법·제약·권장 파라미터 등." />
            <textarea value={f.usageGuide} maxLength={400} onChange={(e) => set('usageGuide', e.target.value)} placeholder="예: OpenAI 호환 chat/completions 엔드포인트. max_tokens 4096 권장." className="shrink-0" style={{ ...inputBase, height: 96, padding: '12px 14px', resize: 'none', lineHeight: 1.5, marginBottom: 16 }} />
            <FieldLabel text="예시 코드" help="(선택) 호출 예시 스니펫. 남는 공간을 채웁니다." />
            <textarea value={f.exampleCode} onChange={(e) => set('exampleCode', e.target.value)} placeholder={'curl -X POST $HOST/v1/chat/completions \\\n  -H "Authorization: Bearer $KEY" \\\n  -d \'{"model":"...","messages":[...]}\''} className="flex-1 min-h-0" style={{ ...inputBase, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: 1.5, fontFamily: 'var(--font-mono)', fontSize: 14 }} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>이전</Button>
        <div className="flex items-center gap-3">
          {!canNext && <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>필수 항목을 입력해주세요.</span>}
          <Button onClick={() => setStep((s) => Math.min(5, s + 1))} disabled={!canNext}>{step === 4 ? '검토하기' : '다음'}</Button>
        </div>
      </div>
    </div>
  )

  // ── 본문 ──
  let body: ReactNode
  if (terminal && req && req.stage === 'deployed' && deployedModel) {
    // 배포 완료 — 읽기전용 모델 명세서(중앙 morph 레이아웃 그대로)
    const doneForm = formFromModel(deployedModel)
    const doneFooter = (
      <>
        <div className="flex items-center flex-wrap" style={{ gap: '4px 10px', fontSize: 14, color: M.help, marginBottom: 10 }}>
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--c-ok)' }}>
            <CheckCircleIcon style={{ width: 15, height: 15 }} />배포 완료
          </span>
          {req.processedAt && <span>· 처리 {req.processedAt}</span>}
          {req.processedBy && <span>· 처리자 {req.processedBy}</span>}
          {req.checksum && <span>· <span style={{ fontFamily: 'var(--font-mono)' }}>{req.checksum}</span></span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate(LIST_PATH)}>목록으로</Button>
          <Button onClick={() => navigate('/models')} className="flex-1 justify-center">카탈로그에서 보기</Button>
        </div>
      </>
    )
    body = (
      <div className="anim-fade flex-1 min-h-0 flex justify-center">
        <div className="flex flex-col min-h-0" style={{ maxWidth: 880, width: '100%' }}>
          <ModelSpecSheet f={doneForm} recommend={recommend} reviewing readonly currentStep={-1} onEdit={() => {}} onDeploy={() => {}} onBack={() => {}} canDeploy={false} footer={doneFooter} />
        </div>
      </div>
    )
  } else if (terminal && req) {
    body = <ResultView req={req} />
  } else if (step === 0) {
    // 스텝 1 — 모델 업로드 (박스 채움 카드 + 다음 푸터)
    body = (
      <div className="flex-1 min-h-0 flex">
        <div className="flex flex-col min-h-0 w-full mx-auto" style={{ maxWidth: 820 }}>
          <div className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex-1 min-h-0 flex flex-col" style={{ padding: '22px 26px' }}>
              <UploadBody req={req} onUpload={onUpload} />
            </div>
            <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
              <Button variant="ghost" onClick={() => navigate(LIST_PATH)}>
                <ArrowLeftIcon style={{ width: 15, height: 15 }} />
                목록으로
              </Button>
              <div className="flex items-center gap-3">
                {!uploaded && <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>파일을 업로드하면 진행할 수 있어요.</span>}
                <Button onClick={() => setStep(1)} disabled={!uploaded}>다음</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } else if (step === 1 && req) {
    // 스텝 2 — 보안 스캔 (박스 채움 카드 · 내용 수직 중앙) + 이전(업로드)·다음(명세)
    body = (
      <div className="flex-1 min-h-0 flex">
        <div className="flex flex-col min-h-0 w-full mx-auto" style={{ maxWidth: 820 }}>
          <div className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-auto" style={{ padding: '24px 28px' }}>
              {scanning ? (
                <ScanGauge req={req} onDone={onScanDone} />
              ) : (
                <div className="flex flex-col w-full" style={{ maxWidth: 580, margin: '0 auto' }}>
                  {/* 상태 헤더 — 통과/실패 */}
                  <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                    <span className="flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 46, height: 46, background: scanOk ? 'var(--ok-soft)' : 'var(--danger-soft)', color: scanOk ? 'var(--c-ok)' : 'var(--c-danger)' }}>
                      {scanOk ? <ShieldCheckIcon style={{ width: 26, height: 26 }} /> : <XCircleIcon style={{ width: 26, height: 26 }} />}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate" style={{ fontSize: 17, color: scanOk ? 'var(--c-text)' : 'var(--c-danger)' }}>{scanOk ? '보안 점검 통과' : '보안 점검 실패'}</h3>
                      <p className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 2 }}>
                        {req.modelName} · <span style={{ fontFamily: 'var(--font-mono)' }}>{req.fileName}</span>
                      </p>
                    </div>
                  </div>
                  {[
                    { ok: true, text: 'safetensors 포맷 검증 — 직렬화 안전 포맷 확인' },
                    { ok: true, text: 'modelscan — 악성 코드 패턴 미검출' },
                    { ok: scanOk, text: scanOk ? 'picklescan — 위험 직렬화 미검출' : 'picklescan — 위험 직렬화 코드 검출' },
                    { ok: scanOk, text: scanOk ? '체크섬(SHA-256) 산출 완료' : '체크섬(SHA-256) — 무결성 확인 보류' },
                  ].map((r) => (
                    <div key={r.text} className="flex items-center gap-3" style={{ padding: '12px 0', borderBottom: '1px solid var(--c-border-s)' }}>
                      <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 24, height: 24, background: r.ok ? 'var(--ok-soft)' : 'var(--danger-soft)', color: r.ok ? 'var(--c-ok)' : 'var(--c-danger)' }}>
                        {r.ok ? <CheckIcon style={{ width: 14, height: 14 }} /> : <XMarkIcon style={{ width: 14, height: 14 }} />}
                      </span>
                      <span className="flex-1 min-w-0" style={{ fontSize: 14, color: 'var(--c-text)' }}>{r.text}</span>
                      <span className="shrink-0" style={{ fontSize: 14, color: r.ok ? 'var(--c-ok)' : 'var(--c-danger)' }}>{r.ok ? '통과' : '실패'}</span>
                    </div>
                  ))}
                  <div className="rounded-[10px]" style={{ marginTop: 16, padding: '12px 14px', background: scanOk ? 'var(--ok-soft)' : 'var(--danger-soft)', fontSize: 14, color: scanOk ? 'var(--c-ok)' : 'var(--c-danger)', lineHeight: 1.5 }}>
                    {scanOk
                      ? '모든 점검을 통과했습니다. 명세 등록을 진행하세요.'
                      : 'picklescan에서 위험 직렬화(pickle) 코드가 검출되었습니다. 안전한 safetensors 포맷으로 다시 업로드하거나 신청을 반려하세요.'}
                  </div>
                  {req.checksum && scanOk && (
                    <p className="flex items-center gap-2 flex-wrap" style={{ fontSize: 14, color: M.help, marginTop: 12 }}>
                      <span>파일 체크섬 (SHA-256)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{req.checksum}</span>
                    </p>
                  )}
                  {!scanOk && (
                    <div style={{ marginTop: 16 }}>
                      <FieldLabel text="반려 사유" help="신청자에게 그대로 전달됩니다. 필요 시 수정하세요." />
                      <textarea
                        value={rejectReason}
                        maxLength={300}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="반려 사유를 입력하세요."
                        style={{ ...inputBase, height: 84, padding: '12px 14px', resize: 'none', lineHeight: 1.5 }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeftIcon style={{ width: 15, height: 15 }} />
                이전
              </Button>
              <div className="flex items-center gap-3">
                {scanning && <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>스캔 완료 후 진행할 수 있어요.</span>}
                {scanned && !scanOk ? (
                  <Button variant="danger" onClick={reject} disabled={!rejectReason.trim()}>
                    <XCircleIcon style={{ width: 15, height: 15 }} />
                    신청 반려
                  </Button>
                ) : (
                  <Button onClick={() => setStep(2)} disabled={!canNext}>다음</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } else if (req) {
    // 스텝 3~6 명세/자원/사용법/검토 — 좌 멀티스텝 + 우 명세서 morph
    body = (
      <MorphFrame
        reviewing={reviewing}
        wizard={formCard}
        sheet={<ModelSpecSheet f={f} recommend={recommend} reviewing={reviewing} currentStep={step - 1} onEdit={(i) => setStep(i + 1)} onDeploy={deploy} onBack={() => setStep(4)} canDeploy={canDeploy} />}
      />
    )
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={{ minHeight: '100%' }}>
      <header className="flex flex-col shrink-0">
        <div className="flex items-center" style={{ gap: 10 }}>
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={() => navigate(LIST_PATH)}
            className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors shrink-0"
            style={{ width: 34, height: 34 }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <h1 className="font-bold" style={{ fontSize: 23, lineHeight: 1.2, color: 'var(--c-text)' }}>신규 모델 반입</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 6 }}>{terminal ? (req?.stage === 'deployed' ? '배포 완료된 모델입니다.' : '반려된 신청입니다.') : subtitle}</p>
      </header>

      {!terminal && (
        <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
          <Stepper steps={STEPS} current={step} />
        </section>
      )}

      {/* 스텝 전환 — 박스 크기가 달라지는 주요 전환(업로드→스캔→명세→결과)에서 가로로 스르륵 슬라이드.
          앞으로 가면 오른쪽에서, 뒤로 가면 왼쪽에서 들어온다. 마법사 내부(명세↔자원↔사용법↔검토)는
          phase 키가 'wizard' 로 유지돼 MorphFrame 의 morph 가 그대로 작동(이중 애니메이션 방지). */}
      <div
        key={terminal ? 'terminal' : step === 0 ? 'upload' : step === 1 ? 'scan' : 'wizard'}
        className={`${step >= prevStepRef.current ? 'step-fwd' : 'step-back'} flex-1 min-h-0 flex flex-col`}
        style={{ marginTop: terminal ? 18 : 14 }}
      >
        {body}
      </div>
      {/* 검토·배포 morph 와 동일 이징(cubic-bezier(.65,0,.35,1))·느린 글라이드로 스르륵.
          index.css 전역 prefers-reduced-motion 이 animation-duration 을 0.001ms 로 죽이므로,
          morph([data-morph]) 처럼 !important 로 예외 처리해 항상 재생되게 한다(높은 특이도 + !important). */}
      <style>{`
.step-fwd{animation:stepFwd .62s cubic-bezier(.65,0,.35,1) both !important}
.step-back{animation:stepBack .62s cubic-bezier(.65,0,.35,1) both !important}
@keyframes stepFwd{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:none}}
@keyframes stepBack{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}}
`}</style>
    </div>
  )
}
