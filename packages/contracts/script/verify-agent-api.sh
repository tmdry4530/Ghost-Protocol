#!/bin/bash
# ===== Agent Verification API 스크립트 =====
# Monad Agent Verification API를 사용하여 3개 익스플로러에 동시 검증
# (MonadVision, Socialscan, Monadscan)
#
# 사용법:
#   bash script/verify-agent-api.sh <CONTRACT_ADDRESS> <CONTRACT_NAME>
#
# 예시:
#   bash script/verify-agent-api.sh 0x225e52C760F157e332e259E82F41a67Ecd1b9520 GhostArena
#
# 참조: https://gist.github.com/portdeveloper/c899ea34ccfd00e6375ab3edea259ecd

set -e

CONTRACT_ADDRESS=$1
CONTRACT_NAME=$2

if [ -z "$CONTRACT_ADDRESS" ] || [ -z "$CONTRACT_NAME" ]; then
  echo "사용법: bash script/verify-agent-api.sh <CONTRACT_ADDRESS> <CONTRACT_NAME>"
  echo "예시: bash script/verify-agent-api.sh 0x225e52C760F157e332e259E82F41a67Ecd1b9520 GhostArena"
  exit 1
fi

echo "=== 1단계: 검증 데이터 준비 ==="
echo "컨트랙트: $CONTRACT_NAME"
echo "주소: $CONTRACT_ADDRESS"

# Standard JSON Input 생성
echo "Standard JSON Input 생성 중..."
forge verify-contract "$CONTRACT_ADDRESS" "$CONTRACT_NAME" \
  --chain 10143 \
  --show-standard-json-input > /tmp/standard-input.json

# Foundry 메타데이터 추출
echo "메타데이터 추출 중..."
cat "out/${CONTRACT_NAME}.sol/${CONTRACT_NAME}.json" | jq '.metadata' > /tmp/metadata.json

# 컴파일러 버전 추출
COMPILER_VERSION=$(jq -r '.metadata | fromjson | .compiler.version' \
  "out/${CONTRACT_NAME}.sol/${CONTRACT_NAME}.json")

echo "컴파일러 버전: v${COMPILER_VERSION}"

echo ""
echo "=== 2단계: Agent Verification API 호출 ==="

STANDARD_INPUT=$(cat /tmp/standard-input.json)
FOUNDRY_METADATA=$(cat /tmp/metadata.json)

# 검증 요청 JSON 생성
cat > /tmp/verify-request.json << EOF
{
  "chainId": 10143,
  "contractAddress": "$CONTRACT_ADDRESS",
  "contractName": "src/${CONTRACT_NAME}.sol:${CONTRACT_NAME}",
  "compilerVersion": "v${COMPILER_VERSION}",
  "standardJsonInput": $STANDARD_INPUT,
  "foundryMetadata": $FOUNDRY_METADATA
}
EOF

echo "검증 요청 전송 중..."

# 3개 익스플로러에 동시 검증
RESPONSE=$(curl -s -X POST https://agents.devnads.com/v1/verify \
  -H "Content-Type: application/json" \
  -d @/tmp/verify-request.json)

echo ""
echo "=== API 응답 ==="
echo "$RESPONSE" | jq '.'

echo ""
echo "=== 검증 완료 ==="
echo "컨트랙트 '$CONTRACT_NAME' (${CONTRACT_ADDRESS})가 다음 익스플로러에 검증되었습니다:"
echo "  - MonadVision: https://monadvision.com/address/${CONTRACT_ADDRESS}"
echo "  - Socialscan: https://monad.socialscan.io/address/${CONTRACT_ADDRESS}"
echo "  - Monadscan: https://monadscan.com/address/${CONTRACT_ADDRESS}"
echo ""
echo "임시 파일 정리 중..."
rm -f /tmp/standard-input.json /tmp/metadata.json /tmp/verify-request.json

echo "완료!"
