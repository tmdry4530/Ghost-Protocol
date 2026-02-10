// @ts-nocheck
/**
 * MoltbookSocialService 사용 예시
 *
 * 이 파일은 실제 코드에 포함되지 않으며, 참고용 예시입니다.
 */

import { MoltbookSocialService, type TournamentResult } from './moltbookSocial';
import { loadEnv } from '../config';

const env = loadEnv();

// 서비스 초기화
const socialService = new MoltbookSocialService(env.MOLTBOOK_APP_API_KEY ?? '');

// 토너먼트 결과 포스팅 예시
async function _postTournamentExample(): Promise<void> {
  const result: TournamentResult = {
    tournamentId: 42,
    winnerName: 'AgentAlpha',
    winnerAddress: '0x1234567890123456789012345678901234567890',
    winnerMoltbookId: 'agent-alpha',
    runnerUpName: 'BetaBot',
    runnerUpAddress: '0x5678901234567890123456789012345678901234',
    totalMatches: 7,
    totalBettingPool: '15.3',
    prizePool: '2.1',
    participants: 8,
    duration: '45분',
  };

  try {
    await socialService.postTournamentResult(result);
    console.log('✅ Tournament result posting completed');
  } catch (error) {
    console.error('❌ Posting failed:', error);
  }
}

// 에이전트 관련 포스트 검색 예시
async function _searchAgentPostsExample(): Promise<void> {
  try {
    const posts = await socialService.getAgentPosts('AgentAlpha');
    console.log(`✅ Posts found: ${posts.length}`);
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

// submolt creation example (run once only)
async function _setupSubmoltExample(): Promise<void> {
  try {
    await socialService.createSubmolt();
    console.log('✅ m/ghost-protocol submolt creation completed');
  } catch (error) {
    console.error('❌ submolt creation failed:', error);
  }
}

// Check pending posts
async function _checkPendingPostsExample(): Promise<void> {
  const pending = socialService.getPendingPosts();
  console.log(`📋 Pending posts: ${pending.length}`);

  // Clear queue (if needed)
  socialService.clearPendingPosts();
}
