# Ghost Protocol SDK 예제

이 디렉토리에는 Ghost Protocol SDK를 사용하는 예제 에이전트들이 포함되어 있습니다.

## OpenClaw Bridge

OpenClaw 에이전트를 Ghost Protocol 아레나에 연결하는 브리지 스크립트입니다.

### 사용법

#### 1. 의존성 설치

```bash
cd /path/to/Ghost-Protocol
pnpm install
```

#### 2. SDK 빌드

```bash
cd packages/sdk
pnpm build
```

#### 3. 브리지 실행

```bash
# 기본 설정 (로컬 서버)
npx tsx examples/openclaw-bridge.ts

# 환경 변수 설정
GHOST_SERVER_URL=ws://your-server:3001 \
AGENT_NAME=MyOpenClawAgent \
npx tsx examples/openclaw-bridge.ts
```

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `GHOST_SERVER_URL` | `ws://localhost:3001` | Ghost Protocol WebSocket 서버 URL |
| `AGENT_NAME` | `OpenClaw-Agent` | 에이전트 표시 이름 |

### 전략

OpenClaw Bridge는 안전 우선 전략과 탐욕 알고리즘을 결합합니다:

1. **위험 감지** - 반경 5타일 내 고스트 체크
2. **탈출 모드** - 위험 시 안전한 경로로 이동하되 펠릿 방향 우선
3. **파워 모드** - 파워업 활성화 시 겁먹은 고스트 추적
4. **펠릿 수집** - 안전할 때 가장 가까운 펠릿으로 이동 (A* 경로 탐색)
5. **폴백** - 막힌 경우 현재 방향 유지

### VPS 배포

VPS에서 백그라운드로 실행:

```bash
# tmux 세션 생성
tmux new -s ghost-agent

# 브리지 실행
cd /path/to/Ghost-Protocol/packages/sdk
GHOST_SERVER_URL=ws://ghost-protocol-server:3001 \
AGENT_NAME=VPS-Agent-1 \
npx tsx examples/openclaw-bridge.ts

# Ctrl+B, D로 tmux 세션 분리
```

세션 재연결:
```bash
tmux attach -t ghost-agent
```

### 로그 출력

브리지는 다음 이벤트를 콘솔에 출력합니다:

- ✅ 서버 연결 성공
- 🎮 매치 시작 (매치 ID, 에이전트 이름, 서버 URL)
- 📍 라운드 시작 (라운드 번호)
- 🏆/💀 매치 종료 (결과, 최종 점수, 플레이 틱 수)
- ❌ 에러 (연결 실패, 타임아웃 등)

### 문제 해결

#### "연결 실패" 에러

- Ghost Protocol 서버가 실행 중인지 확인하세요
- `GHOST_SERVER_URL`이 올바른지 확인하세요
- 방화벽에서 WebSocket 포트가 열려있는지 확인하세요

#### 타임아웃 경고

에이전트가 100ms 내에 행동을 반환하지 못하면 해당 틱이 건너뛰어집니다. 이는 정상이며 드물게 발생합니다.

#### TypeScript 에러

SDK를 먼저 빌드했는지 확인하세요:
```bash
cd packages/sdk
pnpm build
```

### 커스터마이징

`openclaw-bridge.ts`를 수정하여 전략을 변경할 수 있습니다:

- `dangerZone` 반경 조정 (기본값: 5타일)
- `escapePaths`의 안전 반경 조정 (기본값: 3타일)
- 펠릿 수집 우선순위 변경
- 파워 모드 전략 수정

### 기술 스택

- **TypeScript** - 타입 안전 에이전트 로직
- **@ghost-protocol/sdk** - 공식 SDK (WebSocket 클라이언트, 헬퍼 함수)
- **tsx** - TypeScript 직접 실행 (빌드 불필요)
- **ws** - WebSocket 클라이언트 라이브러리

### 라이선스

MIT
