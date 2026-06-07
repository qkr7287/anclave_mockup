import { useEffect, useState } from 'react'

// Q12 스켈레톤 로딩 — index.css .skeleton 셰이딩 재사용.
export function Skeleton({ width = '100%', height = 14, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius }} />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton width={`${40 + ((i * 13) % 40)}%`} />
          <Skeleton width={`${20 + ((i * 7) % 25)}%`} />
          <Skeleton width={60} />
        </div>
      ))}
    </div>
  )
}

// 짧은 로딩(스켈레톤) 시연용 훅 — 마운트 후 ms 동안 true.
export function useBriefLoad(ms = 350): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), ms)
    return () => window.clearTimeout(t)
  }, [ms])
  return loading
}
