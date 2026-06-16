// 마켓 그룹 공통 QA polish — 정적 텍스트 선택/드래그 차단, 인터랙티브 요소엔 pointer 커서,
// 입력 필드는 텍스트 선택 유지. data-qa 속성을 가진 루트의 하위에만 적용된다.
export function QaPolish() {
  return (
    <style>{`
      [data-qa]{user-select:none;-webkit-user-select:none}
      [data-qa] button:not(:disabled),[data-qa] a,[data-qa] select,[data-qa] summary,[data-qa] label,[data-qa] [role="slider"],[data-qa] [role="button"],[data-qa] tr.cursor-pointer,[data-qa] .cursor-pointer{cursor:pointer}
      [data-qa] button:disabled{cursor:not-allowed}
      [data-qa] input,[data-qa] textarea,[data-qa] [contenteditable]{user-select:text;-webkit-user-select:text;cursor:auto}
    `}</style>
  )
}
