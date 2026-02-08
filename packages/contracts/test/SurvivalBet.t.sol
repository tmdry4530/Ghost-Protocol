// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SurvivalBet.sol";

/// @title SurvivalBetTest
/// @notice SurvivalBet 컨트랙트에 대한 포괄적인 Foundry 테스트 스위트
/// @dev 단위 테스트, 퍼즈 테스트, 통합 테스트, 배당 수학 검증을 포함
contract SurvivalBetTest is Test {
    // ──────────────────────────────────────────────
    //  상태 변수
    // ──────────────────────────────────────────────

    SurvivalBet public survivalBet;

    address public deployer = address(this);
    address public arenaManager = address(0xA);
    address public treasury = address(0xB);
    address public player = address(0xC);
    address public bettor1 = address(0x1);
    address public bettor2 = address(0x2);
    address public bettor3 = address(0x3);
    address public unauthorized = address(0xDEAD);

    /// @notice 테스트 실행 전 SurvivalBet 컨트랙트 배포 및 초기 자금 설정
    function setUp() public {
        survivalBet = new SurvivalBet(arenaManager, treasury);

        // 각 배팅자에게 충분한 ETH 제공
        vm.deal(bettor1, 100 ether);
        vm.deal(bettor2, 100 ether);
        vm.deal(bettor3, 100 ether);
        vm.deal(player, 100 ether);
    }

    // ──────────────────────────────────────────────
    //  헬퍼 함수
    // ──────────────────────────────────────────────

    /// @dev 아레나 매니저 권한으로 세션을 생성하고 세션 ID를 반환
    /// @param _player 대상 플레이어 주소
    /// @return sessionId 생성된 세션 ID
    function _createSession(address _player) internal returns (uint256 sessionId) {
        vm.prank(arenaManager);
        sessionId = survivalBet.createSession(_player);
    }

    /// @dev 특정 배팅자로서 예측 배치
    /// @param bettor 배팅자 주소
    /// @param sessionId 세션 ID
    /// @param round 예측 라운드
    /// @param amount 배팅 금액
    function _placePredictionAs(address bettor, uint256 sessionId, uint8 round, uint256 amount) internal {
        vm.prank(bettor);
        survivalBet.placePrediction{value: amount}(sessionId, round);
    }

    /// @dev 아레나 매니저 권한으로 라운드 생존 기록
    /// @param sessionId 세션 ID
    /// @param round 생존 라운드
    function _recordRound(uint256 sessionId, uint8 round) internal {
        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, round);
    }

    /// @dev 아레나 매니저 권한으로 세션 정산
    /// @param sessionId 세션 ID
    /// @param eliminationRound 탈락 라운드
    function _settleSession(uint256 sessionId, uint8 eliminationRound) internal {
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, eliminationRound);
    }

    /// @dev 전체 테스트 세션 설정 -- 3명의 배팅자가 라운드 3, 5, 7에 각 1 ETH 배팅 후 라운드 1~5 기록
    /// @return sessionId 설정 완료된 세션 ID
    function _setupFullSession() internal returns (uint256 sessionId) {
        sessionId = _createSession(player);

        // 3명의 배팅자가 각각 라운드 3, 5, 7에 1 ETH 배팅
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        // 라운드 1~5 생존 기록
        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);
    }

    // ══════════════════════════════════════════════
    //  1. 단위 테스트
    // ══════════════════════════════════════════════

    // ──────────────────────────────────────────────
    //  1.1 생성자 테스트
    // ──────────────────────────────────────────────

    /// @notice 생성자가 owner, arenaManager, treasury를 올바르게 설정하는지 검증
    function test_Constructor_CorrectInitialization() public view {
        assertEq(survivalBet.owner(), deployer, unicode"owner가 deployer로 설정되어야 함");
        assertEq(survivalBet.arenaManager(), arenaManager, unicode"arenaManager가 올바르게 설정되어야 함");
        assertEq(survivalBet.treasury(), treasury, unicode"treasury가 올바르게 설정되어야 함");
        assertEq(survivalBet.nextSessionId(), 0, unicode"초기 세션 ID는 0이어야 함");
    }

    /// @notice 상수값들이 올바르게 설정되었는지 검증
    function test_Constants_CorrectValues() public view {
        assertEq(survivalBet.MIN_BET(), 0.001 ether, unicode"MIN_BET는 0.001 ether이어야 함");
        assertEq(survivalBet.FEE_BPS(), 500, unicode"FEE_BPS는 500 (5%)이어야 함");
        assertEq(survivalBet.SURVIVAL_BONUS_BPS(), 1000, unicode"SURVIVAL_BONUS_BPS는 1000 (10%)이어야 함");
        assertEq(survivalBet.HIGH_SCORE_BONUS_BPS(), 500, unicode"HIGH_SCORE_BONUS_BPS는 500 (5%)이어야 함");
    }

    // ──────────────────────────────────────────────
    //  1.2 createSession 테스트
    // ──────────────────────────────────────────────

    /// @notice 아레나 매니저가 세션을 성공적으로 생성하는지 검증
    function test_CreateSession_Success() public {
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(player);

        assertEq(sessionId, 0, unicode"첫 번째 세션 ID는 0이어야 함");

        (
            address sessionPlayer,
            ISurvivalBet.SessionStatus status,
            uint256 totalPool,
            uint8 currentRound,
            uint8 eliminationRound,
            uint256 totalWeightedShares,
            bool playerBonusClaimed,
            uint256 playerBonusAmount
        ) = survivalBet.getSession(sessionId);

        assertEq(sessionPlayer, player, unicode"세션 플레이어가 올바르게 설정되어야 함");
        assertEq(
            uint8(status), uint8(ISurvivalBet.SessionStatus.Betting), unicode"초기 상태는 Betting이어야 함"
        );
        assertEq(totalPool, 0, unicode"초기 총 풀은 0이어야 함");
        assertEq(currentRound, 0, unicode"초기 현재 라운드는 0이어야 함");
        assertEq(eliminationRound, 0, unicode"초기 탈락 라운드는 0이어야 함");
        assertEq(totalWeightedShares, 0, unicode"초기 가중 지분은 0이어야 함");
        assertFalse(playerBonusClaimed, unicode"초기 보너스 수령 여부는 false이어야 함");
        assertEq(playerBonusAmount, 0, unicode"초기 보너스 금액은 0이어야 함");
    }

    /// @notice 세션 ID가 자동 증가하는지 검증
    function test_CreateSession_AutoIncrementId() public {
        vm.startPrank(arenaManager);
        uint256 id0 = survivalBet.createSession(player);
        uint256 id1 = survivalBet.createSession(player);
        uint256 id2 = survivalBet.createSession(player);
        vm.stopPrank();

        assertEq(id0, 0, unicode"첫 번째 세션 ID는 0");
        assertEq(id1, 1, unicode"두 번째 세션 ID는 1");
        assertEq(id2, 2, unicode"세 번째 세션 ID는 2");
        assertEq(survivalBet.nextSessionId(), 3, unicode"nextSessionId는 3이어야 함");
    }

    /// @notice 아레나 매니저가 아닌 주소의 세션 생성이 실패하는지 검증
    function test_CreateSession_RevertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.createSession(player);
    }

    // ──────────────────────────────────────────────
    //  1.3 placePrediction 테스트
    // ──────────────────────────────────────────────

    /// @notice 예측 배치가 성공적으로 수행되는지 검증
    function test_PlacePrediction_Success() public {
        uint256 sessionId = _createSession(player);

        vm.prank(bettor1);
        survivalBet.placePrediction{value: 0.01 ether}(sessionId, 5);

        (uint8 predictedRound, uint256 amount, bool claimed) = survivalBet.getPrediction(sessionId, bettor1);

        assertEq(predictedRound, 5, unicode"예측 라운드가 5이어야 함");
        assertEq(amount, 0.01 ether, unicode"배팅 금액이 0.01 ether이어야 함");
        assertFalse(claimed, unicode"수령 여부는 false이어야 함");

        // 총 풀 확인
        (,, uint256 totalPool,,,,,) = survivalBet.getSession(sessionId);
        assertEq(totalPool, 0.01 ether, unicode"총 풀이 0.01 ether이어야 함");

        // 배팅자 수 확인
        assertEq(survivalBet.getBettorCount(sessionId), 1, unicode"배팅자 수는 1이어야 함");
    }

    /// @notice 예측 배치 시 PredictionPlaced 이벤트가 올바르게 발생하는지 검증
    function test_PlacePrediction_EmitsEvent() public {
        uint256 sessionId = _createSession(player);

        vm.expectEmit(true, true, false, true);
        emit ISurvivalBet.PredictionPlaced(sessionId, bettor1, 5, 0.01 ether);

        vm.prank(bettor1);
        survivalBet.placePrediction{value: 0.01 ether}(sessionId, 5);
    }

    /// @notice Betting 상태가 아닌 세션에 예측 배치 시 실패하는지 검증
    function test_PlacePrediction_RevertNotBetting() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 0.01 ether);

        // Active 상태로 전환
        _recordRound(sessionId, 1);

        vm.prank(bettor2);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.placePrediction{value: 0.01 ether}(sessionId, 5);
    }

    /// @notice 최소 배팅 금액 미만으로 예측 배치 시 실패하는지 검증
    function test_PlacePrediction_RevertBelowMinBet() public {
        uint256 sessionId = _createSession(player);

        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.BetTooSmall.selector);
        survivalBet.placePrediction{value: 0.0009 ether}(sessionId, 5);
    }

    /// @notice 예측 라운드가 0일 때 실패하는지 검증
    function test_PlacePrediction_RevertRoundZero() public {
        uint256 sessionId = _createSession(player);

        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.RoundMustBePositive.selector);
        survivalBet.placePrediction{value: 0.01 ether}(sessionId, 0);
    }

    /// @notice 동일 세션에 중복 예측 시 실패하는지 검증
    function test_PlacePrediction_RevertDuplicate() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 0.01 ether);

        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.AlreadyPredicted.selector);
        survivalBet.placePrediction{value: 0.01 ether}(sessionId, 5);
    }

    /// @notice 여러 배팅자의 예측이 올바르게 누적되는지 검증
    function test_PlacePrediction_MultipleBettorsPoolAccumulation() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 2 ether);
        _placePredictionAs(bettor3, sessionId, 7, 0.5 ether);

        (,, uint256 totalPool,,,,,) = survivalBet.getSession(sessionId);
        assertEq(totalPool, 3.5 ether, unicode"총 풀은 3.5 ether이어야 함");
        assertEq(survivalBet.getBettorCount(sessionId), 3, unicode"배팅자 수는 3이어야 함");
    }

    // ──────────────────────────────────────────────
    //  1.4 recordRoundSurvived 테스트
    // ──────────────────────────────────────────────

    /// @notice 첫 호출 시 Betting에서 Active로 상태 전환되는지 검증
    function test_RecordRound_BettingToActiveTransition() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 0.01 ether);

        // 상태 전환 전 확인
        (, ISurvivalBet.SessionStatus statusBefore,,,,,,) = survivalBet.getSession(sessionId);
        assertEq(uint8(statusBefore), uint8(ISurvivalBet.SessionStatus.Betting), unicode"초기 상태는 Betting");

        _recordRound(sessionId, 1);

        // 상태 전환 후 확인
        (, ISurvivalBet.SessionStatus statusAfter,,,,,,) = survivalBet.getSession(sessionId);
        assertEq(
            uint8(statusAfter), uint8(ISurvivalBet.SessionStatus.Active), unicode"recordRound 후 상태는 Active"
        );
    }

    /// @notice 라운드가 순차적으로 증가하며 기록되는지 검증
    function test_RecordRound_SequentialProgression() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 5, 0.01 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);

        (,,, uint8 currentRound,,,,) = survivalBet.getSession(sessionId);
        assertEq(currentRound, 3, unicode"현재 라운드는 3이어야 함");
    }

    /// @notice RoundSurvived 이벤트가 올바르게 발생하는지 검증
    function test_RecordRound_EmitsEvent() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 5, 0.01 ether);

        vm.expectEmit(true, false, false, true);
        emit ISurvivalBet.RoundSurvived(sessionId, 1);

        _recordRound(sessionId, 1);
    }

    /// @notice 라운드 번호가 증가하지 않을 때 실패하는지 검증
    function test_RecordRound_RevertNonIncreasingRound() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 5, 0.01 ether);

        _recordRound(sessionId, 3);

        // 같은 라운드 시도
        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidRound.selector);
        survivalBet.recordRoundSurvived(sessionId, 3);

        // 더 낮은 라운드 시도
        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidRound.selector);
        survivalBet.recordRoundSurvived(sessionId, 2);
    }

    /// @notice 정산된 세션에 라운드 기록 시 실패하는지 검증
    function test_RecordRound_RevertSettledSession() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.recordRoundSurvived(sessionId, 6);
    }

    /// @notice 아레나 매니저가 아닌 주소의 라운드 기록이 실패하는지 검증
    function test_RecordRound_RevertUnauthorized() public {
        uint256 sessionId = _createSession(player);

        vm.prank(unauthorized);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.recordRoundSurvived(sessionId, 1);
    }

    // ──────────────────────────────────────────────
    //  1.5 settleSession 테스트
    // ──────────────────────────────────────────────

    /// @notice 세션 정산이 성공적으로 수행되는지 검증
    function test_SettleSession_Success() public {
        uint256 sessionId = _setupFullSession();

        // 트레저리 초기 잔액 기록
        uint256 treasuryBefore = treasury.balance;

        _settleSession(sessionId, 5);

        (
            ,
            ISurvivalBet.SessionStatus status,
            uint256 totalPool,,
            uint8 eliminationRound,
            uint256 totalWeightedShares,,
        ) = survivalBet.getSession(sessionId);

        assertEq(uint8(status), uint8(ISurvivalBet.SessionStatus.Settled), unicode"상태는 Settled이어야 함");
        assertEq(totalPool, 3 ether, unicode"총 풀은 3 ether이어야 함");
        assertEq(eliminationRound, 5, unicode"탈락 라운드는 5이어야 함");

        // 가중치: bettor1(라운드3, diff=2)=1, bettor2(라운드5, diff=0)=3, bettor3(라운드7, diff=2)=1
        // totalWeightedShares = 1*1e18 + 3*1e18 + 1*1e18 = 5e18
        assertEq(totalWeightedShares, 5 ether, unicode"가중 지분 총합은 5 ether이어야 함");

        // 수수료 검증: 3 ETH * 5% = 0.15 ETH
        uint256 expectedFee = 0.15 ether;
        assertEq(
            treasury.balance - treasuryBefore,
            expectedFee,
            unicode"트레저리에 0.15 ETH 수수료가 전송되어야 함"
        );
    }

    /// @notice 세션 정산 시 SessionSettled 이벤트가 올바르게 발생하는지 검증
    function test_SettleSession_EmitsEvent() public {
        uint256 sessionId = _setupFullSession();

        vm.expectEmit(true, false, false, true);
        emit ISurvivalBet.SessionSettled(sessionId, 5, 3 ether);

        _settleSession(sessionId, 5);
    }

    /// @notice Active 상태가 아닌 세션의 정산이 실패하는지 검증
    function test_SettleSession_RevertNotActive() public {
        // Betting 상태에서 시도
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 0.01 ether);

        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.settleSession(sessionId, 5);
    }

    /// @notice 이미 정산된 세션의 재정산이 실패하는지 검증
    function test_SettleSession_RevertAlreadySettled() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.settleSession(sessionId, 5);
    }

    /// @notice 아레나 매니저가 아닌 주소의 세션 정산이 실패하는지 검증
    function test_SettleSession_RevertUnauthorized() public {
        uint256 sessionId = _setupFullSession();

        vm.prank(unauthorized);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.settleSession(sessionId, 5);
    }

    /// @notice 탈락 라운드가 예측 중앙값보다 클 때 서바이벌 보너스가 산정되는지 검증
    /// @dev 예측 [3, 5, 7]의 중앙값 = 5, 탈락 라운드 8 > 5이므로 보너스 발생
    function test_SettleSession_SurvivalBonusCalculated() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);
        _recordRound(sessionId, 6);
        _recordRound(sessionId, 7);
        _recordRound(sessionId, 8);

        _settleSession(sessionId, 8);

        (,,,,,,, uint256 playerBonusAmount) = survivalBet.getSession(sessionId);

        // 보너스 = 3 ETH * 10% = 0.3 ETH
        assertEq(playerBonusAmount, 0.3 ether, unicode"서바이벌 보너스는 0.3 ether이어야 함");
    }

    /// @notice 탈락 라운드가 예측 중앙값 이하일 때 서바이벌 보너스가 0인지 검증
    /// @dev 예측 [3, 5, 7]의 중앙값 = 5, 탈락 라운드 5 == 5이므로 보너스 없음
    function test_SettleSession_NoSurvivalBonus() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        (,,,,,,, uint256 playerBonusAmount) = survivalBet.getSession(sessionId);
        assertEq(playerBonusAmount, 0, unicode"탈락 라운드가 중앙값 이하이면 보너스는 0");
    }

    // ──────────────────────────────────────────────
    //  1.6 claimPayout 테스트
    // ──────────────────────────────────────────────

    /// @notice 정확한 예측(가중치 3)의 배당금 수령이 올바른지 검증
    function test_ClaimPayout_ExactPrediction_Weight3() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        uint256 balanceBefore = bettor2.balance;

        // bettor2는 라운드 5를 예측, 탈락 라운드 5, diff=0, 가중치=3
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);

        uint256 balanceAfter = bettor2.balance;

        // distributablePool = 3e18 - 0.15e18 - 0 = 2.85e18
        // payout = (3e18 * 2.85e18) / 5e18 = 1.71e18
        uint256 expectedPayout = 1.71 ether;
        assertEq(
            balanceAfter - balanceBefore, expectedPayout, unicode"정확한 예측 배당금은 1.71 ether이어야 함"
        );
    }

    /// @notice +/-1 오차 예측(가중치 2)의 배당금 수령이 올바른지 검증
    function test_ClaimPayout_OffByOne_Weight2() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 4, 1 ether); // 예측 4, 탈락 5, diff=1, 가중치=2
        _placePredictionAs(bettor2, sessionId, 5, 1 ether); // 예측 5, 탈락 5, diff=0, 가중치=3

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        // 중앙값: (4+5)/2 = 4 (내림), 탈락 5 > 4이므로 보너스 발생
        _settleSession(sessionId, 5);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        uint256 expectedBonus = (2 ether * 1000) / 10000; // 0.2 ether
        assertEq(bonusAmount, expectedBonus, unicode"보너스는 0.2 ether이어야 함");

        // totalWeightedShares = 2*1e18 + 3*1e18 = 5e18
        // fee = 2e18 * 500 / 10000 = 0.1e18
        // distributablePool = 2e18 - 0.1e18 - 0.2e18 = 1.7e18
        // bettor1 payout = (2e18 * 1.7e18) / 5e18 = 0.68e18
        uint256 balanceBefore = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        uint256 payout = bettor1.balance - balanceBefore;

        assertEq(payout, 0.68 ether, unicode"오차 1 배당금은 0.68 ether이어야 함");
    }

    /// @notice +/-2 오차 예측(가중치 1)의 배당금 수령이 올바른지 검증
    function test_ClaimPayout_OffByTwo_Weight1() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        uint256 balanceBefore = bettor1.balance;

        // bettor1은 라운드 3을 예측, 탈락 라운드 5, diff=2, 가중치=1
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);

        uint256 payout = bettor1.balance - balanceBefore;

        // distributablePool = 2.85e18
        // payout = (1e18 * 2.85e18) / 5e18 = 0.57e18
        assertEq(payout, 0.57 ether, unicode"오차 2 배당금은 0.57 ether이어야 함");
    }

    /// @notice 오차 3 이상(가중치 0)의 배당금 수령이 NoPayout으로 실패하는지 검증
    function test_ClaimPayout_RevertNoPayout_DiffGte3() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 1, 1 ether); // 예측 1, 탈락 5, diff=4, 가중치=0
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        _settleSession(sessionId, 5);

        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.NoPayout.selector);
        survivalBet.claimPayout(sessionId);
    }

    /// @notice 이미 수령한 배당금의 재수령이 실패하는지 검증
    function test_ClaimPayout_RevertAlreadyClaimed() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        vm.startPrank(bettor2);
        survivalBet.claimPayout(sessionId);

        vm.expectRevert(SurvivalBet.AlreadyClaimed.selector);
        survivalBet.claimPayout(sessionId);
        vm.stopPrank();
    }

    /// @notice 정산되지 않은 세션의 배당금 수령이 실패하는지 검증
    function test_ClaimPayout_RevertNotSettled() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 5, 1 ether);

        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.SessionNotSettled.selector);
        survivalBet.claimPayout(sessionId);
    }

    /// @notice 예측하지 않은 주소의 배당금 수령이 실패하는지 검증
    function test_ClaimPayout_RevertNoPrediction() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        vm.prank(unauthorized);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.claimPayout(sessionId);
    }

    // ──────────────────────────────────────────────
    //  1.7 claimPlayerBonus 테스트
    // ──────────────────────────────────────────────

    /// @notice 플레이어가 서바이벌 보너스를 성공적으로 수령하는지 검증
    function test_ClaimPlayerBonus_Success() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);
        _recordRound(sessionId, 6);
        _recordRound(sessionId, 7);
        _recordRound(sessionId, 8);

        // 탈락 라운드 8 > 중앙값 5 -> 보너스 발생
        _settleSession(sessionId, 8);

        uint256 playerBalanceBefore = player.balance;

        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);

        uint256 bonus = player.balance - playerBalanceBefore;
        assertEq(bonus, 0.3 ether, unicode"서바이벌 보너스는 0.3 ether이어야 함");

        // 수령 완료 확인
        (,,,,,, bool claimed,) = survivalBet.getSession(sessionId);
        assertTrue(claimed, unicode"플레이어 보너스 수령 여부가 true이어야 함");
    }

    /// @notice 세션 플레이어가 아닌 주소의 보너스 수령이 실패하는지 검증
    function test_ClaimPlayerBonus_RevertNotPlayer() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);

        _settleSession(sessionId, 4);

        vm.prank(unauthorized);
        vm.expectRevert(SurvivalBet.NotSessionPlayer.selector);
        survivalBet.claimPlayerBonus(sessionId);
    }

    /// @notice 이미 수령한 보너스의 재수령이 실패하는지 검증
    function test_ClaimPlayerBonus_RevertAlreadyClaimed() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        // 중앙값 3, 탈락 5 > 3이므로 보너스 발생
        _settleSession(sessionId, 5);

        vm.startPrank(player);
        survivalBet.claimPlayerBonus(sessionId);

        vm.expectRevert(SurvivalBet.BonusAlreadyClaimed.selector);
        survivalBet.claimPlayerBonus(sessionId);
        vm.stopPrank();
    }

    /// @notice 보너스가 0일 때 수령이 NoBonusAvailable로 실패하는지 검증
    function test_ClaimPlayerBonus_RevertNoBonusAvailable() public {
        uint256 sessionId = _setupFullSession();

        // 탈락 라운드 5 == 중앙값 5이므로 보너스 없음
        _settleSession(sessionId, 5);

        vm.prank(player);
        vm.expectRevert(SurvivalBet.NoBonusAvailable.selector);
        survivalBet.claimPlayerBonus(sessionId);
    }

    /// @notice 정산되지 않은 세션의 보너스 수령이 실패하는지 검증
    function test_ClaimPlayerBonus_RevertNotSettled() public {
        uint256 sessionId = _setupFullSession();

        vm.prank(player);
        vm.expectRevert(SurvivalBet.SessionNotSettled.selector);
        survivalBet.claimPlayerBonus(sessionId);
    }

    // ──────────────────────────────────────────────
    //  1.8 triggerHighScoreBonus 테스트
    // ──────────────────────────────────────────────

    /// @notice 고점 보너스가 성공적으로 추가되는지 검증
    function test_TriggerHighScoreBonus_Success() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        // 초기 보너스 = 0 (탈락 5 == 중앙값 5)
        (,,,,,,, uint256 bonusBefore) = survivalBet.getSession(sessionId);
        assertEq(bonusBefore, 0, unicode"초기 보너스는 0");

        vm.prank(arenaManager);
        survivalBet.triggerHighScoreBonus(sessionId);

        (,,,,,,, uint256 bonusAfter) = survivalBet.getSession(sessionId);
        // 고점 보너스 = 3 ETH * 5% = 0.15 ETH
        assertEq(bonusAfter, 0.15 ether, unicode"고점 보너스는 0.15 ether이어야 함");
    }

    /// @notice 서바이벌 보너스와 고점 보너스가 누적되는지 검증
    function test_TriggerHighScoreBonus_AccumulatesWithSurvivalBonus() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);
        _recordRound(sessionId, 6);
        _recordRound(sessionId, 7);
        _recordRound(sessionId, 8);

        // 탈락 8 > 중앙값 5 -> 서바이벌 보너스 0.3 ETH
        _settleSession(sessionId, 8);

        vm.prank(arenaManager);
        survivalBet.triggerHighScoreBonus(sessionId);

        (,,,,,,, uint256 totalBonus) = survivalBet.getSession(sessionId);
        // 서바이벌(0.3) + 고점(0.15) = 0.45 ETH
        assertEq(totalBonus, 0.45 ether, unicode"누적 보너스는 0.45 ether이어야 함");
    }

    /// @notice 아레나 매니저가 아닌 주소의 고점 보너스 트리거가 실패하는지 검증
    function test_TriggerHighScoreBonus_RevertUnauthorized() public {
        uint256 sessionId = _setupFullSession();
        _settleSession(sessionId, 5);

        vm.prank(unauthorized);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.triggerHighScoreBonus(sessionId);
    }

    /// @notice 플레이어가 이미 보너스를 수령한 후 고점 보너스 추가가 실패하는지 검증
    function test_TriggerHighScoreBonus_RevertAlreadyClaimed() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        // 중앙값 3, 탈락 5 > 3 -> 보너스 발생
        _settleSession(sessionId, 5);

        // 플레이어가 보너스 수령
        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);

        // 이미 수령 후 고점 보너스 추가 시도
        vm.prank(arenaManager);
        vm.expectRevert(SurvivalBet.BonusAlreadyClaimed.selector);
        survivalBet.triggerHighScoreBonus(sessionId);
    }

    /// @notice 정산되지 않은 세션에 고점 보너스 트리거가 실패하는지 검증
    function test_TriggerHighScoreBonus_RevertNotSettled() public {
        uint256 sessionId = _setupFullSession();

        vm.prank(arenaManager);
        vm.expectRevert(ISurvivalBet.InvalidSession.selector);
        survivalBet.triggerHighScoreBonus(sessionId);
    }

    // ──────────────────────────────────────────────
    //  1.9 조회 함수 테스트
    // ──────────────────────────────────────────────

    /// @notice getSession이 올바른 세션 정보를 반환하는지 검증
    function test_GetSession_CorrectReturnValues() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);

        (
            address sessionPlayer,
            ISurvivalBet.SessionStatus status,
            uint256 totalPool,
            uint8 currentRound,
            uint8 eliminationRound,
            uint256 totalWeightedShares,
            bool playerBonusClaimed,
            uint256 playerBonusAmount
        ) = survivalBet.getSession(sessionId);

        assertEq(sessionPlayer, player);
        assertEq(uint8(status), uint8(ISurvivalBet.SessionStatus.Betting));
        assertEq(totalPool, 1 ether);
        assertEq(currentRound, 0);
        assertEq(eliminationRound, 0);
        assertEq(totalWeightedShares, 0);
        assertFalse(playerBonusClaimed);
        assertEq(playerBonusAmount, 0);
    }

    /// @notice getPrediction이 올바른 예측 정보를 반환하는지 검증
    function test_GetPrediction_CorrectReturnValues() public {
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, 7, 0.5 ether);

        (uint8 predictedRound, uint256 amount, bool claimed) = survivalBet.getPrediction(sessionId, bettor1);
        assertEq(predictedRound, 7, unicode"예측 라운드는 7");
        assertEq(amount, 0.5 ether, unicode"배팅 금액은 0.5 ether");
        assertFalse(claimed, unicode"수령 여부는 false");
    }

    /// @notice getBettorCount가 올바른 배팅자 수를 반환하는지 검증
    function test_GetBettorCount_CorrectReturnValue() public {
        uint256 sessionId = _createSession(player);

        assertEq(survivalBet.getBettorCount(sessionId), 0, unicode"초기 배팅자 수는 0");

        _placePredictionAs(bettor1, sessionId, 3, 0.01 ether);
        assertEq(survivalBet.getBettorCount(sessionId), 1, unicode"1명 배팅 후 수는 1");

        _placePredictionAs(bettor2, sessionId, 5, 0.01 ether);
        assertEq(survivalBet.getBettorCount(sessionId), 2, unicode"2명 배팅 후 수는 2");
    }

    // ══════════════════════════════════════════════
    //  2. 퍼즈 테스트
    // ══════════════════════════════════════════════

    /// @notice 다양한 라운드 및 금액 조합에 대해 예측 배치가 정상 동작하는지 퍼즈 검증
    /// @param round 예측 라운드 (1~255로 바운드)
    /// @param amount 배팅 금액 (MIN_BET~10 ETH로 바운드)
    function testFuzz_PlacePrediction(uint8 round, uint256 amount) public {
        // 유효 범위로 바운드
        round = uint8(bound(uint256(round), 1, 255));
        amount = bound(amount, 0.001 ether, 10 ether);

        uint256 sessionId = _createSession(player);

        vm.deal(bettor1, amount);
        vm.prank(bettor1);
        survivalBet.placePrediction{value: amount}(sessionId, round);

        (uint8 predictedRound, uint256 betAmount, bool claimed) = survivalBet.getPrediction(sessionId, bettor1);

        assertEq(predictedRound, round, unicode"예측 라운드가 입력값과 일치해야 함");
        assertEq(betAmount, amount, unicode"배팅 금액이 입력값과 일치해야 함");
        assertFalse(claimed, unicode"수령 여부는 false이어야 함");

        (,, uint256 totalPool,,,,,) = survivalBet.getSession(sessionId);
        assertEq(totalPool, amount, unicode"총 풀이 배팅 금액과 일치해야 함");
    }

    /// @notice 다양한 예측/실제 라운드 조합에 대해 가중치 공식이 올바른지 퍼즈 검증
    /// @dev _calculateWeight가 internal이므로 settleSession을 통해 간접 검증
    /// @param predicted 예측 라운드 (1~200로 바운드)
    /// @param actual 실제 탈락 라운드 (1~200으로 바운드)
    function testFuzz_WeightCalculation(uint8 predicted, uint8 actual) public {
        // 유효 범위로 바운드
        predicted = uint8(bound(uint256(predicted), 1, 200));
        actual = uint8(bound(uint256(actual), 1, 200));

        // 단일 배팅자 세션 설정
        uint256 sessionId = _createSession(player);
        _placePredictionAs(bettor1, sessionId, predicted, 1 ether);

        // 최소 1라운드 기록 후 정산
        uint8 maxRound = actual > predicted ? actual : predicted;
        for (uint8 r = 1; r <= maxRound; r++) {
            _recordRound(sessionId, r);
        }

        _settleSession(sessionId, actual);

        // 가중치 검증 -- totalWeightedShares = weight * 1 ether
        (,,,,, uint256 totalWeightedShares,,) = survivalBet.getSession(sessionId);

        uint8 diff;
        if (predicted >= actual) {
            diff = predicted - actual;
        } else {
            diff = actual - predicted;
        }

        uint256 expectedWeight;
        if (diff == 0) expectedWeight = 3;
        else if (diff == 1) expectedWeight = 2;
        else if (diff == 2) expectedWeight = 1;
        else expectedWeight = 0;

        assertEq(totalWeightedShares, expectedWeight * 1 ether, unicode"가중치가 공식대로 계산되어야 함");
    }

    // ══════════════════════════════════════════════
    //  3. 통합 테스트
    // ══════════════════════════════════════════════

    /// @notice 전체 라이프사이클 테스트: 세션 생성 -> 배팅 -> 라운드 기록 -> 정산 -> 배당 수령
    /// @dev 3명의 배팅자가 라운드 3, 5, 7에 각 1 ETH 배팅, 탈락 라운드 5에서 정산
    function test_Integration_FullLifecycle() public {
        // 1단계: 세션 생성
        uint256 sessionId = _createSession(player);

        // 2단계: 3명이 각각 라운드 3, 5, 7에 1 ETH 배팅
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        assertEq(survivalBet.getBettorCount(sessionId), 3, unicode"배팅자 수 3명 확인");

        // 3단계: 라운드 1~5 기록
        for (uint8 r = 1; r <= 5; r++) {
            _recordRound(sessionId, r);
        }

        // 4단계: 탈락 라운드 5에서 정산
        uint256 treasuryBefore = treasury.balance;
        _settleSession(sessionId, 5);
        uint256 feeReceived = treasury.balance - treasuryBefore;

        // 수수료 검증
        assertEq(feeReceived, 0.15 ether, unicode"수수료 0.15 ETH 전송 확인");

        // 5단계: 각 배팅자 배당 수령 및 금액 검증
        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        uint256 payout1 = bettor1.balance - bal1Before;

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);
        uint256 payout2 = bettor2.balance - bal2Before;

        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        uint256 payout3 = bettor3.balance - bal3Before;

        // 배당 비율 검증: 가중치 1:3:1
        assertEq(payout1, 0.57 ether, unicode"bettor1 배당금 0.57 ETH (가중치 1)");
        assertEq(payout2, 1.71 ether, unicode"bettor2 배당금 1.71 ETH (가중치 3)");
        assertEq(payout3, 0.57 ether, unicode"bettor3 배당금 0.57 ETH (가중치 1)");

        // 총 지출 검증: 수수료 + 배당 = 3 ETH
        assertEq(feeReceived + payout1 + payout2 + payout3, 3 ether, unicode"총 지출이 총 풀과 일치");
    }

    /// @notice 서바이벌 보너스 통합 테스트: 탈락 라운드가 중앙값 초과 시 플레이어 보너스 수령
    function test_Integration_SurvivalBonusClaim() public {
        uint256 sessionId = _createSession(player);

        // 3명이 라운드 3, 5, 7 예측, 중앙값 5
        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        // 라운드 1~8 기록
        for (uint8 r = 1; r <= 8; r++) {
            _recordRound(sessionId, r);
        }

        // 탈락 라운드 8 > 중앙값 5 -> 서바이벌 보너스 발생
        _settleSession(sessionId, 8);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        assertEq(bonusAmount, 0.3 ether, unicode"서바이벌 보너스 0.3 ETH 산정 확인");

        // 플레이어 보너스 수령
        uint256 playerBefore = player.balance;
        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);
        uint256 bonusReceived = player.balance - playerBefore;

        assertEq(bonusReceived, 0.3 ether, unicode"플레이어가 0.3 ETH 보너스를 수령해야 함");

        // 배당 수령 -- distributablePool = 3 - 0.15 - 0.3 = 2.55 ETH
        // 가중치: bettor1(diff 5)=0, bettor2(diff 3)=0, bettor3(diff 1)=2
        // totalWeightedShares = 0 + 0 + 2*1e18 = 2e18
        // bettor3 payout = (2e18 * 2.55e18) / 2e18 = 2.55e18

        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);

        // bettor1, bettor2는 가중치 0이므로 NoPayout
        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.NoPayout.selector);
        survivalBet.claimPayout(sessionId);

        vm.prank(bettor2);
        vm.expectRevert(SurvivalBet.NoPayout.selector);
        survivalBet.claimPayout(sessionId);
    }

    /// @notice 고점 보너스 통합 테스트: triggerHighScoreBonus 호출 후 플레이어가 누적 보너스 수령
    function test_Integration_HighScoreBonusClaim() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        // 라운드 1~8 기록
        for (uint8 r = 1; r <= 8; r++) {
            _recordRound(sessionId, r);
        }

        // 탈락 8 > 중앙값 5 -> 서바이벌 보너스 0.3 ETH
        _settleSession(sessionId, 8);

        // 고점 보너스 트리거 -> +0.15 ETH
        vm.prank(arenaManager);
        survivalBet.triggerHighScoreBonus(sessionId);

        (,,,,,,, uint256 totalBonus) = survivalBet.getSession(sessionId);
        assertEq(totalBonus, 0.45 ether, unicode"서바이벌(0.3) + 고점(0.15) = 0.45 ETH");

        // 플레이어가 누적 보너스 수령
        uint256 playerBefore = player.balance;
        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);
        uint256 bonusReceived = player.balance - playerBefore;

        assertEq(bonusReceived, 0.45 ether, unicode"플레이어가 누적 보너스 0.45 ETH를 수령해야 함");
    }

    /// @notice 고점 보너스만 존재하는 경우 테스트 (서바이벌 보너스 없이 고점 보너스만)
    function test_Integration_HighScoreBonusOnly() public {
        uint256 sessionId = _setupFullSession();

        // 탈락 5 == 중앙값 5 -> 서바이벌 보너스 없음
        _settleSession(sessionId, 5);

        // 고점 보너스 트리거
        vm.prank(arenaManager);
        survivalBet.triggerHighScoreBonus(sessionId);

        (,,,,,,, uint256 totalBonus) = survivalBet.getSession(sessionId);
        assertEq(totalBonus, 0.15 ether, unicode"고점 보너스만 0.15 ETH");

        // 플레이어 수령
        uint256 playerBefore = player.balance;
        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);
        uint256 bonusReceived = player.balance - playerBefore;

        assertEq(bonusReceived, 0.15 ether, unicode"플레이어가 고점 보너스 0.15 ETH를 수령해야 함");
    }

    // ══════════════════════════════════════════════
    //  4. 배당 수학 검증 테스트
    // ══════════════════════════════════════════════

    /// @notice 3명 배팅자 x 1 ETH, 탈락 라운드 5에서의 정밀 배당 수학 검증
    /// @dev totalPool=3 ETH, fee=0.15 ETH, weights=[1,3,1], totalWeightedShares=5e18
    ///      중앙값=5, elimination=5, 보너스=0, distributablePool=2.85 ETH
    function test_PayoutMath_PreciseCalculation() public {
        uint256 sessionId = _setupFullSession();

        // 트레저리 잔액 기록
        uint256 treasuryBefore = treasury.balance;

        _settleSession(sessionId, 5);

        // --- 풀 및 수수료 검증 ---
        (,, uint256 totalPool,,, uint256 totalWeightedShares,, uint256 playerBonusAmount) =
            survivalBet.getSession(sessionId);

        assertEq(totalPool, 3 ether, "totalPool = 3 ETH");

        uint256 fee = (totalPool * 500) / 10000;
        assertEq(fee, 0.15 ether, "fee = 3 ETH * 5% = 0.15 ETH");
        assertEq(treasury.balance - treasuryBefore, fee, unicode"트레저리가 수수료를 수령해야 함");

        // --- 가중치 검증 ---
        // bettor1: 라운드 3, 탈락 5, diff=2, weight=1
        // bettor2: 라운드 5, 탈락 5, diff=0, weight=3
        // bettor3: 라운드 7, 탈락 5, diff=2, weight=1
        // totalWeightedShares = 1*1e18 + 3*1e18 + 1*1e18 = 5e18
        assertEq(totalWeightedShares, 5 ether, "totalWeightedShares = 5e18");

        // --- 중앙값 및 보너스 검증 ---
        // 중앙값 = sort([3,5,7])[1] = 5, 탈락(5) > 중앙값(5) -> false -> 보너스 없음
        assertEq(playerBonusAmount, 0, unicode"탈락 == 중앙값이므로 보너스 없음");

        // --- distributablePool 검증 ---
        uint256 distributablePool = totalPool - fee - playerBonusAmount;
        assertEq(distributablePool, 2.85 ether, "distributablePool = 2.85 ETH");

        // --- 개별 배당금 검증 ---
        // bettor1: (1e18 * 2.85e18) / 5e18 = 0.57e18
        uint256 expectedPayout1 = (1 ether * distributablePool) / totalWeightedShares;
        assertEq(expectedPayout1, 0.57 ether, unicode"bettor1 예상 배당 = 0.57 ETH");

        // bettor2: (3e18 * 2.85e18) / 5e18 = 1.71e18
        uint256 expectedPayout2 = (3 ether * distributablePool) / totalWeightedShares;
        assertEq(expectedPayout2, 1.71 ether, unicode"bettor2 예상 배당 = 1.71 ETH");

        // bettor3: (1e18 * 2.85e18) / 5e18 = 0.57e18
        uint256 expectedPayout3 = (1 ether * distributablePool) / totalWeightedShares;
        assertEq(expectedPayout3, 0.57 ether, unicode"bettor3 예상 배당 = 0.57 ETH");

        // --- 실제 배당 수령 및 검증 ---
        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor1.balance - bal1Before, expectedPayout1, unicode"bettor1 실제 배당 = 예상 배당");

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor2.balance - bal2Before, expectedPayout2, unicode"bettor2 실제 배당 = 예상 배당");

        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor3.balance - bal3Before, expectedPayout3, unicode"bettor3 실제 배당 = 예상 배당");

        // --- 합산 검증: fee + payouts = totalPool ---
        assertEq(
            fee + expectedPayout1 + expectedPayout2 + expectedPayout3,
            totalPool,
            unicode"수수료 + 전체 배당 = 총 풀"
        );
    }

    /// @notice 보너스 포함 시 배당 수학 검증 -- distributablePool에서 보너스 차감 확인
    function test_PayoutMath_WithBonusDeduction() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 5, 1 ether);
        _placePredictionAs(bettor3, sessionId, 7, 1 ether);

        for (uint8 r = 1; r <= 8; r++) {
            _recordRound(sessionId, r);
        }

        uint256 treasuryBefore = treasury.balance;
        _settleSession(sessionId, 8);
        uint256 feeReceived = treasury.balance - treasuryBefore;

        (,, uint256 totalPool,,, uint256 totalWeightedShares,, uint256 bonusAmount) = survivalBet.getSession(sessionId);

        // 기본 검증
        assertEq(totalPool, 3 ether, "totalPool = 3 ETH");
        assertEq(feeReceived, 0.15 ether, "fee = 0.15 ETH");
        assertEq(bonusAmount, 0.3 ether, unicode"서바이벌 보너스 = 0.3 ETH");

        // 가중치: bettor1(diff=5)=0, bettor2(diff=3)=0, bettor3(diff=1)=2
        assertEq(totalWeightedShares, 2 ether, unicode"totalWeightedShares = 2e18 (bettor3만 가중치 2)");

        // distributablePool = 3 - 0.15 - 0.3 = 2.55 ETH
        uint256 distributablePool = totalPool - feeReceived - bonusAmount;
        assertEq(distributablePool, 2.55 ether, "distributablePool = 2.55 ETH");

        // bettor3 배당 = (2e18 * 2.55e18) / 2e18 = 2.55e18
        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor3.balance - bal3Before, 2.55 ether, unicode"bettor3 배당 = 2.55 ETH");

        // 플레이어 보너스 수령
        uint256 playerBefore = player.balance;
        vm.prank(player);
        survivalBet.claimPlayerBonus(sessionId);
        assertEq(player.balance - playerBefore, 0.3 ether, unicode"플레이어 보너스 = 0.3 ETH");

        // 총 지출 = fee + payout + bonus = 0.15 + 2.55 + 0.3 = 3 ETH
        assertEq(feeReceived + 2.55 ether + 0.3 ether, totalPool, unicode"수수료 + 배당 + 보너스 = 총 풀");
    }

    /// @notice 짝수 배팅자의 중앙값 계산 검증 (내림 나눗셈 적용)
    /// @dev 예측 [2, 6]의 중앙값 = (2+6)/2 = 4
    function test_PayoutMath_EvenBettorsMedian() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 2, 1 ether);
        _placePredictionAs(bettor2, sessionId, 6, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        // 중앙값 = (2+6)/2 = 4, 탈락 5 > 4 -> 보너스 발생
        _settleSession(sessionId, 5);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        uint256 expectedBonus = (2 ether * 1000) / 10000; // 0.2 ETH
        assertEq(bonusAmount, expectedBonus, unicode"짝수 배팅자 중앙값 기반 보너스 = 0.2 ETH");
    }

    /// @notice 짝수 배팅자의 중앙값 내림 나눗셈 검증
    /// @dev 예측 [3, 6]의 중앙값 = (3+6)/2 = 4 (내림), 탈락 5 > 4 -> 보너스 발생
    function test_PayoutMath_EvenBettorsMedianFloorDivision() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);
        _placePredictionAs(bettor2, sessionId, 6, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        // 중앙값 = (3+6)/2 = 4 (내림), 탈락 5 > 4 -> 보너스 발생
        _settleSession(sessionId, 5);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        assertTrue(bonusAmount > 0, unicode"중앙값 4(내림), 탈락 5이므로 보너스 발생");
    }

    /// @notice 단일 배팅자의 중앙값 = 자기 자신의 예측 라운드인지 검증
    function test_PayoutMath_SingleBettorMedian() public {
        uint256 sessionId = _createSession(player);

        _placePredictionAs(bettor1, sessionId, 3, 1 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);

        // 중앙값 = 3, 탈락 3 == 중앙값 -> 보너스 없음
        _settleSession(sessionId, 3);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        assertEq(bonusAmount, 0, unicode"단일 배팅자, 탈락 == 예측이면 보너스 없음");
    }

    /// @notice 동일 배팅 금액이 아닌 경우의 가중 지분 검증
    /// @dev 배팅 금액이 다를 때 weightedShare = amount * weight 공식 확인
    function test_PayoutMath_DifferentialBetAmounts() public {
        uint256 sessionId = _createSession(player);

        // bettor1: 2 ETH, 라운드 5 (weight=3), weightedShare = 6e18
        // bettor2: 0.5 ETH, 라운드 3 (weight=1), weightedShare = 0.5e18
        _placePredictionAs(bettor1, sessionId, 5, 2 ether);
        _placePredictionAs(bettor2, sessionId, 3, 0.5 ether);

        _recordRound(sessionId, 1);
        _recordRound(sessionId, 2);
        _recordRound(sessionId, 3);
        _recordRound(sessionId, 4);
        _recordRound(sessionId, 5);

        _settleSession(sessionId, 5);

        (,,,,, uint256 totalWeightedShares,,) = survivalBet.getSession(sessionId);
        // totalWeightedShares = 6e18 + 0.5e18 = 6.5e18
        assertEq(totalWeightedShares, 6.5 ether, unicode"가중 지분 총합 = 6.5 ETH");

        // totalPool = 2.5 ETH
        // fee = 2.5 * 0.05 = 0.125 ETH
        // 중앙값 = (3+5)/2 = 4, 탈락 5 > 4 -> 보너스 = 2.5 * 0.1 = 0.25 ETH
        // distributablePool = 2.5 - 0.125 - 0.25 = 2.125 ETH

        uint256 distributablePool = 2.125 ether;

        // bettor1 payout = (6e18 * 2.125e18) / 6.5e18
        uint256 expectedPayout1 = (6 ether * distributablePool) / 6.5 ether;

        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor1.balance - bal1Before, expectedPayout1, unicode"bettor1 차등 배당 검증");

        // bettor2 payout = (0.5e18 * 2.125e18) / 6.5e18
        uint256 expectedPayout2 = (0.5 ether * distributablePool) / 6.5 ether;

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor2.balance - bal2Before, expectedPayout2, unicode"bettor2 차등 배당 검증");
    }

    /// @notice 모든 배팅자의 가중치가 0일 때 totalWeightedShares가 0인지 검증
    function test_PayoutMath_AllZeroWeights() public {
        uint256 sessionId = _createSession(player);

        // 모두 diff >= 3인 예측
        _placePredictionAs(bettor1, sessionId, 1, 1 ether); // 탈락 10, diff=9
        _placePredictionAs(bettor2, sessionId, 2, 1 ether); // 탈락 10, diff=8

        for (uint8 r = 1; r <= 10; r++) {
            _recordRound(sessionId, r);
        }

        _settleSession(sessionId, 10);

        (,,,,, uint256 totalWeightedShares,,) = survivalBet.getSession(sessionId);
        assertEq(totalWeightedShares, 0, unicode"모든 배팅자 가중치 0이면 totalWeightedShares = 0");
    }
}
