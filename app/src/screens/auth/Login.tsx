import { useNavigate } from 'react-router-dom'
import { accessOf, useRole } from '../../lib/role'
import { userById } from '../../data/users'

const DEMO = [
  { id: 'u-admin', desc: '전체 자원맵 · 승인 · 시스템 설정' },
  { id: 'u-manager', desc: '호스팅 후(B) · 내 할당 자원 대시보드' },
  { id: 'u-user', desc: '호스팅 전(C) · 마켓에서 신청부터' },
]
const ACCESS_LABEL: Record<string, string> = { A: 'A · 최종관리자', B: 'B · 실무관리자', C: 'C · 사용자' }

// 4.1 로그인 — Q13 라디얼 글로우 배경 + gradient 로고 + 3계정 선택.
export function Login() {
  const navigate = useNavigate()
  const { setUserId } = useRole()

  const pick = (id: string) => {
    const u = userById(id)!
    setUserId(id)
    navigate(u.initialRoute)
  }

  return (
    <div
      className="h-full flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(28% 22% at 28% 22%, rgba(110,168,254,.10), transparent 55%), radial-gradient(40% 40% at 78% 80%, rgba(157,111,224,.08), transparent 55%), #0a0d12',
      }}
    >
      <div
        className="rounded-2xl border border-line"
        style={{ width: 320, background: 'rgba(22,28,38,.82)', backdropFilter: 'blur(8px)', padding: '24px 22px', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}
      >
        <div
          className="font-extrabold"
          style={{ fontSize: 22, background: 'linear-gradient(92deg,#6ea8fe,#9d6fe0)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
        >
          Anclave.
        </div>
        <p style={{ fontSize: 14, color: '#8b97a7', marginTop: 4 }}>
          폐쇄망 GPU 호스팅 · AI 마켓플레이스
        </p>

        <div className="flex flex-col mt-5" style={{ gap: 8 }}>
          {DEMO.map((d) => {
            const u = userById(d.id)!
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d.id)}
                className="text-left rounded-lg border border-line hover:border-accent transition-colors"
                style={{ padding: '11px 12px', background: 'rgba(28,36,48,.6)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{ width: 22, height: 22, background: '#6ea8fe', color: '#08111f', fontSize: 14, fontWeight: 800 }}
                  >
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-semibold" style={{ fontSize: 14, color: '#e6edf3' }}>
                    {u.name}
                  </span>
                  <span className="ml-auto" style={{ fontSize: 14, color: '#6ea8fe' }}>
                    {ACCESS_LABEL[accessOf(u)]}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: '#8b97a7', marginTop: 4 }}>{d.desc}</div>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 14, color: '#616a74', marginTop: 14 }}>
          데모 계정 — 클릭하면 역할별 첫 화면으로 이동해요.
        </p>
      </div>
    </div>
  )
}
