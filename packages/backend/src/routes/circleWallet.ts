import { Router, type Router as ExpressRouter } from 'express';
import { randomUUID } from 'node:crypto';

const router: ExpressRouter = Router();

/**
 * Circle API 베이스 URL
 */
const CIRCLE_BASE = process.env.CIRCLE_API_BASE ?? 'https://api.circle.com';

/**
 * Circle API 키 (서버 전용)
 */
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;

/**
 * Circle API 사용 가능 여부 확인
 */
function isCircleAvailable(): boolean {
  return Boolean(CIRCLE_API_KEY);
}

/**
 * POST /api/v1/wallet/device-token
 *
 * Circle Programmable Wallets 서비스에 deviceToken 요청
 * 프론트엔드 Web SDK가 생성한 deviceId를 전달받아 교환
 *
 * Body: { deviceId: string }
 * Returns: { success: true, deviceToken: string, deviceEncryptionKey: string }
 */
router.post('/device-token', async (req, res) => {
  if (!isCircleAvailable()) {
    res.status(503).json({
      success: false,
      error: 'Circle API 키가 설정되지 않았습니다. 이 기능은 선택적 기능입니다.',
    });
    return;
  }

  const { deviceId } = req.body;

  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ success: false, error: 'deviceId 누락' });
    return;
  }

  try {
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/users/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({
        deviceId,
      }),
    });

    const data = (await response.json()) as {
      data?: { deviceToken: string; deviceEncryptionKey: string };
      error?: string;
    };

    if (!response.ok) {
      res.status(response.status).json({ success: false, error: data.error ?? '요청 실패' });
      return;
    }

    res.json({
      success: true,
      deviceToken: data.data?.deviceToken,
      deviceEncryptionKey: data.data?.deviceEncryptionKey,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: `Circle API 호출 실패: ${err.message}`,
    });
  }
});

/**
 * POST /api/v1/wallet/init-user
 *
 * 유저 초기화 (지갑 생성)
 * 이미 초기화된 유저는 error code 155106 반환 → 기존 지갑 로드
 *
 * Body: { userToken: string }
 * Returns: { success: true, challengeId: string } 또는 { success: false, code: 155106 }
 */
router.post('/init-user', async (req, res) => {
  if (!isCircleAvailable()) {
    res.status(503).json({
      success: false,
      error: 'Circle API 키가 설정되지 않았습니다.',
    });
    return;
  }

  const { userToken } = req.body;

  if (!userToken || typeof userToken !== 'string') {
    res.status(400).json({ success: false, error: 'userToken 누락' });
    return;
  }

  try {
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/user/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        'X-User-Token': userToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        accountType: 'SCA',
        blockchains: ['MONAD-TESTNET'],
      }),
    });

    const data = (await response.json()) as {
      data?: { challengeId: string };
      code?: number;
      message?: string;
    };

    if (!response.ok) {
      // code 155106 = 이미 초기화된 유저 — 기존 지갑 로드로 분기
      res.status(response.status).json({
        success: false,
        code: data.code,
        message: data.message,
      });
      return;
    }

    res.json({
      success: true,
      challengeId: data.data?.challengeId,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: `Circle API 호출 실패: ${err.message}`,
    });
  }
});

/**
 * GET /api/v1/wallet/wallets
 *
 * 유저 지갑 목록 조회
 *
 * Query: userToken (string)
 * Returns: { success: true, wallets: [...] }
 */
router.get('/wallets', async (req, res) => {
  if (!isCircleAvailable()) {
    res.status(503).json({
      success: false,
      error: 'Circle API 키가 설정되지 않았습니다.',
    });
    return;
  }

  const userToken = req.query.userToken;

  if (!userToken || typeof userToken !== 'string') {
    res.status(400).json({ success: false, error: 'userToken 누락' });
    return;
  }

  try {
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/wallets`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        'X-User-Token': userToken,
      },
    });

    const data = (await response.json()) as {
      data?: { wallets: unknown[] };
      error?: string;
    };

    if (!response.ok) {
      res.status(response.status).json({ success: false, error: data.error });
      return;
    }

    res.json({
      success: true,
      wallets: data.data?.wallets ?? [],
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: `Circle API 호출 실패: ${err.message}`,
    });
  }
});

/**
 * GET /api/v1/wallet/balance/:walletId
 *
 * 지갑 잔액 조회
 *
 * Params: walletId (string)
 * Query: userToken (string)
 * Returns: { success: true, tokenBalances: [...] }
 */
router.get('/balance/:walletId', async (req, res) => {
  if (!isCircleAvailable()) {
    res.status(503).json({
      success: false,
      error: 'Circle API 키가 설정되지 않았습니다.',
    });
    return;
  }

  const { walletId } = req.params;
  const userToken = req.query.userToken;

  if (!userToken || typeof userToken !== 'string') {
    res.status(400).json({ success: false, error: 'userToken 누락' });
    return;
  }

  if (!walletId) {
    res.status(400).json({ success: false, error: 'walletId 누락' });
    return;
  }

  try {
    const response = await fetch(`${CIRCLE_BASE}/v1/w3s/wallets/${walletId}/balances`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        'X-User-Token': userToken,
      },
    });

    const data = (await response.json()) as {
      data?: { tokenBalances: unknown[] };
      error?: string;
    };

    if (!response.ok) {
      res.status(response.status).json({ success: false, error: data.error });
      return;
    }

    res.json({
      success: true,
      tokenBalances: data.data?.tokenBalances ?? [],
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: `Circle API 호출 실패: ${err.message}`,
    });
  }
});

export { router as circleWalletRouter };
