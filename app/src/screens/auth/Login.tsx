import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '../../lib/role'
import { userById } from '../../data/users'

// 데모 로그인 계정 3종 (공통 비번). 실데이터 보유 user 로 매핑해 화면이 채워지게.
const CREDENTIALS: Record<string, { pw: string; id: string }> = {
  admin: { pw: 'agics12!@', id: 'u-admin' },
  hwang: { pw: 'agics12!@', id: 'u-hwang' },
  lim: { pw: 'agics12!@', id: 'u-lim' },
}
const HINTS = [
  { u: 'admin', label: '최종관리자', desc: '전체 자원맵 · 승인 · 시스템 설정' },
  { u: 'hwang', label: '대표 · 서비스 운영', desc: 'GPU·서비스 보유 — 내 할당/신청' },
  { u: 'lim', label: '사용자 · 신청', desc: '신청 검토중 · 마켓 이용' },
]

// 4.1 로그인 — 라디얼 글로우 배경 + gradient 로고 + 아이디/비번.
export function Login() {
  const navigate = useNavigate()
  const { login } = useRole()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const cred = CREDENTIALS[username.trim()]
    if (!cred || cred.pw !== password) {
      setError('아이디 또는 비밀번호가 올바르지 않아요.')
      return
    }
    login(cred.id)
    navigate(userById(cred.id)!.initialRoute)
  }

  const fill = (u: string) => {
    setUsername(u)
    setPassword('agics12!@')
    setError('')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 42,
    padding: '0 12px',
    fontSize: 14,
    color: '#e6edf3',
    background: 'rgba(12,16,22,.7)',
    border: '1px solid #2a3344',
    borderRadius: 8,
    outline: 'none',
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
        style={{ width: 340, background: 'rgba(22,28,38,.82)', backdropFilter: 'blur(8px)', padding: '26px 24px', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}
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

        <form onSubmit={submit} className="flex flex-col mt-5" style={{ gap: 10 }}>
          <input
            style={inputStyle}
            placeholder="아이디 (admin / hwang / lim)"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError('') }}
            aria-label="아이디"
            autoFocus
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            aria-label="비밀번호"
          />
          {error && (
            <span style={{ fontSize: 14, color: '#f85149' }}>{error}</span>
          )}
          <button
            type="submit"
            className="font-semibold transition-colors"
            style={{ height: 42, borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 15 }}
          >
            로그인
          </button>
        </form>

        <div style={{ borderTop: '1px solid #2a3344', marginTop: 18, paddingTop: 14 }}>
          <p style={{ fontSize: 14, color: '#616a74', marginBottom: 8 }}>데모 계정 — 클릭하면 자동 입력</p>
          <div className="flex flex-col" style={{ gap: 6 }}>
            {HINTS.map((h) => (
              <button
                key={h.u}
                type="button"
                onClick={() => fill(h.u)}
                className="text-left rounded-lg border border-line hover:border-accent transition-colors"
                style={{ padding: '8px 11px', background: 'rgba(28,36,48,.5)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold" style={{ fontSize: 14, color: '#cfe3ff' }}>{h.u}</span>
                  <span style={{ fontSize: 13, color: '#8b97a7' }}>{userById(CREDENTIALS[h.u].id)?.name}</span>
                  <span className="ml-auto" style={{ fontSize: 14, color: '#6ea8fe' }}>{h.label}</span>
                </div>
                <div style={{ fontSize: 14, color: '#8b97a7', marginTop: 2 }}>{h.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
