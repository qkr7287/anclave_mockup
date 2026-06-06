import { PageScaffold } from '../components/PageScaffold'

// ⑥ 게시판 (4.23)

export function Board() {
  return (
    <PageScaffold
      screen="4.23"
      title="게시판 · 공지"
      desc="공지·문의·매뉴얼, 모델 도입 문의 (공통)."
      preview={['Tabs[공지 / 문의·Q&A / 매뉴얼]', '글 테이블', '글쓰기·상세 모달', '답변됨 배지']}
    />
  )
}
