/**
 * Moltbook Identity Token 검증 서비스
 *
 * Moltbook의 Sign in with Moltbook 프로토콜을 구현한다.
 * 에이전트가 제출한 identity token을 Moltbook API로 검증하여
 * 인증된 에이전트 프로필을 반환한다.
 *
 * 참조:
 * - https://www.moltbook.com/skill.md
 * - https://x.com/harpaljadeja/status/2017903854873096663
 *
 * @notice 반드시 https://www.moltbook.com (www 포함) 사용할 것
 * @notice MOLTBOOK_APP_API_KEY(moltdev_)는 서버에서만 사용, 절대 프론트엔드에 노출하지 말 것
 */

import { loadEnv } from '../config.js';
import pino from 'pino';

const logger = pino({ name: 'moltbook-auth' });

/**
 * Moltbook 검증 완료된 에이전트 프로필
 * Moltbook API의 verify-identity 응답 스키마
 */
export interface MoltbookVerifiedProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly karma: number;
  readonly avatar: string | null;
  readonly is_claimed: boolean;
  readonly is_active: boolean;
  readonly follower_count: number;
  readonly following_count: number;
  readonly post_count: number;
  readonly comment_count: number;
  readonly created_at: string;
  readonly last_active: string;
  readonly owner: {
    readonly x_handle: string;
    readonly x_name: string;
    readonly x_avatar: string;
    readonly x_bio: string;
    readonly x_follower_count: number;
    readonly x_following_count: number;
    readonly x_verified: boolean;
  };
}

/**
 * Moltbook 인증 실패 커스텀 에러
 */
export class MoltbookAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'MoltbookAuthError';
  }
}

/**
 * Moltbook Identity Token을 검증하고 에이전트 프로필을 반환한다.
 *
 * 내부적으로 Moltbook의 verify-identity API를 호출한다.
 * Ghost Protocol은 Moltbook Developer Dashboard에서 등록한 앱이며,
 * moltdev_ API key로 인증한다.
 *
 * @param identityToken - 에이전트가 제출한 1시간 만료 identity token
 * @returns 검증된 에이전트 프로필
 * @throws MoltbookAuthError - 토큰 무효/만료 시 401, 미클레임 에이전트 시 403
 */
export async function verifyMoltbookIdentity(
  identityToken: string,
): Promise<MoltbookVerifiedProfile> {
  const env = loadEnv();
  const apiBase = env.MOLTBOOK_API_BASE ?? 'https://www.moltbook.com/api/v1';
  const appKey = env.MOLTBOOK_APP_API_KEY;

  if (!appKey) {
    logger.error('MOLTBOOK_APP_API_KEY environment variable not set');
    throw new MoltbookAuthError('Server configuration error: Moltbook API key not set', 500);
  }

  try {
    logger.debug({ apiBase }, 'Attempting Moltbook identity verification');

    const response = await fetch(`${apiBase}/agents/verify-identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-App-Key': appKey,
      },
      body: JSON.stringify({ token: identityToken }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      const errorMessage =
        errorData.error ?? `Moltbook API error: ${response.statusText}`;

      logger.warn(
        { statusCode: response.status, error: errorMessage },
        'Moltbook identity verification failed',
      );

      throw new MoltbookAuthError(errorMessage, response.status);
    }

    const data = (await response.json()) as { agent: MoltbookVerifiedProfile };
    const profile = data.agent;

    logger.info(
      {
        moltbookId: profile.id,
        name: profile.name,
        karma: profile.karma,
        isClaimed: profile.is_claimed,
      },
      'Moltbook identity verification successful',
    );

    return profile;
  } catch (error) {
    if (error instanceof MoltbookAuthError) {
      throw error;
    }

    // Network error or unexpected error
    logger.error({ error }, 'Unexpected error during Moltbook API call');
    throw new MoltbookAuthError(
      'Network error: Moltbook API connection failed',
      503,
    );
  }
}
