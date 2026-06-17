// 4.14 모델 신청 관리 공유 스토어 — backend API(GET/POST/PATCH) 연동 + 미기동 시 시드/로컬 폴백.
// 화면(model-requests·model-import·model-request-new)은 이 계층만 통해 읽고 쓴다(화면 로직 불변).
// 서버가 id 를 발급하므로 createRequest/createModel 은 생성된 row(서버 id 포함)를 반환 → 반입/배포가 그 id 로 patch.
import { useEffect, useSyncExternalStore } from 'react'
import { modelRequests, models } from '../data'
import { API_BASE } from '../lib/api'
import type { Model, ModelKind, ModelRequest, ModelStage } from '../data/types'

// ── 인라인 fetch 래퍼(lib/api 는 apiGet 만 export·잠금 → POST/PATCH 는 여기 인라인, API_BASE 만 import) ──
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return (await r.json()) as T
}
async function apiSend<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
  // DELETE 는 본문 없는 204 를 흔히 반환 → 파싱 시도하되 빈 본문이면 무시.
  const text = await r.text()
  return (text ? JSON.parse(text) : undefined) as T
}

// ── localStorage 폴백(백엔드 미기동 시 현 동작 유지) ──
const REQ_KEY = 'anclave-local-model-requests'
const OVERRIDE_KEY = 'anclave-model-request-overrides'
const MODELS_KEY = 'anclave-local-models'
const SCAN_KEY = 'anclave-scan-started'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function getLocalRequests(): ModelRequest[] {
  return readJson<ModelRequest[]>(REQ_KEY, [])
}
function getOverrides(): Record<string, Partial<ModelRequest>> {
  return readJson<Record<string, Partial<ModelRequest>>>(OVERRIDE_KEY, {})
}
function getLocalModels(): Model[] {
  return readJson<Model[]>(MODELS_KEY, [])
}
function computeLocalRequests(): ModelRequest[] {
  const ov = getOverrides()
  const seed = modelRequests.map((r) => (ov[r.id] ? { ...r, ...ov[r.id] } : r))
  return [...getLocalRequests(), ...seed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
function computeLocalModels(): Model[] {
  return [...models, ...getLocalModels()]
}
function addLocalRequest(item: ModelRequest): void {
  localStorage.setItem(REQ_KEY, JSON.stringify([item, ...getLocalRequests()]))
}
function patchLocal(id: string, patch: Partial<ModelRequest>): void {
  const locals = getLocalRequests()
  const idx = locals.findIndex((r) => r.id === id)
  if (idx >= 0) {
    locals[idx] = { ...locals[idx], ...patch }
    localStorage.setItem(REQ_KEY, JSON.stringify(locals))
  } else {
    const ov = getOverrides()
    ov[id] = { ...ov[id], ...patch }
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(ov))
  }
}
function addLocalModel(model: Model): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify([model, ...getLocalModels()]))
}
function localReqId(): string {
  const n = modelRequests.length + getLocalRequests().length + 1
  return `mr-${String(n).padStart(2, '0')}`
}
function localModelId(): string {
  return `lm-${getLocalModels().length + 1}`
}
// 폴백 createdAt(서버는 DB default now()) — 'YYYY-MM-DD HH:mm'.
function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── 구독 store(폴링 결과를 스냅샷에 반영, useSyncExternalStore 로 화면 동기화) ──
let reqSnapshot: ModelRequest[] = computeLocalRequests()
let modelSnapshot: Model[] = computeLocalModels()
let listeners: Array<() => void> = []
function subscribe(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
function emit() {
  listeners.forEach((l) => l())
}

// ── 5초 폴링(GET 성공 → 서버 정본 스냅샷, 실패 → 로컬 폴백 스냅샷) ──
let polling = false
async function refetch(): Promise<void> {
  try {
    const [reqs, mods] = await Promise.all([
      apiGet<ModelRequest[]>('/api/model-requests'),
      apiGet<Model[]>('/api/models'),
    ])
    reqSnapshot = reqs
    modelSnapshot = mods
  } catch {
    reqSnapshot = computeLocalRequests()
    modelSnapshot = computeLocalModels()
  }
  emit()
}
function startPolling(): void {
  if (polling) return
  polling = true
  void refetch()
  window.setInterval(() => void refetch(), 5000)
}

// ── 쓰기 — API 우선, 실패 시 localStorage 폴백. 생성류는 서버 id 포함 row 반환 ──
export interface NewRequest {
  requesterUserId: string
  modelName: string
  reason: string
  kind?: ModelKind
  source?: string
}
export async function createRequest(body: NewRequest): Promise<ModelRequest> {
  try {
    const row = await apiSend<ModelRequest>('POST', '/api/model-requests', body)
    await refetch()
    return row
  } catch {
    const item: ModelRequest = {
      id: localReqId(),
      requesterUserId: body.requesterUserId,
      modelName: body.modelName,
      kind: body.kind,
      source: body.source,
      reason: body.reason,
      status: 'pending',
      stage: 'requested',
      createdAt: fmtNow(),
    }
    addLocalRequest(item)
    reqSnapshot = computeLocalRequests()
    emit()
    return item
  }
}
export async function patchRequest(id: string, patch: Partial<ModelRequest>): Promise<void> {
  try {
    await apiSend<ModelRequest>('PATCH', `/api/model-requests/${id}`, patch)
    await refetch()
  } catch {
    patchLocal(id, patch)
    reqSnapshot = computeLocalRequests()
    emit()
  }
}
export interface NewModel {
  name: string
  kind: ModelKind
  description: string
  addons: string[]
  license: string
  recommendedGpu: string
  params: string
  reqVramGb: number
  reqRamGb: number
  reqStorageGb: number
  reqCpuCores: number
}
export async function createModel(model: NewModel): Promise<Model> {
  try {
    const row = await apiSend<Model>('POST', '/api/models', model)
    await refetch()
    return row
  } catch {
    const m: Model = { id: localModelId(), usageRank: computeLocalModels().length + 1, usageCount: 0, ...model }
    addLocalModel(m)
    modelSnapshot = computeLocalModels()
    emit()
    return m
  }
}

// 모델 회수(배포 중단)·등록 취소 시 카탈로그에서 제거. 명시적 사용자 액션이라 결과(상태코드)를 호출부에 전달한다.
// 409=사용 중 서비스 있음(거부), 404=이미 없음, 200=삭제. 네트워크 실패는 throw(호출부 catch).
export async function deleteModel(id: string): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(`${API_BASE}/api/models/${id}`, { method: 'DELETE' })
  if (r.ok) await refetch()
  return { ok: r.ok, status: r.status }
}
// 등록 취소(영구 삭제) 시 신청 레코드까지 제거.
export async function deleteRequest(id: string): Promise<void> {
  try {
    await apiSend<void>('DELETE', `/api/model-requests/${id}`)
    await refetch()
  } catch {
    localStorage.setItem(REQ_KEY, JSON.stringify(getLocalRequests().filter((r) => r.id !== id)))
    reqSnapshot = computeLocalRequests()
    emit()
  }
}

// ── 읽기 hook(마운트 시 폴링 시작 보장) ──
export function useModelRequests(): ModelRequest[] {
  useEffect(() => {
    startPolling()
  }, [])
  return useSyncExternalStore(subscribe, () => reqSnapshot, () => reqSnapshot)
}
export function useCatalogModels(): Model[] {
  useEffect(() => {
    startPolling()
  }, [])
  return useSyncExternalStore(subscribe, () => modelSnapshot, () => modelSnapshot)
}
export function getRequest(id: string): ModelRequest | undefined {
  return reqSnapshot.find((r) => r.id === id)
}

// ── 스캔 시작 시각(백그라운드 진행률) — 나갔다 와도 경과 시간으로 진행률 복원. localStorage 유지 ──
export function getScanStart(id: string): number | null {
  const m = readJson<Record<string, number>>(SCAN_KEY, {})
  return m[id] ?? null
}
export function setScanStart(id: string, ts: number): void {
  const m = readJson<Record<string, number>>(SCAN_KEY, {})
  m[id] = ts
  localStorage.setItem(SCAN_KEY, JSON.stringify(m))
}
export function clearScanStart(id: string): void {
  const m = readJson<Record<string, number>>(SCAN_KEY, {})
  if (id in m) {
    delete m[id]
    localStorage.setItem(SCAN_KEY, JSON.stringify(m))
  }
}

// ── 단계 표시 메타(테이블 배지·필터 공용) ──
export interface StageMeta {
  label: string
  tone: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'
}
export const STAGE_META: Record<ModelStage, StageMeta> = {
  requested: { label: '신청됨', tone: 'neutral' },
  scanning: { label: '스캔중', tone: 'info' },
  scanned: { label: '스캔완료', tone: 'warn' },
  deployed: { label: '배포', tone: 'ok' },
  rejected: { label: '반려', tone: 'danger' },
}

export const KIND_OPTS: ModelKind[] = ['LLM', 'Code', 'Vision-Language', 'Image', 'STT', 'Embedding']
