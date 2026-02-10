import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { GhostProtocolError, NotFoundError, RateLimitError, AuthenticationError } from '@ghost-protocol/shared';

/** 로거 인스턴스 */
const logger = pino({ name: 'error-handler' });

/**
 * Express 5 글로벌 에러 핸들러
 * 모든 비동기 에러를 자동으로 캐치하여 적절한 HTTP 응답 반환
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, 'Error during request processing');

  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: err.message,
    });
    return;
  }

  if (err instanceof RateLimitError) {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: err.message,
      retryAfter: err.retryAfter,
    });
    return;
  }

  if (err instanceof AuthenticationError) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: err.message,
    });
    return;
  }

  if (err instanceof GhostProtocolError) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: err.message,
    });
    return;
  }

  // Unknown error — internal server error
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error occurred',
  });
}
