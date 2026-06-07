import { useState } from 'react'
import type { ReactNode } from 'react'
import { PaperClipIcon } from '@heroicons/react/24/solid'
import { Card, Badge, StatusBadge, Button, Tabs, Modal, Drawer, EmptyState, useToast } from '../components/ui'
import { HexTile } from '../components/charts'
import { useRole } from '../lib/role'
import { gpuRequests, apiRequests, publishRequests, gpuChangeRequests } from '../data/requests'
import { services } from '../data/services'
import { models } from '../data/models'
import { userById } from '../data/users'
import { servers, allSlices } from '../data/servers'
import { serverUsage, isSliceFree } from '../lib/metrics'
import type { GpuRequest, ChangeType } from '../data/types'

function PageHead({ title, screen, action }: { title: string; screen: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center" style={{ gap: 8 }}>
        <h2 className="font-bold" style={{ fontSize: 18 }}>{title}</h2>
        <span className="text-muted font-mono" style={{ fontSize: 14, padding: '1px 7px', borderRadius: 6, background: 'var(--c-soft)' }}>{screen}</span>
      </div>
      {action}
    </div>
  )
}

// ── 4.8 신청 관리 ─────────────────────────────────────────
export function Requests() {
  const [tab, setTab] = useState('gpu')
  const { user } = useRole()
  const myGpu = gpuRequests.filter((r) => r.requesterUserId === user.id)
  const myApi = apiRequests.filter((r) => r.requesterUserId === user.id)
  const myPub = publishRequests.filter((r) => r.requesterUserId === user.id)

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHead title="신청 관리" screen="4.8" />
      <Tabs
        tabs={[{ key: 'api', label: 'API 신청' }, { key: 'gpu', label: 'GPU 번들' }, { key: 'publish', label: '게시 신청' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'gpu' && (
        <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <Card title="GPU 신청 마법사"><GpuWizard /></Card>
          <Card title="내 GPU 신청"><RequestList rows={myGpu} render={(r) => `${r.capacity}${r.capacityUnit === 'card' ? '장' : ' 슬라이스'} · ${r.serviceName}`} /></Card>
        </div>
      )}
      {tab === 'api' && (
        <Card title="내 API 신청">
          <RequestList rows={myApi} render={(r) => `${services.find((s) => s.id === r.serviceId)?.name ?? r.serviceId} · ${r.targetServiceUrl}`} />
        </Card>
      )}
      {tab === 'publish' && (
        <Card title="내 게시 신청">
          <RequestList rows={myPub} render={(r) => `${r.serviceName} · ${r.meta}`} />
        </Card>
      )}
    </div>
  )
}

// 공통 신청 목록 + 반려 사유 모달
function RequestList<T extends { id: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string; rejectReason?: string }>({
  rows,
  render,
}: {
  rows: T[]
  render: (row: T) => string
}) {
  const [reason, setReason] = useState<string | null>(null)
  if (rows.length === 0) return <EmptyState title="아직 신청 내역이 없어요" description="왼쪽에서 새 신청을 작성해 보세요." />
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '9px 11px' }}>
          <div className="min-w-0">
            <div className="truncate" style={{ fontSize: 14 }}>{render(r)}</div>
            <div className="text-muted" style={{ fontSize: 14 }}>{r.createdAt}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.status === 'rejected' && r.rejectReason && (
              <button type="button" className="text-accent" style={{ fontSize: 14 }} onClick={() => setReason(r.rejectReason ?? '')}>사유</button>
            )}
            <StatusBadge status={r.status} />
          </div>
        </div>
      ))}
      <Modal open={reason != null} onClose={() => setReason(null)} title="반려 사유" footer={<Button variant="outline" onClick={() => setReason(null)}>닫기</Button>}>
        <p style={{ fontSize: 14 }}>{reason}</p>
      </Modal>
    </div>
  )
}

// GPU 신청 세로 마법사 (Q6)
const WIZARD_STEPS = ['용량', '모델 선택', '환경 · 부가', '서비스명 · 목적']
function GpuWizard() {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [unit, setUnit] = useState<'card' | 'slice'>('slice')
  const [capacity, setCapacity] = useState(1)
  const [picked, setPicked] = useState<string[]>([])
  const [env, setEnv] = useState('Ubuntu 22.04 · CUDA 12.4')
  const [addons, setAddons] = useState<string[]>(['주피터'])
  const [serviceName, setServiceName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [attached, setAttached] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const next = () => {
    if (step === 1 && picked.length === 0) return setErr('모델을 1개 이상 선택해 주세요.')
    setErr('')
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }
  const submit = () => {
    if (!serviceName.trim()) return setErr('서비스명을 입력해 주세요.')
    if (!purpose.trim()) return setErr('사용 목적을 입력해 주세요.')
    setErr('')
    toast.push('GPU 신청을 보냈어요. 대기 상태로 등록됐어요.', 'ok')
    setStep(0); setPicked([]); setServiceName(''); setPurpose(''); setAttached(false)
  }

  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      {WIZARD_STEPS.map((label, i) => {
        const active = i === step
        const done = i < step
        return (
          <div key={label} className="flex gap-3" style={{ paddingBottom: i === WIZARD_STEPS.length - 1 ? 0 : 16, position: 'relative' }}>
            {i < WIZARD_STEPS.length - 1 && (
              <span style={{ position: 'absolute', left: 13, top: 30, bottom: 0, width: 2, background: done ? 'var(--c-ok)' : 'var(--c-border)' }} />
            )}
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 28, height: 28, borderRadius: '50%', fontSize: 14, fontWeight: 800, zIndex: 1,
                background: done ? 'var(--c-ok)' : active ? 'var(--accent-soft)' : 'var(--c-soft)',
                color: done ? '#0a0d12' : active ? 'var(--c-accent)' : 'var(--c-muted)',
                border: active ? '1.5px solid var(--c-accent)' : '1.5px solid var(--c-border)',
              }}
            >
              {done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1" style={{ paddingTop: 3 }}>
              <div className="font-bold" style={{ fontSize: 14 }}>{label}</div>
              {active && (
                <div className="mt-2.5">
                  {i === 0 && (
                    <div className="flex flex-col" style={{ gap: 10 }}>
                      <div className="flex gap-2">
                        {(['slice', 'card'] as const).map((u) => (
                          <button key={u} type="button" onClick={() => setUnit(u)} className="rounded-lg border" style={{ fontSize: 14, padding: '6px 14px', color: unit === u ? 'var(--c-accent)' : 'var(--c-muted)', background: unit === u ? 'var(--accent-soft)' : 'transparent', borderColor: unit === u ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>
                            {u === 'slice' ? '슬라이스(MIG)' : '장(카드)'}
                          </button>
                        ))}
                      </div>
                      <label className="text-muted" style={{ fontSize: 14 }}>수량
                        <input type="number" min={1} max={8} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="ml-2 bg-soft border border-line rounded-lg text-text" style={{ fontSize: 14, width: 70, height: 32, padding: '0 8px' }} />
                      </label>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="grid" style={{ gap: 6, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                      {models.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 rounded-lg border border-line cursor-pointer" style={{ padding: '6px 9px', fontSize: 14, background: picked.includes(m.id) ? 'var(--accent-soft)' : 'transparent' }}>
                          <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(picked, m.id, setPicked)} />
                          <span className="truncate">{m.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {i === 2 && (
                    <div className="flex flex-col" style={{ gap: 10 }}>
                      <select value={env} onChange={(e) => setEnv(e.target.value)} className="bg-soft border border-line rounded-lg text-text" style={{ fontSize: 14, height: 34, padding: '0 10px' }}>
                        <option>Ubuntu 22.04 · CUDA 12.4</option>
                        <option>Ubuntu 20.04 · CUDA 11.8</option>
                      </select>
                      <div className="flex gap-2">
                        {['주피터', 'API'].map((a) => (
                          <label key={a} className="flex items-center gap-2 rounded-lg border border-line cursor-pointer" style={{ padding: '6px 12px', fontSize: 14, background: addons.includes(a) ? 'var(--accent-soft)' : 'transparent' }}>
                            <input type="checkbox" checked={addons.includes(a)} onChange={() => toggle(addons, a, setAddons)} />{a}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {i === 3 && (
                    <div className="flex flex-col" style={{ gap: 10 }}>
                      <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="서비스명" className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, height: 34, padding: '0 10px' }} />
                      <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="사용 목적" rows={2} className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 10px', resize: 'none' }} />
                      <button type="button" onClick={() => setAttached((v) => !v)} className="flex items-center gap-2 self-start rounded-lg border border-line" style={{ fontSize: 14, padding: '6px 11px', color: attached ? 'var(--c-ok)' : 'var(--c-muted)' }}>
                        <PaperClipIcon width={15} height={15} />{attached ? '결재 공문 첨부됨 (gongmun.pdf)' : '결재 공문 첨부'}
                      </button>
                    </div>
                  )}
                  {err && <div className="mt-2" style={{ fontSize: 14, color: 'var(--c-danger)' }}>⚠ {err}</div>}
                  <div className="flex gap-2 mt-3">
                    {step > 0 && <Button variant="ghost" onClick={() => { setErr(''); setStep((s) => s - 1) }}>이전</Button>}
                    {step < WIZARD_STEPS.length - 1 ? <Button variant="primary" onClick={next}>다음</Button> : <Button variant="primary" onClick={submit}>제출</Button>}
                  </div>
                </div>
              )}
              {done && (
                <div className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>
                  {i === 0 && `${capacity}${unit === 'card' ? '장' : ' 슬라이스'}`}
                  {i === 1 && `${picked.length}개 모델`}
                  {i === 2 && `${env.split(' · ')[0]} · ${addons.join('·')}`}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 4.10 GPU 승인 관리 ────────────────────────────────────
export function ApprovalsGpu() {
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [processed, setProcessed] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [review, setReview] = useState<GpuRequest | null>(null)
  const [picking, setPicking] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const isPending = (r: GpuRequest) => r.status === 'pending' && !processed[r.id]
  const pending = gpuRequests.filter(isPending)
  const handled = gpuRequests.filter((r) => !isPending(r))

  const approve = (server: string) => {
    if (!review) return
    setProcessed((p) => ({ ...p, [review.id]: 'approved' }))
    toast.push(`승인했어요 · ${server}에 배치했어요.`, 'ok')
    setPicking(false); setReview(null)
  }
  const reject = () => {
    if (!review) return
    if (!rejectReason.trim()) return
    setProcessed((p) => ({ ...p, [review.id]: 'rejected' }))
    toast.push('반려했어요. 신청자에게 알림을 보냈어요.', 'warn')
    setRejecting(false); setRejectReason(''); setReview(null)
  }

  const rows = tab === 'pending' ? pending : handled

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHead title="GPU 승인 관리" screen="4.10" action={<Badge tone="warn">대기 {pending.length}</Badge>} />
      <Tabs tabs={[{ key: 'pending', label: `대기 ${pending.length}` }, { key: 'handled', label: '기 승인 · 반려' }]} active={tab} onChange={setTab} />

      <Card flush>
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState title="처리할 GPU 신청이 없어요" description="새 신청이 들어오면 여기에 표시돼요." /></div>
        ) : (
          <div className="flex flex-col">
            {rows.map((r, i) => {
              const status = processed[r.id] ?? r.status
              return (
                <div key={r.id} className="flex items-center justify-between gap-3" style={{ padding: '11px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--c-border-s)', background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ fontSize: 14 }}>{r.serviceName} · {userById(r.requesterUserId)?.name}</div>
                    <div className="text-muted truncate" style={{ fontSize: 14 }}>{r.capacity}{r.capacityUnit === 'card' ? '장' : ' 슬라이스'} · {r.models.map((m) => models.find((x) => x.id === m)?.name ?? m).join(', ')} · {r.purpose}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.attachmentUrl && <PaperClipIcon width={15} height={15} className="text-muted" />}
                    {tab === 'pending' ? (
                      <Button variant="outline" onClick={() => setReview(r)}>검토</Button>
                    ) : (
                      <StatusBadge status={status} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* 검토 드로어 */}
      <Drawer open={review != null && !picking} onClose={() => setReview(null)} title="GPU 신청 검토">
        {review && (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <Field label="신청자" value={userById(review.requesterUserId)?.name ?? ''} />
            <Field label="서비스명" value={review.serviceName} />
            <Field label="용량" value={`${review.capacity}${review.capacityUnit === 'card' ? '장' : ' 슬라이스'}`} />
            <Field label="요청 모델" value={review.models.map((m) => models.find((x) => x.id === m)?.name ?? m).join(', ')} />
            <Field label="환경" value={review.env} />
            <Field label="사용 목적" value={review.purpose} />
            <Field label="결재 공문" value={review.attachmentUrl ? '첨부됨' : '없음'} />
            <div className="flex gap-2 mt-2">
              <Button variant="primary" onClick={() => setPicking(true)}>승인 (서버 선택)</Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>반려</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 승인 → 헥사곤 서버 선택 */}
      <Modal open={picking} onClose={() => setPicking(false)} title="배치할 서버 선택" width={560}>
        <p className="text-muted mb-3" style={{ fontSize: 14 }}>가용 용량이 있는 서버를 선택하면 자원맵에 자동 배치돼요.</p>
        <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {servers.map((s) => (
            <button key={s.id} type="button" onClick={() => approve(s.host)} className="flex flex-col items-center gap-1.5 rounded-lg border border-line hover:border-accent" style={{ padding: '10px 6px', background: 'var(--c-soft)' }}>
              <HexTile usage={serverUsage(s)} width={44} height={50} />
              <span className="font-semibold truncate w-full text-center" style={{ fontSize: 14 }}>{s.host}</span>
              <span className="text-muted" style={{ fontSize: 14 }}>{serverUsage(s)}%</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* 반려 모달 */}
      <Modal open={rejecting} onClose={() => setRejecting(false)} title="반려 사유" footer={<><Button variant="ghost" onClick={() => setRejecting(false)}>취소</Button><Button variant="danger" onClick={reject}>반려</Button></>}>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="반려 사유를 입력해 주세요." rows={3} className="w-full bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 10px', resize: 'none' }} />
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted" style={{ fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}

// ── 4.9 게시 승인 관리 (A) ────────────────────────────────
export function ApprovalsPublish() {
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [processed, setProcessed] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [review, setReview] = useState<(typeof publishRequests)[number] | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const isPending = (id: string, st: string) => st === 'pending' && !processed[id]
  const pending = publishRequests.filter((r) => isPending(r.id, r.status))
  const handled = publishRequests.filter((r) => !isPending(r.id, r.status))
  const rows = tab === 'pending' ? pending : handled

  const approve = () => { if (!review) return; setProcessed((p) => ({ ...p, [review.id]: 'approved' })); toast.push(`${review.serviceName} 게시를 승인했어요 · 마켓에 노출돼요.`, 'ok'); setReview(null) }
  const reject = () => { if (!review || !reason.trim()) return; setProcessed((p) => ({ ...p, [review.id]: 'rejected' })); toast.push('게시 신청을 반려했어요. 신청자에게 알림을 보냈어요.', 'warn'); setRejecting(false); setReason(''); setReview(null) }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHead title="게시 승인 관리" screen="4.9" action={<Badge tone="warn">대기 {pending.length}</Badge>} />
      <Tabs tabs={[{ key: 'pending', label: `대기 ${pending.length}` }, { key: 'handled', label: '기 승인 · 반려' }]} active={tab} onChange={setTab} />
      <Card flush>
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState title="처리할 게시 신청이 없어요" description="새 게시 신청이 들어오면 여기에 표시돼요." /></div>
        ) : (
          <div className="flex flex-col">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between gap-3" style={{ padding: '11px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--c-border-s)', background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ fontSize: 14 }}>{r.serviceName} · {userById(r.requesterUserId)?.name}</div>
                  <div className="text-muted truncate" style={{ fontSize: 14 }}>{r.meta} · {r.serviceUrl}</div>
                </div>
                {tab === 'pending' ? <Button variant="outline" onClick={() => setReview(r)}>검토</Button> : <StatusBadge status={processed[r.id] ?? r.status} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Drawer open={review != null} onClose={() => setReview(null)} title="게시 신청 검토">
        {review && (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <Field label="신청자" value={userById(review.requesterUserId)?.name ?? ''} />
            <Field label="서비스명" value={review.serviceName} />
            <Field label="메타" value={review.meta} />
            <Field label="서비스 URL" value={review.serviceUrl} />
            <Field label="데모 URL" value={review.demoUrl} />
            <div className="flex gap-2 mt-2">
              <Button variant="primary" onClick={approve}>승인 (마켓 노출)</Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>반려</Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="반려 사유" footer={<><Button variant="ghost" onClick={() => setRejecting(false)}>취소</Button><Button variant="danger" onClick={reject}>반려</Button></>}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="반려 사유를 입력해 주세요." rows={3} className="w-full bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 10px', resize: 'none' }} />
      </Modal>
    </div>
  )
}

// ── 4.11 변경 · 확장 · 이전 · 회수 ────────────────────────
const CHANGE_LABEL: Record<ChangeType, string> = { expand: '확장', migrate: '이전', change: '변경', reclaim: '회수' }
export function GpuChange() {
  const toast = useToast()
  const [type, setType] = useState<ChangeType>('expand')
  const [reason, setReason] = useState('')
  const [reclaimed, setReclaimed] = useState<string[]>([])

  const idleByServer = servers
    .map((s) => ({ server: s, free: s.gpus.flatMap((g) => g.slices ?? []).filter(isSliceFree).length }))
    .filter((x) => x.free > 0)
  const totalFree = allSlices.filter(isSliceFree).length

  const submit = () => { if (!reason.trim()) return; toast.push(`${CHANGE_LABEL[type]} 신청을 보냈어요. 승인 후 자원맵에 반영돼요.`, 'ok'); setReason('') }
  const reclaim = (id: string, host: string) => { setReclaimed((r) => [...r, id]); toast.push(`${host} 유휴 슬라이스를 회수했어요 · 가용으로 전환됐어요.`, 'ok') }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHead title="변경 · 확장 · 이전 · 회수" screen="4.11" />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <Card title="변경 신청">
          <div className="flex flex-col" style={{ gap: 10 }}>
            <div className="flex gap-2">
              {(['expand', 'migrate', 'change', 'reclaim'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className="rounded-lg border" style={{ fontSize: 14, padding: '6px 12px', color: type === t ? 'var(--c-accent)' : 'var(--c-muted)', background: type === t ? 'var(--accent-soft)' : 'transparent', borderColor: type === t ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>{CHANGE_LABEL[t]}</button>
              ))}
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="변경 사유를 입력해 주세요." rows={3} className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 10px', resize: 'none' }} />
            <Button variant="primary" onClick={submit}>신청 제출</Button>
          </div>
        </Card>

        <Card title={`직접 회수 · 유휴 슬라이스 ${totalFree}`}>
          <p className="text-muted mb-2" style={{ fontSize: 14 }}>유휴(빈) 슬라이스를 직접 회수해 가용 자원으로 전환할 수 있어요.</p>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {idleByServer.map(({ server, free }) => (
              <div key={server.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '8px 10px' }}>
                <span className="truncate" style={{ fontSize: 14 }}>{server.host} · 유휴 {free}</span>
                {reclaimed.includes(server.id) ? <Badge tone="ok">회수됨</Badge> : <Button variant="outline" onClick={() => reclaim(server.id, server.host)}>회수</Button>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="변경 신청 내역" flush>
        <div className="flex flex-col">
          {gpuChangeRequests.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-3" style={{ padding: '11px 14px', borderBottom: i === gpuChangeRequests.length - 1 ? 'none' : '1px solid var(--c-border-s)', background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
              <div className="min-w-0 flex items-center gap-2">
                <Badge tone="info" dot={false}>{CHANGE_LABEL[r.type]}</Badge>
                <span className="truncate" style={{ fontSize: 14 }}>{userById(r.requesterUserId)?.name} · {r.reason}</span>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
