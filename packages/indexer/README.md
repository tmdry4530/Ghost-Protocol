# Ghost Protocol Envio Indexer

Monad 블록체인의 Ghost Protocol 온체인 이벤트를 실시간으로 인덱싱하는 Envio HyperIndex 설정입니다.

## 개요

이 인덱서는 다음 스마트 컨트랙트의 이벤트를 추적합니다:

- **GhostArena** (`0x225e52C760F157e332e259E82F41a67Ecd1b9520`)
  - AgentRegistered: AI 에이전트 등록
  - TournamentCreated: 토너먼트 생성
  - MatchResultRecorded: 매치 결과 기록

- **WagerPool** (`0xb39173Ca23d5c6e42c4d25Ad388D602AC57e9D1C`)
  - BetPlaced: 베팅 배치
  - BetSettled: 베팅 정산
  - PoolCreated: 베팅 풀 생성

- **SurvivalBet** (`0x1af65f774f358baf9367C8bC814a4AA842588DE8`)
  - PredictionPlaced: Survival 모드 라운드 예측
  - SessionSettled: 세션 정산

## 설치 및 실행

### 1. Envio CLI 설치

```bash
npm install -g envio
```

### 2. 코드 생성

```bash
cd packages/indexer
pnpm codegen
```

이 명령은 `config.yaml`과 `schema.graphql`을 기반으로 TypeScript 타입과 핸들러 스켈레톤을 생성합니다.

### 3. 개발 모드 실행

```bash
pnpm dev
```

개발 모드는 로컬 PostgreSQL 데이터베이스를 사용하며 파일 변경 시 자동으로 재시작됩니다.

### 4. 프로덕션 실행

```bash
pnpm start
```

## GraphQL API

인덱서가 실행되면 GraphQL API가 `http://localhost:8080/v1/graphql`에서 제공됩니다.

### 예제 쿼리

```graphql
# 최근 베팅 조회
query RecentBets {
  bets(orderBy: timestamp, orderDirection: desc, limit: 10) {
    id
    matchId
    bettor
    agent
    amount
    timestamp
  }
}

# 특정 매치의 베팅 풀 조회
query MatchPool($matchId: String!) {
  bettingPool(id: $matchId) {
    matchId
    totalAmount
    betCount
    lockTime
  }
}

# 에이전트 목록 조회
query Agents {
  agents(orderBy: registeredAt, orderDirection: desc) {
    address
    name
    agentId
    registeredAt
  }
}

# 매치 결과 조회
query MatchResult($matchId: String!) {
  matchResult(id: $matchId) {
    matchId
    winner
    stateHash
    recordedAt
  }
}
```

## 백엔드 통합

`IndexerService` 클래스는 Envio GraphQL 엔드포인트를 폴링하고 새로운 이벤트를 Socket.IO를 통해 브로드캐스트합니다.

### 사용 방법

```typescript
import { IndexerService } from './services/indexerService.js';

const indexerService = new IndexerService({
  graphqlUrl: 'http://localhost:8080/v1/graphql',
  io: socketIOServerInstance,
  pollInterval: 2000, // 2초마다 폴링
});

indexerService.start();
```

### 브로드캐스트되는 이벤트

- `bet:new` - 새로운 베팅이 배치됨 (룸: `match:{matchId}`)
- `bet:settled` - 베팅이 정산됨 (룸: `match:{matchId}`)
- `agent:registered` - 새로운 에이전트 등록 (전역)
- `tournament:created` - 토너먼트 생성 (전역)
- `match:result` - 매치 결과 기록 (룸: `match:{matchId}`)

## 아키텍처

```
Monad Blockchain
       ↓
   Envio Indexer (PostgreSQL)
       ↓
   GraphQL API (port 8080)
       ↓
   IndexerService (폴링)
       ↓
   Socket.IO (WebSocket)
       ↓
   프론트엔드 클라이언트
```

## 환경 변수

`.env` 파일에 다음 변수를 추가하세요:

```env
# Envio Indexer GraphQL 엔드포인트
ENVIO_GRAPHQL_URL=http://localhost:8080/v1/graphql
```

## 문제 해결

### PostgreSQL 연결 오류

Envio는 로컬 PostgreSQL이 필요합니다. Docker로 실행:

```bash
docker run -d \
  --name envio-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15
```

### RPC 속도 제한

Monad 테스트넷 RPC는 속도 제한이 있을 수 있습니다. `config.yaml`의 `start_block`을 최근 블록으로 설정하여 초기 동기화 시간을 단축하세요.

### 핸들러 오류

핸들러 로직에 오류가 있으면 인덱서가 중단됩니다. `pnpm dev` 모드에서 로그를 확인하세요.

## 추가 정보

- [Envio 공식 문서](https://docs.envio.dev/)
- [HyperIndex 가이드](https://docs.envio.dev/docs/HyperIndex/overview)
- [GraphQL 스키마 레퍼런스](https://docs.envio.dev/docs/HyperIndex/schema)
