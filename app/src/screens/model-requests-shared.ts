// 4.14 모델 신청 관리 공유 스토어 — 시드(modelRequests) + 로컬(신규 신청·반입·단계 patch) 병합.
// src/data/** 는 STEP 병렬 소유권 보호로 잠겨 있어, 신규 신청·단계 전환·배포 모델을
// localStorage 로컬 스토어에 둔다(g2 requests-shared 패턴). useSyncExternalStore 로 화면 동기화.
import { useSyncExternalStore } from 'react'
import { modelRequests, models } from '../data'
import type { Model, ModelKind, ModelRequest, ModelStage } from '../data/types'

const REQ_KEY = 'anclave-local-model-requests' // 신규 신청·신규 반입(전체 ModelRequest[])
const OVERRIDE_KEY = 'anclave-model-request-overrides' // 시드 항목 단계 patch(Record<id, Partial>)
const MODELS_KEY = 'anclave-local-models' // 배포 완료된 카탈로그 모델(Model[])

// ── 구독(같은 탭 변경은 storage 이벤트 미발생 → 수동 emit) ──
let listeners: Array<() => void> = []
function subscribe(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
function emit() {
  reqSnapshot = computeRequests()
  modelSnapshot = computeModels()
  listeners.forEach((l) => l())
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// ── 로컬 신청(신규 추가분) ──
export function getLocalRequests(): ModelRequest[] {
  return readJson<ModelRequest[]>(REQ_KEY, [])
}
function getOverrides(): Record<string, Partial<ModelRequest>> {
  return readJson<Record<string, Partial<ModelRequest>>>(OVERRIDE_KEY, {})
}

export function addLocalRequest(item: ModelRequest): void {
  localStorage.setItem(REQ_KEY, JSON.stringify([item, ...getLocalRequests()]))
  emit()
}

// 단계 전환(scanning→scanned→deployed/rejected 등). 로컬 항목이면 직접 갱신, 시드면 override.
export function patchRequest(id: string, patch: Partial<ModelRequest>): void {
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
  emit()
}

// ── 배포 모델(카탈로그·마켓 노출) ──
export function getLocalModels(): Model[] {
  return readJson<Model[]>(MODELS_KEY, [])
}
export function addLocalModel(model: Model): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify([model, ...getLocalModels()]))
  emit()
}

// ── 스캔 시작 시각(백그라운드 진행률) — 나갔다 와도 경과 시간으로 진행률 복원 ──
const SCAN_KEY = 'anclave-scan-started'
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

// 다음 신청 id — 시드 mr-NN + 로컬 누적 기준 증가.
export function nextRequestId(): string {
  const n = modelRequests.length + getLocalRequests().length + 1
  return `mr-${String(n).padStart(2, '0')}`
}
// 다음 배포 모델 id — 로컬 전용 prefix(시드 m1..m13 와 비충돌).
export function nextModelId(): string {
  return `lm-${getLocalModels().length + 1}`
}

// ── 병합 스냅샷(시드 + override + 로컬), createdAt desc ──
function computeRequests(): ModelRequest[] {
  const ov = getOverrides()
  const seed = modelRequests.map((r) => (ov[r.id] ? { ...r, ...ov[r.id] } : r))
  const merged = [...getLocalRequests(), ...seed]
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
function computeModels(): Model[] {
  return [...models, ...getLocalModels()]
}

let reqSnapshot: ModelRequest[] = computeRequests()
let modelSnapshot: Model[] = computeModels()

export function useModelRequests(): ModelRequest[] {
  return useSyncExternalStore(subscribe, () => reqSnapshot, () => reqSnapshot)
}
export function useCatalogModels(): Model[] {
  return useSyncExternalStore(subscribe, () => modelSnapshot, () => modelSnapshot)
}
export function getRequest(id: string): ModelRequest | undefined {
  return reqSnapshot.find((r) => r.id === id)
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
