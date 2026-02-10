import { Server as SocketIOServer } from 'socket.io';
import pino from 'pino';

/**
 * GraphQL 쿼리 응답 타입 정의
 */
interface BetQueryResult {
  bets: Array<{
    id: string;
    matchId: string;
    bettor: string;
    agent: string;
    amount: string;
    timestamp: string;
    blockNumber: string;
  }>;
}

interface SettlementQueryResult {
  settlements: Array<{
    id: string;
    matchId: string;
    bettor: string;
    payout: string;
    timestamp: string;
  }>;
}

interface AgentQueryResult {
  agents: Array<{
    id: string;
    address: string;
    name: string;
    agentId: string;
    registeredAt: string;
    blockNumber: string;
  }>;
}

interface TournamentQueryResult {
  tournaments: Array<{
    id: string;
    tournamentId: string;
    startTime: string;
    createdAt: string;
  }>;
}

interface MatchResultQueryResult {
  matchResults: Array<{
    id: string;
    matchId: string;
    winner: string;
    stateHash: string;
    recordedAt: string;
  }>;
}

/**
 * IndexerService 설정 옵션
 */
interface IndexerServiceOptions {
  graphqlUrl: string;
  io: SocketIOServer;
  pollInterval?: number; // 기본값: 2000ms
}

/**
 * IndexerService
 * Envio GraphQL 엔드포인트를 폴링하고 새로운 온체인 이벤트를 WebSocket으로 브로드캐스트
 */
export class IndexerService {
  private readonly graphqlUrl: string;
  private readonly io: SocketIOServer;
  private readonly pollInterval: number;
  private readonly logger: pino.Logger;

  private intervalId: NodeJS.Timeout | null = null;
  private lastSeenTimestamp = 0n;
  private isPolling = false;

  constructor(options: IndexerServiceOptions) {
    this.graphqlUrl = options.graphqlUrl;
    this.io = options.io;
    this.pollInterval = options.pollInterval ?? 2000;
    this.logger = pino({ name: 'IndexerService' });
  }

  /**
   * 폴링 시작
   */
  start(intervalMs?: number): void {
    const interval = intervalMs ?? this.pollInterval;

    if (this.intervalId !== null) {
      this.logger.warn('IndexerService가 이미 실행 중입니다');
      return;
    }

    this.logger.info({ interval }, 'IndexerService 폴링 시작');

    // 즉시 한 번 실행
    this.poll().catch((error) => {
      this.logger.error({ error }, '초기 폴링 실패');
    });

    // 주기적 폴링 시작
    this.intervalId = setInterval(() => {
      this.poll().catch((error) => {
        this.logger.error({ error }, '폴링 중 오류 발생');
      });
    }, interval);
  }

  /**
   * 폴링 중지
   */
  stop(): void {
    if (this.intervalId === null) {
      this.logger.warn('IndexerService가 실행 중이 아닙니다');
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.logger.info('IndexerService 폴링 중지');
  }

  /**
   * 폴링 실행 (모든 이벤트 조회 및 브로드캐스트)
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('이전 폴링이 아직 진행 중입니다');
      return;
    }

    this.isPolling = true;

    try {
      // 병렬로 모든 이벤트 조회
      const [bets, settlements, agents, tournaments, matchResults] = await Promise.all([
        this.queryRecentBets(),
        this.queryRecentSettlements(),
        this.queryRecentRegistrations(),
        this.queryRecentTournaments(),
        this.queryRecentMatchResults(),
      ]);

      // 새로운 베팅 브로드캐스트
      for (const bet of bets) {
        this.io.to(`match:${bet.matchId}`).emit('bet:new', {
          matchId: bet.matchId,
          bettor: bet.bettor,
          agent: bet.agent,
          amount: bet.amount,
          timestamp: bet.timestamp,
        });
      }

      // 정산 브로드캐스트
      for (const settlement of settlements) {
        this.io.to(`match:${settlement.matchId}`).emit('bet:settled', {
          matchId: settlement.matchId,
          bettor: settlement.bettor,
          payout: settlement.payout,
          timestamp: settlement.timestamp,
        });
      }

      // 에이전트 등록 브로드캐스트
      for (const agent of agents) {
        this.io.emit('agent:registered', {
          address: agent.address,
          name: agent.name,
          agentId: agent.agentId,
          registeredAt: agent.registeredAt,
        });
      }

      // 토너먼트 생성 브로드캐스트
      for (const tournament of tournaments) {
        this.io.emit('tournament:created', {
          tournamentId: tournament.tournamentId,
          startTime: tournament.startTime,
          createdAt: tournament.createdAt,
        });
      }

      // 매치 결과 브로드캐스트
      for (const result of matchResults) {
        this.io.to(`match:${result.matchId}`).emit('match:result', {
          matchId: result.matchId,
          winner: result.winner,
          stateHash: result.stateHash,
          recordedAt: result.recordedAt,
        });
      }

      // 마지막 타임스탬프 업데이트
      const allTimestamps = [
        ...bets.map((b) => BigInt(b.timestamp)),
        ...settlements.map((s) => BigInt(s.timestamp)),
        ...agents.map((a) => BigInt(a.registeredAt)),
        ...tournaments.map((t) => BigInt(t.createdAt)),
        ...matchResults.map((m) => BigInt(m.recordedAt)),
      ];

      if (allTimestamps.length > 0) {
        const maxTimestamp = allTimestamps.reduce((max, ts) => (ts > max ? ts : max), 0n);
        if (maxTimestamp > this.lastSeenTimestamp) {
          this.lastSeenTimestamp = maxTimestamp;
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * 최근 베팅 조회
   */
  private async queryRecentBets(): Promise<BetQueryResult['bets']> {
    const query = `
      query RecentBets($afterTimestamp: BigInt!) {
        bets(where: { timestamp_gt: $afterTimestamp }, orderBy: timestamp, orderDirection: asc) {
          id
          matchId
          bettor
          agent
          amount
          timestamp
          blockNumber
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { afterTimestamp: this.lastSeenTimestamp.toString() },
        }),
      });

      const result = (await response.json()) as { data: BetQueryResult };
      return result.data.bets;
    } catch (error) {
      this.logger.error({ error }, '베팅 조회 실패');
      return [];
    }
  }

  /**
   * 최근 정산 조회
   */
  private async queryRecentSettlements(): Promise<SettlementQueryResult['settlements']> {
    const query = `
      query RecentSettlements($afterTimestamp: BigInt!) {
        settlements(where: { timestamp_gt: $afterTimestamp }, orderBy: timestamp, orderDirection: asc) {
          id
          matchId
          bettor
          payout
          timestamp
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { afterTimestamp: this.lastSeenTimestamp.toString() },
        }),
      });

      const result = (await response.json()) as { data: SettlementQueryResult };
      return result.data.settlements;
    } catch (error) {
      this.logger.error({ error }, '정산 조회 실패');
      return [];
    }
  }

  /**
   * 최근 에이전트 등록 조회
   */
  private async queryRecentRegistrations(): Promise<AgentQueryResult['agents']> {
    const query = `
      query RecentAgents($afterTimestamp: BigInt!) {
        agents(where: { registeredAt_gt: $afterTimestamp }, orderBy: registeredAt, orderDirection: asc) {
          id
          address
          name
          agentId
          registeredAt
          blockNumber
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { afterTimestamp: this.lastSeenTimestamp.toString() },
        }),
      });

      const result = (await response.json()) as { data: AgentQueryResult };
      return result.data.agents;
    } catch (error) {
      this.logger.error({ error }, '에이전트 등록 조회 실패');
      return [];
    }
  }

  /**
   * 최근 토너먼트 조회
   */
  private async queryRecentTournaments(): Promise<TournamentQueryResult['tournaments']> {
    const query = `
      query RecentTournaments($afterTimestamp: BigInt!) {
        tournaments(where: { createdAt_gt: $afterTimestamp }, orderBy: createdAt, orderDirection: asc) {
          id
          tournamentId
          startTime
          createdAt
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { afterTimestamp: this.lastSeenTimestamp.toString() },
        }),
      });

      const result = (await response.json()) as { data: TournamentQueryResult };
      return result.data.tournaments;
    } catch (error) {
      this.logger.error({ error }, '토너먼트 조회 실패');
      return [];
    }
  }

  /**
   * 최근 매치 결과 조회
   */
  private async queryRecentMatchResults(): Promise<MatchResultQueryResult['matchResults']> {
    const query = `
      query RecentMatchResults($afterTimestamp: BigInt!) {
        matchResults(where: { recordedAt_gt: $afterTimestamp }, orderBy: recordedAt, orderDirection: asc) {
          id
          matchId
          winner
          stateHash
          recordedAt
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { afterTimestamp: this.lastSeenTimestamp.toString() },
        }),
      });

      const result = (await response.json()) as { data: MatchResultQueryResult };
      return result.data.matchResults;
    } catch (error) {
      this.logger.error({ error }, '매치 결과 조회 실패');
      return [];
    }
  }
}
