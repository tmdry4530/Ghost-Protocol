#!/bin/bash
# Ghost Protocol — Monad 테스트넷 배포 스크립트
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CONTRACT_DIR"

# .env 파일 로드
if [ -f "../../.env" ]; then
  set -a
  source "../../.env"
  set +a
  echo "✅ .env 파일 로드 완료"
else
  echo "❌ .env 파일을 찾을 수 없습니다. 루트 디렉토리에 .env 파일을 생성하세요."
  exit 1
fi

# 필수 환경 변수 확인
if [ -z "${ARENA_MANAGER_PRIVATE_KEY:-}" ]; then
  echo "❌ ARENA_MANAGER_PRIVATE_KEY가 설정되지 않았습니다."
  exit 1
fi

if [ -z "${MONAD_RPC_URL:-}" ]; then
  echo "❌ MONAD_RPC_URL이 설정되지 않았습니다."
  exit 1
fi

# deployments 디렉토리 생성
mkdir -p deployments

echo "🚀 Monad 테스트넷 배포 시작..."
echo "  RPC URL: $MONAD_RPC_URL"

# Forge 스크립트 실행
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$MONAD_RPC_URL" \
  --broadcast \
  --verify \
  -vvv

echo ""
echo "✅ 배포 완료! 결과: deployments/monad-testnet.json"
cat deployments/monad-testnet.json 2>/dev/null || echo "⚠️ 배포 결과 파일을 확인하세요."
