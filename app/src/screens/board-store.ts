import { userById } from '../data'

// 4.23 게시판 · 공지 — 목업 store(세션 사본).
// 카테고리 3종: 공지(notice) / 문의·Q&A(qna) / 매뉴얼(manual).
//  · 공지 = 관리자 작성, 전원 열람. 상단 고정(pinned) + 말머리(noticeTag).
//  · 문의 = 사용자 작성(모델 도입·기술·계정·일반), 관리자 답변 → '답변 완료' 배지.
//  · 매뉴얼 = 관리자 관리, 분류별 가이드 문서(전원 열람).
// 시드는 실제 user id 참조. 백엔드 endpoint 생기면 이 레이어만 교체.

export type BoardCategory = 'notice' | 'qna' | 'manual'
export type NoticeTag = '일반' | '점검' | '정책' | '긴급'
export type QnaTopic = 'general' | 'model' | 'tech' | 'account'
export type AnswerState = 'answered' | 'pending'

export const NOTICE_TAGS: NoticeTag[] = ['일반', '점검', '정책', '긴급']

export const QNA_TOPIC_META: Record<QnaTopic, { label: string; tone: 'accent' | 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  general: { label: '일반', tone: 'neutral' },
  model: { label: '모델 도입', tone: 'accent' },
  tech: { label: '기술', tone: 'ok' },
  account: { label: '계정·권한', tone: 'warn' },
}

export const MANUAL_TAGS = ['시작하기', '자원', '마켓플레이스', '모델', 'API'] as const
export type ManualTag = (typeof MANUAL_TAGS)[number]

export interface BoardAnswer {
  body: string
  byUserId: string
  at: string
}

export interface BoardAttachment {
  name: string
  size: string // '240 KB' 등 표기 문자열(목업)
}

export interface BoardPost {
  id: string
  category: BoardCategory
  title: string
  body: string
  authorUserId: string
  createdAt: string // 'YYYY-MM-DD HH:mm'
  views: number
  // notice
  pinned?: boolean
  noticeTag?: NoticeTag
  // qna
  topic?: QnaTopic
  answer?: BoardAnswer
  // manual
  manualTag?: ManualTag
  updatedAt?: string
  // 공통
  attachments?: BoardAttachment[]
}

// 'YYYY-MM-DD HH:mm'
export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function answerStateOf(p: BoardPost): AnswerState {
  return p.answer ? 'answered' : 'pending'
}

// ──────────────────────────── 시드 ────────────────────────────

const NOTICES: BoardPost[] = [
  {
    id: 'bn-01', category: 'notice', authorUserId: 'u-admin', pinned: true, noticeTag: '긴급',
    title: 'GPU 클러스터 정기 점검 안내 (6/20 02:00~06:00)', createdAt: '2026-06-14 09:10', views: 412,
    body: `안녕하세요, 시스템 관리팀입니다.

인프라 안정화를 위한 전체 GPU 클러스터 정기 점검을 아래와 같이 진행합니다. 점검 시간 동안 일부 서비스 이용이 제한되오니 업무에 참고 부탁드립니다.

[ 점검 일시 ]
2026년 6월 20일(토) 02:00 ~ 06:00 (4시간)

[ 점검 영향 범위 ]
· 자원 신청 · 할당 · 회수 처리 일시 중단
· 마켓플레이스 추론(API · 웹 UI) 호출 중단
· 모델 반입 · 게시 신청 처리 보류

[ 사용자 조치 사항 ]
1. 진행 중인 학습 작업은 점검 시작 전 체크포인트를 저장해 주세요.
2. 야간 배치 작업은 06:00 이후로 예약 시간을 조정해 주세요.
3. 점검 완료 후 자동 복구되며, 별도 재신청은 필요하지 않습니다.

점검 일정은 인프라 상황에 따라 변동될 수 있으며, 변경 시 본 게시판을 통해 다시 공지드립니다. 문의는 문의 · Q&A 게시판으로 남겨 주시면 순차 답변드리겠습니다.

협조해 주셔서 감사합니다.`,
    attachments: [
      { name: '클러스터_점검_안내문_v2.pdf', size: '248 KB' },
      { name: '점검_대상_서버_목록.xlsx', size: '36 KB' },
    ],
  },
  {
    id: 'bn-02', category: 'notice', authorUserId: 'u-admin', pinned: true, noticeTag: '정책',
    title: '자원 신청·회수 정책 개정 안내 (2026-07 시행)', createdAt: '2026-06-11 14:30', views: 287,
    body: `안녕하세요, 시스템 관리팀입니다.

GPU 자원의 효율적 운영과 유휴 자원 회수를 위해 자원 신청·회수 정책을 아래와 같이 개정하여 2026년 7월 1일부터 시행합니다. 신규 신청부터 적용되며, 기존 할당은 첫 갱신 시점부터 순차 적용됩니다.

[ 주요 변경 사항 ]
1. 신청 시 '사용 목적'과 '예상 사용 기간' 입력이 필수로 변경됩니다. 목적이 모호하거나 기간 미기재 시 반려될 수 있습니다.
2. 90일 이상 미사용(평균 사용률 5% 미만) 할당은 매월 1일 '회수 권고 대상'으로 자동 분류되어 담당자에게 알림이 발송됩니다.
3. 회수 권고 후 14일 이내 응답이 없으면 관리자 검토를 거쳐 자원이 가용 풀로 환원됩니다.
4. 동일 사용자의 GPU 카드 동시 보유 상한이 8장 → 6장으로 조정됩니다. (초과 보유분은 갱신 시 조정 협의)

[ 적용 일정 ]
· 2026-07-01 : 신규 신청 적용 시작
· 2026-08-01 : 기존 할당 회수 권고 1차 발송

[ 사용자 협조 사항 ]
장기 미사용 자원은 미리 자율 반납해 주시면 신규 프로젝트 배정이 원활해집니다. 반납은 '자원 신청현황 > 변경·확장·회수'에서 신청하실 수 있습니다.

정책 개정 배경과 세부 기준은 첨부된 운영정책 개정본과 매뉴얼 탭의 "GPU 자원 신청 가이드"를 참고해 주시기 바랍니다.`,
    attachments: [
      { name: '자원_운영정책_개정본_2026-07.pdf', size: '512 KB' },
      { name: '회수_대상_산정기준_요약.pdf', size: '184 KB' },
    ],
  },
  {
    id: 'bn-03', category: 'notice', authorUserId: 'u-admin', noticeTag: '일반',
    title: '모델 카탈로그 신규 모델 7종 추가', createdAt: '2026-06-09 11:00', views: 198,
    body: `모델 카탈로그에 신규 모델 7종이 추가되었습니다. 보안 스캔과 라이선스 검토를 완료한 모델로, 카탈로그에서 상세 스펙을 확인하고 바로 반입을 신청하실 수 있습니다.

[ 추가된 모델 ]
· Qwen2.5-72B-Instruct — 다국어 범용, vLLM 서빙 검증 완료
· Qwen2.5-7B-Instruct — 경량 추론·요약용
· Llama 3.3-70B-Instruct — 영문 추론 성능 강화
· bge-m3 — 다국어 임베딩(RAG 파이프라인 권장)
· bge-reranker-v2-m3 — 검색 결과 재정렬
· Whisper-large-v3 — 음성 인식(STT)
· Stable Diffusion 3.5 — 이미지 생성

[ 이용 안내 ]
각 모델의 GPU 요구 사항(메모리·MIG 분할 가능 여부)은 카탈로그 상세 페이지에서 확인하실 수 있습니다. 라이선스 조건이 상이하므로, 상용 서비스 배포 전에는 반드시 라이선스 항목을 검토해 주세요.

반입 신청은 '모델 관리 > 모델 신청 관리'에서 진행하시면 됩니다.`,
  },
  {
    id: 'bn-04', category: 'notice', authorUserId: 'u-admin', noticeTag: '점검',
    title: '마켓플레이스 API 게이트웨이 업데이트 완료', createdAt: '2026-06-05 17:40', views: 156,
    body: `마켓플레이스 API 게이트웨이가 v2.3으로 업데이트되었습니다. 무중단 배포로 진행되어 서비스 중단은 없었으며, 기존 발급 API 키는 변경 없이 그대로 사용 가능합니다.

[ 개선 사항 ]
· 평균 응답 지연 약 28% 단축 (커넥션 풀링·캐시 계층 개선)
· 스트리밍 응답(SSE) 안정성 강화 — 장시간 연결 끊김 현상 해소
· 요청별 토큰 사용량 응답 헤더(x-usage-tokens) 추가
· rate limit 초과 시 응답 코드를 429로 표준화

[ 참고 ]
SDK를 사용 중인 경우 최신 버전으로 업데이트하시면 신규 헤더와 재시도 로직을 자동 활용할 수 있습니다. 엔드포인트 URL과 인증 방식은 변경되지 않았습니다.

이슈 발생 시 문의 · Q&A 게시판으로 남겨 주세요.`,
  },
  {
    id: 'bn-05', category: 'notice', authorUserId: 'u-admin', noticeTag: '일반',
    title: '사내 LLM 사용 가이드라인 v2 배포', createdAt: '2026-05-30 10:20', views: 234,
    body: `데이터 보안 및 모델 활용 가이드라인 v2가 배포되었습니다. 최근 사내 LLM 활용이 확대됨에 따라, 민감정보 취급 기준과 외부 모델 사용 원칙을 구체화했습니다. 전 구성원은 숙지 후 업무에 적용해 주시기 바랍니다.

[ v2 주요 추가 내용 ]
1. 고객 개인정보·계약 정보는 사내 폐쇄망 모델에서만 처리하며, 외부 API 모델 입력을 금지합니다.
2. 프롬프트에 입력한 데이터는 학습에 사용되지 않으나, 로그 보존 정책(90일)에 따라 감사 대상이 됩니다.
3. 생성 결과물을 외부 공개·배포할 경우, 사실 검증과 라이선스 확인을 담당자가 책임집니다.
4. 코드 생성·리뷰 용도 사용 시 비밀키·내부 엔드포인트가 포함되지 않도록 주의합니다.

[ 적용 ]
본 가이드라인은 즉시 적용되며, 위반 시 감사 로그를 통해 확인될 수 있습니다. 세부 사례와 FAQ는 첨부 문서 및 매뉴얼 탭을 참고해 주세요.

문의는 문의 · Q&A 게시판으로 남겨 주시면 보안팀이 답변드립니다.`,
    attachments: [{ name: '사내_LLM_사용_가이드라인_v2.pdf', size: '1.2 MB' }],
  },
]

const QNAS: BoardPost[] = [
  {
    id: 'bq-01', category: 'qna', authorUserId: 'u-pts', topic: 'model',
    title: 'Qwen2.5-72B 도입 문의 — vLLM 서빙 가능 여부', createdAt: '2026-06-15 16:22', views: 41,
    body: '서비스 기술개발팀입니다. Qwen2.5-72B-Instruct를 vLLM으로 서빙하려고 하는데, 현재 클러스터의 H100 단일 카드로 가능한지, MIG 분할이 필요한지 문의드립니다. 예상 동시 사용자는 20명 내외입니다.',
  },
  {
    id: 'bq-02', category: 'qna', authorUserId: 'u-jhs', topic: 'tech',
    title: 'MIG 슬라이스 할당 후 nvidia-smi 인식 문제', createdAt: '2026-06-14 13:05', views: 67,
    body: '16GB MIG 슬라이스를 할당받았는데 컨테이너 내부에서 nvidia-smi 실행 시 GPU가 보이지 않습니다. 드라이버 설정 이슈일까요?',
    answer: { byUserId: 'u-admin', at: '2026-06-14 15:48', body: 'NVIDIA_VISIBLE_DEVICES 환경변수에 할당된 MIG UUID가 정확히 매핑되었는지 확인 부탁드립니다. 컨테이너 재시작 후에도 동일하면 신청 ID와 함께 다시 알려주시면 직접 점검하겠습니다.' },
  },
  {
    id: 'bq-03', category: 'qna', authorUserId: 'u-pjh', topic: 'general',
    title: '할당 자원 회수 신청은 어디서 하나요?', createdAt: '2026-06-13 10:40', views: 38,
    body: '프로젝트가 종료되어 할당받은 GPU를 반납하려고 합니다. 회수 신청 경로를 알려주세요.',
    answer: { byUserId: 'u-admin', at: '2026-06-13 11:15', body: '자원 신청현황 > 상세 보기에서 "변경 · 확장 · 회수" 신청으로 진행하시면 됩니다. 회수 신청 후 관리자 승인 시 반영됩니다.' },
  },
  {
    id: 'bq-04', category: 'qna', authorUserId: 'u-kgr', topic: 'model',
    title: '임베딩 모델(bge-m3) 반입 가능 여부', createdAt: '2026-06-12 09:18', views: 29,
    body: 'RAG 파이프라인용으로 bge-m3 임베딩 모델을 반입하고 싶습니다. 라이선스 검토가 필요한지 문의드립니다.',
  },
  {
    id: 'bq-05', category: 'qna', authorUserId: 'u-leh', topic: 'account',
    title: '호스팅 권한 신청 절차 문의', createdAt: '2026-06-10 14:55', views: 52,
    body: '마켓플레이스에 서비스를 게시하려면 호스팅 권한이 필요하다고 들었습니다. 신청 절차가 어떻게 되나요?',
    answer: { byUserId: 'u-admin', at: '2026-06-10 16:30', body: '호스팅 권한은 팀 리더 승인 후 시스템 설정 > 사용자·역할 관리에서 관리자가 부여합니다. 팀 리더 승인 메일을 시스템 관리팀으로 전달해 주세요.' },
  },
  {
    id: 'bq-06', category: 'qna', authorUserId: 'u-hwang', topic: 'tech',
    title: 'API 키 rate limit 상향 요청', createdAt: '2026-06-08 11:30', views: 44,
    body: '운영 중인 서비스의 호출량이 증가해 분당 요청 한도 상향이 필요합니다. 절차를 안내해 주세요.',
  },
]

const MANUALS: BoardPost[] = [
  {
    id: 'bm-01', category: 'manual', authorUserId: 'u-admin', manualTag: '시작하기',
    title: 'GPU 자원 신청 가이드', createdAt: '2026-04-02 10:00', updatedAt: '2026-06-11 14:35', views: 891,
    body: `GPU 번들을 신청하고 할당받기까지의 전체 절차를 안내합니다. 처음 사용하시는 분은 이 문서를 먼저 읽어 주세요.

[ 신청 절차 ]
1. '자원 신청현황 > 신규 신청'으로 이동합니다.
2. 필요한 GPU 종류·수량, 메모리·저장공간·CPU를 선택합니다.
3. 사용 목적과 예상 사용 기간을 입력합니다. (2026-07부터 필수)
4. 신청서를 제출하면 관리자 검토 후 승인·반려 결과가 알림으로 전달됩니다.

[ 승인 흐름 ]
신청 → 관리자 검토 → 승인(서버·GPU 자동 배치) 또는 반려(사유 회신). 승인 시 '내 할당 자원'에서 접속 정보를 확인할 수 있습니다.

[ 작성 팁 ]
· 사용 목적은 모델명·서비스명까지 구체적으로 적을수록 승인이 빠릅니다.
· 단기 실험이라면 예상 기간을 짧게 잡아 회수 권고 대상에서 제외되도록 합니다.
· MIG 분할이 가능한 워크로드는 슬라이스 단위 신청을 권장합니다.`,
  },
  {
    id: 'bm-02', category: 'manual', authorUserId: 'u-admin', manualTag: '자원',
    title: 'MIG 슬라이스 이해하기', createdAt: '2026-04-10 10:00', updatedAt: '2026-05-22 09:10', views: 603,
    body: `MIG(Multi-Instance GPU)는 하나의 물리 GPU를 여러 개의 독립 인스턴스로 분할해 사용하는 기술입니다. 소규모 추론·실험 워크로드에 GPU 한 장을 통째로 점유하지 않고 효율적으로 자원을 나눠 쓸 수 있습니다.

[ 슬라이스 단위 ]
· 16GB 슬라이스 — 경량 모델 추론, 임베딩 서버에 적합
· 32GB 슬라이스 — 중형 모델, 동시 사용자 다수 환경
· 전체 카드 — 대형 모델(70B급) 또는 고부하 학습

[ 할당 방식 ]
신청 시 'MIG 분할'을 선택하면 가용한 슬라이스가 배정됩니다. 슬라이스는 서로 메모리·연산이 격리되어 다른 사용자의 작업에 영향을 주지 않습니다.

[ 컨테이너 연동 주의사항 ]
· 컨테이너에는 NVIDIA_VISIBLE_DEVICES에 배정된 MIG UUID를 정확히 매핑해야 합니다.
· nvidia-smi에서 인스턴스가 보이지 않으면 UUID 매핑과 컨테이너 재시작을 먼저 확인하세요.
· 슬라이스는 동적 재분할이 불가하므로, 용량 변경이 필요하면 변경 신청을 이용합니다.`,
  },
  {
    id: 'bm-03', category: 'manual', authorUserId: 'u-admin', manualTag: '마켓플레이스',
    title: '마켓플레이스 서비스 게시 절차', createdAt: '2026-04-18 10:00', updatedAt: '2026-06-05 13:20', views: 477,
    body: `배포한 AI 서비스를 사내 마켓플레이스에 노출(게시)해 다른 구성원이 사용하도록 공개하는 절차입니다. 게시에는 호스팅 권한과 관리자 승인이 필요합니다.

[ 게시 절차 ]
1. '마켓플레이스 > 서비스 게시 신청'에서 신규 게시 신청을 작성합니다.
2. 서비스명·소개·종류(웹 UI / API)·연동 모델·데모 URL을 입력합니다.
3. 관리자 검토(보안·노출 적합성) 후 승인되면 마켓플레이스에 공개됩니다.
4. 반려 시 사유가 회신되며, 보완 후 재신청할 수 있습니다.

[ 게시 전 체크리스트 ]
· 서비스 소개와 사용 방법이 명확히 작성되어 있는가
· API 제공 시 인증·rate limit 정책이 정의되어 있는가
· 데모 URL이 정상 동작하는가

[ 공개 후 관리 ]
공개된 서비스의 API 키 신청은 'API 신청 관리'에서 소유자가 직접 승인·발급합니다. 사용량과 발급 현황도 같은 화면에서 확인할 수 있습니다.`,
  },
  {
    id: 'bm-04', category: 'manual', authorUserId: 'u-admin', manualTag: '모델',
    title: '모델 반입 신청 매뉴얼', createdAt: '2026-05-01 10:00', updatedAt: '2026-06-09 11:05', views: 388,
    body: `외부 모델(오픈소스·상용)을 사내 카탈로그에 반입해 자원 신청·배포에 사용할 수 있도록 등록하는 절차입니다. 반입된 모델만 GPU 신청과 마켓플레이스 게시에 사용할 수 있습니다.

[ 반입 절차 ]
1. '모델 관리 > 모델 신청 관리 > 신규 반입'에서 신청서를 작성합니다.
2. 모델 출처(HuggingFace 등), 라이선스, 용도, 예상 GPU 요구사항을 입력합니다.
3. 관리자가 라이선스 적합성과 보안 스캔(악성코드·취약점)을 검토합니다.
4. 승인되면 카탈로그에 등록되어 전 구성원이 조회·신청할 수 있습니다.

[ 검토 기준 ]
· 라이선스가 사내 사용·상용 배포 조건에 부합하는가
· 가중치 파일 무결성 및 보안 스캔 통과 여부
· 중복 모델 여부(이미 카탈로그에 동일 모델이 있는지)

[ 소요 기간 ]
일반적으로 영업일 기준 2~3일이 소요되며, 라이선스 추가 검토가 필요한 경우 더 걸릴 수 있습니다.`,
  },
  {
    id: 'bm-05', category: 'manual', authorUserId: 'u-admin', manualTag: 'API',
    title: 'API 키 발급·사용 가이드', createdAt: '2026-05-12 10:00', updatedAt: '2026-05-28 16:40', views: 542,
    body: `마켓플레이스에 게시된 서비스의 API를 호출하기 위한 키 발급과 사용 방법을 설명하는 개발자 가이드입니다.

[ 키 발급 절차 ]
1. '마켓플레이스'에서 사용할 서비스를 선택합니다.
2. 'API 키 요청'으로 사용 목적과 예상 호출량을 입력해 신청합니다.
3. 서비스 소유자(또는 관리자) 승인 후 키가 발급됩니다.

[ 호출 예시 ]
요청 헤더에 발급받은 키를 포함합니다.
  Authorization: Bearer {API_KEY}
응답 헤더의 x-usage-tokens로 호출별 토큰 사용량을 확인할 수 있습니다.

[ rate limit 정책 ]
· 기본 한도는 분당 60회이며, 초과 시 429 응답이 반환됩니다.
· 한도 상향이 필요하면 문의 · Q&A 게시판으로 요청해 주세요.

[ 보안 주의 ]
API 키는 비밀로 관리하고 소스 코드·공개 저장소에 노출되지 않도록 주의하세요. 노출이 의심되면 즉시 재발급을 신청합니다.`,
  },
]

let session: BoardPost[] = [...NOTICES, ...QNAS, ...MANUALS]

export function getPosts(category: BoardCategory): BoardPost[] {
  return session.filter((p) => p.category === category)
}

export function getPostById(id: string): BoardPost | undefined {
  return session.find((p) => p.id === id)
}

// 카테고리 목록 표시 순서 — 목록 화면과 동일(공지: 고정 우선·최신, 문의: 대기 우선·최신, 매뉴얼: 업데이트 최신)
export function sortedPosts(category: BoardCategory): BoardPost[] {
  const list = getPosts(category)
  return [...list].sort((a, b) => {
    if (category === 'notice') return Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)
    if (category === 'qna') return (answerStateOf(a) === 'pending' ? 0 : 1) - (answerStateOf(b) === 'pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
  })
}

// 이전 글(목록상 위) / 다음 글(목록상 아래) — 게시판 상세 네비게이션용
export function getSiblings(id: string): { prev?: BoardPost; next?: BoardPost } {
  const post = getPostById(id)
  if (!post) return {}
  const list = sortedPosts(post.category)
  const i = list.findIndex((p) => p.id === id)
  if (i < 0) return {}
  return { prev: i > 0 ? list[i - 1] : undefined, next: i < list.length - 1 ? list[i + 1] : undefined }
}

// 상세 열람 — 조회수 +1 (세션 한정)
export function viewPost(id: string): void {
  session = session.map((p) => (p.id === id ? { ...p, views: p.views + 1 } : p))
}

interface NewPostInput {
  category: BoardCategory
  title: string
  body: string
  authorUserId: string
  noticeTag?: NoticeTag
  pinned?: boolean
  topic?: QnaTopic
  manualTag?: ManualTag
}

export function createPost(input: NewPostInput): BoardPost {
  const at = nowStamp()
  const prefix = input.category === 'notice' ? 'bn' : input.category === 'qna' ? 'bq' : 'bm'
  const post: BoardPost = {
    id: `${prefix}-${Date.now().toString(36)}`,
    category: input.category,
    title: input.title.trim(),
    body: input.body.trim(),
    authorUserId: input.authorUserId,
    createdAt: at,
    views: 0,
    pinned: input.category === 'notice' ? input.pinned : undefined,
    noticeTag: input.category === 'notice' ? (input.noticeTag ?? '일반') : undefined,
    topic: input.category === 'qna' ? (input.topic ?? 'general') : undefined,
    manualTag: input.category === 'manual' ? input.manualTag : undefined,
    updatedAt: input.category === 'manual' ? at : undefined,
  }
  session = [post, ...session]
  return post
}

// 관리자 답변 등록/수정 (문의)
export function answerPost(id: string, body: string, byUserId: string): BoardPost | undefined {
  const at = nowStamp()
  session = session.map((p) =>
    p.id === id ? { ...p, answer: { body: body.trim(), byUserId, at } } : p,
  )
  return getPostById(id)
}

export function authorName(userId: string): string {
  return userById(userId)?.name ?? userId
}

// 답변 작성자명 (없으면 '관리자')
export function answerName(post: BoardPost): string {
  return post.answer ? authorName(post.answer.byUserId) : '관리자'
}
