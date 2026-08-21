# Rock Sizzle Preppers

Three.js로 직접 렌더링하는 브라우저 3D 아레나 게임의 첫 플레이어블입니다.

## 실행

```bash
npm install
npm run dev
```

`npm run dev`는 Vite 클라이언트와 `ws://127.0.0.1:5175` 권위 서버를 함께 실행합니다. 로컬 전투는 메인 화면의 `PLAY AS GUEST`, 온라인 Room은 `FLUX-7 ONLINE ROOM`으로 입장합니다.

직접 Room 링크를 열 수도 있습니다.

```text
http://127.0.0.1:5174/?room=FLUX7
```

프로덕션 빌드:

```bash
npm run build
npm run preview
```

정식 산출물은 `release/`에 생성됩니다. 현재 런타임 자산과 코드만 포함한 전체 크기는 약 2.3MB이며, 원본 이미지가 배포물에 중복 포함되지 않습니다.

## Vercel + Render 배포

이 저장소는 Vercel 정적 클라이언트와 Render WebSocket 서버를 함께 배포할 수 있도록 구성되어 있습니다.

1. GitHub에 저장소를 push합니다.
2. Render Dashboard에서 `New > Blueprint`를 선택하고 저장소를 연결합니다. 루트의 `render.yaml`이 `project-splash-server` Web Service를 생성합니다.
3. 배포가 끝나면 Render 서비스 URL을 복사하고 `https://`를 `wss://`로 바꿉니다. 예: `wss://project-splash-server.onrender.com`.
4. Vercel에서 같은 GitHub 저장소를 Import합니다. 루트의 `vercel.json`이 `npm run build`와 `release/` 출력 폴더를 사용합니다.
5. Vercel Project Settings의 Environment Variables에서 `VITE_WS_URL`을 앞에서 만든 `wss://...` 주소로 등록합니다. Production과 Preview를 모두 선택합니다.
6. 환경변수 등록 후 Vercel을 Redeploy합니다.

CLI로 Vercel Preview와 Production을 배포할 수도 있습니다.

```bash
npx vercel
npx vercel --prod
```

Render 서버 상태는 `https://<render-host>/health`에서 확인할 수 있습니다. 로컬 개발에서는 `VITE_WS_URL`을 생략하면 기존처럼 `ws://127.0.0.1:5175`를 사용합니다.

## 조작

- `WASD` / 방향키: 이동
- `Space`: 점프 (장애물과 바닥 구멍 통과)
- `F`: Splash Core 설치
- `C`: 바라보는 방향에 파괴 가능한 장애물 설치
- `Shift`: Ripple Dash
- `E`: 밀기 아이템 획득 후 가까운 Core 밀기
- 마우스: 투척 방향 조준
- `Q` 누르기/놓기: 던지기 아이템 획득 후 포물선 착지 프리뷰로 가까운 Core를 최대 3칸 투척
- `R`: Flux Lock 상태의 가까운 아군 구조

## 현재 구현

- Three.js 직접 제어 렌더링과 Quarter View 카메라
- 30 Hz 고정 게임 판정 / 독립 렌더 루프
- World 좌표와 Logical Grid 분리
- 월드 거리 기반 원형 Splash 전파와 범위 링
- 기본 1개인 동시 Core 슬롯과 용량 아이템을 통한 최대 6개 확장
- 파괴된 장애물의 밀기·던지기·Core 용량·관통 아이템 드롭
- 관통 Core의 벽 관통, 플랫폼 바닥 파괴와 구멍 낙사
- 기본 점프와 플레이어 장애물 설치
- 채운 하트와 빈 하트로 표시하는 3칸 체력 HUD
- Core fuse, 최대 보유량, 연쇄 작동
- Dash, Core Kick, 포물선 Core Throw, 플레이어 충돌, 폭발 Knockback, Flux Lock, 3-hit elimination
- BLOO·LUMI 대 CORAL·VIO의 2v2 전투와 3 Bot Fill
- 위험 경로, 아군 구조, 적 추적을 판단하는 로컬 Bot
- 3회 피격 후 6초 Rescue Window, 구조 실패 시 Elimination
- 예고 후 캐릭터와 Core를 미는 주기적 선풍기 맵 이벤트
- 트랙을 가로질러 플레이어를 밀고 Core의 격자를 바꾸는 서버 권위 Toy Express 이벤트
- 3분 Match Loop, 결과, 접속자를 유지하는 서버 권위 즉시 Rematch
- Guest nickname, Room URL, 초대 링크 복사
- 모든 참가자가 공유하는 서버 권위 `3 · 2 · 1 · SPLASH!` 시작 카운트다운
- Node.js + TypeScript WebSocket 권위 서버
- 입력 Sequence, 30 Hz 서버 판정, 15 Hz 공통 Snapshot
- 서버 권위 Movement, Core, Kick, Throw, Fuse, Chain 깊이 이벤트, Flux, Rescue, Fan Event, Match End
- 빈 슬롯을 채우고 실제 접속자가 들어오면 교체되는 서버 Bot Fill
- 서버 재시작이나 순간 단절 뒤 같은 Room으로 복귀하는 WebSocket 자동 재접속
- 서버와 클라이언트가 공유하는 3분 Fan / Toy Express 맵 타임라인
- DOM HUD와 반응형 로비
- Web Audio 기반 Core 설치·폭발·투척·대시·구조·선풍기 정보음과 음소거
- `?debug=true` Grid / Collider / Bot 목표선 / 서버 위치 고스트와 FPS / Frame Time / Draw Calls / Triangles / Textures / Sim Bodies / RTT / Packet Rate / Pending Input 런타임 HUD
- 20개 고정 풀과 InstancedMesh를 사용하는 누수 없는 연쇄 폭발 VFX
- `imagegen`으로 제작한 Rock Sizzle Preppers 전용 캐릭터 및 키 아트

## 고정 아트 디렉션

`assets/source/splash/project-splash-key-art-reference-v2.png`을 캐릭터와 환경의 기준 아트로 사용합니다. 원본과 레거시 자산은 Vite 배포물에 복사되지 않도록 `assets/source/splash`에 보존하고, 최적화 런타임 자산만 `public/assets/splash`에 둡니다.

- 캐릭터: 둥근 캡슐형 몸체, 흰 얼굴 패널, 검은 타원 눈, 발광 안테나
- 재질: 매트한 소프트 토이, 낮은 표면 복잡도
- 환경: 거대한 놀이방, 책·블록·튜브·선풍기
- 이펙트: 시안과 코랄의 원형 에너지 충격파
- 조명: 따뜻한 오후 햇빛과 차가운 에너지 림 라이트의 대비

현재 사용 캐릭터는 `BLOO`, `CORAL`, `LUMI`, `VIO`입니다. 네 캐릭터 모두 아레나와 HUD에 연결되어 있습니다.

## 규칙 테스트

```bash
npm test
```

Grid 변환, 벽 차단, 폭발 전파, 위험 셀 중복 제거, Core 용량, 연쇄 작동, Flux 단계, Match 승패와 권위 Room의 슬롯·입력·Core Action을 순수 모듈에서 검증합니다.

실제 소켓 검증에서는 두 클라이언트가 같은 Room의 동일 Tick Snapshot을 받고, 한 클라이언트의 이동과 Core 설치가 다른 클라이언트에도 동일한 서버 상태로 전달되는 것을 확인했습니다.

Debug Room 예시:

```text
http://127.0.0.1:5174/?room=FLUX7&debug=true
```
