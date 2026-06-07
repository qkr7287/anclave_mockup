import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, Switch } from '../components/ui'
import { capabilities, infraIntegrations } from '../data/admin'
import { users } from '../data/users'
import { accessOf } from '../lib/role'

// ── 4.26 능력 탐지 · 기능 플래그 (A) ──────────────────────
const FEATURE_FLAGS = [
  { key: 'mig-menu', label: 'MIG 메뉴 노출', on: true },
  { key: 'time-slice', label: 'Time-Slicing 허용', on: true },
  { key: 'auto-deploy', label: '에이전트 자동 배포', on: true },
  { key: 'beta-playground', label: '플레이그라운드(베타)', on: false },
]
export function Capabilities() {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, f.on])))

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="능력 탐지 · 기능 플래그" screen="4.26" desc="GPU·오케스트레이터 지원을 탐지하고 기능을 켜고 꺼요." />
      <Card title="지원 매트릭스" flush>
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /><col style={{ width: '30%' }} /><col style={{ width: '32%' }} /></colgroup>
          <thead><tr style={{ background: 'var(--th-bg)' }}>{['GPU 세대', 'MIG', '오케스트레이터', '지원 기능'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {capabilities.map((c, i) => (
              <tr key={c.gpuGen} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{c.gpuGen}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{c.migSupported ? <Badge tone="ok" dot={false}>지원</Badge> : <Badge tone="danger" dot={false}>미지원</Badge>}</td>
                <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{c.orchestrator}</td>
                <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{c.enabledFeatures.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="기능 플래그">
        <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          {FEATURE_FLAGS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-line" style={{ padding: '10px 12px' }}>
              <span className="truncate" style={{ fontSize: 14 }}>{f.label}</span>
              <Switch on={flags[f.key]} onChange={(v) => setFlags((s) => ({ ...s, [f.key]: v }))} label={f.label} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── 4.27 사용자 · 역할 관리 (A) ───────────────────────────
const ACCESS_LABEL: Record<string, string> = { A: 'A · 최종관리자', B: 'B · 실무관리자', C: 'C · 사용자' }
export function UsersAdmin() {
  const [appNoti, setAppNoti] = useState(true)
  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="사용자 · 역할 관리" screen="4.27" desc="사용자 역할을 관리하고 알림 채널을 설정해요. (폐쇄망 · 메일 미사용)" />
      <Card title={`사용자 ${users.length}`} flush>
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup><col style={{ width: '20%' }} /><col style={{ width: '24%' }} /><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '22%' }} /></colgroup>
          <thead><tr style={{ background: 'var(--th-bg)' }}>{['이름', '이메일', '역할', '호스팅', '권한'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{u.name}</td>
                <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{u.email}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>
                  <select defaultValue={u.role} className="bg-soft border border-line rounded-lg text-text" style={{ fontSize: 14, padding: '4px 8px' }}>
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{u.hasHosting ? <Badge tone="ok" dot={false}>보유</Badge> : <span className="text-muted" style={{ fontSize: 14 }}>—</span>}</td>
                <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{ACCESS_LABEL[accessOf(u)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="알림 채널">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line" style={{ padding: '10px 12px' }}>
          <span style={{ fontSize: 14 }}>앱 내 알림(벨 + 글로벌 알림창) — 폐쇄망이라 메일은 사용하지 않아요.</span>
          <Switch on={appNoti} onChange={setAppNoti} label="앱 내 알림" />
        </div>
      </Card>
    </div>
  )
}

// ── 4.28 인프라 연동 (A) ──────────────────────────────────
export function InfraIntegrationScreen() {
  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="인프라 연동" screen="4.28" desc="DCGM · Prometheus · 메트릭 · 오케스트레이터 연동 상태를 점검해요." />
      <div className="grid" style={{ gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {infraIntegrations.map((it) => (
          <div key={it.id} className="bg-card2 border border-line rounded-xl" style={{ padding: '14px 16px', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-bold truncate" style={{ fontSize: 14 }}>{it.name}</span>
              {it.status === 'connected' ? <Badge tone="ok">연결됨</Badge> : <Badge tone="danger">끊김</Badge>}
            </div>
            <div className="text-muted truncate font-mono" style={{ fontSize: 14 }}>{it.endpoint}</div>
            <div className="text-muted mt-1" style={{ fontSize: 14 }}>종류: {it.kind}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
