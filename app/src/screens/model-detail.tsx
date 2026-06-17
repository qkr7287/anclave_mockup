import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { services } from '../data'
import type { Model, Service } from '../data/types'
import { useRole } from '../lib/role'
import { Logo, providerName } from './catalog'
import { createRequest, deleteModel, deleteRequest, patchRequest, useCatalogModels, useModelRequests } from './model-requests-shared'
import { M, SectionHead, SpecSection } from './model-wizard-ui'

// G5 · 4.13 모델 상세 — 카탈로그(4.12)에서 모델 클릭 시 진입. 라우팅(/models/:id)·App.tsx 는 기존 그대로.
// 좌: 이 모델을 쓰는 서비스 현황 + 상세 사용률 추이, 우: 신청 관리(4.14) 명세서 톤의 모델 명세.
// 관리자(A): 모델 회수(배포 중단·재배포 가능) / 등록 취소(영구 삭제) — 확인 팝업 후 DB(63) 반영.
// 색=앱 공통 토큰(var(--c-*)) 자동 라이트/다크. 본문 14px floor(차트 축만 12 허용).

const TOKENS_PER_REQ = 5400
const END_DATE = new Date('2026-06-15T00:00:00') // deterministic 기준일(Math.random·argless Date 미사용)

const fmtReq = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`
const fmtTok = (n: number) =>
  n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(2)}B` : n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : `${Math.round(n / 1000)}K`

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'model'
}

// 모델 소개(description)는 '요약 2문장 + 빈 줄 + 불릿' 구조 → 위치별로 분량 차등 노출.
// 헤더/명세서엔 요약만, '모델 소개' 박스엔 전체.
const descSummary = (d?: string): string => (d ?? '').split('\n\n')[0].trim()
const descLead = (d?: string): string => {
  const s = descSummary(d)
  const i = s.indexOf('. ')
  return i > 0 ? s.slice(0, i + 1) : s
}

interface CountPoint {
  label: string
  count: number
}
// 이 모델을 '가져다 쓴 서비스 수' 추이 — 최근 6개월 누적 채택(deterministic). total=현재 사용 서비스 수.
function serviceCountSeries(total: number): CountPoint[] {
  const out: CountPoint[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(END_DATE)
    d.setMonth(d.getMonth() - (5 - i))
    out.push({ label: `${d.getMonth() + 1}월`, count: i === 5 ? total : Math.round((total * (i + 1)) / 6) })
  }
  return out
}

// ── 가져다 쓴 서비스 수 추이(월별 누적 채택, area+line+값) ──
function ServiceTrendChart({ data }: { data: CountPoint[] }) {
  const W = 720
  const H = 130
  const max = Math.max(2, ...data.map((d) => d.count)) * 1.25
  const px = (i: number) => (i * W) / (data.length - 1)
  const py = (v: number) => H * (1 - v / max)
  const line = data.map((d, i) => `${px(i)},${py(d.count)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const top = Math.ceil(max)
  const yTicks = [top, Math.round(top / 2), 0]
  return (
    <div>
      <div className="flex" style={{ gap: 10 }}>
        <div className="flex flex-col justify-between shrink-0 text-right" style={{ width: 24, height: H }}>
          {yTicks.map((t, i) => (
            <span key={i} className="tabular-nums" style={{ fontSize: 14, color: M.idle }}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0" style={{ height: H }}>
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (<span key={i} style={{ height: 1, background: 'var(--c-border)', opacity: 0.6 }} />))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
            <defs>
              <linearGradient id="svcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#svcArea)" />
            <polyline points={line} fill="none" stroke="var(--c-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* 각 월 데이터 점 + 값 */}
          {data.map((d, i) => (
            <span key={i} className="absolute" style={{ left: `${(i / (data.length - 1)) * 100}%`, top: `${(py(d.count) / H) * 100}%`, transform: 'translate(-50%, -50%)' }}>
              <span className="block rounded-full" style={{ width: 8, height: 8, background: 'var(--c-accent)', border: '2px solid var(--c-card2)' }} />
              <span className="absolute tabular-nums font-bold" style={{ left: '50%', bottom: 12, transform: 'translateX(-50%)', fontSize: 14, color: 'var(--c-accent)' }}>{d.count}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex" style={{ marginTop: 8, paddingLeft: 34 }}>
        <div className="flex-1 flex justify-between">
          {data.map((d, i) => (
            <span key={i} className="tabular-nums" style={{ fontSize: 14, color: M.idle }}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 패널 래퍼 ──
function Panel({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: 'var(--c-card2)', border: `1px solid ${M.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div className="flex items-center justify-between" style={{ gap: 10, marginBottom: 14 }}>
        <div className="flex flex-col min-w-0">
          <h3 className="font-bold truncate" style={{ fontSize: 15, color: M.text }}>{title}</h3>
          {sub && <span className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 2 }}>{sub}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

// ── 이 모델을 사용하는 서비스 — 콤보 차트(요청 막대 + 토큰 라인) ──
function ServiceCombo({ rows }: { rows: Service[] }) {
  if (rows.length === 0) {
    return <div className="text-center" style={{ fontSize: 14, color: M.help, padding: '24px 0' }}>이 모델을 사용하는 서비스가 아직 없습니다.</div>
  }
  const W = 720
  const H = 212
  const PAD_TOP = 28                                   // 막대 위 값 라벨 여유
  const plotH = H - PAD_TOP
  const reqMax = Math.max(...rows.map((s) => s.usageCount)) * 1.12
  const n = rows.length
  const slot = W / n
  const bw = Math.min(72, slot * 0.52)
  const cx = (i: number) => slot * i + slot / 2
  const barH = (v: number) => (v / reqMax) * plotH
  const barTop = (v: number) => PAD_TOP + plotH - barH(v)
  // 토큰 라인 — 막대 top 과 겹치지 않게 독립 정규화해 plot 상단 밴드(4~32%)에 배치 → 콤보 분리감
  const toks = rows.map((s) => s.usageCount * TOKENS_PER_REQ)
  const tMax = Math.max(...toks)
  const tMin = Math.min(...toks)
  const tRange = tMax - tMin || tMax || 1
  const lineY = (t: number) => PAD_TOP + plotH * 0.04 + (1 - (t - tMin) / tRange) * (plotH * 0.28)
  const pts = toks.map((t, i) => `${cx(i)},${lineY(t)}`).join(' ')
  return (
    <div>
      {/* 범례 */}
      <div className="flex items-center justify-end" style={{ gap: 16, marginBottom: 12, fontSize: 14, color: M.help }}>
        <span className="flex items-center" style={{ gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--c-accent)' }} />요청 수</span>
        <span className="flex items-center" style={{ gap: 5 }}><span style={{ width: 16, height: 2, background: '#6c32f3' }} />토큰</span>
      </div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 flex flex-col justify-between" style={{ top: PAD_TOP, bottom: 0 }}>
          {[0, 1, 2, 3].map((i) => (<span key={i} style={{ height: 1, background: 'var(--c-border)', opacity: 0.45 }} />))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <defs>
            <linearGradient id="svcBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.58" />
              <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="1" />
            </linearGradient>
          </defs>
          {rows.map((s, i) => (
            <rect key={s.id} x={cx(i) - bw / 2} y={barTop(s.usageCount)} width={bw} height={barH(s.usageCount)} rx={6} fill="url(#svcBar)" />
          ))}
          <polyline points={pts} fill="none" stroke="#6c32f3" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {toks.map((t, i) => (
            <circle key={rows[i].id} cx={cx(i)} cy={lineY(t)} r={4} fill="#6c32f3" stroke="var(--c-card2)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {/* 막대 위 요청 값 */}
        {rows.map((s, i) => (
          <span key={s.id} className="absolute tabular-nums font-bold" style={{ left: `${(cx(i) / W) * 100}%`, top: `${(barTop(s.usageCount) / H) * 100}%`, transform: 'translate(-50%, -145%)', fontSize: 14, color: 'var(--c-text)' }}>{fmtReq(s.usageCount)}</span>
        ))}
      </div>
      {/* X축 — 서비스명 + 토큰 */}
      <div className="flex" style={{ marginTop: 10 }}>
        {rows.map((s) => (
          <div key={s.id} className="flex flex-col items-center min-w-0" style={{ width: `${100 / n}%`, padding: '0 4px' }}>
            <span className="truncate font-semibold text-center" style={{ fontSize: 14, color: M.text, maxWidth: '100%' }}>{s.name}</span>
            <span className="truncate text-center" style={{ fontSize: 14, color: M.help, maxWidth: '100%' }}>{fmtTok(s.usageCount * TOKENS_PER_REQ)} 토큰</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 모델 소개 — 신규 반입(4.14a) '명세 등록'의 설명을 그대로 노출. 비어 있으면 안내 placeholder. ──
function ModelIntro({ model }: { model: Model }) {
  const intro = model.description?.trim()
  return (
    <section
      className="flex flex-col flex-1 min-h-0"
      style={{ background: 'var(--c-card2)', border: `1px solid ${M.border}`, borderRadius: 14, padding: '16px 18px' }}
    >
      <div className="flex flex-col" style={{ marginBottom: 12 }}>
        <h3 className="font-bold" style={{ fontSize: 15, color: M.text }}>모델 소개</h3>
        <span style={{ fontSize: 14, color: M.help, marginTop: 2 }}>반입 시 등록한 모델 설명</span>
      </div>
      {intro ? (
        <div className="flex-1 min-h-0 overflow-auto" style={{ fontSize: 14, color: M.value, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {model.description}
        </div>
      ) : (
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ minHeight: 150, borderRadius: 12, border: `1px dashed ${M.border}`, background: M.inputBg, gap: 12, padding: 24 }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden style={{ color: M.idle }}>
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="8.5" cy="9.5" r="1.8" />
            <path d="M3 16l4.5-4 3.5 3 4-4.5L21 16" />
          </svg>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <span className="font-semibold" style={{ fontSize: 14, color: M.text }}>아직 등록된 소개가 없어요</span>
            <span style={{ fontSize: 14, color: M.help }}>신규 모델 반입의 '명세 등록' 설명에 입력하면 여기에 표시됩니다</span>
          </div>
        </div>
      )}
    </section>
  )
}

// ── 우측 명세서(신청 관리 톤) ──
function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start" style={{ gap: 12, padding: '7px 0' }}>
      <span className="shrink-0" style={{ width: 72, fontSize: 14, color: M.help }}>{label}</span>
      <span className="flex-1 min-w-0" style={{ fontSize: 14, color: M.value }}>{children}</span>
    </div>
  )
}

function SpecCard({ model, actions }: { model: Model; actions?: ReactNode }) {
  const callExample = [
    `curl -X POST https://api.anclave.local/v1/chat/completions \\`,
    `  -H "Authorization: Bearer $ANCLAVE_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "model": "${model.name}",`,
    `    "messages": [{ "role": "user", "content": "안녕하세요" }]`,
    `  }'`,
  ].join('\n')

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--c-card2)', border: `1px solid ${M.border}`, borderRadius: 14, padding: '18px 18px 16px' }}>
      <div className="flex items-center min-w-0" style={{ gap: 12, marginBottom: 4 }}>
        <Logo id={model.id} name={model.name} size={42} />
        <div className="flex flex-col min-w-0">
          <span className="truncate font-bold" style={{ fontSize: 16, color: M.text }}>{model.name}</span>
          <span className="truncate" style={{ fontSize: 14, color: M.help }}>카탈로그 등록 명세서</span>
        </div>
        <span className="shrink-0 flex items-center" style={{ gap: 6, marginLeft: 'auto', fontSize: 14, color: 'var(--c-success, #15a85c)' }}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: 'currentColor' }} />배포
        </span>
      </div>

      <SpecSection title="기본 명세" active={false} reviewing={false}>
        <SpecRow label="태그">
          <span className="flex flex-wrap" style={{ gap: 6 }}>
            {[model.kind, ...model.addons].map((t) => (
              <span key={t} style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', borderRadius: 6, padding: '2px 8px', fontSize: 14 }}>{t}</span>
            ))}
          </span>
        </SpecRow>
        <SpecRow label="설명">{descSummary(model.description)}</SpecRow>
        <SpecRow label="라이선스">{model.license}</SpecRow>
      </SpecSection>

      <SpecSection title="자원 요건" active={false} reviewing={false}>
        <SpecRow label="최소 자원">VRAM {model.reqVramGb}GB · RAM {model.reqRamGb}GB · 저장 {model.reqStorageGb}GB · CPU {model.reqCpuCores}코어</SpecRow>
        <SpecRow label="권장 GPU">{model.recommendedGpu}</SpecRow>
        <SpecRow label="파라미터">{model.params}</SpecRow>
      </SpecSection>

      {/* 사용법 — 엔드포인트·가이드 행 제거, 호출 예시 코드 박스 하나로 통일 */}
      <div className="flex flex-col flex-1 min-h-0" style={{ marginBottom: 10, borderRadius: 10, padding: '6px 12px' }}>
        <SectionHead title="사용법" active={false} reviewing={false} />
        <pre className="flex-1 min-h-0 overflow-auto rounded-[8px]" style={{ marginTop: 8, padding: '12px 13px', background: 'var(--c-bg)', border: `1px solid ${M.border}`, fontSize: 14, fontFamily: 'var(--font-mono)', color: M.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{model.usageGuide?.trim() || callExample}</pre>
      </div>

      {actions}
    </div>
  )
}

// ── 확인 모달 ──
function ConfirmModal({ title, message, confirmLabel, danger, busy, error, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel: string; danger?: boolean; busy: boolean; error?: string | null; onConfirm: () => void; onClose: () => void
}) {
  const btn: CSSProperties = { height: 42, borderRadius: 9, fontSize: 14, fontWeight: 600, padding: '0 16px' }
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(8,12,20,0.55)', zIndex: 60, padding: 16 }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex flex-col"
        style={{ width: 'min(440px, 100%)', background: 'var(--c-card2)', border: `1px solid ${M.border}`, borderRadius: 16, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center" style={{ gap: 11, marginBottom: 12 }}>
          <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 38, height: 38, background: danger ? 'color-mix(in srgb, var(--c-danger) 16%, transparent)' : 'var(--accent-soft)', color: danger ? 'var(--c-danger)' : 'var(--c-accent)' }} aria-hidden>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 6.5v4.2M10 14h.01" strokeLinecap="round" /><circle cx="10" cy="10" r="7.5" /></svg>
          </span>
          <h3 className="font-bold" style={{ fontSize: 16, color: M.text }}>{title}</h3>
        </div>
        <div style={{ fontSize: 14, color: M.value, lineHeight: 1.6, marginBottom: error ? 12 : 20 }}>{message}</div>
        {error && (
          <div style={{ fontSize: 14, color: 'var(--c-danger)', background: 'color-mix(in srgb, var(--c-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger) 30%, transparent)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
        )}
        <div className="flex justify-end" style={{ gap: 9 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ ...btn, background: 'transparent', border: `1px solid ${M.border}`, color: M.text, opacity: busy ? 0.5 : 1 }}>닫기</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ ...btn, background: danger ? 'var(--c-danger)' : 'var(--c-accent)', color: '#fff', border: 'none', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 ──
type ActionKind = 'reclaim' | 'cancel'

export function ModelDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin, user } = useRole()
  const allModels = useCatalogModels()
  const requests = useModelRequests()
  const [action, setAction] = useState<ActionKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const model = useMemo(() => allModels.find((m) => m.id === id), [allModels, id])
  // N:M 호환 — backend 가 Service.models[] 추가 전엔 단일 model 폴백, 추가 후엔 여러 모델 공용 조회.
  const usingServices = useMemo(
    () => services.filter((s) => ((s as { models?: string[] }).models ?? [s.model]).includes(id)).sort((a, b) => b.usageCount - a.usageCount),
    [id],
  )
  const serviceTrend = useMemo(() => serviceCountSeries(usingServices.length), [usingServices.length])
  const request = useMemo(() => requests.find((r) => r.registeredModelId === id), [requests, id])

  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: 360, gap: 12 }}>
        <h2 className="font-bold" style={{ fontSize: 18, color: M.text }}>모델을 찾을 수 없어요</h2>
        <p style={{ fontSize: 14, color: M.help }}>회수되었거나 등록이 취소된 모델일 수 있습니다.</p>
        <button type="button" onClick={() => navigate('/models')} style={{ height: 40, borderRadius: 9, padding: '0 16px', fontSize: 14, fontWeight: 600, background: 'var(--c-accent)', color: '#fff', border: 'none' }}>모델 카탈로그로</button>
      </div>
    )
  }

  const closeModal = () => { setAction(null); setErr(null) }

  const runAction = async () => {
    if (!action) return
    setBusy(true)
    setErr(null)
    try {
      const res = await deleteModel(model.id)
      // 409=연동 서비스 존재(거부), 404=이미 없음(계속 진행), 그 외 4xx/5xx=오류.
      if (!res.ok && res.status === 409) {
        setErr('이 모델을 사용하는 서비스가 있어 회수할 수 없습니다. 먼저 연동 서비스를 정리해 주세요.')
        return
      }
      if (!res.ok && res.status !== 404) {
        setErr('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      if (action === 'reclaim') {
        // 배포 중단 → 신청을 '스캔완료'로 되돌려 신청 관리(4.14)에서 바로 재배포 가능하게.
        if (request) {
          // registeredModelId(모델 FK)는 backend 가 모델 삭제 시 NULL 정리 — 여기서 빈값 set 하면 FK 위반.
          await patchRequest(request.id, { stage: 'scanned', status: 'pending', scan: 'pass' })
        } else {
          // 시드/직접 등록 모델은 연결 신청이 없으므로 재배포용 '스캔완료' 신청을 새로 만든다.
          const created = await createRequest({ requesterUserId: user.id, modelName: model.name, kind: model.kind, reason: '카탈로그 회수 후 재배포 대기' })
          await patchRequest(created.id, {
            stage: 'scanned', status: 'pending', scan: 'pass',
            fileName: `${slugify(model.name)}.safetensors`, format: 'safetensors',
            checksum: 'sha256:' + created.id.replace(/\D/g, '').padEnd(4, '0') + '…a1f3',
          })
        }
        navigate('/models/requests')
      } else {
        // 등록 취소(영구) → 연결 신청까지 삭제하고 카탈로그로.
        if (request) await deleteRequest(request.id)
        navigate('/models')
      }
    } catch {
      setErr('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const adminActions = isAdmin && (
    <div className="flex" style={{ gap: 9, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${M.border}` }}>
      <button
        type="button"
        onClick={() => setAction('reclaim')}
        className="flex-1"
        style={{ height: 42, borderRadius: 9, fontSize: 14, fontWeight: 600, background: 'transparent', border: `1px solid ${M.border}`, color: M.text }}
      >
        모델 회수
      </button>
      <button
        type="button"
        onClick={() => setAction('cancel')}
        className="flex-1"
        style={{ height: 42, borderRadius: 9, fontSize: 14, fontWeight: 600, background: 'transparent', border: '1px solid var(--c-danger)', color: 'var(--c-danger)' }}
      >
        등록 취소
      </button>
    </div>
  )

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={{ gap: 18 }}>
      <header className="flex flex-col min-w-0" style={{ gap: 4 }}>
        <div className="flex items-start min-w-0" style={{ gap: 12 }}>
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={() => navigate('/models')}
            className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors shrink-0"
            style={{ width: 34, height: 34, marginTop: 9 }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <Logo id={model.id} name={model.name} size={52} />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
              <h2 className="font-bold truncate" style={{ fontSize: 23, lineHeight: 1.2, color: M.text }}>{model.name}</h2>
              <span style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', borderRadius: 6, padding: '2px 9px', fontSize: 14, fontWeight: 600 }}>{model.kind}</span>
              <span className="flex items-center" style={{ gap: 6, fontSize: 14, color: 'var(--c-success, #15a85c)' }}>
                <span className="rounded-full" style={{ width: 7, height: 7, background: 'currentColor' }} />배포 중
              </span>
            </div>
            <p className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 4 }}>{providerName(model.id)} · {model.params} · {descLead(model.description)}</p>
          </div>
        </div>
      </header>

      <div className="grid items-stretch flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(0,1.62fr) minmax(0,1fr)', gap: 20 }}>
        {/* 좌: KPI · 사용률 추이 · 사용 서비스 · 모델 소개 */}
        <div className="flex flex-col min-w-0 min-h-0" style={{ gap: 18 }}>
          <Panel title="가져다 쓴 서비스 수" sub="이 모델을 채택한 서비스 수 — 최근 6개월 추이">
            <ServiceTrendChart data={serviceTrend} />
          </Panel>

          <Panel title="이 모델을 사용하는 서비스" sub={`${usingServices.length}개 서비스가 연동 중 · 요청·토큰 비교`}>
            <ServiceCombo rows={usingServices} />
          </Panel>

          <ModelIntro model={model} />
        </div>

        {/* 우: 명세서 — 좌측 높이만큼 채워 아래 여백 제거 */}
        <div className="flex flex-col min-w-0 min-h-0">
          <SpecCard model={model} actions={adminActions} />
        </div>
      </div>

      {action === 'reclaim' && (
        <ConfirmModal
          title="모델 회수"
          confirmLabel="회수하기"
          busy={busy}
          error={err}
          onConfirm={runAction}
          onClose={closeModal}
          message={
            <>
              <b>{model.name}</b> 모델을 배포 중단(회수)하시겠습니까?<br />
              카탈로그에서 내려가고 <b>신청 관리</b>에 "스캔완료"로 이동하며, 거기서 다시 배포할 수 있습니다.
              {usingServices.length > 0 && (
                <span className="block" style={{ marginTop: 8, color: 'var(--c-danger)' }}>현재 {usingServices.length}개 서비스가 이 모델을 사용 중입니다.</span>
              )}
            </>
          }
        />
      )}
      {action === 'cancel' && (
        <ConfirmModal
          title="등록 취소"
          confirmLabel="등록 취소"
          danger
          busy={busy}
          error={err}
          onConfirm={runAction}
          onClose={closeModal}
          message={
            <>
              <b>{model.name}</b> 모델의 등록을 취소하시겠습니까?<br />
              카탈로그와 신청 기록에서 <b>영구히 삭제</b>되며 되돌릴 수 없습니다.
              {usingServices.length > 0 && (
                <span className="block" style={{ marginTop: 8, color: 'var(--c-danger)' }}>현재 {usingServices.length}개 서비스가 이 모델을 사용 중입니다.</span>
              )}
            </>
          }
        />
      )}
    </div>
  )
}
