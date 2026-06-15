import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  ShieldCheckIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Button } from '../components/ui'
import { models } from '../data'
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
  SelectCard,
  Stepper,
  inputBase,
} from './model-wizard-ui'
import {
  addLocalModel,
  addLocalRequest,
  getLocalModels,
  nextModelId,
  nextRequestId,
  patchRequest,
  useModelRequests,
} from './model-requests-shared'

// G5 · 4.14 관리자 모델 반입(A 전용, 별도 페이지) — 드래그 업로드 → 보안 스캔 →
// 스캔 완료 → 5단계 멀티스텝(명세·자원·사용법·검토 morph) → 배포(카탈로그+마켓).
// 라우트/App.tsx 등록은 deny → 메인에서 연결(보고). 화면·로직은 모두 구현.

const LIST_PATH = '/admin/models/requests'
const WIZARD_STEPS = ['스캔 결과', '명세 등록', '자원 요건', '사용법', '검토 · 배포']
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

// ── 업로드(드래그&드롭) ──
function UploadView({ req, onUpload }: { req: ModelRequest | null; onUpload: (fileName: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const take = (list: FileList | null | undefined) => {
    const file = list?.[0]
    if (file) onUpload(file.name)
  }
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16, maxWidth: 760, width: '100%', margin: '0 auto' }}>
      {req && (
        <div className="bg-card2 border border-line rounded-[12px] flex items-center gap-3" style={{ padding: '13px 16px', boxShadow: 'var(--shadow-card)' }}>
          <span className="font-bold truncate" style={{ fontSize: 15, color: 'var(--c-text)' }}>{req.modelName}</span>
          <span className="shrink-0" style={{ fontSize: 13, color: 'var(--c-muted)' }}>신청자 {req.requesterUserId}</span>
        </div>
      )}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files) }}
        className="flex flex-col items-center justify-center text-center cursor-pointer rounded-[16px] transition-colors"
        style={{
          minHeight: 320,
          border: `2px dashed ${drag ? M.blue : M.border}`,
          background: drag ? M.activeBg : 'var(--c-card2)',
          padding: 32,
          boxShadow: 'var(--shadow-card)',
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
        <span style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 12, fontFamily: 'var(--font-mono)' }}>.safetensors · .bin · .gguf · .pt · .onnx</span>
      </div>
    </div>
  )
}

// ── 보안 스캔 진행 ──
function ScanView({ req, onDone }: { req: ModelRequest; onDone: () => void }) {
  const navigate = useNavigate()
  const [pct, setPct] = useState(8)
  const doneRef = useRef(false)
  useEffect(() => {
    const t = window.setInterval(() => {
      setPct((p) => {
        const next = Math.min(100, p + 4 + Math.round(p / 24))
        if (next >= 100 && !doneRef.current) {
          doneRef.current = true
          window.clearInterval(t)
          window.setTimeout(onDone, 480)
        }
        return next
      })
    }, 320)
    return () => window.clearInterval(t)
  }, [onDone])

  const stepState = (i: number): 'done' | 'active' | 'wait' => {
    const lo = i * 25
    if (pct >= lo + 25) return 'done'
    if (pct >= lo) return 'active'
    return 'wait'
  }

  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16, maxWidth: 680, width: '100%', margin: '0 auto' }}>
      <div className="bg-card2 border border-line rounded-[16px] flex flex-col" style={{ padding: '28px 30px', boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 48, height: 48, background: M.activeBg, color: M.blue }}>
            <ShieldCheckIcon style={{ width: 28, height: 28 }} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold truncate" style={{ fontSize: 18, color: 'var(--c-text)' }}>보안을 위해 검토 중입니다</h2>
            <p className="truncate" style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 3 }}>
              {req.modelName} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{req.fileName}</span>
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
                <span className="shrink-0" style={{ fontSize: 13, color: st === 'done' ? 'var(--c-ok)' : st === 'active' ? M.blue : 'var(--c-muted)' }}>
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
      </div>
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeftIcon style={{ width: 15, height: 15 }} />
          목록으로
        </Button>
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
        <h2 className="font-bold" style={{ fontSize: 19, marginTop: 18, color: 'var(--c-text)' }}>{deployed ? '배포 완료된 모델입니다' : '반려된 신청입니다'}</h2>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.55, marginTop: 8 }}>
          {deployed ? `${req.modelName} 은(는) 카탈로그와 마켓플레이스에 노출되고 있습니다.` : req.rejectReason ?? '보안 점검 또는 검토 단계에서 반려되었습니다.'}
        </p>
        <div className="flex items-center gap-2" style={{ marginTop: 22 }}>
          <Button variant="outline" onClick={() => navigate(LIST_PATH)}>목록으로</Button>
          {deployed && req.registeredModelId && <Button onClick={() => navigate(`/models/${req.registeredModelId}`)}>카탈로그에서 보기</Button>}
        </div>
      </div>
    </div>
  )
}

// ── 명세서(우측) — 멀티스텝 입력 실시간 반영 → 검토 시 센터 morph ──
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

function SectionTitle({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5" style={{ margin: '14px 0 4px' }}>
      <span className="font-bold shrink-0" style={{ fontSize: 14, color: M.text }}>{text}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
    </div>
  )
}

function ModelSpecSheet({ f, recommend, reviewing, onDeploy, onBack, canDeploy }: {
  f: SpecForm
  recommend: Recommend
  reviewing: boolean
  onDeploy: () => void
  onBack: () => void
  canDeploy: boolean
}) {
  const tagsText = f.tags.length ? f.tags.join(', ') : ''
  const resText = f.vram && f.ram && f.storage && f.cpu
    ? `VRAM ${f.vram}GB · RAM ${f.ram}GB · 저장 ${f.storage}GB · CPU ${f.cpu}코어`
    : ''
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
                <span className="shrink-0 font-semibold rounded-[6px]" style={{ fontSize: 13, padding: '2px 9px', background: M.activeBg, color: M.blue }}>{f.kind}</span>
              </div>
              <p className="truncate" style={{ fontSize: 13, color: M.help, marginTop: 3 }}>카탈로그 등록 명세서 · {f.params || '규모 미정'}</p>
            </div>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-ok)' : M.blue}`, color: reviewing ? 'var(--c-ok)' : M.blue, background: reviewing ? 'var(--ok-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '배포' : '초안'}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '6px 18px 14px' }}>
          <SectionTitle text="기본 명세" />
          <SheetRow label="태그" value={tagsText ? f.tags.map((t) => (
            <span key={t} className="inline-block rounded-[5px]" style={{ fontSize: 13, padding: '1px 8px', margin: '2px 4px 2px 0', background: M.activeBg, color: M.blue }}>{t}</span>
          )) : ''} pendingW="55%" reviewing={reviewing} />
          <SheetRow label="설명" value={f.description} pendingW="92%" reviewing={reviewing} />
          <SheetRow label="라이선스" value={f.license} pendingW="40%" reviewing={reviewing} last />

          <SectionTitle text="자원 요건" />
          <SheetRow label="최소 자원" value={resText} pendingW="85%" reviewing={reviewing} />
          <SheetRow label="권장 GPU" value={f.recommendedGpu} pendingW="45%" reviewing={reviewing} last />

          <SectionTitle text="사용법" />
          <SheetRow label="엔드포인트" value={f.endpoint ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{f.endpoint}</span> : ''} pendingW="70%" reviewing={reviewing} />
          <SheetRow label="가이드" value={f.usageGuide} pendingW="88%" reviewing={reviewing} last />
          {f.exampleCode && (
            <pre className="anim-fade rounded-[8px] overflow-auto" style={{ marginTop: 10, padding: '11px 13px', background: 'var(--c-bg)', border: `1px solid ${M.border}`, fontSize: 12.5, fontFamily: 'var(--font-mono)', color: M.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.exampleCode}</pre>
          )}
          {!reviewing && (
            <div className="rounded-[8px]" style={{ marginTop: 12, padding: '10px 12px', border: '1px dashed var(--c-border)', fontSize: 13, color: M.help, lineHeight: 1.5 }}>
              스캔에서 산출한 추천 자원: VRAM {recommend.vram}GB · RAM {recommend.ram}GB · 저장 {recommend.storage}GB · CPU {recommend.cpu}코어
            </div>
          )}
        </div>

        {reviewing && (
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

// ── 5단계 멀티스텝(스캔완료 → 배포) ──
function WizardView({ req }: { req: ModelRequest }) {
  const navigate = useNavigate()
  const { user } = useRole()
  const imgRef = useRef<HTMLInputElement>(null)
  const recommend = recommendResources(req.modelName)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [f, setF] = useState<SpecForm>(() => ({
    name: req.modelName,
    kind: req.kind ?? 'LLM',
    tags: req.kind ? [req.kind] : [],
    description: '',
    license: 'Apache-2.0',
    params: '',
    recommendedGpu: '',
    vram: String(recommend.vram),
    ram: String(recommend.ram),
    storage: String(recommend.storage),
    cpu: String(recommend.cpu),
    usageGuide: '',
    exampleCode: '',
    endpoint: `/v1/models/${req.modelName.toLowerCase().replace(/[\s_]+/g, '-')}`,
  }))
  const set = <K extends keyof SpecForm>(k: K, v: SpecForm[K]) => setF((p) => ({ ...p, [k]: v }))
  const [tagDraft, setTagDraft] = useState('')

  const scanOk = req.scan !== 'fail'
  const valid = [
    scanOk,
    Boolean(f.name.trim() && f.description.trim()),
    Boolean(f.vram && f.ram && f.storage && f.cpu),
    true,
  ]
  const reviewing = step === 4
  const wizardStep = reviewing ? 3 : step
  const canNext = valid[Math.min(step, 3)]
  const go = (d: number) => setStep((s) => Math.max(0, Math.min(WIZARD_STEPS.length - 1, s + d)))

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

  const deploy = () => {
    const modelId = nextModelId()
    const model: Model = {
      id: modelId,
      name: f.name.trim(),
      kind: f.kind,
      description: f.description.trim(),
      addons: f.tags.filter((t) => t !== f.kind),
      license: f.license.trim() || 'Apache-2.0',
      recommendedGpu: f.recommendedGpu.trim() || `VRAM ${f.vram}GB+`,
      params: f.params.trim() || '—',
      usageRank: models.length + getLocalModels().length + 1,
      usageCount: 0,
      reqVramGb: Number(f.vram), reqRamGb: Number(f.ram), reqStorageGb: Number(f.storage), reqCpuCores: Number(f.cpu),
    }
    addLocalModel(model)
    patchRequest(req.id, { stage: 'deployed', status: 'approved', processedAt: fmtNow(), processedBy: user.id, scan: 'pass', registeredModelId: modelId })
    setDone(true)
  }

  if (done) {
    return (
      <div className="anim-fade flex items-center justify-center" style={{ flex: 1, minHeight: 0 }}>
        <div className="bg-card2 border border-line rounded-[16px] flex flex-col items-center text-center" style={{ padding: '42px 46px', maxWidth: 460, width: '100%', boxShadow: 'var(--shadow-card)' }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: 'var(--ok-soft)', color: 'var(--c-ok)' }}>
            <CheckCircleIcon style={{ width: 36, height: 36 }} />
          </span>
          <h2 className="font-bold" style={{ fontSize: 19, marginTop: 18, color: 'var(--c-text)' }}>배포가 완료되었습니다</h2>
          <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.55, marginTop: 8 }}>{f.name} 이(가) 카탈로그와 마켓플레이스에 노출됩니다.</p>
          <div className="flex items-center gap-2" style={{ marginTop: 22 }}>
            <Button variant="outline" onClick={() => navigate(LIST_PATH)}>목록으로</Button>
            <Button onClick={() => navigate('/models')}>카탈로그로</Button>
          </div>
        </div>
      </div>
    )
  }

  const numField = (label: string, key: 'vram' | 'ram' | 'storage' | 'cpu', unit: string, rec: number) => (
    <div>
      <FieldLabel text={label} required />
      <div className="relative">
        <input
          type="number" min={0} value={f[key]} onChange={(e) => set(key, e.target.value)}
          style={{ ...inputBase, paddingRight: 92 }}
        />
        <span className="absolute" style={{ right: 14, top: 13, fontSize: 13, color: M.meta }}>{unit}</span>
      </div>
      <button type="button" onClick={() => set(key, String(rec))} className="hover:underline" style={{ fontSize: 13, color: M.blueText, marginTop: 6 }}>
        추천 {rec}{unit} 적용
      </button>
    </div>
  )

  const ScanResultRow = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-3" style={{ padding: '12px 0', borderBottom: '1px solid var(--c-border-s)' }}>
      <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 24, height: 24, background: ok ? 'var(--ok-soft)' : 'var(--danger-soft)', color: ok ? 'var(--c-ok)' : 'var(--c-danger)' }}>
        {ok ? <CheckIcon style={{ width: 14, height: 14 }} /> : <XMarkIcon style={{ width: 14, height: 14 }} />}
      </span>
      <span className="flex-1 min-w-0" style={{ fontSize: 14, color: 'var(--c-text)' }}>{text}</span>
      <span className="shrink-0" style={{ fontSize: 13, color: ok ? 'var(--c-ok)' : 'var(--c-danger)' }}>{ok ? '통과' : '실패'}</span>
    </div>
  )

  const wizardCard: ReactNode = (
    <div className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ padding: '22px 26px' }}>
        {wizardStep === 0 && (
          <div className="flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 4 }}>모델 스캔 결과</h3>
            <p className="shrink-0" style={{ fontSize: 13, color: M.help, marginBottom: 14 }}>보안 점검을 통과해야 다음 단계로 진행할 수 있어요.</p>
            <div className="flex flex-col">
              <ScanResultRow ok text="safetensors 포맷 검증 — 직렬화 안전 포맷 확인" />
              <ScanResultRow ok text="modelscan — 악성 코드 패턴 미검출" />
              <ScanResultRow ok={scanOk} text={scanOk ? 'picklescan — 위험 직렬화 미검출' : 'picklescan — 위험 직렬화 코드 검출'} />
              <ScanResultRow ok text="체크섬(SHA-256) 산출 완료" />
            </div>
            <div className="rounded-[10px]" style={{ marginTop: 16, padding: '12px 14px', background: scanOk ? 'var(--ok-soft)' : 'var(--danger-soft)', fontSize: 14, color: scanOk ? 'var(--c-ok)' : 'var(--c-danger)', lineHeight: 1.5 }}>
              {scanOk ? '모든 점검을 통과했습니다. 명세 등록을 진행하세요.' : '위험 항목이 검출되어 진행할 수 없습니다. 신청을 반려하세요.'}
            </div>
            {req.checksum && <p style={{ fontSize: 13, color: M.help, marginTop: 12, fontFamily: 'var(--font-mono)' }}>{req.checksum}</p>}
          </div>
        )}

        {wizardStep === 1 && (
          <div className="flex flex-col flex-1 min-h-0 overflow-auto" style={{ marginRight: -6, paddingRight: 6 }}>
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
                  <span key={t} className="inline-flex items-center gap-1.5 rounded-[6px]" style={{ fontSize: 13, padding: '3px 8px', background: M.activeBg, color: M.blue }}>
                    {t}
                    <button type="button" onClick={() => set('tags', f.tags.filter((x) => x !== t))} aria-label="태그 제거"><XMarkIcon style={{ width: 13, height: 13 }} /></button>
                  </span>
                ))}
              </div>
            )}
            <FieldLabel text="설명" required />
            <textarea value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} placeholder="모델 용도·특징을 한두 문장으로." style={{ ...inputBase, height: 84, padding: '12px 14px', resize: 'none', lineHeight: 1.5, marginBottom: 18 }} />
            <div className="grid grid-cols-2" style={{ gap: 14, marginBottom: 18 }}>
              <div><FieldLabel text="파라미터 규모" /><input value={f.params} onChange={(e) => set('params', e.target.value)} placeholder="예: 72B" style={inputBase} /></div>
              <div><FieldLabel text="라이선스" /><input value={f.license} onChange={(e) => set('license', e.target.value)} placeholder="예: Apache-2.0" style={inputBase} /></div>
            </div>
            <FieldLabel text="프로필 이미지" help="없으면 모델명 이니셜로 자동 생성됩니다. (선택)" />
            <div className="flex items-center gap-3 shrink-0">
              <ModelAvatar name={f.name || '모델'} img={f.imageUrl} size={52} />
              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => imgRef.current?.click()}><PhotoIcon style={{ width: 15, height: 15 }} />이미지 선택</Button>
              {f.imageUrl && <button type="button" onClick={() => set('imageUrl', undefined)} className="hover:underline" style={{ fontSize: 13, color: M.help }}>제거</button>}
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="flex flex-col flex-1 min-h-0">
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 4 }}>최소 자원 요건</h3>
            <p className="shrink-0" style={{ fontSize: 13, color: M.help, marginBottom: 18 }}>스캔에서 산출한 추천값이 채워져 있어요. 필요 시 조정하세요.</p>
            <div className="grid grid-cols-2" style={{ gap: 16 }}>
              {numField('VRAM', 'vram', 'GB', recommend.vram)}
              {numField('시스템 RAM', 'ram', 'GB', recommend.ram)}
              {numField('저장공간', 'storage', 'GB', recommend.storage)}
              {numField('CPU 코어', 'cpu', '코어', recommend.cpu)}
            </div>
            <div style={{ marginTop: 18 }}>
              <FieldLabel text="권장 GPU" help="(선택) 비우면 VRAM 기준으로 자동 표기됩니다." />
              <input value={f.recommendedGpu} onChange={(e) => set('recommendedGpu', e.target.value)} placeholder="예: H100 80GB ×4" style={inputBase} />
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="flex flex-col flex-1 min-h-0 overflow-auto" style={{ marginRight: -6, paddingRight: 6 }}>
            <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 18 }}>사용법 안내</h3>
            <FieldLabel text="엔드포인트" />
            <input value={f.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="/v1/models/..." style={{ ...inputBase, fontFamily: 'var(--font-mono)', marginBottom: 18 }} />
            <FieldLabel text="사용 가이드" help="호출 방법·제약·권장 파라미터 등." />
            <textarea value={f.usageGuide} maxLength={400} onChange={(e) => set('usageGuide', e.target.value)} placeholder="예: OpenAI 호환 chat/completions 엔드포인트. max_tokens 4096 권장." style={{ ...inputBase, height: 90, padding: '12px 14px', resize: 'none', lineHeight: 1.5, marginBottom: 18 }} />
            <FieldLabel text="예시 코드" help="(선택) 호출 예시 스니펫." />
            <textarea value={f.exampleCode} onChange={(e) => set('exampleCode', e.target.value)} placeholder={'curl -X POST $HOST/v1/chat/completions \\\n  -H "Authorization: Bearer $KEY"'} style={{ ...inputBase, height: 120, padding: '12px 14px', resize: 'none', lineHeight: 1.5, fontFamily: 'var(--font-mono)', fontSize: 13 }} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
        <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>이전</Button>
        <div className="flex items-center gap-3">
          {!canNext && <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>{step === 0 ? '점검 통과 후 진행할 수 있어요.' : '필수 항목을 입력해주세요.'}</span>}
          <Button onClick={() => go(1)} disabled={!canNext}>{step === 3 ? '검토하기' : '다음'}</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col min-h-0 h-full">
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px' }}>
        <Stepper steps={WIZARD_STEPS} current={step} />
      </section>
      <MorphFrame
        reviewing={reviewing}
        wizard={wizardCard}
        sheet={<ModelSpecSheet f={f} recommend={recommend} reviewing={reviewing} onDeploy={deploy} onBack={() => setStep(3)} canDeploy={valid[0] && valid[1] && valid[2]} />}
      />
    </div>
  )
}

// ── 메인 ──
export function ModelImport() {
  const navigate = useNavigate()
  const requests = useModelRequests()
  const [params] = useSearchParams()
  const idParam = params.get('id')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const { user } = useRole()

  const id = idParam ?? createdId
  const req = id ? requests.find((r) => r.id === id) ?? null : null

  const onUpload = (fileName: string) => {
    const patch: Partial<ModelRequest> = { stage: 'scanning', fileName, format: 'safetensors', scan: 'pending' }
    if (req) {
      patchRequest(req.id, patch)
    } else {
      const newId = nextRequestId()
      addLocalRequest({
        id: newId, requesterUserId: user.id, modelName: guessModelName(fileName), kind: 'LLM',
        reason: '관리자 직접 반입', status: 'pending', stage: 'scanning', createdAt: fmtNow(),
        fileName, format: 'safetensors', scan: 'pending',
      })
      setCreatedId(newId)
    }
  }
  const onScanDone = () => {
    if (req) patchRequest(req.id, { stage: 'scanned', scan: 'pass', checksum: 'sha256:' + req.id.replace(/\D/g, '').padEnd(4, '0') + '…' + 'a1f3' })
  }

  // 단계별 뷰 — req 없음/requested=업로드, scanning=스캔, scanned=멀티스텝, deployed/rejected=결과.
  let body: ReactNode
  let subtitle: string
  if (!req || req.stage === 'requested') {
    subtitle = req ? '신청된 모델을 반입합니다. 파일을 업로드하면 보안 점검이 시작됩니다.' : '신규 모델 파일을 반입합니다. 업로드 시 보안 점검이 시작됩니다.'
    body = <UploadView req={req} onUpload={onUpload} />
  } else if (req.stage === 'scanning') {
    subtitle = '서버에서 보안 점검이 진행 중입니다.'
    body = <ScanView req={req} onDone={onScanDone} />
  } else if (req.stage === 'scanned') {
    subtitle = '보안 점검을 통과했습니다. 명세·자원·사용법을 등록하고 배포하세요.'
    body = <WizardView req={req} />
  } else {
    subtitle = req.stage === 'deployed' ? '배포 완료된 모델입니다.' : '반려된 신청입니다.'
    body = <ResultView req={req} />
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={{ minHeight: '100%' }}>
      <header className="flex flex-col shrink-0">
        <button type="button" onClick={() => navigate(LIST_PATH)} className="inline-flex items-center gap-1.5 self-start transition-colors" style={{ fontSize: 14, color: 'var(--c-muted)' }}>
          <ArrowLeftIcon style={{ width: 15, height: 15 }} />
          모델 신청 관리
        </button>
        <h1 className="font-bold" style={{ fontSize: 22, lineHeight: 1.2, marginTop: 12, color: 'var(--c-text)' }}>신규 모델 반입</h1>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 6 }}>{subtitle}</p>
      </header>
      <div className="flex-1 min-h-0 flex flex-col" style={{ marginTop: 18 }}>{body}</div>
    </div>
  )
}
