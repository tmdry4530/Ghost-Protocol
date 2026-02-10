import { GhostArena } from "generated";

/**
 * AgentRegistered 이벤트 핸들러
 * 새로운 AI 에이전트가 등록될 때 호출됨
 */
GhostArena.AgentRegistered.handler(async ({ event, context }) => {
  context.Agent.set({
    id: `${event.params.agent}-${event.block.number}`,
    address: event.params.agent,
    name: event.params.name,
    agentId: event.params.agentId,
    registeredAt: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

/**
 * TournamentCreated 이벤트 핸들러
 * 새로운 토너먼트가 생성될 때 호출됨
 */
GhostArena.TournamentCreated.handler(async ({ event, context }) => {
  context.Tournament.set({
    id: event.params.tournamentId.toString(),
    tournamentId: event.params.tournamentId,
    startTime: event.params.startTime,
    createdAt: event.block.timestamp,
  });
});

/**
 * MatchResultRecorded 이벤트 핸들러
 * 매치 결과가 온체인에 기록될 때 호출됨
 */
GhostArena.MatchResultRecorded.handler(async ({ event, context }) => {
  context.MatchResult.set({
    id: event.params.matchId.toString(),
    matchId: event.params.matchId,
    winner: event.params.winner,
    stateHash: event.params.stateHash,
    recordedAt: event.block.timestamp,
  });
});
