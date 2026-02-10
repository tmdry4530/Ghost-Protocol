/**
 * Express 미들웨어: Moltbook Identity Token 검증
 *
 * X-Moltbook-Identity 헤더에서 토큰을 추출하고 검증한다.
 * 검증 성공 시 req.moltbookAgent에 프로필을 부착한다.
 *
 * 사용 예시:
 * ```typescript
 * router.post('/arena/register', moltbookAuthMiddleware, async (req, res) => {
 *   const agent = req.moltbookAgent!; // 검증된 프로필 사용
 *   // ...
 * });
 * ```
 */

import type { Request, Response, NextFunction } from 'express';
import {
  verifyMoltbookIdentity,
  MoltbookAuthError,
  type MoltbookVerifiedProfile,
} from '../services/moltbookAuth.js';
import pino from 'pino';

const logger = pino({ name: 'moltbook-auth-middleware' });

/**
 * Express Request 타입 확장
 * moltbookAgent 속성을 추가하여 검증된 프로필 전달
 */
declare global {
  namespace Express {
    interface Request {
      moltbookAgent?: MoltbookVerifiedProfile;
    }
  }
}

/**
 * Moltbook 인증 미들웨어
 *
 * 흐름:
 * 1. X-Moltbook-Identity 헤더에서 토큰 추출
 * 2. verifyMoltbookIdentity()로 토큰 검증
 * 3. 프로필의 is_claimed 체크 (미클레임 에이전트 거부)
 * 4. 프로필의 is_active 체크 (비활성 에이전트 거부)
 * 5. req.moltbookAgent에 프로필 주입 후 next()
 *
 * @param req - Express Request
 * @param res - Express Response
 * @param next - Express NextFunction
 */
export async function moltbookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers['x-moltbook-identity'];

  if (!token || typeof token !== 'string') {
    logger.warn(
      { headers: req.headers },
      'X-Moltbook-Identity 헤더 누락 또는 유효하지 않음',
    );
    res.status(401).json({
      success: false,
      error: 'X-Moltbook-Identity 헤더에 identity token이 없습니다',
      hint: 'Moltbook API로 identity token을 발급받은 후 헤더에 포함하세요',
      authDocsUrl:
        'https://moltbook.com/auth.md?app=GhostProtocol&endpoint=' +
        encodeURIComponent(`${req.protocol}://${req.get('host') ?? 'localhost'}/api/v1/arena/register`) +
        '&header=X-Moltbook-Identity',
    });
    return;
  }

  try {
    const profile = await verifyMoltbookIdentity(token);

    // 클레임되지 않은 에이전트는 참가 불가
    if (!profile.is_claimed) {
      logger.warn(
        { moltbookId: profile.id, name: profile.name },
        '미클레임 에이전트의 참가 시도 거부',
      );
      res.status(403).json({
        success: false,
        error: '아직 인간 소유자에 의해 claim되지 않은 에이전트입니다',
        hint: 'Moltbook에서 claim 절차를 완료한 후 다시 시도하세요',
        moltbookProfile: {
          id: profile.id,
          name: profile.name,
          karma: profile.karma,
        },
      });
      return;
    }

    // 비활성 에이전트 필터
    if (!profile.is_active) {
      logger.warn(
        { moltbookId: profile.id, name: profile.name },
        '비활성 에이전트의 참가 시도 거부',
      );
      res.status(403).json({
        success: false,
        error: '비활성화된 Moltbook 에이전트입니다',
        moltbookProfile: {
          id: profile.id,
          name: profile.name,
          karma: profile.karma,
        },
      });
      return;
    }

    // 검증 성공 — Request에 프로필 주입
    req.moltbookAgent = profile;
    logger.debug(
      {
        moltbookId: profile.id,
        name: profile.name,
        karma: profile.karma,
        owner: profile.owner.x_handle,
      },
      '미들웨어 인증 성공',
    );
    next();
  } catch (error) {
    if (error instanceof MoltbookAuthError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    // 예상치 못한 에러 — Express 에러 핸들러로 전달
    logger.error({ error }, '미들웨어에서 예상치 못한 에러 발생');
    next(error);
  }
}
