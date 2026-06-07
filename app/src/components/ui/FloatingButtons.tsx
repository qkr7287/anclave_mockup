import {
  CommandLineIcon,
  BeakerIcon,
  QueueListIcon,
} from '@heroicons/react/24/solid'

interface FloatingButtonsProps {
  /** 이벤트 로그 드로어 열기 */
  onEventLog?: () => void
  /** 대상 라벨(단일=서버, GPU 상세=GPU) */
  target?: string
}

// Q29 우하단 플로팅 — 콘솔·주피터(워크스페이스 새 창) · 이벤트 로그(드로어).
export function FloatingButtons({ onEventLog, target }: FloatingButtonsProps) {
  const btn =
    'flex items-center gap-2 bg-card2 border border-line rounded-lg px-3 py-2 text-[14px] font-semibold hover:border-accent transition-colors'
  // 가로 바(컴팩트) — 우하단 콘텐츠 침범 최소화
  return (
    <div className="fixed bottom-4 right-5 z-30 flex flex-row items-center gap-2">
      <button type="button" className={btn} title={target ? `콘솔 — ${target}` : '콘솔'}>
        <CommandLineIcon width={16} height={16} className="text-accent" />
        콘솔
      </button>
      <button type="button" className={btn} title={target ? `주피터 — ${target}` : '주피터'}>
        <BeakerIcon width={16} height={16} className="text-accent" />
        주피터
      </button>
      <button type="button" className={btn} onClick={onEventLog} title="이벤트 로그">
        <QueueListIcon width={16} height={16} className="text-accent" />
        이벤트 로그
      </button>
    </div>
  )
}
