import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import type { MatchScheduler, MatchJobResult } from './MatchScheduler.js';
import type { ResultVerifier } from './ResultVerifier.js';
import type { BettingOrchestrator } from './BettingOrchestrator.js';
import type { SocketManager } from '../websocket/SocketManager.js';
import type { MazeVariant, DifficultyTier } from '@ghost-protocol/shared';
import pino from 'pino';

const logger = pino({ name: 'arena-manager' });

/** ArenaManager 설정 */
export interface ArenaManagerConfig {
  readonly rpcUrl: string;
  readonly privateKey: string;
  readonly ghostArenaAddress: string;
  readonly matchScheduler: MatchScheduler;
  readonly resultVerifier: ResultVerifier;
  readonly bettingOrchestrator: BettingOrchestrator;
  readonly socketManager: SocketManager;
  /** 테스트용 컨트랙트 주입 (선택사항) */
  readonly ghostArenaContract?: Contract;
}

/** GhostArena 컨트랙트 ABI (필요한 함수만) */
const GHOST_ARENA_ABI = [
  'function getActiveAgents() external view returns (address[] memory)',
  'function getAgentInfo(address agent) external view returns (address owner, string memory name, uint256 wins, uint256 losses, uint256 reputation, bool active)',
  'function createTournament(address[] memory participants, uint8 bracketSize) external returns (uint256 tournamentId)',
  'function getTournamentInfo(uint256 tournamentId) external view returns (address[] memory participants, uint8 bracketSize, uint8 status, uint256 prizePool)',
  'function advanceTournament(uint256 tournamentId, address[] memory winners) external',
  'function finalizeTournament(uint256 tournamentId, address champion) external',
] as const;

/** 토너먼트 브래킷 상태 */
interface TournamentBracket {
  readonly tournamentId: string;
  readonly bracketSize: 8 | 16;
  readonly participants: readonly string[];
  currentRound: number;
  readonly bracket: Map<number, readonly MatchPairing[]>; // round -> pairings
  roundWinners: Map<number, readonly string[]>; // round -> winners
  status: 'active' | 'completed';
}

/** 매치 페어링 */
interface MatchPairing {
  readonly matchId: string;
  readonly agentA: string;
  readonly agentB: string;
  readonly variant: MazeVariant;
  readonly seed: number;
}

/**
 * 아레나 매니저
 * 자율적인 토너먼트 생성, 브래킷 관리, 매치 스케줄링, 결과 검증 및 온체인 제출을 총괄합니다.
 */
export class ArenaManager {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly ghostArenaContract: Contract;
  private readonly matchScheduler: MatchScheduler;
  private readonly resultVerifier: ResultVerifier;
  private readonly bettingOrchestrator: BettingOrchestrator;
  private readonly socketManager: SocketManager;

  private readonly activeTournaments: Map<string, TournamentBracket> = new Map();
  private tournamentIdCounter = 0;
  private matchIdCounter = 0;

  constructor(config: ArenaManagerConfig) {
    if (config.ghostArenaContract) {
      // 테스트용 컨트랙트가 주입된 경우
      this.provider = undefined as unknown as JsonRpcProvider;
      this.wallet = undefined as unknown as Wallet;
      this.ghostArenaContract = config.ghostArenaContract;
    } else {
      // 프로덕션: RPC로부터 컨트랙트 생성
      this.provider = new JsonRpcProvider(config.rpcUrl);
      this.wallet = new Wallet(config.privateKey, this.provider);
      this.ghostArenaContract = new Contract(
        config.ghostArenaAddress,
        GHOST_ARENA_ABI,
        this.wallet,
      );
    }
    this.matchScheduler = config.matchScheduler;
    this.resultVerifier = config.resultVerifier;
    this.bettingOrchestrator = config.bettingOrchestrator;
    this.socketManager = config.socketManager;

    // 매치 완료 콜백 설정
    this.matchScheduler.setOnMatchComplete((result) => {
      void this.handleMatchComplete(result);
    });
  }

  /**
   * 자율 토너먼트 생성 시작
   * 평판 기반 시딩으로 8 또는 16명 토너먼트를 생성하고 자동 진행합니다.
   */
  async createAutonomousTournament(bracketSize: 8 | 16 = 8): Promise<string> {
    logger.info({ bracketSize }, '자율 토너먼트 생성 시작');

    // 1. 활성 에이전트 조회
    const activeAgents = await this.getActiveAgents();
    if (activeAgents.length < bracketSize) {
      throw new Error(`활성 에이전트 부족: ${String(activeAgents.length)}명 (최소 ${String(bracketSize)}명 필요)`);
    }

    // 2. 평판 기반 시딩 (상위 N명 선정)
    const participants = await this.selectParticipantsByReputation(activeAgents, bracketSize);

    // 3. 온체인 토너먼트 생성
    const onChainTournamentId = await this.createOnChainTournament(participants, bracketSize);
    const tournamentId = `tournament:${String(this.tournamentIdCounter++)}:${String(onChainTournamentId)}`;

    // 4. 브래킷 생성
    const bracket = this.generateBracket(tournamentId, participants, bracketSize);
    this.activeTournaments.set(tournamentId, bracket);

    logger.info({ tournamentId, participants: participants.length }, '토너먼트 생성 완료');

    // 5. 첫 라운드 시작
    await this.startTournamentRound(tournamentId, 1);

    return tournamentId;
  }

  /**
   * 활성 에이전트 조회 (온체인)
   */
  private async getActiveAgents(): Promise<readonly string[]> {
    const agents = (await this.ghostArenaContract.getFunction('getActiveAgents')()) as string[];
    return agents;
  }

  /**
   * 평판 기반 에이전트 선정
   */
  private async selectParticipantsByReputation(
    agents: readonly string[],
    count: number,
  ): Promise<readonly string[]> {
    // 각 에이전트 정보 조회
    const agentInfos = await Promise.all(
      agents.map(async (address) => {
        const info = (await this.ghostArenaContract.getFunction('getAgentInfo')(address)) as [
          string, // owner
          string, // name
          bigint, // wins
          bigint, // losses
          bigint, // reputation
          boolean, // active
        ];
        return {
          address,
          reputation: Number(info[4]),
        };
      }),
    );

    // 평판 내림차순 정렬 후 상위 N명
    agentInfos.sort((a, b) => b.reputation - a.reputation);
    return agentInfos.slice(0, count).map((a) => a.address);
  }

  /**
   * 온체인 토너먼트 생성
   */
  private async createOnChainTournament(
    participants: readonly string[],
    bracketSize: 8 | 16,
  ): Promise<number> {
    const tx = (await this.ghostArenaContract.getFunction('createTournament')(
      participants,
      bracketSize,
    )) as { wait: () => Promise<{ hash: string }> };
    const receipt = await tx.wait();

    // tournamentId는 이벤트에서 추출하거나 컨트랙트에서 반환 (여기서는 간단히 가정)
    const tournamentId = 1; // 실제로는 이벤트 파싱 필요
    logger.info({ tournamentId, txHash: receipt.hash }, '온체인 토너먼트 생성 완료');
    return tournamentId;
  }

  /**
   * 싱글 엘리미네이션 브래킷 생성
   */
  private generateBracket(
    tournamentId: string,
    participants: readonly string[],
    bracketSize: 8 | 16,
  ): TournamentBracket {
    const bracket = new Map<number, readonly MatchPairing[]>();

    // 첫 라운드 페어링 생성 (시드 순서대로)
    const firstRoundPairings: MatchPairing[] = [];
    for (let i = 0; i < participants.length; i += 2) {
      const agentA = participants[i];
      const agentB = participants[i + 1];
      if (agentA === undefined || agentB === undefined) continue;

      firstRoundPairings.push({
        matchId: `match:${String(this.matchIdCounter++)}`,
        agentA,
        agentB,
        variant: this.selectRandomVariant(),
        seed: this.generateSeed(),
      });
    }
    bracket.set(1, firstRoundPairings);

    return {
      tournamentId,
      bracketSize,
      participants,
      currentRound: 0,
      bracket,
      roundWinners: new Map(),
      status: 'active',
    };
  }

  /**
   * 토너먼트 라운드 시작
   */
  private async startTournamentRound(tournamentId: string, round: number): Promise<void> {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) return;

    const pairings = tournament.bracket.get(round);
    if (!pairings) {
      logger.warn({ tournamentId, round }, '라운드 페어링 없음');
      return;
    }

    logger.info({ tournamentId, round, matchCount: pairings.length }, '라운드 시작');
    tournament.currentRound = round;

    // 토너먼트 진행 브로드캐스트
    this.socketManager.broadcastTournamentAdvance(tournamentId, {
      type: 'round_start',
      tournamentId,
      round,
      matchups: pairings.map((p) => ({ agentA: p.agentA, agentB: p.agentB })),
    });

    // 모든 매치 동시 스케줄링
    const matchJobs = pairings.map((pairing) => ({
      matchId: pairing.matchId,
      agentA: pairing.agentA,
      agentB: pairing.agentB,
      variant: pairing.variant,
      seed: pairing.seed,
      difficulty: 3 as DifficultyTier, // 토너먼트는 Tier 3 고정
      tournamentId,
      round,
    }));

    // 매치 스케줄링 전에 배팅 창 열기
    for (const pairing of pairings) {
      this.bettingOrchestrator.openBettingWindow(pairing.matchId, pairing.agentA, pairing.agentB);
    }

    await this.matchScheduler.scheduleRoundMatches(matchJobs);
  }

  /**
   * 매치 완료 처리
   */
  private async handleMatchComplete(result: MatchJobResult): Promise<void> {
    logger.info({ matchId: result.matchId, winner: result.winner }, '매치 완료 처리');

    // 1. 결과 검증 및 온체인 제출
    await this.resultVerifier.submitResult({
      matchId: Number(result.matchId.split(':')[1] ?? '0'),
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      winner: result.winner,
      replayData: result.replayData,
      replayURI: `ipfs://replay/${result.matchId}`, // 실제로는 IPFS 업로드 필요
    });

    // 2. 배팅 정산
    const betSide = result.scoreA >= result.scoreB ? 'agentA' : 'agentB';
    await this.bettingOrchestrator.settleBets(result.matchId, betSide);

    // 3. 토너먼트 브래킷 업데이트 (해당하는 경우)
    await this.updateTournamentBracket(result);
  }

  /**
   * 토너먼트 브래킷 업데이트 및 다음 라운드 진행
   */
  private async updateTournamentBracket(result: MatchJobResult): Promise<void> {
    // tournamentId를 매치 결과에서 찾기 (간단화: activeTournaments 순회)
    for (const [tournamentId, tournament] of this.activeTournaments) {
      const currentPairings = tournament.bracket.get(tournament.currentRound);
      if (!currentPairings) continue;

      const matchIndex = currentPairings.findIndex((p) => p.matchId === result.matchId);
      if (matchIndex === -1) continue;

      // 라운드 승자 기록
      const existingWinners = tournament.roundWinners.get(tournament.currentRound) ?? [];
      tournament.roundWinners.set(tournament.currentRound, [...existingWinners, result.winner]);

      // 라운드 모든 매치 완료 확인
      const allWinners = tournament.roundWinners.get(tournament.currentRound) ?? [];
      if (allWinners.length === currentPairings.length) {
        await this.advanceToNextRound(tournamentId, allWinners);
      }

      break;
    }
  }

  /**
   * 다음 라운드 진행 또는 토너먼트 종료
   */
  private async advanceToNextRound(tournamentId: string, winners: readonly string[]): Promise<void> {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) return;

    const nextRound = tournament.currentRound + 1;

    // 결승 완료 (승자 1명)
    if (winners.length === 1) {
      const champion = winners[0];
      if (champion !== undefined) {
        await this.finalizeTournament(tournamentId, champion);
      }
      return;
    }

    // 다음 라운드 페어링 생성
    const nextPairings: MatchPairing[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      const agentA = winners[i];
      const agentB = winners[i + 1];
      if (agentA === undefined || agentB === undefined) continue;

      nextPairings.push({
        matchId: `match:${String(this.matchIdCounter++)}`,
        agentA,
        agentB,
        variant: this.selectRandomVariant(),
        seed: this.generateSeed(),
      });
    }

    tournament.bracket.set(nextRound, nextPairings);

    logger.info({ tournamentId, nextRound, matchCount: nextPairings.length }, '다음 라운드 진행');

    // 온체인 토너먼트 진행 기록
    await this.advanceOnChainTournament(tournamentId, winners);

    // 다음 라운드 시작
    await this.startTournamentRound(tournamentId, nextRound);
  }

  /**
   * 온체인 토너먼트 진행 기록
   */
  private async advanceOnChainTournament(tournamentId: string, winners: readonly string[]): Promise<void> {
    const onChainId = Number(tournamentId.split(':')[2] ?? '0');
    const tx = (await this.ghostArenaContract.getFunction('advanceTournament')(onChainId, winners)) as { wait: () => Promise<unknown> };
    await tx.wait();
    logger.info({ tournamentId, winnersCount: winners.length }, '온체인 토너먼트 진행 기록');
  }

  /**
   * 토너먼트 종료 및 우승자 상금 분배
   */
  private async finalizeTournament(tournamentId: string, champion: string): Promise<void> {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) return;

    logger.info({ tournamentId, champion }, '토너먼트 종료');

    // 온체인 토너먼트 종료 및 상금 분배
    const onChainId = Number(tournamentId.split(':')[2] ?? '0');
    const tx = (await this.ghostArenaContract.getFunction('finalizeTournament')(onChainId, champion)) as { wait: () => Promise<unknown> };
    await tx.wait();

    tournament.status = 'completed';

    // 토너먼트 종료 브로드캐스트
    this.socketManager.broadcastTournamentAdvance(tournamentId, {
      type: 'tournament_complete',
      tournamentId,
      champion,
    });

    // 토너먼트 제거
    this.activeTournaments.delete(tournamentId);

    logger.info({ tournamentId, champion }, '토너먼트 종료 및 상금 분배 완료');
  }

  /** 내부 시드 카운터 (결정론적 난수 생성용) */
  private seedCounter = 0;

  /**
   * 간단한 결정론적 해시 (시드 기반)
   * @param seed 시드 값
   */
  private deterministicHash(seed: number): number {
    let h = seed | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  /**
   * 결정론적 미로 변형 선택 (타임스탬프 + 카운터 기반)
   */
  private selectRandomVariant(): MazeVariant {
    const variants: MazeVariant[] = ['classic', 'labyrinth', 'speedway', 'fortress', 'random'];
    const hash = this.deterministicHash(Date.now() + this.seedCounter++);
    const selected = variants[hash % variants.length];
    return selected ?? 'classic';
  }

  /**
   * 게임 시드 생성 (타임스탬프 + 카운터 기반 결정론적)
   */
  private generateSeed(): number {
    return this.deterministicHash(Date.now() + this.seedCounter++);
  }

  /**
   * 활성 토너먼트 수
   */
  getActiveTournamentCount(): number {
    return this.activeTournaments.size;
  }

  /**
   * 정리 (서버 종료 시)
   */
  shutdown(): void {
    this.activeTournaments.clear();
    logger.info('ArenaManager 종료');
  }
}
