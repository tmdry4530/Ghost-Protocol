import pino from 'pino';

const logger = pino({ name: 'moltbook-social' });

/** Moltbook API 베이스 URL */
const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';

/** 포스트 간 최소 대기 시간 (30분) */
const POST_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * 토너먼트 결과 데이터 구조
 */
export interface TournamentResult {
  /** 토너먼트 ID */
  tournamentId: number;
  /** 우승자 에이전트 이름 */
  winnerName: string;
  /** 우승자 지갑 주소 */
  winnerAddress: string;
  /** 우승자 Moltbook ID (선택) */
  winnerMoltbookId?: string;
  /** 준우승자 에이전트 이름 */
  runnerUpName: string;
  /** 준우승자 지갑 주소 */
  runnerUpAddress: string;
  /** 총 매치 수 */
  totalMatches: number;
  /** 총 베팅 풀 (ETH 포맷) */
  totalBettingPool: string;
  /** 상금 (ETH 포맷) */
  prizePool: string;
  /** 참가자 수 */
  participants: number;
  /** 소요 시간 (예: "45분") */
  duration: string;
}

/**
 * Moltbook Social Layer 서비스
 *
 * 토너먼트 결과를 m/ghost-protocol submolt에 자동 포스팅
 *
 * Rate limits:
 * - 100 req/min (일반 API)
 * - 1 post per 30min
 * - 1 comment per 20s
 */
export class MoltbookSocialService {
  /** Moltbook API 키 */
  private readonly apiKey: string;
  /** 마지막 포스트 시각 (타임스탬프) */
  private lastPostTime: number = 0;
  /** 대기 중인 포스트 큐 */
  private pendingPosts: TournamentResult[] = [];

  /**
   * 서비스 초기화
   * @param apiKey - Moltbook API 키
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 토너먼트 결과를 m/ghost-protocol submolt에 포스팅
   *
   * @param result - 토너먼트 결과 데이터
   * @throws {Error} API 호출 실패 시
   */
  async postTournamentResult(result: TournamentResult): Promise<void> {
    if (!this.canPost()) {
      const waitTime = Math.ceil((POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 1000 / 60);
      logger.warn(
        { tournamentId: result.tournamentId, waitTime },
        `30분 쿨다운 중 — ${waitTime}분 후 재시도 가능. 큐에 추가합니다.`
      );
      this.pendingPosts.push(result);
      return;
    }

    const content = this.formatTournamentSummary(result);

    try {
      const response = await fetch(`${MOLTBOOK_BASE}/submolts/ghost-protocol/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          content,
          contentType: 'markdown',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moltbook API 오류 (${response.status}): ${errorText}`);
      }

      this.lastPostTime = Date.now();
      logger.info(
        { tournamentId: result.tournamentId },
        '토너먼트 결과를 m/ghost-protocol에 성공적으로 포스팅했습니다.'
      );
    } catch (error) {
      logger.error(
        { error, tournamentId: result.tournamentId },
        '토너먼트 결과 포스팅 실패'
      );
      throw error;
    }
  }

  /**
   * 특정 에이전트 관련 포스트 검색 (시맨틱 검색)
   *
   * @param agentName - 에이전트 이름
   * @returns 검색된 포스트 배열
   */
  async getAgentPosts(agentName: string): Promise<unknown[]> {
    try {
      const response = await fetch(
        `${MOLTBOOK_BASE}/submolts/ghost-protocol/posts/search?q=${encodeURIComponent(agentName)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moltbook API 오류 (${response.status}): ${errorText}`);
      }

      const data = await response.json() as { posts: unknown[] };
      return data.posts;
    } catch (error) {
      logger.error({ error, agentName }, '에이전트 포스트 검색 실패');
      throw error;
    }
  }

  /**
   * ghost-protocol submolt 생성 (일회성 설정)
   *
   * @throws {Error} API 호출 실패 시
   */
  async createSubmolt(): Promise<void> {
    try {
      const response = await fetch(`${MOLTBOOK_BASE}/submolts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          name: 'ghost-protocol',
          displayName: 'Ghost Protocol',
          description: 'AI-powered Pac-Man arena on Monad — 토너먼트 결과 및 베팅 통계',
          isPublic: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moltbook API 오류 (${response.status}): ${errorText}`);
      }

      logger.info('m/ghost-protocol submolt를 성공적으로 생성했습니다.');
    } catch (error) {
      logger.error({ error }, 'Submolt 생성 실패');
      throw error;
    }
  }

  /**
   * 토너먼트 결과를 마크다운 형식으로 포맷
   *
   * @param result - 토너먼트 결과 데이터
   * @returns 포맷된 마크다운 문자열
   */
  private formatTournamentSummary(result: TournamentResult): string {
    // 주소 축약 (0x1234...abcd)
    const shortenAddress = (addr: string): string => {
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return `🏆 Ghost Protocol Tournament #${result.tournamentId} 결과

**우승**: ${result.winnerName} (${shortenAddress(result.winnerAddress)})
**준우승**: ${result.runnerUpName} (${shortenAddress(result.runnerUpAddress)})

📊 통계:
- 총 매치: ${result.totalMatches}경기
- 참가 에이전트: ${result.participants}팀
- 총 베팅 풀: ${result.totalBettingPool} MON
- 상금: ${result.prizePool} MON
- 소요 시간: ${result.duration}

🔗 전체 결과: ghost-protocol.xyz/tournament/${result.tournamentId}`;
  }

  /**
   * 포스팅 가능 여부 확인 (30분 쿨다운)
   *
   * @returns 포스팅 가능하면 true
   */
  private canPost(): boolean {
    return Date.now() - this.lastPostTime >= POST_COOLDOWN_MS;
  }

  /**
   * 대기 중인 포스트 큐 조회
   *
   * @returns 대기 중인 토너먼트 결과 배열
   */
  getPendingPosts(): readonly TournamentResult[] {
    return this.pendingPosts;
  }

  /**
   * 대기 중인 포스트 큐 비우기
   */
  clearPendingPosts(): void {
    this.pendingPosts = [];
  }
}
