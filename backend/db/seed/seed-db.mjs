// seed.json → Postgres 엔티티 적재 (멱등 · on conflict do nothing).
// 텔레메트리(사용률·온도·전력·토큰)는 여기서 안 넣음 → backend 워커(2단계)가 현재값+과거치 생성.
// 실행: cd backend && cp .env.example .env(비번 채움) && docker compose up -d && npm install && npm run seed
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
// 단일 진실원: app 의 seed.json 을 그대로 읽는다(monorepo)
const seed = JSON.parse(readFileSync(resolve(here, '../../../app/src/data/seed.json'), 'utf-8'))
// 마켓 표시 서비스(4.17) 정본 — 별도 파일(app/scripts/market-services.seed.json) 주입.
try {
  const market = JSON.parse(readFileSync(resolve(here, '../../../app/scripts/market-services.seed.json'), 'utf-8'))
  seed.marketServices = market.marketServices
} catch { /* 파일 없으면 0건(seed.marketServices ?? []) */ }
// 모델 소개·사용법 정본(app/scripts/model-content.json) 주입 — description/usageGuide 덮어씀.
let modelContent = {}
try {
  modelContent = JSON.parse(readFileSync(resolve(here, '../../../app/scripts/model-content.json'), 'utf-8'))
} catch { /* 없으면 seed.json 값 유지 */ }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

const svcById = (id) => (id ? seed.services.find((s) => s.id === id) : undefined)
const reqByService = (name) =>
  seed.gpuRequests.find((r) => r.serviceName === name && r.status === 'approved')?.id

let n = 0
async function ins(table, cols, vals) {
  const ph = cols.map((_, i) => `$${i + 1}`).join(',')
  await client.query(
    `insert into ${table}(${cols.join(',')}) values(${ph}) on conflict do nothing`,
    vals,
  )
  n++
}

async function main() {
  await client.connect()

  // --- users ---
  for (const u of seed.users)
    await ins('users',
      ['id', 'username', 'name', 'role', 'email', 'has_hosting', 'initial_route', 'department'],
      [u.id, u.username, u.name, u.role, u.email, !!u.hasHosting, u.initialRoute, u.department ?? null])

  // --- models (자원요건 req_* 포함 — 프론트 Model 싱크) · description/usageGuide 는 model-content.json 우선 ---
  for (const m of seed.models) {
    const mc = modelContent[m.id] ?? {}
    await ins('models',
      ['id', 'name', 'kind', 'description', 'usage_guide', 'addons', 'license', 'recommended_gpu', 'params', 'usage_rank', 'usage_count', 'req_vram_gb', 'req_ram_gb', 'req_storage_gb', 'req_cpu_cores'],
      [m.id, m.name, m.kind, mc.description ?? m.description ?? null, mc.usageGuide ?? m.usageGuide ?? null, m.addons ?? [], m.license ?? null, m.recommendedGpu ?? null, m.params ?? null, m.usageRank ?? null, m.usageCount ?? 0, m.reqVramGb ?? null, m.reqRamGb ?? null, m.reqStorageGb ?? null, m.reqCpuCores ?? null])
  }

  // --- services (listed=true: 기존 7개는 이미 게시된 상태) ---
  for (const s of seed.services)
    await ins('services',
      ['id', 'name', 'kind', 'has_api', 'model_id', 'service_url', 'test_url', 'description', 'manual_url', 'owner_user_id', 'deployer_user_id', 'tags', 'usage_count', 'usage_rank', 'listed', 'models'],
      [s.id, s.name, s.kind ?? null, !!s.hasApi, s.model ?? null, s.serviceUrl ?? null, s.testUrl ?? null, s.description ?? null, s.manualUrl ?? null, s.ownerUserId, s.deployerUserId ?? null, s.tags ?? [], s.usageCount ?? 0, s.usageRank ?? null, true, s.models ?? (s.model ? [s.model] : [])])

  // --- gpu_requests (먼저: 아래 mig_slices.request_id FK 가 참조) — 심사 확장 + 확정 자원 제한 포함 ---
  for (const r of seed.gpuRequests)
    await ins('gpu_requests',
      ['id', 'requester_user_id', 'capacity', 'capacity_unit', 'models', 'env', 'addons', 'service_name', 'purpose', 'attachment_url', 'status', 'reject_reason', 'created_at',
        'period', 'priority', 'admin_memo', 'processed_at', 'processed_by', 'allocated_server_id', 'allocated_gpu_id', 'allocated_slice_id', 'allocated_ram_gb', 'allocated_storage_gb', 'allocated_cpu_cores'],
      [r.id, r.requesterUserId, r.capacity, r.capacityUnit, r.models ?? [], r.env ?? null, r.addons ?? [], r.serviceName ?? null, r.purpose ?? null, r.attachmentUrl ?? null, r.status, r.rejectReason ?? null, r.createdAt,
        r.period ?? null, r.priority ?? null, r.adminMemo ?? null, r.processedAt ?? null, r.processedBy ?? null, r.allocatedServerId ?? null, r.allocatedGpuId ?? null, r.allocatedSliceId ?? null, r.allocatedRamGb ?? null, r.allocatedStorageGb ?? null, r.allocatedCpuCores ?? null])

  // --- fleet → gpu_servers / gpus / mig_slices (servers.ts 빌드 로직 재현, 엔티티 컬럼만) ---
  for (const node of seed.fleet) {
    const serviceIds = new Set(), userIds = new Set()
    for (const fg of node.gpus) {
      const svc = svcById(fg.serviceId)
      if (svc) { serviceIds.add(svc.id); userIds.add(svc.ownerUserId) }
      for (const inst of fg.instances ?? []) {
        const s2 = svcById(inst.serviceId)
        if (s2) { serviceIds.add(s2.id); userIds.add(s2.ownerUserId) }
      }
    }
    const anyXid = node.gpus.some((g) => g.xid)
    const allIdle = node.gpus.every((g) => (g.health ?? 'normal') === 'inactive')
    const serverHealth = anyXid ? 'danger' : allIdle ? 'inactive' : 'normal' // temp 기반 warn 은 워커가 갱신
    const note = anyXid ? '장애 GPU · 점검'
      : allIdle ? '유휴 노드(미할당)'
      : node.gpus.length > 1 ? `GPU ${node.gpus.length}장`
      : node.gpus[0].migCapable ? 'MIG 분할 노드'
      : `${node.gpus[0].model} · 단일 할당`

    // 호스트 물리 스펙(자원 자동 산정용) — host 기준(41/63 = 32GB·16core, 그 외 = 16GB·8core, 저장 2048GB).
    const big = node.host === '192.168.0.41' || node.host === '192.168.0.63'
    await ins('gpu_servers',
      ['id', 'name', 'rack', 'host', 'network', 'note', 'health', 'hosted_service_ids', 'hosted_user_ids', 'ram_gb', 'storage_gb', 'cpu_cores'],
      [node.id, node.host, node.host, node.host, node.network ?? null, note, serverHealth, [...serviceIds], [...userIds], big ? 32 : 16, 2048, big ? 16 : 8])

    for (let gi = 0; gi < node.gpus.length; gi++) {
      const fg = node.gpus[gi]
      const gpuId = `${node.id}-gpu${gi}`
      const svc = svcById(fg.serviceId)
      await ins('gpus',
        ['id', 'server_id', 'name', 'model', 'arch', 'vram_gb', 'mig_capable', 'serial', 'interconnect', 'health', 'alloc_mode', 'assigned_user_id', 'assigned_service_id', 'xid'],
        [gpuId, node.id, fg.model, fg.model, fg.arch, fg.vramGb, !!fg.migCapable, fg.serial, fg.interconnect ?? null,
          fg.xid ? 'danger' : (fg.health ?? 'normal'), fg.migCapable ? 'mig' : 'cluster',
          svc?.ownerUserId ?? null, fg.serviceId ?? null, fg.xid ?? null])

      const instances = fg.instances ?? []
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i]
        const s = svcById(inst.serviceId)
        await ins('mig_slices',
          ['id', 'gpu_id', 'profile', 'units', 'gb', 'owner_user_id', 'model_id', 'container_id', 'health', 'request_id', 'status'],
          [`${gpuId}-s${i + 1}`, gpuId, inst.profile, parseInt(inst.profile, 10) || 1, inst.gb, s?.ownerUserId ?? null, s?.model ?? null,
            s ? `cont-${s.id.slice(4)}-01` : null,
            !s ? 'inactive' : inst.usage >= 80 ? 'warn' : 'normal',
            s ? (reqByService(s.name) ?? null) : null, 'active'])
      }
    }
  }

  // --- 신청류 (gpu_requests 는 위에서 먼저 적재) ---
  for (const r of seed.apiRequests ?? [])
    await ins('api_requests',
      ['id', 'requester_user_id', 'service_id', 'model', 'target_service_url', 'status', 'api_key', 'reject_reason', 'created_at', 'purpose', 'processed_by', 'processed_at'],
      [r.id, r.requesterUserId, r.serviceId, r.model ?? null, r.targetServiceUrl ?? null, r.status, r.apiKey ?? null, r.rejectReason ?? null, r.createdAt, r.purpose ?? null, r.processedBy ?? null, r.processedAt ?? null])

  for (const r of seed.publishRequests ?? [])
    await ins('publish_requests',
      ['id', 'requester_user_id', 'service_name', 'service_url', 'demo_url', 'meta', 'overview', 'api_desc', 'features', 'tags', 'visibility', 'demo_note', 'status', 'reject_reason', 'created_at', 'admin_memo', 'processed_by', 'processed_at'],
      [r.id, r.requesterUserId, r.serviceName, r.serviceUrl ?? null, r.demoUrl ?? null, r.meta ?? null, r.overview ?? null, r.apiDesc ?? null, r.features ?? [], r.tags ?? [], r.visibility ?? null, r.demoNote ?? null, r.status, r.rejectReason ?? null, r.createdAt, r.adminMemo ?? null, r.processedBy ?? null, r.processedAt ?? null])

  for (const r of seed.gpuChangeRequests ?? [])
    await ins('gpu_change_requests',
      ['id', 'requester_user_id', 'type', 'reason', 'status', 'reject_reason', 'created_at',
        'target_request_id', 'after_server_id', 'after_gpu_id', 'after_slice_id',
        'after_ram_gb', 'after_storage_gb', 'after_cpu_cores', 'after_extra',
        'processed_at', 'processed_by', 'admin_memo'],
      [r.id, r.requesterUserId, r.type, r.reason ?? null, r.status, r.rejectReason ?? null, r.createdAt,
        r.targetRequestId ?? null, r.afterServerId ?? null, r.afterGpuId ?? null, r.afterSliceId ?? null,
        r.afterRamGb ?? null, r.afterStorageGb ?? null, r.afterCpuCores ?? null,
        r.afterExtra ? JSON.stringify(r.afterExtra) : null, r.processedAt ?? null, r.processedBy ?? null, r.adminMemo ?? null])

  // --- model_requests (4.14 모델 신청 관리 — 프론트 ModelRequest 싱크, 구 model_imports 대체) ---
  for (const r of seed.modelRequests ?? [])
    await ins('model_requests',
      ['id', 'requester_user_id', 'model_name', 'kind', 'source', 'reason', 'description', 'license', 'addons', 'status', 'stage', 'created_at', 'reject_reason', 'processed_at', 'processed_by', 'file_name', 'format', 'scan', 'checksum', 'registered_model_id'],
      [r.id, r.requesterUserId, r.modelName, r.kind ?? null, r.source ?? null, r.reason ?? null, r.description ?? null, r.license ?? null, r.addons ?? [], r.status, r.stage, r.createdAt, r.rejectReason ?? null, r.processedAt ?? null, r.processedBy ?? null, r.fileName ?? null, r.format ?? null, r.scan ?? null, r.checksum ?? null, r.registeredModelId ?? null])

  // 카탈로그 모델 신청·배포 이력 백필(정휘선) — models 값(desc/guide/license/addons) 복사. 이미 점유된 모델은 skip(멱등).
  try {
    const bf = JSON.parse(readFileSync(resolve(here, '../../../app/scripts/model-requests.backfill.json'), 'utf-8'))
    const taken = new Set((seed.modelRequests ?? []).filter((r) => r.registeredModelId).map((r) => r.registeredModelId))
    for (const [modelId, it] of Object.entries(bf.items)) {
      if (taken.has(modelId)) continue
      const m = seed.models.find((x) => x.id === modelId)
      if (!m) continue
      const mc = modelContent[modelId] ?? {}
      await ins('model_requests',
        ['id', 'requester_user_id', 'model_name', 'kind', 'source', 'reason', 'description', 'license', 'addons', 'usage_guide', 'status', 'stage', 'created_at', 'processed_at', 'processed_by', 'file_name', 'format', 'scan', 'checksum', 'registered_model_id'],
        [`mr-bf-${modelId}`, bf.requesterUserId, m.name, m.kind, it.source, it.reason,
          mc.description ?? m.description ?? null, m.license ?? null, m.addons ?? [], mc.usageGuide ?? m.usageGuide ?? null,
          'approved', 'deployed', it.created, it.deployed, bf.processedBy, `${it.slug}.safetensors`, 'safetensors', 'pass', it.checksum, modelId])
    }
  } catch { /* 백필 파일 없으면 skip */ }

  for (const k of seed.apiKeyUsages ?? [])
    await ins('api_key_usage', ['key_id', 'service_id', 'connections'],
      [k.keyId, k.serviceId ?? null, k.connections ?? 0])

  // --- market_services (4.17 마켓 표시 전용 — 기존 services 와 별개) — jsonb 는 JSON.stringify ---
  for (const s of seed.marketServices ?? [])
    await ins('market_services',
      ['id', 'name', 'kind', 'provider', 'model', 'api', 'owner', 'owner_user_id', 'service_id', 'rating', 'status', 'hue', 'icon', 'response_time', 'tier', 'monthly_req', 'usage', 'usage_num', 'delta', 'up', 'req_full', 'success', 'delta_pct', 'last_call', 'tags', 'description', 'overview', 'api_desc', 'features', 'ops_notes', 'service_url', 'demo_url', 'thumbnail', 'screenshots'],
      [s.id, s.name, s.kind ?? null, s.provider ?? null, s.model ?? null, s.api ?? null, s.owner ?? null, s.ownerUserId ?? null, s.serviceId ?? null, s.rating ?? null, s.status ?? null, s.hue ?? null, s.icon ?? null, s.responseTime ?? null, s.tier ?? null, s.monthlyReq ?? null, s.usage ?? null, s.usageNum ?? null, s.delta ?? null, s.up ?? null, s.reqFull ?? null, s.success ?? null, s.deltaPct ?? null, s.lastCall ?? null, JSON.stringify(s.tags ?? []), s.desc ?? null, s.overview ?? null, s.apiDesc ?? null, JSON.stringify(s.features ?? []), JSON.stringify(s.opsNotes ?? []), s.serviceUrl ?? null, s.demoUrl ?? null, s.thumbnail ?? null, JSON.stringify(s.screenshots ?? [])])

  console.log(`✓ seeded ${n} rows`)
  const { rows } = await client.query(`select
    (select count(*) from users) users, (select count(*) from models) models,
    (select count(*) from services) services, (select count(*) from gpu_servers) servers,
    (select count(*) from gpus) gpus, (select count(*) from mig_slices) slices,
    (select count(*) from gpu_requests) gpu_requests, (select count(*) from api_requests) api_requests,
    (select count(*) from model_requests) model_requests`)
  console.log('counts:', rows[0])
  await client.end()
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1) })
