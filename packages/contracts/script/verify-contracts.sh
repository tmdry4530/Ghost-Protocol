#!/bin/bash
# Ghost Protocol — 컨트랙트 소스 검증 스크립트
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CONTRACT_DIR"

# .env 파일 로드
if [ -f "../../.env" ]; then
  set -a
  source "../../.env"
  set +a
fi

# 배포 결과 파일 확인
DEPLOY_FILE="deployments/monad-testnet.json"
if [ ! -f "$DEPLOY_FILE" ]; then
  echo "❌ 배포 결과 파일이 없습니다: $DEPLOY_FILE"
  echo "   먼저 deploy-testnet.sh를 실행하세요."
  exit 1
fi

# jq로 주소 추출
if ! command -v jq &> /dev/null; then
  echo "❌ jq가 설치되지 않았습니다. 설치 후 재시도하세요."
  exit 1
fi

GHOST_ARENA=$(jq -r '.ghostArena' "$DEPLOY_FILE")
WAGER_POOL=$(jq -r '.wagerPool' "$DEPLOY_FILE")
SURVIVAL_BET=$(jq -r '.survivalBet' "$DEPLOY_FILE")
DEPLOYER=$(jq -r '.deployer' "$DEPLOY_FILE")

echo "🔍 컨트랙트 소스 검증 시작..."
echo "  GhostArena:  $GHOST_ARENA"
echo "  WagerPool:   $WAGER_POOL"
echo "  SurvivalBet: $SURVIVAL_BET"
echo ""

# 생성자 인자 인코딩 (address, address)
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address)" "$DEPLOYER" "$DEPLOYER")

echo "[1/3] GhostArena 검증 중..."
forge verify-contract "$GHOST_ARENA" src/GhostArena.sol:GhostArena \
  --chain 10143 \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --verifier-url "https://explorer.testnet.monad.xyz/api" \
  --etherscan-api-key "${MONAD_EXPLORER_API_KEY:-}" \
  || echo "⚠️ GhostArena 검증 실패 — 수동으로 재시도하세요."

echo "[2/3] WagerPool 검증 중..."
forge verify-contract "$WAGER_POOL" src/WagerPool.sol:WagerPool \
  --chain 10143 \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --verifier-url "https://explorer.testnet.monad.xyz/api" \
  --etherscan-api-key "${MONAD_EXPLORER_API_KEY:-}" \
  || echo "⚠️ WagerPool 검증 실패 — 수동으로 재시도하세요."

echo "[3/3] SurvivalBet 검증 중..."
forge verify-contract "$SURVIVAL_BET" src/SurvivalBet.sol:SurvivalBet \
  --chain 10143 \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --verifier-url "https://explorer.testnet.monad.xyz/api" \
  --etherscan-api-key "${MONAD_EXPLORER_API_KEY:-}" \
  || echo "⚠️ SurvivalBet 검증 실패 — 수동으로 재시도하세요."

echo ""
echo "✅ 소스 검증 완료!"
