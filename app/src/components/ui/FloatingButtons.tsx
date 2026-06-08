import { useState } from 'react'
import {
  CommandLineIcon,
  BeakerIcon,
  QueueListIcon,
  ChevronDoubleRightIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/solid'

interface FloatingButtonsProps {
  /** 이벤트 로그 드로어 열기 */
  onEventLog?: () => void
  /** 대상 라벨(단일=서버, GPU 상세=GPU) */
  target?: string
}

// Q29 우하단 플로팅 — 콘솔·주피터(워크스페이스 새 창) · 이벤트 로그(드로어) + 접기/펼치기 토글.
export function FloatingButtons({ onEventLog, target }: FloatingButtonsProps) {
  const [open, setOpen] = useState(true)
  const btn =
    'flex items-center gap-2 bg-card2 border border-line rounded-lg px-3 py-2 text-[14px] font-semibold hover:border-accent transition-colors'
  const iconBtn =
    'flex items-center justify-center bg-card2 border border-line rounded-lg hover:border-accent transition-colors'

  return (
    <div className="fixed bottom-4 right-5 z-30 flex flex-row items-center gap-2">
      {open ? (
        <>
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
          {/* 접기 — 우측 끝으로 치움 */}
          <button
            type="button"
            className={iconBtn}
            style={{ width: 38, height: 38 }}
            onClick={() => setOpen(false)}
            title="플로팅 메뉴 접기"
            aria-label="플로팅 메뉴 접기"
          >
            <ChevronDoubleRightIcon width={16} height={16} className="text-muted" />
          </button>
        </>
      ) : (
        // 접힘 — 펼치기 버튼만
        <button
          type="button"
          className={iconBtn}
          style={{ width: 44, height: 44 }}
          onClick={() => setOpen(true)}
          title="플로팅 메뉴 펼치기"
          aria-label="플로팅 메뉴 펼치기"
        >
          <Squares2X2Icon width={20} height={20} className="text-accent" />
        </button>
      )}
    </div>
  )
}
