#!/bin/bash
# Ghost Protocol 배포 주소 내보내기 스크립트
# 자동 생성 — deployments/monad-testnet.json → packages/shared/src/contracts.ts

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# jq 설치 확인
if ! command -v jq &> /dev/null; then
    echo -e "${RED}오류: jq가 설치되어 있지 않습니다.${NC}"
    echo "설치 방법:"
    echo "  Ubuntu/Debian: sudo apt-get install jq"
    echo "  macOS: brew install jq"
    echo "  Windows: choco install jq"
    exit 1
fi

# 프로젝트 루트로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}배포 주소 내보내기 시작...${NC}"

# 배포 파일 경로
DEPLOYMENT_FILE="packages/contracts/deployments/monad-testnet.json"
OUTPUT_FILE="packages/shared/src/contracts.ts"
INDEX_FILE="packages/shared/src/index.ts"

# 배포 파일 존재 확인
if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo -e "${RED}오류: 배포 파일을 찾을 수 없습니다: $DEPLOYMENT_FILE${NC}"
    echo ""
    echo "먼저 컨트랙트를 배포하세요:"
    echo "  cd packages/contracts"
    echo "  make deploy-monad"
    exit 1
fi

# JSON 파일 파싱
echo "배포 파일 파싱 중: $DEPLOYMENT_FILE"

GHOST_ARENA=$(jq -r '.ghostArena' "$DEPLOYMENT_FILE")
WAGER_POOL=$(jq -r '.wagerPool' "$DEPLOYMENT_FILE")
SURVIVAL_BET=$(jq -r '.survivalBet' "$DEPLOYMENT_FILE")
DEPLOYER=$(jq -r '.deployer' "$DEPLOYMENT_FILE")
DEPLOYED_AT=$(jq -r '.timestamp' "$DEPLOYMENT_FILE")

# 주소 유효성 검사
if [ "$GHOST_ARENA" == "null" ] || [ -z "$GHOST_ARENA" ]; then
    echo -e "${RED}오류: GhostArena 주소를 찾을 수 없습니다${NC}"
    exit 1
fi

if [ "$WAGER_POOL" == "null" ] || [ -z "$WAGER_POOL" ]; then
    echo -e "${RED}오류: WagerPool 주소를 찾을 수 없습니다${NC}"
    exit 1
fi

if [ "$SURVIVAL_BET" == "null" ] || [ -z "$SURVIVAL_BET" ]; then
    echo -e "${RED}오류: SurvivalBet 주소를 찾을 수 없습니다${NC}"
    exit 1
fi

# 현재 타임스탬프
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# contracts.ts 파일 생성
echo "TypeScript 파일 생성 중: $OUTPUT_FILE"

cat > "$OUTPUT_FILE" << EOF
/**
 * Ghost Protocol 배포된 컨트랙트 주소
 * 자동 생성 파일 — 수동 편집 금지
 * 생성 시간: ${CURRENT_TIME}
 * 네트워크: Monad Testnet (Chain ID: 10143)
 */

/** GhostArena 컨트랙트 주소 */
export const GHOST_ARENA_ADDRESS = '${GHOST_ARENA}' as const;

/** WagerPool 컨트랙트 주소 */
export const WAGER_POOL_ADDRESS = '${WAGER_POOL}' as const;

/** SurvivalBet 컨트랙트 주소 */
export const SURVIVAL_BET_ADDRESS = '${SURVIVAL_BET}' as const;

/** 배포 정보 */
export const DEPLOYMENT_INFO = {
  chainId: 10143,
  deployer: '${DEPLOYER}',
  deployedAt: '${DEPLOYED_AT}',
} as const;
EOF

echo -e "${GREEN}✓ contracts.ts 생성 완료${NC}"

# index.ts에 export 추가 (없는 경우만)
if ! grep -q "export \* from './contracts.js';" "$INDEX_FILE"; then
    echo "index.ts에 contracts.js export 추가 중..."
    echo "export * from './contracts.js';" >> "$INDEX_FILE"
    echo -e "${GREEN}✓ index.ts 업데이트 완료${NC}"
else
    echo "index.ts에 이미 contracts.js export가 존재합니다."
fi

# 결과 출력
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}배포 주소 내보내기 완료!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "GhostArena:  $GHOST_ARENA"
echo "WagerPool:   $WAGER_POOL"
echo "SurvivalBet: $SURVIVAL_BET"
echo "Deployer:    $DEPLOYER"
echo "배포 시간:    $DEPLOYED_AT"
echo ""
echo -e "${YELLOW}다음 단계:${NC}"
echo "  1. .env 파일 업데이트:"
echo "     GHOST_ARENA_ADDRESS=$GHOST_ARENA"
echo "     WAGER_POOL_ADDRESS=$WAGER_POOL"
echo "     SURVIVAL_BET_ADDRESS=$SURVIVAL_BET"
echo ""
echo "  2. 프론트엔드 .env 업데이트:"
echo "     VITE_GHOST_ARENA_ADDRESS=$GHOST_ARENA"
echo "     VITE_WAGER_POOL_ADDRESS=$WAGER_POOL"
echo "     VITE_SURVIVAL_BET_ADDRESS=$SURVIVAL_BET"
echo ""
