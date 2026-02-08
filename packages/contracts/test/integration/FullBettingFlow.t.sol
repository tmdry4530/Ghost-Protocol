// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/GhostArena.sol";
import "../../src/WagerPool.sol";
import "../../src/SurvivalBet.sol";

/// @title FullBettingFlowTest
/// @notice 세 컨트랙트(GhostArena, WagerPool, SurvivalBet)를 횡단하는 전체 배팅/정산 통합 테스트
/// @dev 에이전트 등록 → 토너먼트 → 배팅 → 결과 → 정산 → 수령의 전체 흐름과 에지 케이스를 검증한다
contract FullBettingFlowTest is Test {
    // ──────────────────────────────────────────────
    //  컨트랙트 인스턴스
    // ──────────────────────────────────────────────

    GhostArena public arena;
    WagerPool public wagerPool;
    SurvivalBet public survivalBet;

    // ──────────────────────────────────────────────
    //  테스트 주소
    // ──────────────────────────────────────────────

    /// @dev 아레나 매니저 — 세 컨트랙트에서 공유하는 관리자 주소
    address public arenaManager = makeAddr("arenaManager");

    /// @dev 트레저리 — 수수료 수취 주소
    address public treasury = makeAddr("treasury");

    /// @dev 컨트랙트 배포자 겸 소유자
    address public deployer = address(this);

    /// @dev 배팅자 5명
    address public bettor1 = makeAddr("bettor1");
    address public bettor2 = makeAddr("bettor2");
    address public bettor3 = makeAddr("bettor3");
    address public bettor4 = makeAddr("bettor4");
    address public bettor5 = makeAddr("bettor5");

    /// @dev 서바이벌 모드 플레이어
    address public survivalPlayer = makeAddr("survivalPlayer");

    /// @dev 권한 없는 일반 사용자
    address public stranger = makeAddr("stranger");

    /// @dev 에이전트 주소를 고유하게 생성하기 위한 카운터
    uint256 private _agentCounter;

    // ──────────────────────────────────────────────
    //  상수
    // ──────────────────────────────────────────────

    uint256 constant REGISTRATION_FEE = 0.01 ether;
    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 10 ether;
    uint256 constant FEE_BPS = 500;
    uint256 constant TREASURY_FEE_BPS = 300;
    uint256 constant MANAGER_FEE_BPS = 200;
    uint256 constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  setUp
    // ──────────────────────────────────────────────

    /// @notice 테스트 환경 초기화 — 세 컨트랙트 배포 및 참가자 ETH 지급
    function setUp() public {
        // 동일한 arenaManager와 treasury를 공유하도록 세 컨트랙트 배포
        arena = new GhostArena(arenaManager, treasury);
        wagerPool = new WagerPool(arenaManager, treasury);
        survivalBet = new SurvivalBet(arenaManager, treasury);

        // 배팅자들에게 충분한 ETH 지급
        vm.deal(bettor1, 100 ether);
        vm.deal(bettor2, 100 ether);
        vm.deal(bettor3, 100 ether);
        vm.deal(bettor4, 100 ether);
        vm.deal(bettor5, 100 ether);
        vm.deal(survivalPlayer, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    // ──────────────────────────────────────────────
    //  헬퍼 함수
    // ──────────────────────────────────────────────

    /// @notice 지정 수만큼 에이전트를 등록하고 주소 배열을 반환
    /// @param count 등록할 에이전트 수
    /// @return agents_ 등록된 에이전트 주소 배열
    function _registerAgents(uint256 count) internal returns (address[] memory agents_) {
        agents_ = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = _agentCounter++;
            address agent = makeAddr(string(abi.encodePacked("agent", vm.toString(idx))));
            agents_[i] = agent;
            vm.deal(agent, 1 ether);
            vm.prank(agent);
            arena.registerAgent{value: REGISTRATION_FEE}(
                string(abi.encodePacked("Agent", vm.toString(idx))),
                string(abi.encodePacked("ipfs://meta", vm.toString(idx)))
            );
        }
    }

    /// @notice 8인 토너먼트를 생성하고 첫 라운드 매치 ID 배열까지 반환
    /// @return tid 토너먼트 ID
    /// @return participants 참가자 주소 배열
    /// @return round0Matches 라운드 0 매치 ID 배열
    function _createTournament8()
        internal
        returns (uint256 tid, address[] memory participants, uint256[] memory round0Matches)
    {
        participants = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(participants, 8);
        tid = arena.nextTournamentId() - 1;
        round0Matches = arena.getRoundMatches(tid, 0);
    }

    /// @notice 특정 매치의 결과를 제출하는 헬퍼
    function _submitResult(uint256 matchId, uint256 scoreA, uint256 scoreB, address winner) internal {
        vm.prank(arenaManager);
        arena.submitResult(
            matchId, scoreA, scoreB, winner, keccak256(abi.encodePacked("log", matchId)), "ipfs://replay"
        );
    }

    /// @notice 특정 라운드의 모든 매치에서 agentA를 승자로 결과 제출
    function _submitAllRoundResultsAgentAWins(uint256 tid, uint256 round) internal {
        uint256[] memory matchIds = arena.getRoundMatches(tid, round);
        for (uint256 i = 0; i < matchIds.length; i++) {
            (,, address agentA,,,,,,,) = arena.matches(matchIds[i]);
            _submitResult(matchIds[i], 100, 50, agentA);
        }
    }

    /// @notice 8인 토너먼트를 끝까지 진행 (agentA 항상 승리) 하여 완료 상태로 만듦
    function _completeTournament(uint256 tid) internal {
        // 라운드 0 (4매치) → 라운드 1
        _submitAllRoundResultsAgentAWins(tid, 0);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 1 (2매치) → 라운드 2
        _submitAllRoundResultsAgentAWins(tid, 1);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 2 (결승 1매치) → 완료
        _submitAllRoundResultsAgentAWins(tid, 2);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);
    }

    /// @notice WagerPool에 배팅을 실행하는 헬퍼
    function _placeBet(address bettor, uint256 matchId, IWagerPool.Side side, uint256 amount) internal {
        vm.prank(bettor);
        wagerPool.placeBet{value: amount}(matchId, side);
    }

    /// @notice SurvivalBet에 예측 배치하는 헬퍼
    function _placePrediction(address bettor, uint256 sessionId, uint8 predictedRound, uint256 amount) internal {
        vm.prank(bettor);
        survivalBet.placePrediction{value: amount}(sessionId, predictedRound);
    }

    // ════════════════════════════════════════════════════════════════
    //  1. 아레나 배팅 전체 플로우
    // ════════════════════════════════════════════════════════════════

    /// @notice 에이전트 등록 → 토너먼트 생성 → 배팅 → 매치 결과 → 정산 → 상금 수령
    /// @dev 세 컨트랙트를 횡단하는 가장 기본적인 전체 플로우를 검증한다
    function test_FullArenaFlow() public {
        // ── 1단계: 에이전트 등록 및 토너먼트 생성 ──
        (uint256 tid, address[] memory participants, uint256[] memory round0) = _createTournament8();
        assertEq(round0.length, 4, unicode"라운드 0에 4개 매치 생성 확인");

        // ── 2단계: 토너먼트 상금 풀 충전 ──
        uint256 prizeAmount = 2 ether;
        arena.fundTournament{value: prizeAmount}(tid);

        // ── 3단계: 첫 매치(matchId=round0[0])에 WagerPool 배팅 ──
        uint256 matchId = round0[0];
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 1 ether);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, 2 ether);

        // ── 4단계: 배팅 잠금 ──
        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);

        // 잠금 후 배팅 시도 → BettingWindowClosed
        vm.expectRevert(IWagerPool.BettingWindowClosed.selector);
        _placeBet(bettor3, matchId, IWagerPool.Side.AgentA, 0.5 ether);

        // ── 5단계: 매치 결과 제출 (agentA 승리) ──
        (,, address agentA,,,,,,,) = arena.matches(matchId);
        _submitResult(matchId, 120, 80, agentA);

        // ── 6단계: WagerPool 정산 ──
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        // ── 7단계: 승리 배팅자 배당 수령 ──
        uint256 totalPool = 3 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR; // 2.85 ETH

        uint256 bettor1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);
        uint256 bettor1Payout = bettor1.balance - bettor1Before;

        // bettor1이 유일한 AgentA 배팅자이므로 distributablePool 전액 수령
        assertEq(
            bettor1Payout, distributablePool, unicode"유일한 승리자가 distributablePool 전액 수령해야 함"
        );

        // ── 8단계: 나머지 라운드 진행 후 토너먼트 완료 → 상금 수령 ──
        // 나머지 라운드 0 매치 결과 제출 (agentA 승리)
        for (uint256 i = 1; i < round0.length; i++) {
            (,, address a,,,,,,,) = arena.matches(round0[i]);
            _submitResult(round0[i], 100, 50, a);
        }
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 1, 2 진행
        _submitAllRoundResultsAgentAWins(tid, 1);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        _submitAllRoundResultsAgentAWins(tid, 2);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 토너먼트 완료 확인
        (,,, IGhostArena.TournamentStatus status,) = arena.tournaments(tid);
        assertEq(
            uint256(status),
            uint256(IGhostArena.TournamentStatus.Completed),
            unicode"토너먼트가 Completed 상태여야 함"
        );

        // 우승자 상금 수령
        address champion = arena.tournamentChampion(tid);
        uint256 championBefore = champion.balance;
        vm.prank(champion);
        arena.claimPrize(tid);
        assertEq(
            champion.balance - championBefore, prizeAmount, unicode"우승자가 상금 전액을 수령해야 함"
        );
    }

    // ════════════════════════════════════════════════════════════════
    //  2. 여러 배터의 양쪽 배팅 후 정산
    // ════════════════════════════════════════════════════════════════

    /// @notice 5명의 배팅자가 양쪽에 배팅 후 승자 측만 비례 배당을 수령하고, 패자 측은 수령 불가
    function test_MultipleBettorsSettlement() public {
        uint256 matchId = 42;

        // 배팅 배치: AgentA 측 3명, AgentB 측 2명
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 1 ether); // AgentA
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentA, 2 ether); // AgentA
        _placeBet(bettor3, matchId, IWagerPool.Side.AgentA, 3 ether); // AgentA
        _placeBet(bettor4, matchId, IWagerPool.Side.AgentB, 2 ether); // AgentB
        _placeBet(bettor5, matchId, IWagerPool.Side.AgentB, 2 ether); // AgentB

        // 총 풀: AgentA=6, AgentB=4, total=10 ETH
        uint256 totalPool = 10 ether;
        uint256 winningSideTotal = 6 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR; // 9.5 ETH

        // 잠금 & 정산 (AgentA 승리)
        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        // 승리 측 배당 수령
        uint256 expected1 = (1 ether * distributablePool) / winningSideTotal;
        uint256 expected2 = (2 ether * distributablePool) / winningSideTotal;
        uint256 expected3 = (3 ether * distributablePool) / winningSideTotal;

        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);
        assertEq(bettor1.balance - bal1Before, expected1, unicode"bettor1 비례 배당 검증");

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        wagerPool.claimWinnings(matchId);
        assertEq(bettor2.balance - bal2Before, expected2, unicode"bettor2 비례 배당 검증");

        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        wagerPool.claimWinnings(matchId);
        assertEq(bettor3.balance - bal3Before, expected3, unicode"bettor3 비례 배당 검증");

        // 패배 측 수령 시도 → NotOnWinningSide
        vm.prank(bettor4);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(matchId);

        vm.prank(bettor5);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(matchId);
    }

    // ════════════════════════════════════════════════════════════════
    //  3. 수수료 계산 정확성
    // ════════════════════════════════════════════════════════════════

    /// @notice 5% 수수료 = 3% treasury + 2% manager 분배의 정확성을 검증
    function test_FeeCalculation() public {
        uint256 matchId = 100;

        // 양쪽에 배팅
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 4 ether);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, 6 ether);

        uint256 totalPool = 10 ether;

        // 잠금 & 정산
        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        // 수수료 누적 확인
        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR; // 0.3 ETH
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR; // 0.2 ETH

        assertEq(
            wagerPool.accumulatedTreasuryFees(), expectedTreasuryFee, unicode"재무부 수수료 0.3 ETH 누적 확인"
        );
        assertEq(
            wagerPool.accumulatedManagerFees(), expectedManagerFee, unicode"매니저 수수료 0.2 ETH 누적 확인"
        );
        assertEq(
            expectedTreasuryFee + expectedManagerFee,
            (totalPool * FEE_BPS) / BPS_DENOMINATOR,
            unicode"합산 수수료 = 5%"
        );

        // 수수료 출금 및 실제 전송 검증
        uint256 treasuryBefore = treasury.balance;
        uint256 managerBefore = arenaManager.balance;

        wagerPool.withdrawFees();

        assertEq(treasury.balance - treasuryBefore, expectedTreasuryFee, unicode"재무부에 0.3 ETH 전송 확인");
        assertEq(arenaManager.balance - managerBefore, expectedManagerFee, unicode"매니저에 0.2 ETH 전송 확인");

        // 누적 수수료가 0으로 초기화되었는지 확인
        assertEq(wagerPool.accumulatedTreasuryFees(), 0, unicode"출금 후 재무부 수수료 잔액 0");
        assertEq(wagerPool.accumulatedManagerFees(), 0, unicode"출금 후 매니저 수수료 잔액 0");

        // 배당 수령 후 컨트랙트 잔액 정합성 검증
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 bettor1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);
        uint256 bettor1Payout = bettor1.balance - bettor1Before;

        assertEq(bettor1Payout, distributablePool, unicode"유일 승리자가 수수료 제외 전액 수령");
    }

    // ════════════════════════════════════════════════════════════════
    //  4. 매치 무효화 시 전원 환불
    // ════════════════════════════════════════════════════════════════

    /// @notice voidMatch 호출 후 전 배팅자가 원금을 환불받는지 검증
    function test_VoidMatchRefund() public {
        uint256 matchId = 200;

        // 양쪽에 배팅
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 3 ether);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, 2 ether);
        _placeBet(bettor3, matchId, IWagerPool.Side.AgentA, 1 ether);

        // 잠금 후 무효화
        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
        vm.prank(arenaManager);
        wagerPool.voidMatch(matchId);

        // 풀 상태 확인
        (IWagerPool.PoolStatus status,,,) = wagerPool.pools(matchId);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Refunded), unicode"풀 상태가 Refunded여야 함");

        // 전원 환불
        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.refund(matchId);
        assertEq(bettor1.balance - bal1Before, 3 ether, unicode"bettor1 원금 3 ETH 환불");

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        wagerPool.refund(matchId);
        assertEq(bettor2.balance - bal2Before, 2 ether, unicode"bettor2 원금 2 ETH 환불");

        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        wagerPool.refund(matchId);
        assertEq(bettor3.balance - bal3Before, 1 ether, unicode"bettor3 원금 1 ETH 환불");

        // 컨트랙트 잔액 0 확인
        assertEq(address(wagerPool).balance, 0, unicode"환불 완료 후 컨트랙트 잔액 0");
    }

    // ════════════════════════════════════════════════════════════════
    //  5. 서바이벌 배팅 전체 플로우
    // ════════════════════════════════════════════════════════════════

    /// @notice 세션 생성 → 예측 배팅 → 라운드 생존 기록 → 정산 → 배당 수령
    function test_FullSurvivalFlow() public {
        // ── 1단계: 세션 생성 ──
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        // ── 2단계: 3명의 배팅자가 예측 배치 ──
        _placePrediction(bettor1, sessionId, 3, 1 ether); // 라운드 3 예측
        _placePrediction(bettor2, sessionId, 5, 1 ether); // 라운드 5 예측
        _placePrediction(bettor3, sessionId, 7, 1 ether); // 라운드 7 예측

        // ── 3단계: 라운드 1~5 생존 기록 ──
        for (uint8 r = 1; r <= 5; r++) {
            vm.prank(arenaManager);
            survivalBet.recordRoundSurvived(sessionId, r);
        }

        // 세션 상태가 Active로 전환되었는지 확인
        (, ISurvivalBet.SessionStatus status,,,,,,) = survivalBet.getSession(sessionId);
        assertEq(uint8(status), uint8(ISurvivalBet.SessionStatus.Active), unicode"세션 상태가 Active여야 함");

        // ── 4단계: 정산 (탈락 라운드 5) ──
        uint256 treasuryBefore = treasury.balance;
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 5);

        // 수수료 검증: 3 ETH * 5% = 0.15 ETH
        assertEq(
            treasury.balance - treasuryBefore, 0.15 ether, unicode"트레저리에 0.15 ETH 수수료 전송 확인"
        );

        // ── 5단계: 배당 수령 ──
        // 가중치: bettor1(diff=2)=1, bettor2(diff=0)=3, bettor3(diff=2)=1
        // totalWeightedShares = 1+3+1 = 5 (각 1 ETH 기준)
        // distributablePool = 3 - 0.15 - 0 = 2.85 ETH (보너스 0, 탈락 5 == 중앙값 5)

        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor1.balance - bal1Before, 0.57 ether, unicode"bettor1 배당금 0.57 ETH (가중치 1/5)");

        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor2.balance - bal2Before, 1.71 ether, unicode"bettor2 배당금 1.71 ETH (가중치 3/5)");

        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        assertEq(bettor3.balance - bal3Before, 0.57 ether, unicode"bettor3 배당금 0.57 ETH (가중치 1/5)");

        // 총 지출 정합성: 수수료 + 배당 = totalPool
        uint256 totalDisbursed_ = 0.15 ether + 0.57 ether + 1.71 ether + 0.57 ether;
        assertEq(totalDisbursed_, 3 ether, unicode"수수료 + 전체 배당 = 총 풀");
    }

    // ════════════════════════════════════════════════════════════════
    //  6. 예측 정확도 기반 가중치 검증
    // ════════════════════════════════════════════════════════════════

    /// @notice 정확한 예측자(가중치 3)가 가장 높은 배당을, ±1(가중치 2), ±2(가중치 1) 순으로 낮은 배당을 받는지 검증
    function test_PredictionWeights() public {
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        // 3명이 서로 다른 정확도로 예측 (탈락 라운드를 5로 정산 예정)
        _placePrediction(bettor1, sessionId, 5, 1 ether); // diff=0, weight=3
        _placePrediction(bettor2, sessionId, 4, 1 ether); // diff=1, weight=2
        _placePrediction(bettor3, sessionId, 3, 1 ether); // diff=2, weight=1

        for (uint8 r = 1; r <= 5; r++) {
            vm.prank(arenaManager);
            survivalBet.recordRoundSurvived(sessionId, r);
        }

        // 중앙값: sort([5,4,3])=[3,4,5], median=4, 탈락 5 > 4 → 보너스 발생
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 5);

        (,,,,, uint256 totalWeightedShares,, uint256 bonusAmount) = survivalBet.getSession(sessionId);

        // totalWeightedShares = 3*1e18 + 2*1e18 + 1*1e18 = 6e18
        assertEq(totalWeightedShares, 6 ether, unicode"가중 지분 총합 = 6 ETH");

        // bonusAmount = 3 ETH * 10% = 0.3 ETH
        assertEq(bonusAmount, 0.3 ether, unicode"서바이벌 보너스 = 0.3 ETH");

        // fee = 3 * 5% = 0.15 ETH
        // distributablePool = 3 - 0.15 - 0.3 = 2.55 ETH
        uint256 distributablePool = 2.55 ether;

        // bettor1 (weight=3): (3e18 * 2.55e18) / 6e18 = 1.275 ETH
        uint256 bal1Before = bettor1.balance;
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);
        uint256 payout1 = bettor1.balance - bal1Before;

        // bettor2 (weight=2): (2e18 * 2.55e18) / 6e18 = 0.85 ETH
        uint256 bal2Before = bettor2.balance;
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);
        uint256 payout2 = bettor2.balance - bal2Before;

        // bettor3 (weight=1): (1e18 * 2.55e18) / 6e18 = 0.425 ETH
        uint256 bal3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        uint256 payout3 = bettor3.balance - bal3Before;

        uint256 expectedPayout1 = (3 ether * distributablePool) / 6 ether;
        uint256 expectedPayout2 = (2 ether * distributablePool) / 6 ether;
        uint256 expectedPayout3 = (1 ether * distributablePool) / 6 ether;

        assertEq(payout1, expectedPayout1, unicode"정확한 예측자(weight=3) 배당 검증");
        assertEq(payout2, expectedPayout2, unicode"오차 1(weight=2) 배당 검증");
        assertEq(payout3, expectedPayout3, unicode"오차 2(weight=1) 배당 검증");

        // 정확한 예측자가 가장 높은 배당을 받아야 함
        assertGt(payout1, payout2, unicode"weight=3 배당이 weight=2 배당보다 커야 함");
        assertGt(payout2, payout3, unicode"weight=2 배당이 weight=1 배당보다 커야 함");
    }

    // ════════════════════════════════════════════════════════════════
    //  7. 플레이어 서바이벌 보너스
    // ════════════════════════════════════════════════════════════════

    /// @notice 탈락 라운드가 중앙값 초과 시 플레이어가 10% 서바이벌 보너스를 수령
    function test_SurvivalBonus() public {
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        // 3명이 라운드 3, 5, 7 예측 (중앙값 = 5)
        _placePrediction(bettor1, sessionId, 3, 1 ether);
        _placePrediction(bettor2, sessionId, 5, 1 ether);
        _placePrediction(bettor3, sessionId, 7, 1 ether);

        // 라운드 1~8 생존
        for (uint8 r = 1; r <= 8; r++) {
            vm.prank(arenaManager);
            survivalBet.recordRoundSurvived(sessionId, r);
        }

        // 탈락 라운드 8 > 중앙값 5 → 보너스 발생
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 8);

        (,,,,,,, uint256 bonusAmount) = survivalBet.getSession(sessionId);
        assertEq(bonusAmount, 0.3 ether, unicode"서바이벌 보너스 = 3 ETH * 10% = 0.3 ETH");

        // 플레이어 보너스 수령
        uint256 playerBefore = survivalPlayer.balance;
        vm.prank(survivalPlayer);
        survivalBet.claimPlayerBonus(sessionId);
        assertEq(survivalPlayer.balance - playerBefore, 0.3 ether, unicode"플레이어가 0.3 ETH 보너스 수령");

        // 이중 수령 방지
        vm.prank(survivalPlayer);
        vm.expectRevert(SurvivalBet.BonusAlreadyClaimed.selector);
        survivalBet.claimPlayerBonus(sessionId);
    }

    // ════════════════════════════════════════════════════════════════
    //  8. 이중 수령 방지
    // ════════════════════════════════════════════════════════════════

    /// @notice claimWinnings 두 번 호출 시 AlreadyClaimed 리버트 확인
    function test_DoubleClaim() public {
        uint256 matchId = 300;

        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 1 ether);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, 1 ether);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        // 첫 번째 수령 (성공)
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);

        // 두 번째 수령 (실패)
        vm.prank(bettor1);
        vm.expectRevert(WagerPool.AlreadyClaimed.selector);
        wagerPool.claimWinnings(matchId);
    }

    // ════════════════════════════════════════════════════════════════
    //  9. 잠금 후 배팅 시도 시 revert
    // ════════════════════════════════════════════════════════════════

    /// @notice 풀이 Locked 상태에서 배팅 시도 시 BettingWindowClosed 리버트
    function test_BetAfterLock() public {
        uint256 matchId = 400;

        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);

        // Locked 상태에서 배팅 시도
        vm.expectRevert(IWagerPool.BettingWindowClosed.selector);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, 1 ether);

        // Settled 상태에서도 배팅 불가
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        vm.expectRevert(IWagerPool.BettingWindowClosed.selector);
        _placeBet(bettor3, matchId, IWagerPool.Side.AgentA, 1 ether);
    }

    // ════════════════════════════════════════════════════════════════
    //  10. 최소/최대 배팅 금액 경계 테스트
    // ════════════════════════════════════════════════════════════════

    /// @notice MIN_BET 미만, MAX_BET 초과, 경계값 정확히에서의 동작을 검증
    function test_BetAmountBounds() public {
        uint256 matchId = 500;

        // MIN_BET - 1 → InvalidBetAmount
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, MIN_BET - 1);

        // MAX_BET + 1 → InvalidBetAmount
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, MAX_BET + 1);

        // 0 wei → InvalidBetAmount
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 0);

        // MIN_BET 정확히 → 성공
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, MIN_BET);
        (, uint256 amount1,) = wagerPool.getBet(matchId, bettor1);
        assertEq(amount1, MIN_BET, unicode"최소 금액 배팅 성공");

        // MAX_BET 정확히 → 성공
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, MAX_BET);
        (, uint256 amount2,) = wagerPool.getBet(matchId, bettor2);
        assertEq(amount2, MAX_BET, unicode"최대 금액 배팅 성공");

        // 누적 초과: bettor1이 추가 배팅으로 MAX_BET 초과
        // bettor1의 현재 배팅 = MIN_BET, MAX_BET - MIN_BET 추가는 가능
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, MAX_BET - MIN_BET);
        (, uint256 amount1After,) = wagerPool.getBet(matchId, bettor1);
        assertEq(amount1After, MAX_BET, unicode"누적 배팅이 MAX_BET에 도달");

        // 1 wei라도 더 추가하면 초과 → InvalidBetAmount
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, MIN_BET);

        // SurvivalBet 최소 금액 테스트
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        // MIN_BET - 1 → BetTooSmall
        vm.prank(bettor3);
        vm.expectRevert(SurvivalBet.BetTooSmall.selector);
        survivalBet.placePrediction{value: MIN_BET - 1}(sessionId, 5);

        // MIN_BET 정확히 → 성공
        _placePrediction(bettor3, sessionId, 5, MIN_BET);
        (uint8 predicted, uint256 predAmount,) = survivalBet.getPrediction(sessionId, bettor3);
        assertEq(predicted, 5, unicode"서바이벌 최소 금액 예측 라운드 확인");
        assertEq(predAmount, MIN_BET, unicode"서바이벌 최소 금액 배팅 확인");
    }

    // ════════════════════════════════════════════════════════════════
    //  11. 비승인 주소의 관리자 함수 호출 시 revert
    // ════════════════════════════════════════════════════════════════

    /// @notice 세 컨트랙트의 모든 관리자 전용 함수에 대해 비승인 접근을 차단하는지 검증
    function test_UnauthorizedAccess() public {
        // ── GhostArena 관리자 함수 ──
        address[] memory participants = _registerAgents(8);

        vm.prank(stranger);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.createTournament(participants, 8);

        // 토너먼트 생성 (정상)
        vm.prank(arenaManager);
        arena.createTournament(participants, 8);
        uint256 tid = 0;
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);

        vm.prank(stranger);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.submitResult(round0[0], 100, 50, participants[0], keccak256("log"), "ipfs://replay");

        vm.prank(stranger);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.advanceBracket(tid);

        // ── WagerPool 관리자 함수 ──
        uint256 matchId = 999;
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.lockBets(matchId);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.voidMatch(matchId);

        // ── SurvivalBet 관리자 함수 ──
        vm.prank(stranger);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.createSession(survivalPlayer);

        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);
        _placePrediction(bettor1, sessionId, 5, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.recordRoundSurvived(sessionId, 1);

        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 1);

        vm.prank(stranger);
        vm.expectRevert(SurvivalBet.OnlyArenaManager.selector);
        survivalBet.settleSession(sessionId, 1);
    }

    // ════════════════════════════════════════════════════════════════
    //  12. 크로스 컨트랙트: 아레나 결과 → 풀 정산 → 상금 수령
    // ════════════════════════════════════════════════════════════════

    /// @notice GhostArena 매치 결과를 기반으로 WagerPool을 정산하고, 토너먼트 상금도 수령하는 전체 흐름
    function test_CrossContractFlow() public {
        // ── 에이전트 등록 & 토너먼트 생성 ──
        (uint256 tid, address[] memory participants, uint256[] memory round0) = _createTournament8();

        // 토너먼트 상금 충전
        uint256 prizeAmount = 5 ether;
        arena.fundTournament{value: prizeAmount}(tid);

        // ── 라운드 0, 매치 0: 배팅 진행 ──
        uint256 matchId0 = round0[0];
        _placeBet(bettor1, matchId0, IWagerPool.Side.AgentA, 2 ether);
        _placeBet(bettor2, matchId0, IWagerPool.Side.AgentB, 3 ether);
        _placeBet(bettor3, matchId0, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId0);

        // GhostArena에서 매치 결과 제출 → agentA(participants[0]) 승리
        _submitResult(matchId0, 150, 90, participants[0]);

        // WagerPool에서 같은 매치 결과로 정산
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId0, IWagerPool.Side.AgentA);

        // 승리 배팅자 배당 수령
        uint256 totalPool = 6 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR; // 5.7 ETH
        uint256 winningSideTotal = 3 ether; // bettor1(2) + bettor3(1)

        uint256 expectedBettor1 = (2 ether * distributablePool) / winningSideTotal;
        uint256 expectedBettor3 = (1 ether * distributablePool) / winningSideTotal;

        uint256 b1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId0);
        assertEq(bettor1.balance - b1Before, expectedBettor1, unicode"크로스: bettor1 배당 수령 확인");

        uint256 b3Before = bettor3.balance;
        vm.prank(bettor3);
        wagerPool.claimWinnings(matchId0);
        assertEq(bettor3.balance - b3Before, expectedBettor3, unicode"크로스: bettor3 배당 수령 확인");

        // bettor2는 패배 → 수령 불가
        vm.prank(bettor2);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(matchId0);

        // ── 나머지 매치 결과 제출 & 토너먼트 완료 ──
        for (uint256 i = 1; i < round0.length; i++) {
            (,, address a,,,,,,,) = arena.matches(round0[i]);
            _submitResult(round0[i], 100, 50, a);
        }
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        _submitAllRoundResultsAgentAWins(tid, 1);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        _submitAllRoundResultsAgentAWins(tid, 2);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // ── 토너먼트 우승자 상금 수령 ──
        address champion = arena.tournamentChampion(tid);
        assertEq(champion, participants[0], unicode"우승자가 participants[0]이어야 함");

        uint256 champBefore = champion.balance;
        vm.prank(champion);
        arena.claimPrize(tid);
        assertEq(champion.balance - champBefore, prizeAmount, unicode"우승자가 상금 5 ETH 수령");

        // 이중 수령 방지
        vm.prank(champion);
        vm.expectRevert(GhostArena.PrizeAlreadyClaimed.selector);
        arena.claimPrize(tid);

        // ── 에이전트 통계 확인 ──
        // participants[0]은 3경기 승리 (라운드 0, 1, 2에서 각 1승)
        (,,, uint256 wins, uint256 losses,,,) = arena.agents(participants[0]);
        assertEq(wins, 3, unicode"우승자 총 3승 확인");
        assertEq(losses, 0, unicode"우승자 총 0패 확인");

        // ── WagerPool 수수료 출금 ──
        uint256 treasuryBefore = treasury.balance;
        uint256 managerBefore = arenaManager.balance;
        wagerPool.withdrawFees();

        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR;

        assertEq(
            treasury.balance - treasuryBefore,
            expectedTreasuryFee,
            unicode"크로스: 재무부 수수료 전송 확인"
        );
        assertEq(
            arenaManager.balance - managerBefore,
            expectedManagerFee,
            unicode"크로스: 매니저 수수료 전송 확인"
        );
    }

    // ════════════════════════════════════════════════════════════════
    //  13. 동시 다중 매치 배팅 독립성
    // ════════════════════════════════════════════════════════════════

    /// @notice 서로 다른 매치의 배팅 풀이 간섭 없이 독립적으로 동작하는지 검증
    function test_MultipleMatchIndependence() public {
        uint256 matchA = 600;
        uint256 matchB = 601;

        // 매치 A: bettor1(AgentA, 2ETH), bettor2(AgentB, 3ETH) → AgentA 승리
        _placeBet(bettor1, matchA, IWagerPool.Side.AgentA, 2 ether);
        _placeBet(bettor2, matchA, IWagerPool.Side.AgentB, 3 ether);

        // 매치 B: bettor3(AgentA, 1ETH), bettor4(AgentB, 4ETH) → 무효화
        _placeBet(bettor3, matchB, IWagerPool.Side.AgentA, 1 ether);
        _placeBet(bettor4, matchB, IWagerPool.Side.AgentB, 4 ether);

        // 매치 A 정산
        vm.prank(arenaManager);
        wagerPool.lockBets(matchA);
        vm.prank(arenaManager);
        wagerPool.settleBets(matchA, IWagerPool.Side.AgentA);

        // 매치 B 무효화
        vm.prank(arenaManager);
        wagerPool.voidMatch(matchB);

        // 매치 A: 승리자 배당 수령
        uint256 b1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchA);
        assertGt(bettor1.balance, b1Before, unicode"매치A: bettor1 배당 수령 확인");

        // 매치 B: 환불
        uint256 b3Before = bettor3.balance;
        vm.prank(bettor3);
        wagerPool.refund(matchB);
        assertEq(bettor3.balance - b3Before, 1 ether, unicode"매치B: bettor3 원금 1 ETH 환불");

        uint256 b4Before = bettor4.balance;
        vm.prank(bettor4);
        wagerPool.refund(matchB);
        assertEq(bettor4.balance - b4Before, 4 ether, unicode"매치B: bettor4 원금 4 ETH 환불");

        // 교차 접근 불가 확인
        vm.prank(bettor1);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.refund(matchB);

        vm.prank(bettor3);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.claimWinnings(matchA);
    }

    // ════════════════════════════════════════════════════════════════
    //  14. 아레나 + 서바이벌 동시 운영
    // ════════════════════════════════════════════════════════════════

    /// @notice 아레나 모드 배팅과 서바이벌 모드 배팅이 동시에 독립적으로 운영되는지 검증
    function test_SimultaneousArenaAndSurvival() public {
        // ── 아레나 측: 매치 배팅 ──
        uint256 arenaMatchId = 700;
        _placeBet(bettor1, arenaMatchId, IWagerPool.Side.AgentA, 2 ether);
        _placeBet(bettor2, arenaMatchId, IWagerPool.Side.AgentB, 2 ether);

        vm.prank(arenaManager);
        wagerPool.lockBets(arenaMatchId);
        vm.prank(arenaManager);
        wagerPool.settleBets(arenaMatchId, IWagerPool.Side.AgentA);

        // ── 서바이벌 측: 세션 생성 & 배팅 ──
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);
        _placePrediction(bettor3, sessionId, 5, 2 ether);
        _placePrediction(bettor4, sessionId, 3, 2 ether);

        for (uint8 r = 1; r <= 5; r++) {
            vm.prank(arenaManager);
            survivalBet.recordRoundSurvived(sessionId, r);
        }
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 5);

        // ── 양쪽 수령 ──

        // 아레나 배당 수령
        uint256 b1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(arenaMatchId);
        uint256 arenaPayout = bettor1.balance - b1Before;

        uint256 arenaDistributable = (4 ether * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        assertEq(arenaPayout, arenaDistributable, unicode"아레나 배당 수령 확인");

        // 서바이벌 배당 수령 (bettor3: diff=0, weight=3)
        uint256 b3Before = bettor3.balance;
        vm.prank(bettor3);
        survivalBet.claimPayout(sessionId);
        uint256 survivalPayout3 = bettor3.balance - b3Before;
        assertGt(survivalPayout3, 0, unicode"서바이벌 bettor3 배당 수령 확인");

        // 서바이벌 배당 수령 (bettor4: diff=2, weight=1)
        uint256 b4Before = bettor4.balance;
        vm.prank(bettor4);
        survivalBet.claimPayout(sessionId);
        uint256 survivalPayout4 = bettor4.balance - b4Before;
        assertGt(survivalPayout4, 0, unicode"서바이벌 bettor4 배당 수령 확인");

        // 정확한 예측자(weight=3)가 더 높은 배당을 받아야 함
        assertGt(survivalPayout3, survivalPayout4, unicode"정확한 예측자가 더 높은 배당 수령");
    }

    // ════════════════════════════════════════════════════════════════
    //  15. 퍼즈 테스트: 다양한 배팅 비율에서의 배분 풀 정합성
    // ════════════════════════════════════════════════════════════════

    /// @notice 다양한 배팅 비율에서 총 배당금 + 수수료가 총 풀을 초과하지 않는 불변식 검증
    /// @param betA bettor1의 AgentA 배팅 금액
    /// @param betB bettor2의 AgentB 배팅 금액
    function testFuzz_PayoutIntegrity(uint256 betA, uint256 betB) public {
        betA = bound(betA, MIN_BET, MAX_BET);
        betB = bound(betB, MIN_BET, MAX_BET);

        uint256 matchId = 800;

        vm.deal(bettor1, betA);
        vm.deal(bettor2, betB);

        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, betA);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentB, betB);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentA);

        uint256 totalPool = betA + betB;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR;

        // 배당 수령
        uint256 b1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);
        uint256 payout = bettor1.balance - b1Before;

        // bettor1이 유일한 AgentA 배팅자이므로 distributablePool 전액
        assertEq(payout, distributablePool, unicode"퍼즈: 유일 승리자가 distributablePool 전액 수령");

        // 불변식: 배당 + 수수료 <= 총 풀
        uint256 totalDisbursed = payout + expectedTreasuryFee + expectedManagerFee;
        assertLe(totalDisbursed, totalPool, unicode"퍼즈: 총 지출이 총 풀을 초과하면 안 됨");

        // 먼지(반올림 잔여) 검증 — 1 gwei 미만이어야 함
        uint256 dust = totalPool - totalDisbursed;
        assertLt(dust, 1 gwei, unicode"퍼즈: 반올림 잔여가 1 gwei 미만이어야 함");
    }

    // ════════════════════════════════════════════════════════════════
    //  16. 서바이벌 배팅 이중 수령 방지
    // ════════════════════════════════════════════════════════════════

    /// @notice SurvivalBet의 claimPayout을 두 번 호출하면 AlreadyClaimed 리버트
    function test_SurvivalDoubleClaimPrevention() public {
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        _placePrediction(bettor1, sessionId, 5, 1 ether);
        _placePrediction(bettor2, sessionId, 3, 1 ether);

        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 1);
        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 2);
        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 3);
        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 4);
        vm.prank(arenaManager);
        survivalBet.recordRoundSurvived(sessionId, 5);

        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 5);

        // bettor1: 첫 수령 (성공)
        vm.prank(bettor1);
        survivalBet.claimPayout(sessionId);

        // bettor1: 이중 수령 (실패)
        vm.prank(bettor1);
        vm.expectRevert(SurvivalBet.AlreadyClaimed.selector);
        survivalBet.claimPayout(sessionId);

        // bettor2: diff=2, weight=1 → 첫 수령은 성공
        vm.prank(bettor2);
        survivalBet.claimPayout(sessionId);

        // bettor2: 이중 수령 (실패)
        vm.prank(bettor2);
        vm.expectRevert(SurvivalBet.AlreadyClaimed.selector);
        survivalBet.claimPayout(sessionId);
    }

    // ════════════════════════════════════════════════════════════════
    //  17. 승리 사이드 배팅자 없을 때 전원 원금 환불
    // ════════════════════════════════════════════════════════════════

    /// @notice AgentA에만 배팅 후 AgentB 승리로 정산 → 승리 사이드 total=0 → 전원 원금 환불 (수수료 없음)
    function test_NoWinningSideBettors_RefundAll() public {
        uint256 matchId = 900;

        // 전원 AgentA에 배팅
        _placeBet(bettor1, matchId, IWagerPool.Side.AgentA, 2 ether);
        _placeBet(bettor2, matchId, IWagerPool.Side.AgentA, 3 ether);

        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);

        // AgentB 승리로 정산 → 승리 사이드에 배팅자 없음
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, IWagerPool.Side.AgentB);

        // 수수료가 누적되지 않아야 함
        assertEq(
            wagerPool.accumulatedTreasuryFees(), 0, unicode"승리 사이드 배팅자 없을 때 재무부 수수료 0"
        );
        assertEq(
            wagerPool.accumulatedManagerFees(), 0, unicode"승리 사이드 배팅자 없을 때 매니저 수수료 0"
        );

        // 전원 원금 환불 (claimWinnings의 winningSideTotal==0 분기)
        uint256 b1Before = bettor1.balance;
        vm.prank(bettor1);
        wagerPool.claimWinnings(matchId);
        assertEq(bettor1.balance - b1Before, 2 ether, unicode"bettor1 원금 2 ETH 환불");

        uint256 b2Before = bettor2.balance;
        vm.prank(bettor2);
        wagerPool.claimWinnings(matchId);
        assertEq(bettor2.balance - b2Before, 3 ether, unicode"bettor2 원금 3 ETH 환불");

        // 컨트랙트 잔액 0 확인
        assertEq(address(wagerPool).balance, 0, unicode"전원 환불 후 컨트랙트 잔액 0");
    }

    // ════════════════════════════════════════════════════════════════
    //  18. 서바이벌 고점 보너스 + 서바이벌 보너스 누적 수령
    // ════════════════════════════════════════════════════════════════

    /// @notice 서바이벌 보너스(10%)와 고점 보너스(5%)가 누적되어 플레이어가 합산 수령하는지 검증
    function test_CombinedSurvivalAndHighScoreBonus() public {
        vm.prank(arenaManager);
        uint256 sessionId = survivalBet.createSession(survivalPlayer);

        _placePrediction(bettor1, sessionId, 3, 2 ether);
        _placePrediction(bettor2, sessionId, 5, 2 ether);
        _placePrediction(bettor3, sessionId, 7, 2 ether);

        // 라운드 1~8 생존
        for (uint8 r = 1; r <= 8; r++) {
            vm.prank(arenaManager);
            survivalBet.recordRoundSurvived(sessionId, r);
        }

        // 탈락 라운드 8 > 중앙값 5 → 서바이벌 보너스 발생
        vm.prank(arenaManager);
        survivalBet.settleSession(sessionId, 8);

        // 서바이벌 보너스 = 6 ETH * 10% = 0.6 ETH
        (,,,,,,, uint256 bonusBeforeHS) = survivalBet.getSession(sessionId);
        assertEq(bonusBeforeHS, 0.6 ether, unicode"서바이벌 보너스 = 0.6 ETH");

        // 고점 보너스 트리거 → +0.3 ETH (6 ETH * 5%)
        vm.prank(arenaManager);
        survivalBet.triggerHighScoreBonus(sessionId);

        (,,,,,,, uint256 totalBonus) = survivalBet.getSession(sessionId);
        assertEq(totalBonus, 0.9 ether, unicode"누적 보너스 = 서바이벌(0.6) + 고점(0.3) = 0.9 ETH");

        // 플레이어가 누적 보너스 수령
        uint256 playerBefore = survivalPlayer.balance;
        vm.prank(survivalPlayer);
        survivalBet.claimPlayerBonus(sessionId);
        assertEq(
            survivalPlayer.balance - playerBefore, 0.9 ether, unicode"플레이어가 누적 보너스 0.9 ETH 수령"
        );

        // 이중 수령 방지
        vm.prank(survivalPlayer);
        vm.expectRevert(SurvivalBet.BonusAlreadyClaimed.selector);
        survivalBet.claimPlayerBonus(sessionId);

        // 고점 보너스 재트리거도 방지 (보너스 이미 수령됨)
        vm.prank(arenaManager);
        vm.expectRevert(SurvivalBet.BonusAlreadyClaimed.selector);
        survivalBet.triggerHighScoreBonus(sessionId);
    }
}
