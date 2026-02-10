/**
 * Ghost Protocol 메인 서버 진입점
 * Express HTTP 서버, Socket.io WebSocket, 게임 루프 매니저, 데모 토너먼트를 초기화하고 시작한다.
 */
import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import { loadEnv } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { GameLoopManager } from './game/GameLoopManager.js';
import { SocketManager } from './websocket/SocketManager.js';
import { createApiRouter, ApiStateStore } from './routes/api.js';
import { agentRegistrationRouter } from './routes/agentRegistration.js';
import { circleWalletRouter } from './routes/circleWallet.js';
import { DemoTournamentRunner } from './orchestrator/DemoTournamentRunner.js';
import { ChallengeMatchOrchestrator } from './orchestrator/ChallengeMatchOrchestrator.js';
import { BettingOrchestrator } from './orchestrator/BettingOrchestrator.js';
import { IndexerService } from './services/indexerService.js';

/** 구조화된 로거 인스턴스 */
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/** 서버 시작 */
function main(): void {
  const env = loadEnv();

  /** Express 앱 인스턴스 */
  const app = express();

  /** HTTP 서버 — Socket.io와 공유 */
  const httpServer = createServer(app);

  /** Socket.io 서버 인스턴스 */
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  // 미들웨어 설정
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  // 핵심 매니저 초기화 (단일 인스턴스 공유)
  const gameLoopManager = new GameLoopManager();
  const socketManager = new SocketManager(io, gameLoopManager);

  // API 상태 저장소 초기화
  const stateStore = new ApiStateStore();
  stateStore.registerDemoAgents();

  // SocketManager에 상태 저장소 연결 (로비 참가 시 현재 상태 전송용)
  socketManager.setStateStore(stateStore);

  // 배팅 오케스트레이터 초기화 (온체인 키/주소 있을 때만)
  let bettingOrchestrator: BettingOrchestrator | undefined;
  if (env.ARENA_MANAGER_PRIVATE_KEY && env.WAGER_POOL_ADDRESS) {
    bettingOrchestrator = new BettingOrchestrator({
      rpcUrl: env.MONAD_RPC_URL,
      privateKey: env.ARENA_MANAGER_PRIVATE_KEY,
      wagerPoolAddress: env.WAGER_POOL_ADDRESS,
      socketManager,
    });
    logger.info('BettingOrchestrator initialized (on-chain betting enabled)');
  } else {
    logger.info('BettingOrchestrator not initialized (ARENA_MANAGER_PRIVATE_KEY or WAGER_POOL_ADDRESS not set)');
  }

  // 챌린지 매치 오케스트레이터 초기화
  const challengeOrchestrator = new ChallengeMatchOrchestrator(
    gameLoopManager,
    socketManager,
    bettingOrchestrator,
  );

  // SocketManager에 챌린지 오케스트레이터 연결
  socketManager.setChallengeOrchestrator(challengeOrchestrator);

  // 상태 확인 엔드포인트
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      connections: socketManager.getConnectedCount(),
      activeSessions: gameLoopManager.getActiveSessions().length,
      agents: stateStore.agents.size,
      tournaments: stateStore.tournaments.size,
    });
  });

  // API v1 라우터 마운트
  const apiRouter = createApiRouter(gameLoopManager, stateStore, challengeOrchestrator);
  app.use('/api/v1', apiRouter);

  // v2 라우트 마운트
  app.use('/api/v1', agentRegistrationRouter);
  app.use('/api/v1/wallet', circleWalletRouter);

  // 에러 핸들러 (반드시 마지막에 등록)
  app.use(errorHandler);

  // 데모 토너먼트 러너 초기화
  const demoRunner = new DemoTournamentRunner(
    gameLoopManager,
    socketManager,
    stateStore,
  );

  // Envio Indexer 서비스 초기화
  const indexerService = new IndexerService({
    graphqlUrl: env.ENVIO_GRAPHQL_URL,
    io,
    pollInterval: 2000, // 2초마다 폴링
  });

  // Graceful Shutdown
  const shutdown = () => {
    logger.info('Shutting down server...');
    demoRunner.stop();
    bettingOrchestrator?.shutdown();
    challengeOrchestrator.shutdown();
    indexerService.stop();
    socketManager.shutdown();
    httpServer.close(() => {
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info(`Ghost Protocol server started: http://localhost:${env.PORT.toString()}`);
    logger.info(`WebSocket listening: ws://localhost:${env.PORT.toString()}`);
    logger.info(`API: http://localhost:${env.PORT.toString()}/api/v1`);
    logger.info(`Envio Indexer connected: ${env.ENVIO_GRAPHQL_URL}`);
    logger.info(`Agent count: ${stateStore.agents.size.toString()}`);

    // Auto-run demo tournament after server start
    demoRunner.start();

    // Start indexer polling
    indexerService.start();
  });
}

try {
  main();
} catch (error: unknown) {
  console.error('Server start failed:', error);
  process.exit(1);
}
