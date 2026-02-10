import { SurvivalBet } from "generated";

/**
 * PredictionPlaced 이벤트 핸들러
 * 사용자가 Survival 모드에서 라운드 예측을 배치할 때 호출됨
 */
SurvivalBet.PredictionPlaced.handler(async ({ event, context }) => {
  const predictionId = `${event.params.sessionId}-${event.params.bettor}-${event.block.number}`;

  context.Prediction.set({
    id: predictionId,
    sessionId: event.params.sessionId.toString(),
    bettor: event.params.bettor,
    predictedRound: event.params.predictedRound,
    amount: event.params.amount.toString(),
    timestamp: event.block.timestamp,
  });
});

/**
 * SessionSettled 이벤트 핸들러
 * Survival 세션이 정산될 때 호출됨
 */
SurvivalBet.SessionSettled.handler(async ({ event, context }) => {
  const sessionId = event.params.sessionId.toString();

  context.SessionResult.set({
    id: sessionId,
    sessionId,
    eliminationRound: event.params.eliminationRound,
    totalPool: event.params.totalPool.toString(),
    settledAt: event.block.timestamp,
  });
});
