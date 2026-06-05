// 워크샵 페이지 간 이전/다음 네비게이션 (하단 고정 바)
(function () {
  const ORDER = [
    ['q1-mood', 'Q1 무드'], ['q2-layout', 'Q2 레이아웃'], ['q3-cards-tables', 'Q3 카드·테이블'],
    ['q4-components', 'Q4 컴포넌트'], ['q5-dataviz', 'Q5 데이터viz'], ['q6-wizard-modal-empty', 'Q6 플로우'],
    ['q7-motion', 'Q7 모션'], ['q8-tokens', 'Q8 토큰'], ['q9-icons', 'Q9 아이콘'],
    ['q10-resourcemap', 'Q10 자원맵'], ['q11-table-form', 'Q11 테이블·폼'], ['q12-states', 'Q12 상태'],
    ['q13-content-visual', 'Q13 콘텐츠 비주얼'], ['q14-lightmode', 'Q14 라이트'], ['q15-charts', 'Q15 차트'],
    ['q16-responsive', 'Q16 반응형'], ['q17-microcopy', 'Q17 마이크로카피'], ['q18-header', 'Q18 헤더'],
    ['q19-cmdk', 'Q19 팔레트'], ['q20-filters', 'Q20 필터'], ['q21-events', 'Q21 이벤트'],
    ['q22-a11y', 'Q22 접근성'], ['q23-bulk', 'Q23 벌크'], ['q24-form-controls', 'Q24 폼 컨트롤'],
  ];
  const cur = location.pathname.split('/').pop().replace('.html', '');
  const i = ORDER.findIndex((x) => x[0] === cur);
  if (i < 0) return;
  const prev = i > 0 ? ORDER[i - 1] : null;
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null;

  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;' +
    'padding:10px 22px;background:rgba(10,13,18,.92);backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.08);' +
    'font-family:Pretendard,system-ui,sans-serif';

  const link = (item, dir) => {
    if (!item) return '<span style="width:140px"></span>';
    const a = dir < 0 ? '←&nbsp; ' : '';
    const b = dir > 0 ? ' &nbsp;→' : '';
    return (
      `<a href="${item[0]}.html" style="display:inline-flex;align-items:center;color:#e6edf3;text-decoration:none;` +
      `font-size:13px;font-weight:600;padding:8px 15px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#1c2430">` +
      `${a}${item[1]}${b}</a>`
    );
  };

  bar.innerHTML =
    link(prev, -1) +
    `<a href="index.html" style="color:#8b97a7;text-decoration:none;font-size:12.5px;font-weight:600">목록 · ${i + 1}/${ORDER.length}</a>` +
    link(next, 1);

  document.body.appendChild(bar);
  document.body.style.paddingBottom = '72px';
})();
