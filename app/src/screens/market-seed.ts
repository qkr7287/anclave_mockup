// 마켓플레이스(4.17) 카드/상세 표시용 서비스 정본.
// backend market_services 테이블 seed + 프론트 표시 공용 더미.
// - icon: heroicon 컴포넌트명 문자열 → 프론트에서 ICON_MAP으로 매핑.
// - hue: 0~360 색상값(로고 폴백 그라데이션·악센트).
// - serviceUrl 비어 있으면 프론트가 id로 자동 생성(http://svc.anclave.local/{id}).
// - thumbnail/screenshots: /services/{id}/ 하위 webp 경로(public).
// backend 연동(GET /api/market-services) 완료 후 market.tsx가 이 정본을 REST로 대체 로드.

export interface MarketServiceSeed {
  id: string
  name: string
  kind: string
  provider: string
  model: string
  api: string
  owner: string
  rating: number
  status: string
  hue: number
  icon: string
  responseTime: string
  tier: string
  monthlyReq: string
  usage: string
  usageNum: number
  delta: string
  up: boolean
  reqFull: string
  success: string
  deltaPct: string
  lastCall: string
  tags: string[]
  desc: string
  overview: string
  apiDesc: string
  features: string[]
  opsNotes: string[]
  serviceUrl: string
  demoUrl: string
  thumbnail: string
  screenshots: string[]
}

export const MARKET_SERVICES: MarketServiceSeed[] = [
  {
    id: 'educat',
    name: '에듀캣',
    kind: '동화 창작',
    provider: '에듀테크팀',
    model: 'EXAONE 3.0 + SDXL',
    api: '콘솔',
    owner: '정휘선',
    rating: 4.7,
    status: '정상',
    hue: 32,
    icon: 'BookOpenIcon',
    responseTime: '1.8s',
    tier: 'Standard',
    monthlyReq: '8.4K',
    usage: '8.4K',
    usageNum: 8400,
    delta: '▲ 14%',
    up: true,
    reqFull: '8,420건',
    success: '99.10%',
    deltaPct: '+14.2%',
    lastCall: '3분 전',
    tags: ['교육', '동화', '창작'],
    desc: '아이가 직접 이야기 전개를 상상해 완성하는 AI 동화 창작 서비스.',
    overview:
      '에듀캣은 아이들의 창의력 향상을 위한 AI 기반 동화 창작 서비스입니다. 기존 동화나 자체 제작한 동화의 뒷부분을 정해진 내용대로 읽는 대신, 아이가 직접 이야기의 전개를 상상하고 그림과 글로 완성하도록 돕습니다. 이를 통해 표현력·상상력·창의적 사고 능력을 자연스럽게 향상시키는 것을 목표로 합니다.',
    apiDesc: '',
    features: ['동화 뒷이야기 직접 전개', '글·그림으로 장면 완성', 'AI 삽화 자동 생성', '연령별 동화 추천', '창작물 앨범 저장'],
    opsNotes: ['아동 친화 UI로 설계되어 보호자 계정과 연동됩니다.', '생성 삽화는 안전 필터를 거칩니다.', '오프라인 동화책 PDF 내보내기를 지원합니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/educat/thumb.webp',
    screenshots: ['/services/educat/01.webp', '/services/educat/02.webp', '/services/educat/03.webp', '/services/educat/04.webp', '/services/educat/05.webp'],
  },
  {
    id: 'doragi',
    name: '도라지',
    kind: '지식 검색(RAG)',
    provider: '디지털지식팀',
    model: 'BGE-M3 + HyperCLOVA X',
    api: 'REST API',
    owner: '정휘선',
    rating: 4.8,
    status: '정상',
    hue: 280,
    icon: 'CircleStackIcon',
    responseTime: '1.1s',
    tier: 'Enterprise',
    monthlyReq: '64.2K',
    usage: '64.2K',
    usageNum: 64200,
    delta: '▲ 22%',
    up: true,
    reqFull: '64,180건',
    success: '99.55%',
    deltaPct: '+22.0%',
    lastCall: '12초 전',
    tags: ['RAG', '지식검색', '협업'],
    desc: '사내 비정형 데이터를 통합 아카이빙하고 RAG로 실시간 검색·답변하는 지식 솔루션.',
    overview:
      "도라지는 기업 내부에 흩어져 있는 문서·메일·메신저 기록 등 다양한 비정형 데이터를 통합 아카이빙하고, RAG(Retrieval-Augmented Generation) 기술로 사용자가 필요한 정보를 실시간으로 검색하고 답변받을 수 있는 지능형 사내 지식 검색 솔루션입니다. 조직 내부 깊은 곳에 묻혀 있던 핵심 지식 자산을 AI가 정밀하게 찾아내 실무자에게 즉각적인 인사이트를 제공합니다. 검색된 자료를 구성원과 공유하고 채팅·실시간 음성으로 협업하며, 그림·메모를 활용한 시각적 협업도 지원합니다.",
    apiDesc: 'REST 엔드포인트로 문서 업서트·시맨틱 질의·답변 생성을 제공합니다. 질의에 근거 출처를 함께 반환하며, 권한 기반 검색으로 접근 범위를 제어합니다.',
    features: ['비정형 데이터 통합 아카이빙', 'RAG 실시간 검색·답변', '검색 자료 공유·협업', '채팅·실시간 음성 전달', '그림·메모 시각적 협업'],
    opsNotes: ["'산삼보다 귀한 도라지' 컨셉의 사내 지식 검색 솔루션입니다.", '문서·메일·메신저 기록을 통합 인덱싱합니다.', '권한 기반으로 검색 범위가 제한됩니다.'],
    serviceUrl: 'https://doragi.co.kr/',
    demoUrl: '',
    thumbnail: '/services/doragi/thumb.webp',
    screenshots: ['/services/doragi/01.webp', '/services/doragi/02.webp', '/services/doragi/03.webp'],
  },
  {
    id: 'voicecat',
    name: '보이스캣',
    kind: 'VoC 분석',
    provider: '고객경험팀',
    model: 'HyperCLOVA X',
    api: 'REST API',
    owner: '정휘선',
    rating: 4.6,
    status: '정상',
    hue: 200,
    icon: 'ChatBubbleLeftRightIcon',
    responseTime: '1.3s',
    tier: 'Standard',
    monthlyReq: '38.6K',
    usage: '38.6K',
    usageNum: 38600,
    delta: '▲ 11%',
    up: true,
    reqFull: '38,610건',
    success: '99.38%',
    deltaPct: '+11.4%',
    lastCall: '40초 전',
    tags: ['VoC', '민원분석', '보고서'],
    desc: 'LLM 기반 VoC 분석·민원 대응 이력 관리·보고서 생성 솔루션.',
    overview:
      '보이스캣은 LLM 기반 VoC(Voice of Customer) 분석 및 대응 솔루션입니다. 단순히 고객 의견을 요약하는 수준을 넘어 민원 내용 분석, 대응 이력 관리, 처리 상태 추적, 보고서 생성 기능까지 포함하는 고도화된 VoC 관리 서비스를 목표로 합니다. 고객 문의와 민원을 체계적으로 관리하고 조직의 대응 품질을 높입니다.',
    apiDesc: 'REST 엔드포인트로 민원 텍스트 분석·분류·요약을 제공합니다. 대응 이력과 처리 상태를 함께 관리하며 보고서 생성 API를 지원합니다.',
    features: ['민원 내용 분석·분류', '대응 이력 관리', '처리 상태 추적', 'VoC 보고서 자동 생성', '감성·우선순위 태깅'],
    opsNotes: ['단순 요약을 넘어 대응 품질 관리까지 지원합니다.', '민원 카테고리는 운영 중 학습으로 보강됩니다.', '보고서 템플릿을 커스터마이즈할 수 있습니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/voicecat/thumb.webp',
    screenshots: ['/services/voicecat/01.webp', '/services/voicecat/02.webp', '/services/voicecat/03.webp', '/services/voicecat/04.webp'],
  },
  {
    id: 'dreamlog',
    name: '드림로그',
    kind: '이미지 생성',
    provider: '뉴미디어랩',
    model: 'Stable Diffusion XL',
    api: '콘솔',
    owner: '박태수',
    rating: 4.5,
    status: '정상',
    hue: 250,
    icon: 'MoonIcon',
    responseTime: '2.6s',
    tier: 'Standard',
    monthlyReq: '21.0K',
    usage: '21.0K',
    usageNum: 21000,
    delta: '▲ 6%',
    up: true,
    reqFull: '21,040건',
    success: '98.70%',
    deltaPct: '+6.3%',
    lastCall: '1분 전',
    tags: ['꿈기록', '이미지생성', '엔터테인먼트'],
    desc: '기억에 남는 꿈을 기록하면 AI가 꿈 이미지를 카드로 생성하는 기록 앱.',
    overview:
      '드림로그는 사용자가 기억에 남는 꿈이나 흥미로운 꿈을 기록하면 AI가 그 내용을 바탕으로 꿈의 이미지를 생성해주는 엔터테인먼트형 기록 앱입니다. 생성된 이미지는 카드 형태로 저장할 수 있으며, 사용자는 자신만의 꿈 카드 컬렉션을 모으는 재미를 느낄 수 있습니다. 일상 속 가벼운 기록과 AI 이미지 생성 경험을 결합한 심심풀이형 서비스입니다.',
    apiDesc: '',
    features: ['꿈 텍스트 기록', 'AI 꿈 이미지 생성', '꿈 카드 컬렉션', '캘린더로 기록 관리', '카드 공유'],
    opsNotes: ['일상 기록과 AI 이미지 생성을 결합한 심심풀이형 서비스입니다.', '생성 이미지는 카드 형태로 보관됩니다.', '민감 콘텐츠 안전 필터가 적용됩니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/dreamlog/thumb.webp',
    screenshots: ['/services/dreamlog/01.webp', '/services/dreamlog/02.webp', '/services/dreamlog/03.webp', '/services/dreamlog/04.webp', '/services/dreamlog/05.webp', '/services/dreamlog/06.webp'],
  },
  {
    id: 'dootory',
    name: '두투리',
    kind: '음성 요약·정리',
    provider: '라이프스타일팀',
    model: 'Whisper + EXAONE 3.0',
    api: '콘솔',
    owner: '이은혜',
    rating: 4.6,
    status: '정상',
    hue: 150,
    icon: 'ClipboardDocumentCheckIcon',
    responseTime: '1.5s',
    tier: 'Standard',
    monthlyReq: '17.8K',
    usage: '17.8K',
    usageNum: 17800,
    delta: '▲ 9%',
    up: true,
    reqFull: '17,820건',
    success: '99.05%',
    deltaPct: '+9.0%',
    lastCall: '2분 전',
    tags: ['음성기록', '체크리스트', '라이프스타일'],
    desc: '말로 입력하면 AI가 요약·체크리스트로 정리하는 라이프 관리 앱.',
    overview:
      '두투리는 사용자가 일상에서 있었던 일이나 해야 할 일을 말로 입력하면 AI가 내용을 요약하고 체크리스트로 정리해주는 라이프스타일 개선 앱입니다. 단순 기록을 넘어 사용자의 생활 패턴을 분석하고 필요한 행동이나 개선 방향을 제안하여 더 체계적인 일상 관리를 돕는 것을 목표로 합니다.',
    apiDesc: '',
    features: ['음성 입력 받아쓰기', '내용 자동 요약', '체크리스트 자동 생성', '생활 패턴 분석', '개선 행동 제안'],
    opsNotes: ['단순 기록을 넘어 생활 패턴 분석·제안을 제공합니다.', '음성은 텍스트로 변환 후 처리됩니다.', '일·주 단위 리포트를 제공합니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/dootory/thumb.webp',
    screenshots: ['/services/dootory/01.webp', '/services/dootory/02.webp', '/services/dootory/03.webp', '/services/dootory/04.webp'],
  },
  {
    id: 'biocat',
    name: '바이오캣',
    kind: '비전 분석',
    provider: 'AI융합연구실',
    model: 'YOLOv8 (Vision)',
    api: '콘솔',
    owner: '정휘선',
    rating: 4.7,
    status: '정상',
    hue: 174,
    icon: 'BeakerIcon',
    responseTime: '0.9s',
    tier: 'Premium',
    monthlyReq: '5.2K',
    usage: '5.2K',
    usageNum: 5200,
    delta: '▲ 4%',
    up: true,
    reqFull: '5,210건',
    success: '99.60%',
    deltaPct: '+4.1%',
    lastCall: '5분 전',
    tags: ['비전', '미생물', '분석'],
    desc: '이미지 기반 병원성 미생물 자동 계수·시각화 분석 프로그램.',
    overview:
      '바이오캣은 AI 융합 기술과 차세대 시각화 솔루션을 활용한 병원성 미생물 계수 분석 프로그램입니다. 감염병 연구와 미생물 분석 과정에서 이미지 데이터를 기반으로 병원성 미생물의 수를 자동으로 분석하고 시각화하는 것을 목표로 합니다. 기존 수작업 중심의 미생물 계수 과정을 보다 편리하고 신속하게 개선하며, 연구자의 분석 효율성과 데이터 신뢰성을 높입니다.',
    apiDesc: '',
    features: ['미생물 이미지 자동 계수', '차세대 시각화', '감염병 연구 지원', '분석 결과 기록·관리', '유저별 테스트 이력'],
    opsNotes: ['수작업 계수 과정을 자동화해 분석 효율을 높입니다.', '이미지 데이터 기반으로 병원성 미생물을 분석합니다.', '연구 데이터 신뢰성 확보를 목표로 합니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/biocat/thumb.webp',
    screenshots: ['/services/biocat/01.webp', '/services/biocat/02.webp', '/services/biocat/03.webp', '/services/biocat/04.webp', '/services/biocat/05.webp', '/services/biocat/06.webp'],
  },
  {
    id: 'imagecat',
    name: '이미지캣',
    kind: '인터랙티브 콘텐츠',
    provider: '실감미디어팀',
    model: 'Pose Estimation (Vision)',
    api: '콘솔',
    owner: '정휘선',
    rating: 4.5,
    status: '정상',
    hue: 312,
    icon: 'VideoCameraIcon',
    responseTime: '1.0s',
    tier: 'Standard',
    monthlyReq: '9.6K',
    usage: '9.6K',
    usageNum: 9600,
    delta: '▲ 7%',
    up: true,
    reqFull: '9,610건',
    success: '98.90%',
    deltaPct: '+7.2%',
    lastCall: '4분 전',
    tags: ['모션인식', '인터랙티브', '콘텐츠'],
    desc: '모션인식·스트림 처리 기반 인터랙티브 콘텐츠 서비스.',
    overview:
      '이미지캣은 체감형 모션인식 기술과 스트림 처리 알고리즘을 활용한 인터랙티브 콘텐츠 서비스입니다. 다양한 콘텐츠와 데이터를 온·오프라인 환경에서 제공하고 사용자 특성에 따라 콘텐츠 접근 방식을 다양화하는 것을 목표로 합니다. 단방향 콘텐츠 제공 방식에서 벗어나 사용자와 콘텐츠가 상호작용할 수 있는 인터랙티브 접근을 도입하며, 콘텐츠 중심 유니버스 공간으로 온라인 접근성을 확장하고 메타버스 기반 환경에도 대응하는 플랫폼형 서비스를 지향합니다.',
    apiDesc: '',
    features: ['체감형 모션인식', '실시간 스트림 처리', '온·오프라인 콘텐츠 제공', '사용자 맞춤 콘텐츠 접근', '콘텐츠 유니버스 공간'],
    opsNotes: ['단방향 콘텐츠를 넘어 상호작용형 접근을 도입했습니다.', '메타버스 기반 환경 대응을 지향합니다.', '콘텐츠 중심 유니버스 공간을 제공합니다.'],
    serviceUrl: '',
    demoUrl: '',
    thumbnail: '/services/imagecat/thumb.webp',
    screenshots: ['/services/imagecat/01.webp', '/services/imagecat/02.webp', '/services/imagecat/03.webp', '/services/imagecat/04.webp', '/services/imagecat/05.webp', '/services/imagecat/06.webp'],
  },
]
