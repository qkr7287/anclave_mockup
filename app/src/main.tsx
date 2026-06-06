import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './lib/theme'
import { RoleProvider } from './lib/role'
import { ToastProvider } from './components/ui'

// 개발 모드: §5 참조 무결성 자가 점검 — 끊긴 FK가 있으면 콘솔 에러로 표면화(정상이면 무음).
if (import.meta.env.DEV) {
  void import('./data').then(({ verifyIntegrity }) => {
    const issues = verifyIntegrity()
    if (issues.length > 0) console.error('[seed integrity]', issues)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <RoleProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </RoleProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
