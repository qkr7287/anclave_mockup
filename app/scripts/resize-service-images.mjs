// 서비스 스크린샷 → 웹용 webp 변환(public/services/{id}/).
// thumb.webp(카드 썸네일, cover crop) + NN.webp(상세 갤러리, 비율 유지).
// 입력 원본은 데스크톱 폴더, 한글 파일명 → 순번 webp로 정규화.
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SRC = 'C:/Users/agics/Desktop/서비스이미지'
const OUT = 'C:/Users/agics/Desktop/workspace/01. git/anclave-g8/app/public/services'

// id → { thumb: 대표파일, shots: [갤러리 파일 순서] }
const MAP = {
  educat: { dir: '에듀캣', thumb: 'Splash.jpg', shots: ['메인.png', '생각뒤집기_동화선택.png', '생각뒤집기_붕대감기2.png', '생각뒤집기_집 고쳐주기.png', 'ORH89U1.png'] },
  doragi: { dir: '도라지', thumb: '도라지_예시_1.png', shots: ['도라지_예시_1.png', '도라지_예시_2.png', '도라지_예시_3.png'] },
  voicecat: { dir: '보이스캣', thumb: '스플래쉬.png', shots: ['요약 회의록.png', '회의록_요약 생성중.png', '회의록_요약 완료_ai요약.png', '새녹음_일시정지.png'] },
  dreamlog: { dir: '드림로그', thumb: '메인_1.png', shots: ['메인_1.png', '기록.png', '달력_캘린더.png', '결과_1.png', '로딩.png', '1.png'] },
  dootory: { dir: '두투리', thumb: '0.스플래쉬.png', shots: ['0.png', '1.녹음시작.png', '4.정리단계.png', '8.정리단계_다시말하기 (디자인중).png'] },
  biocat: { dir: '바이오캣', thumb: '1.홈.png', shots: ['1.홈.png', '2.홈_검사전.png', '3.홈_검사후.png', '4.테스트기록.png', '5.유저관리.png', '0.로그인.png'] },
  imagecat: { dir: '이미지캣', thumb: '메인.png', shots: ['랜딩.png', '메인.png', '카테고리.png', '상세.png', '리포팅.png', '로딩.png'] },
}

const pad = (n) => String(n).padStart(2, '0')

for (const [id, { dir, thumb, shots }] of Object.entries(MAP)) {
  const outDir = join(OUT, id)
  await mkdir(outDir, { recursive: true })

  // 썸네일: 카드용 가로 배너(cover, 상단 우선)
  await sharp(join(SRC, dir, thumb))
    .resize({ width: 720, height: 480, fit: 'cover', position: 'top' })
    .webp({ quality: 82 })
    .toFile(join(outDir, 'thumb.webp'))

  // 갤러리: 비율 유지, 최대 1280px 폭
  let i = 1
  for (const shot of shots) {
    await sharp(join(SRC, dir, shot))
      .resize({ width: 1280, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(join(outDir, `${pad(i)}.webp`))
    i++
  }
  console.log(`✓ ${id}: thumb + ${shots.length} shots`)
}

console.log('done')
