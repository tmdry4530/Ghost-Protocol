import { WagerPool } from "generated";

/**
 * BetPlaced 이벤트 핸들러
 * 사용자가 베팅을 배치할 때 호출됨
 */
WagerPool.BetPlaced.handler(async ({ event, context }) => {
  const betId = `${event.params.matchId}-${event.params.bettor}-${event.block.number}`;
  const matchId = event.params.matchId.toString();

  // 베팅 기록 생성
  context.Bet.set({
    id: betId,
    matchId,
    bettor: event.params.bettor,
    agent: event.params.agent,
    amount: event.params.amount.toString(),
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  // 베팅 풀 업데이트 (기존 풀 가져오기 또는 새로 생성)
  const existingPool = await context.BettingPool.get(matchId);

  if (existingPool) {
    context.BettingPool.set({
      ...existingPool,
      totalAmount: (BigInt(existingPool.totalAmount) + event.params.amount).toString(),
      betCount: existingPool.betCount + 1,
    });
  } else {
    context.BettingPool.set({
      id: matchId,
      matchId,
      totalAmount: event.params.amount.toString(),
      betCount: 1,
      lockTime: undefined,
    });
  }
});

/**
 * BetSettled 이벤트 핸들러
 * 베팅이 정산될 때 호출됨
 */
WagerPool.BetSettled.handler(async ({ event, context }) => {
  const settlementId = `${event.params.matchId}-${event.params.bettor}-${event.block.number}`;

  context.Settlement.set({
    id: settlementId,
    matchId: event.params.matchId.toString(),
    bettor: event.params.bettor,
    payout: event.params.payout.toString(),
    timestamp: event.block.timestamp,
  });
});

/**
 * PoolCreated 이벤트 핸들러
 * 새로운 베팅 풀이 생성될 때 호출됨
 */
WagerPool.PoolCreated.handler(async ({ event, context }) => {
  const matchId = event.params.matchId.toString();

  // 기존 풀이 있으면 lockTime만 업데이트, 없으면 새로 생성
  const existingPool = await context.BettingPool.get(matchId);

  if (existingPool) {
    context.BettingPool.set({
      ...existingPool,
      lockTime: event.params.lockTime,
    });
  } else {
    context.BettingPool.set({
      id: matchId,
      matchId,
      totalAmount: "0",
      betCount: 0,
      lockTime: event.params.lockTime,
    });
  }
});
