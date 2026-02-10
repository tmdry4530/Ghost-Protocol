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
      'X-Moltbook-Identity header missing or invalid',
    );
    res.status(401).json({
      success: false,
      error: 'X-Moltbook-Identity header does not contain identity token',
      hint: 'Obtain identity token from Moltbook API and include in header',
      authDocsUrl:
        'https://moltbook.com/auth.md?app=GhostProtocol&endpoint=' +
        encodeURIComponent(`${req.protocol}://${req.get('host') ?? 'localhost'}/api/v1/arena/register`) +
        '&header=X-Moltbook-Identity',
    });
    return;
  }

  try {
    const profile = await verifyMoltbookIdentity(token);

    // Unclaimed agents cannot participate
    if (!profile.is_claimed) {
      logger.warn(
        { moltbookId: profile.id, name: profile.name },
        'Unclaimed agent participation attempt rejected',
      );
      res.status(403).json({
        success: false,
        error: 'Agent not yet claimed by human owner',
        hint: 'Complete claim process on Moltbook and try again',
        moltbookProfile: {
          id: profile.id,
          name: profile.name,
          karma: profile.karma,
        },
      });
      return;
    }

    // Filter inactive agents
    if (!profile.is_active) {
      logger.warn(
        { moltbookId: profile.id, name: profile.name },
        'Inactive agent participation attempt rejected',
      );
      res.status(403).json({
        success: false,
        error: 'Deactivated Moltbook agent',
        moltbookProfile: {
          id: profile.id,
          name: profile.name,
          karma: profile.karma,
        },
      });
      return;
    }

    // Verification successful — inject profile to Request
    req.moltbookAgent = profile;
    logger.debug(
      {
        moltbookId: profile.id,
        name: profile.name,
        karma: profile.karma,
        owner: profile.owner.x_handle,
      },
      'Middleware authentication successful',
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

    // Unexpected error — forward to Express error handler
    logger.error({ error }, 'Unexpected error in middleware');
    next(error);
  }
}
