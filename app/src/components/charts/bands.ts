// Q10 사용률 5밴드 그라데이션(블루→퍼플) + 빈/가용 빗금.
export function bandGradient(usage: number): string {
  if (usage < 25) return 'linear-gradient(155deg, #525d72, #3a4252)'
  if (usage < 50) return 'linear-gradient(155deg, #6f9bf2, #4d72d2)'
  if (usage < 75) return 'linear-gradient(155deg, #7e88ee, #5d64ca)'
  if (usage < 90) return 'linear-gradient(155deg, #9f80ea, #7a59ce)'
  return 'linear-gradient(155deg, #c178e2, #9c51c2)'
}

// 빈 슬라이스(가용) 빗금 텍스처.
export const hatchBackground =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 6px, rgba(255,255,255,.02) 6px 12px)'

export const BAND_LEGEND = [
  { color: '#414a5c', label: '유휴 <25%' },
  { color: '#5b8def', label: '25–50%' },
  { color: '#6b71d8', label: '50–75%' },
  { color: '#8d6be0', label: '75–90%' },
  { color: '#b25fd0', label: '>90%' },
]
