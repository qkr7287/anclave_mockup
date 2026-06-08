import { Badge } from './ui'
import { useRole } from '../lib/role'

// 화면 ↔ 구현 STEP (병렬 작업 단위)
const STEP_BY_SCREEN: Record<string, number> = {
  '4.2': 1, '4.3': 1, '4.4': 1, '4.5': 2, '4.6': 2, '4.8': 3, '4.11': 3,
  '4.9': 4, '4.10': 4, '4.12': 5, '4.13': 5, '4.14': 6, '4.15': 6, '4.16': 7,
  '4.17': 8, '4.18': 8, '4.19': 9, '4.20': 9, '4.21': 10, '4.22': 10,
  '4.7': 11, '4.23': 12, '4.24': 13, '4.25': 13, '4.26': 13, '4.27': 13, '4.28': 13,
}

const ACCESS_LABEL: Record<string, string> = { A: '최종관리자', B: '실무관리자', C: '사용자' }

interface FoundationPageProps {
  screen: string
  title: string
  desc: string
  group: number
  planned: string[]
  roles?: ('A' | 'B' | 'C')[]
}

// 아직 구현 전인 화면 — 셸(사이드바·헤더) 안에 "무엇이 들어올지" 설명하는 placeholder 박스.
// 실제 구현은 STEP별 병렬 세션이 자기 화면 파일에서 채운다.
export function FoundationPage({ screen, title, desc, planned, roles }: FoundationPageProps) {
  const { access } = useRole()
  const step = STEP_BY_SCREEN[screen]

  return (
    <div className="flex flex-col h-full min-h-0" style={{ padding: '20px 24px', gap: 14 }}>
      <div>
        <h1 className="font-bold" style={{ fontSize: 20 }}>{title}</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>{desc}</p>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          className="rounded-2xl text-center"
          style={{ maxWidth: 580, width: '100%', padding: '36px 32px', background: 'var(--c-card)', border: '1px dashed var(--c-border)' }}
        >
          <Badge tone="info" dot={false}>{step != null ? `STEP ${step} · 구현 예정` : '구현 예정'}</Badge>
          <h3 className="font-bold" style={{ fontSize: 17, marginTop: 14 }}>
            이 자리에 「{title}」 페이지가 들어옵니다
          </h3>

          <div style={{ marginTop: 18, textAlign: 'left' }}>
            <p className="text-muted" style={{ fontSize: 14, marginBottom: 8 }}>들어올 구성</p>
            <ul className="flex flex-col" style={{ gap: 6 }}>
              {planned.map((p, i) => (
                <li key={p} className="flex items-start gap-2.5" style={{ fontSize: 14 }}>
                  <span
                    className="flex items-center justify-center rounded-md shrink-0 font-bold"
                    style={{ width: 22, height: 22, fontSize: 14, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="text-muted"
            style={{ fontSize: 14, marginTop: 18, borderTop: '1px solid var(--c-border)', paddingTop: 12 }}
          >
            화면 {screen} · 접근 {roles && roles.length ? roles.join(' · ') : '공통'} · 현재 역할 {access} · {ACCESS_LABEL[access]}
          </div>
        </div>
      </div>
    </div>
  )
}
