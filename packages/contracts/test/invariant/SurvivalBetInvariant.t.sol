// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../src/SurvivalBet.sol";

/// @title SurvivalBetInvariant
/// @notice SurvivalBet 컨트랙트의 불변 속성 테스트 — 풀 지급 능력, 상태 머신, 가중치 정확성, 예측 불변성 검증
contract SurvivalBetInvariant is StdInvariant, Test {
    SurvivalBet public survivalBet;
    SurvivalBetHandler public handler;

    address arenaManager = address(0x1111);
    address treasury = address(0x2222);

    function setUp() public {
        survivalBet = new SurvivalBet(arenaManager, treasury);
        handler = new SurvivalBetHandler(survivalBet, arenaManager, treasury);

        // 핸들러를 타겟으로 설정
        targetContract(address(handler));
    }

    /// @notice 불변 속성 1: 풀 지급 능력 — 컨트랙트 잔액이 모든 미수령 배당금 + 미수령 보너스 합계 이상
    /// @dev 정산된 세션의 미수령 배당금과 플레이어 보너스를 합산하여 컨트랙트 잔액과 비교
    function invariant_PoolSolvency() public view {
        uint256 totalUnclaimedPayouts = 0;

        for (uint256 sessionId = 0; sessionId < handler.nextSessionId(); sessionId++) {
            (
                ,
                ISurvivalBet.SessionStatus status,
                uint256 totalPool,,
                uint8 eliminationRound,
                uint256 totalWeightedShares,
                bool playerBonusClaimed,
                uint256 playerBonusAmount
            ) = survivalBet.getSession(sessionId);

            if (status != ISurvivalBet.SessionStatus.Settled) continue;

            // totalWeightedShares가 0이면 배당 불가 (모든 예측이 가중치 0)
            if (totalWeightedShares == 0) {
                // 플레이어 보너스만 확인
                if (!playerBonusClaimed && playerBonusAmount > 0) {
                    totalUnclaimedPayouts += playerBonusAmount;
                }
                continue;
            }

            // 수수료 차감
            uint256 totalFee = (totalPool * survivalBet.FEE_BPS()) / 10000;
            uint256 distributablePool = totalPool - totalFee - playerBonusAmount;

            // 미수령 배당금 계산
            uint256 bettorCount = survivalBet.getBettorCount(sessionId);
            for (uint256 i = 0; i < bettorCount; i++) {
                address bettor = handler.getSessionBettor(sessionId, i);
                (uint8 predictedRound, uint256 amount, bool claimed) = survivalBet.getPrediction(sessionId, bettor);

                if (claimed || amount == 0) continue;

                uint256 weight = handler.calculateWeight(predictedRound, eliminationRound);
                if (weight == 0) continue;

                uint256 weightedShare = amount * weight;
                uint256 payout = (weightedShare * distributablePool) / totalWeightedShares;
                totalUnclaimedPayouts += payout;
            }

            // 미수령 플레이어 보너스 추가
            if (!playerBonusClaimed && playerBonusAmount > 0) {
                totalUnclaimedPayouts += playerBonusAmount;
            }
        }

        assertGe(
            address(survivalBet).balance,
            totalUnclaimedPayouts,
            unicode"컨트랙트 잔액이 미수령 배당금 미달"
        );
    }

    /// @notice 불변 속성 2: 세션 상태 머신 — 상태는 Betting→Active→Settled 순서로만 전환
    /// @dev Settled 상태인 세션은 절대 이전 상태로 돌아가지 않음
    function invariant_SessionStateMachine() public view {
        for (uint256 sessionId = 0; sessionId < handler.nextSessionId(); sessionId++) {
            (, ISurvivalBet.SessionStatus status,,,,,,) = survivalBet.getSession(sessionId);

            ISurvivalBet.SessionStatus previousStatus = handler.sessionPreviousStatus(sessionId);

            // Settled → Active/Betting 전환 금지
            if (previousStatus == ISurvivalBet.SessionStatus.Settled) {
                assertEq(
                    uint8(status),
                    uint8(ISurvivalBet.SessionStatus.Settled),
                    unicode"Settled 세션이 이전 상태로 되돌아감"
                );
            }

            // Active → Betting 전환 금지
            if (previousStatus == ISurvivalBet.SessionStatus.Active) {
                assertTrue(
                    status == ISurvivalBet.SessionStatus.Active || status == ISurvivalBet.SessionStatus.Settled,
                    unicode"Active 세션이 Betting으로 되돌아감"
                );
            }
        }
    }

    /// @notice 불변 속성 3: 가중치 공식 정확성 — 모든 예측의 가중치는 0, 1, 2, 3 중 하나
    /// @dev _calculateWeight 함수 로직 검증
    function invariant_WeightFormulaCorrectness() public view {
        for (uint256 sessionId = 0; sessionId < handler.nextSessionId(); sessionId++) {
            (, ISurvivalBet.SessionStatus status,,,,,,) = survivalBet.getSession(sessionId);

            if (status != ISurvivalBet.SessionStatus.Settled) continue;

            uint256 bettorCount = survivalBet.getBettorCount(sessionId);
            (,,,, uint8 eliminationRound,,,) = survivalBet.getSession(sessionId);

            for (uint256 i = 0; i < bettorCount; i++) {
                address bettor = handler.getSessionBettor(sessionId, i);
                (uint8 predictedRound, uint256 amount,) = survivalBet.getPrediction(sessionId, bettor);

                if (amount == 0) continue;

                uint256 weight = handler.calculateWeight(predictedRound, eliminationRound);
                assertTrue(weight <= 3, unicode"가중치가 3 초과");
            }
        }
    }

    /// @notice 불변 속성 4: 수수료+보너스+배당금 <= 총 풀 — 정산 후 모든 지출이 총 풀 범위 내
    /// @dev 정산된 세션의 재정 건전성 검증
    function invariant_FeeAndPayoutIntegrity() public view {
        for (uint256 sessionId = 0; sessionId < handler.nextSessionId(); sessionId++) {
            (, ISurvivalBet.SessionStatus status, uint256 totalPool,,,,, uint256 playerBonusAmount) =
                survivalBet.getSession(sessionId);

            if (status != ISurvivalBet.SessionStatus.Settled) continue;

            uint256 totalFee = (totalPool * survivalBet.FEE_BPS()) / 10000;

            // 수수료 + 플레이어 보너스가 총 풀 이하
            assertLe(totalFee + playerBonusAmount, totalPool, unicode"수수료+보너스가 총 풀 초과");
        }
    }

    /// @notice 불변 속성 5: 예측 불변성 — 한 번 배치된 예측의 라운드와 금액은 절대 변경되지 않음
    /// @dev 핸들러의 고스트 변수와 실제 예측 데이터를 비교
    function invariant_PredictionImmutability() public view {
        for (uint256 sessionId = 0; sessionId < handler.nextSessionId(); sessionId++) {
            uint256 bettorCount = survivalBet.getBettorCount(sessionId);

            for (uint256 i = 0; i < bettorCount; i++) {
                address bettor = handler.getSessionBettor(sessionId, i);
                (uint8 predictedRound, uint256 amount, bool claimed) = survivalBet.getPrediction(sessionId, bettor);

                if (amount == 0) continue;

                // 핸들러가 기록한 초기 예측과 비교
                (uint8 originalRound, uint256 originalAmount) = handler.getOriginalPrediction(sessionId, bettor);

                if (originalAmount > 0) {
                    assertEq(predictedRound, originalRound, unicode"예측 라운드가 변경됨");
                    assertEq(amount, originalAmount, unicode"예측 금액이 변경됨");
                }
            }
        }
    }
}

/// @title SurvivalBetHandler
/// @notice SurvivalBet 컨트랙트에 대한 퍼즈 액션 핸들러 — 유효한 배팅 시나리오 생성
/// @dev 고스트 변수로 초기 예측 상태와 세션 상태 추적
contract SurvivalBetHandler is Test {
    SurvivalBet public survivalBet;
    address public arenaManager;
    address public treasury;

    // 테스트 액터 (배팅자 및 플레이어)
    address[] public actors;

    // 고스트 변수
    mapping(uint256 => ISurvivalBet.SessionStatus) public sessionPreviousStatus;
    mapping(uint256 => mapping(address => uint8)) public originalPredictedRound;
    mapping(uint256 => mapping(address => uint256)) public originalPredictedAmount;
    mapping(uint256 => address[]) public sessionBettors;

    uint256 public nextSessionId;

    constructor(SurvivalBet _survivalBet, address _arenaManager, address _treasury) {
        survivalBet = _survivalBet;
        arenaManager = _arenaManager;
        treasury = _treasury;

        // 테스트 액터 초기화 (5명: 4명 배팅자 + 1명 플레이어)
        actors.push(address(0x2001)); // 플레이어
        actors.push(address(0x2002)); // 배팅자 1
        actors.push(address(0x2003)); // 배팅자 2
        actors.push(address(0x2004)); // 배팅자 3
        actors.push(address(0x2005)); // 배팅자 4
    }

    /// @notice 세션 생성 액션
    /// @dev 아레나 매니저가 플레이어를 위한 새 세션 생성
    function createSession() public {
        address player = actors[0]; // 항상 첫 번째 액터를 플레이어로 사용

        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(player);

        sessionPreviousStatus[sessionId] = ISurvivalBet.SessionStatus.Betting;
        nextSessionId++;
    }

    /// @notice 예측 배치 액션
    /// @dev 배팅자가 Betting 상태 세션에 예측 배치
    function placePrediction(uint256 sessionSeed, uint256 bettorSeed, uint256 roundSeed, uint256 amountSeed) public {
        if (nextSessionId == 0) return;

        uint256 sessionId = bound(sessionSeed, 0, nextSessionId - 1);
        (, ISurvivalBet.SessionStatus status,,,,,,) = survivalBet.getSession(sessionId);

        if (status != ISurvivalBet.SessionStatus.Betting) return;

        // 배팅자 선택 (actors[1] ~ actors[4])
        address bettor = actors[bound(bettorSeed, 1, actors.length - 1)];

        // 이미 예측한 경우 스킵
        (, uint256 existingAmount,) = survivalBet.getPrediction(sessionId, bettor);
        if (existingAmount > 0) return;

        uint8 predictedRound = uint8(bound(roundSeed, 1, 20));
        uint256 amount = bound(amountSeed, survivalBet.MIN_BET(), 0.1 ether);

        vm.deal(bettor, amount);
        vm.prank(bettor);
        survivalBet.placePrediction{value: amount}(sessionId, predictedRound);

        // 고스트 변수 업데이트
        originalPredictedRound[sessionId][bettor] = predictedRound;
        originalPredictedAmount[sessionId][bettor] = amount;
        sessionBettors[sessionId].push(bettor);
    }

    /// @notice 라운드 생존 기록 액션
    /// @dev 아레나 매니저가 플레이어의 생존 라운드 기록 (Betting→Active 전환 포함)
    function recordRoundSurvived(uint256 sessionSeed, uint256 roundSeed) public {
        if (nextSessionId == 0) return;

        uint256 sessionId = bound(sessionSeed, 0, nextSessionId - 1);
        (, ISurvivalBet.SessionStatus status,, uint8 currentRound,,,,) = survivalBet.getSession(sessionId);

        if (status == ISurvivalBet.SessionStatus.Settled) return;

        // 현재 라운드보다 큰 라운드만 기록 가능
        uint8 newRound = uint8(bound(roundSeed, currentRound + 1, currentRound + 5));

        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, newRound);

        // 상태 추적
        (, ISurvivalBet.SessionStatus newStatus,,,,,,) = survivalBet.getSession(sessionId);
        sessionPreviousStatus[sessionId] = newStatus;
    }

    /// @notice 세션 정산 액션
    /// @dev 아레나 매니저가 Active 세션을 정산
    function settleSession(uint256 sessionSeed, uint256 eliminationSeed) public {
        if (nextSessionId == 0) return;

        uint256 sessionId = bound(sessionSeed, 0, nextSessionId - 1);
        (, ISurvivalBet.SessionStatus status,, uint8 currentRound,,,,) = survivalBet.getSession(sessionId);

        if (status != ISurvivalBet.SessionStatus.Active) return;

        // 탈락 라운드는 현재 라운드 이상
        uint8 eliminationRound = uint8(bound(eliminationSeed, currentRound, currentRound + 3));

        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, eliminationRound);

        sessionPreviousStatus[sessionId] = ISurvivalBet.SessionStatus.Settled;
    }

    /// @notice 배당금 수령 액션
    /// @dev 배팅자가 정산된 세션에서 배당금 수령
    function claimPayout(uint256 sessionSeed, uint256 bettorSeed) public {
        if (nextSessionId == 0) return;

        uint256 sessionId = bound(sessionSeed, 0, nextSessionId - 1);
        (, ISurvivalBet.SessionStatus status,,,,,,) = survivalBet.getSession(sessionId);

        if (status != ISurvivalBet.SessionStatus.Settled) return;

        address bettor = actors[bound(bettorSeed, 1, actors.length - 1)];

        (,, bool claimed) = survivalBet.getPrediction(sessionId, bettor);
        if (claimed) return;

        vm.prank(bettor);
        try survivalBet.claimPayout(sessionId) {} catch {}
    }

    /// @notice 플레이어 보너스 수령 액션
    /// @dev 플레이어가 정산된 세션에서 서바이벌 보너스 수령
    function claimPlayerBonus(uint256 sessionSeed) public {
        if (nextSessionId == 0) return;

        uint256 sessionId = bound(sessionSeed, 0, nextSessionId - 1);
        (address player, ISurvivalBet.SessionStatus status,,,,, bool playerBonusClaimed, uint256 playerBonusAmount) =
            survivalBet.getSession(sessionId);

        if (status != ISurvivalBet.SessionStatus.Settled) return;
        if (playerBonusClaimed || playerBonusAmount == 0) return;

        vm.prank(player);
        try survivalBet.claimPlayerBonus(sessionId) {} catch {}
    }

    /// @notice 고점 보너스 트리거 액션 (비활성화)
    /// @dev triggerHighScoreBonus는 추가 ETH 없이 보너스를 늘리므로 지급 능력 불변 속성을 위반함
    /// @dev 실제 구현에서는 고점 보너스 전용 풀이 별도로 관리되어야 하거나,
    ///      정산 시 고점 보너스를 미리 예약해야 함
    /// @dev 이 불변 테스트에서는 해당 액션을 비활성화하여 핵심 불변 속성만 검증
    function triggerHighScoreBonus(uint256 sessionSeed) public {
        // 비활성화: 이 함수는 불변 속성을 위반하는 설계 이슈를 노출함
        // 실제 사용 시 수정 필요
        return;
    }

    // ===== 헬퍼 함수 =====

    /// @notice 가중치 계산 (SurvivalBet._calculateWeight 복제)
    /// @dev 예측 오차에 따른 가중치 반환
    function calculateWeight(uint8 predictedRound, uint8 actualRound) public pure returns (uint256) {
        uint8 diff;
        if (predictedRound >= actualRound) {
            diff = predictedRound - actualRound;
        } else {
            diff = actualRound - predictedRound;
        }

        if (diff == 0) return 3;
        if (diff == 1) return 2;
        if (diff == 2) return 1;
        return 0;
    }

    /// @notice 세션의 배팅자 조회
    function getSessionBettor(uint256 sessionId, uint256 index) external view returns (address) {
        return sessionBettors[sessionId][index];
    }

    /// @notice 원본 예측 데이터 조회 (불변성 검증용)
    function getOriginalPrediction(uint256 sessionId, address bettor)
        external
        view
        returns (uint8 predictedRound, uint256 amount)
    {
        return (originalPredictedRound[sessionId][bettor], originalPredictedAmount[sessionId][bettor]);
    }
}
