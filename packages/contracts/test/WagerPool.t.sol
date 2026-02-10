// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/WagerPool.sol";

// ════════════════════════════════════════════════════════════════
//  재진입 공격 시뮬레이션용 악성 컨트랙트
// ════════════════════════════════════════════════════════════════

/// @notice claimWinnings 재진입 공격을 시도하는 컨트랙트
contract ReentrancyAttacker {
    WagerPool public pool;
    uint256 public targetMatchId;
    uint256 public attackCount;

    constructor(address _pool) {
        pool = WagerPool(_pool);
    }

    /// @notice 배팅 실행
    function placeBet(uint256 matchId, IWagerPool.Side side) external payable {
        targetMatchId = matchId;
        pool.placeBet{value: msg.value}(matchId, side);
    }

    /// @notice 배당금 수령 시도 (재진입 공격)
    function attack() external {
        pool.claimWinnings(targetMatchId);
    }

    /// @notice 환불 시도 (재진입 공격)
    function attackRefund() external {
        pool.refund(targetMatchId);
    }

    receive() external payable {
        if (attackCount < 1) {
            attackCount++;
            // 재진입 시도
            pool.claimWinnings(targetMatchId);
        }
    }
}

/// @notice ETH 수신을 거부하는 컨트랙트 — TransferFailed 테스트용
contract ETHRejecter {
    WagerPool public pool;

    constructor(address _pool) {
        pool = WagerPool(_pool);
    }

    function placeBet(uint256 matchId, IWagerPool.Side side) external payable {
        pool.placeBet{value: msg.value}(matchId, side);
    }

    function claimWinnings(uint256 matchId) external {
        pool.claimWinnings(matchId);
    }

    function claimRefund(uint256 matchId) external {
        pool.refund(matchId);
    }

    // receive 함수 없음 — ETH 수신 거부
}

// ════════════════════════════════════════════════════════════════
//  WagerPool 종합 테스트
// ════════════════════════════════════════════════════════════════

/// @title WagerPoolTest
/// @notice WagerPool 컨트랙트의 종합 단위·퍼즈·통합 테스트
/// @dev 모든 공개 함수, 커스텀 에러, 이벤트 발생을 검증한다
contract WagerPoolTest is Test {
    // ──────────────────────────────────────────────
    //  상수 및 상태 변수
    // ──────────────────────────────────────────────

    WagerPool public wagerPool;

    address public deployer = address(this);
    address public arenaManager = makeAddr("arenaManager");
    address public treasury = makeAddr("treasury");

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public dave = makeAddr("dave");
    address public eve = makeAddr("eve");
    address public stranger = makeAddr("stranger");

    uint256 public constant MATCH_ID = 1;
    uint256 public constant MATCH_ID_2 = 2;

    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 10 ether;
    uint256 public constant FEE_BPS = 500;
    uint256 public constant TREASURY_FEE_BPS = 300;
    uint256 public constant MANAGER_FEE_BPS = 200;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  setUp
    // ──────────────────────────────────────────────

    /// @notice 테스트 환경 초기화 — WagerPool 배포 및 참가자 ETH 지급
    function setUp() public {
        wagerPool = new WagerPool(arenaManager, treasury);

        // 각 참가자에게 충분한 ETH 지급
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(eve, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    // ──────────────────────────────────────────────
    //  헬퍼 함수
    // ──────────────────────────────────────────────

    /// @notice 특정 주소로 배팅을 실행하는 헬퍼
    /// @param bettor 배팅자 주소
    /// @param matchId 매치 ID
    /// @param side 배팅 방향
    /// @param amount 배팅 금액
    function _placeBetAs(address bettor, uint256 matchId, IWagerPool.Side side, uint256 amount) internal {
        vm.prank(bettor);
        wagerPool.placeBet{value: amount}(matchId, side);
    }

    /// @notice 배팅 잠금을 실행하는 헬퍼 (아레나 매니저로 실행)
    /// @param matchId 매치 ID
    function _lockBetsAs(uint256 matchId) internal {
        vm.prank(arenaManager);
        wagerPool.lockBets(matchId);
    }

    /// @notice 배팅 정산을 실행하는 헬퍼 (아레나 매니저로 실행)
    /// @param matchId 매치 ID
    /// @param winner 승리 방향
    function _settleBetsAs(uint256 matchId, IWagerPool.Side winner) internal {
        vm.prank(arenaManager);
        wagerPool.settleBets(matchId, winner);
    }

    /// @notice 매치 무효화를 실행하는 헬퍼 (아레나 매니저로 실행)
    /// @param matchId 매치 ID
    function _voidMatchAs(uint256 matchId) internal {
        vm.prank(arenaManager);
        wagerPool.voidMatch(matchId);
    }

    /// @notice 풀 오픈 (역할 매핑)을 실행하는 헬퍼 (아레나 매니저로 실행)
    /// @param matchId 매치 ID
    /// @param pacmanSide 팩맨 역할이 속한 사이드
    function _openPoolAs(uint256 matchId, IWagerPool.Side pacmanSide) internal {
        vm.prank(arenaManager);
        wagerPool.openPool(matchId, pacmanSide);
    }

    /// @notice 표준 시나리오 설정: 양쪽에 배팅 → 잠금 → 정산
    /// @dev alice가 AgentA에 1 ETH, bob이 AgentB에 2 ETH 배팅 후 AgentA 승리로 정산
    function _setupStandardSettledMatch() internal {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);
    }

    // ══════════════════════════════════════════════
    //  1. 생성자 (Constructor) 테스트
    // ══════════════════════════════════════════════

    /// @notice 정상 배포 — owner, arenaManager, treasury가 올바르게 설정되는지 확인
    function test_Constructor_Success() public view {
        assertEq(wagerPool.owner(), deployer, unicode"owner가 배포자여야 함");
        assertEq(wagerPool.arenaManager(), arenaManager, unicode"arenaManager 주소 불일치");
        assertEq(wagerPool.treasury(), treasury, unicode"treasury 주소 불일치");
    }

    /// @notice arenaManager가 제로 주소이면 ZeroAddress로 리버트
    function test_Constructor_RevertWhen_ZeroArenaManager() public {
        vm.expectRevert(WagerPool.ZeroAddress.selector);
        new WagerPool(address(0), treasury);
    }

    /// @notice treasury가 제로 주소이면 ZeroAddress로 리버트
    function test_Constructor_RevertWhen_ZeroTreasury() public {
        vm.expectRevert(WagerPool.ZeroAddress.selector);
        new WagerPool(arenaManager, address(0));
    }

    /// @notice 상수값이 올바르게 설정되었는지 확인
    function test_Constructor_ConstantsAreCorrect() public view {
        assertEq(wagerPool.MIN_BET(), MIN_BET, unicode"MIN_BET 불일치");
        assertEq(wagerPool.MAX_BET(), MAX_BET, unicode"MAX_BET 불일치");
        assertEq(wagerPool.FEE_BPS(), FEE_BPS, unicode"FEE_BPS 불일치");
        assertEq(wagerPool.TREASURY_FEE_BPS(), TREASURY_FEE_BPS, unicode"TREASURY_FEE_BPS 불일치");
        assertEq(wagerPool.MANAGER_FEE_BPS(), MANAGER_FEE_BPS, unicode"MANAGER_FEE_BPS 불일치");
    }

    // ══════════════════════════════════════════════
    //  2. placeBet 테스트
    // ══════════════════════════════════════════════

    /// @notice AgentA에 정상 배팅 — 풀 금액과 배팅 정보가 올바르게 업데이트되는지 확인
    function test_PlaceBet_AgentA_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 1 ether, unicode"AgentA 총액 불일치");
        assertEq(totalB, 0, unicode"AgentB 총액은 0이어야 함");

        (IWagerPool.Side side, uint256 amount, bool claimed) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(uint8(side), uint8(IWagerPool.Side.AgentA), unicode"배팅 방향 불일치");
        assertEq(amount, 1 ether, unicode"배팅 금액 불일치");
        assertFalse(claimed, unicode"claimed는 false여야 함");
    }

    /// @notice AgentB에 정상 배팅
    function test_PlaceBet_AgentB_Success() public {
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 0, unicode"AgentA 총액은 0이어야 함");
        assertEq(totalB, 2 ether, unicode"AgentB 총액 불일치");
    }

    /// @notice 최소 배팅 금액 미달 시 InvalidBetAmount로 리버트
    function test_PlaceBet_RevertWhen_BelowMinBet() public {
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, MIN_BET - 1);
    }

    /// @notice 최대 배팅 금액 초과 시 InvalidBetAmount로 리버트
    function test_PlaceBet_RevertWhen_AboveMaxBet() public {
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, MAX_BET + 1);
    }

    /// @notice 누적 배팅이 MAX_BET를 초과하면 InvalidBetAmount로 리버트
    function test_PlaceBet_RevertWhen_CumulativeExceedsMaxBet() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 6 ether);

        // 두 번째 배팅으로 누적 11 ETH → MAX_BET(10) 초과
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 5 ether);
    }

    /// @notice 같은 사이드에 추가 배팅 — 금액이 누적되는지 확인
    function test_PlaceBet_AdditionalBetSameSide_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 2 ether);

        (, uint256 amount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(amount, 3 ether, unicode"누적 배팅 금액이 3 ETH여야 함");

        (uint256 totalA,) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 3 ether, unicode"풀 AgentA 총액이 3 ETH여야 함");
    }

    /// @notice 다른 사이드로 전환 시도하면 CannotSwitchSide로 리버트
    function test_PlaceBet_RevertWhen_SwitchingSide() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.expectRevert(WagerPool.CannotSwitchSide.selector);
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentB, 1 ether);
    }

    /// @notice Open 상태가 아닌 풀에 배팅 시 BettingWindowClosed로 리버트
    function test_PlaceBet_RevertWhen_PoolLocked() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);

        vm.expectRevert(IWagerPool.BettingWindowClosed.selector);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 1 ether);
    }

    /// @notice 일시정지 상태에서 배팅 시 Pausable의 EnforcedPause로 리버트
    function test_PlaceBet_RevertWhen_Paused() public {
        wagerPool.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
    }

    /// @notice 배팅 시 BetPlaced 이벤트가 올바르게 발생하는지 확인
    function test_PlaceBet_EmitsBetPlacedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IWagerPool.BetPlaced(MATCH_ID, alice, IWagerPool.Side.AgentA, 1 ether);

        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
    }

    /// @notice 최소 금액 정확히 배팅 — 경계값 테스트
    function test_PlaceBet_ExactMinBet_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, MIN_BET);

        (, uint256 amount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(amount, MIN_BET, unicode"최소 배팅 금액으로 배팅 가능해야 함");
    }

    /// @notice 최대 금액 정확히 배팅 — 경계값 테스트
    function test_PlaceBet_ExactMaxBet_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, MAX_BET);

        (, uint256 amount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(amount, MAX_BET, unicode"최대 배팅 금액으로 배팅 가능해야 함");
    }

    /// @notice 여러 사용자가 동시에 배팅 — 각각의 배팅 정보가 독립적으로 유지되는지 확인
    function test_PlaceBet_MultipleBettors_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _placeBetAs(charlie, MATCH_ID, IWagerPool.Side.AgentA, 3 ether);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 4 ether, unicode"AgentA 총액 = alice(1) + charlie(3) = 4 ETH");
        assertEq(totalB, 2 ether, unicode"AgentB 총액 = bob(2) = 2 ETH");

        uint256 totalPool = wagerPool.getTotalPool(MATCH_ID);
        assertEq(totalPool, 6 ether, unicode"총 풀 = 6 ETH");
    }

    // ══════════════════════════════════════════════
    //  2-B. placeBetByRole 테스트
    // ══════════════════════════════════════════════

    /// @notice 역할 기반 배팅: PACMAN(role=0) → AgentA 정상 배팅 및 totalA 업데이트 확인
    function test_PlaceBetByRole_Pacman_Success() public {
        // 풀 오픈: 팩맨 = AgentA
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        vm.prank(alice);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 0);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 1 ether, unicode"PACMAN 배팅 → totalA 업데이트");
        assertEq(totalB, 0, unicode"totalB는 0이어야 함");

        (IWagerPool.Side side, uint256 amount, bool claimed) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(uint8(side), uint8(IWagerPool.Side.AgentA), unicode"PACMAN → AgentA 매핑");
        assertEq(amount, 1 ether, unicode"배팅 금액 1 ETH");
        assertFalse(claimed, unicode"claimed는 false");

        (,uint256 poolTotalA, uint256 poolTotalB,, uint256 pacmanSide, uint256 ghostSide,,) = wagerPool.pools(MATCH_ID);
        assertEq(pacmanSide, 1 ether, unicode"pacmanSide 업데이트");
        assertEq(ghostSide, 0, unicode"ghostSide는 0");
        assertEq(poolTotalA, 1 ether, unicode"pool.totalA 업데이트됨");
        assertEq(poolTotalB, 0, unicode"pool.totalB는 0");
    }

    /// @notice 역할 기반 배팅: GHOST(role=1) → AgentB 정상 배팅 및 totalB 업데이트 확인
    function test_PlaceBetByRole_Ghost_Success() public {
        // 풀 오픈: 팩맨 = AgentA → 고스트 = AgentB
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        vm.prank(bob);
        wagerPool.placeBetByRole{value: 2 ether}(MATCH_ID, 1);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 0, unicode"totalA는 0이어야 함");
        assertEq(totalB, 2 ether, unicode"GHOST 배팅 → totalB 업데이트");

        (IWagerPool.Side side, uint256 amount,) = wagerPool.getBet(MATCH_ID, bob);
        assertEq(uint8(side), uint8(IWagerPool.Side.AgentB), unicode"GHOST → AgentB 매핑");
        assertEq(amount, 2 ether, unicode"배팅 금액 2 ETH");

        (,uint256 poolTotalA, uint256 poolTotalB,, uint256 pacmanSide, uint256 ghostSide,,) = wagerPool.pools(MATCH_ID);
        assertEq(pacmanSide, 0, unicode"pacmanSide는 0");
        assertEq(ghostSide, 2 ether, unicode"ghostSide 업데이트");
        assertEq(poolTotalA, 0, unicode"pool.totalA는 0");
        assertEq(poolTotalB, 2 ether, unicode"pool.totalB 업데이트됨");
    }

    /// @notice 역할 기반 배팅 후 정산 및 배당금 수령 — totalA/totalB가 올바르게 반영되어 payout 계산 정확성 검증
    function test_PlaceBetByRole_SettlementAndPayout_Success() public {
        // 풀 오픈: 팩맨 = AgentA
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        // alice: PACMAN (AgentA) 1 ETH
        vm.prank(alice);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 0);

        // bob: GHOST (AgentB) 2 ETH
        vm.prank(bob);
        wagerPool.placeBetByRole{value: 2 ether}(MATCH_ID, 1);

        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        uint256 totalPool = 3 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 expectedPayout = (1 ether * distributablePool) / 1 ether; // alice는 유일한 승리자

        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);

        assertEq(
            alice.balance - aliceBalanceBefore,
            expectedPayout,
            unicode"역할 기반 배팅 후 배당금 계산 정확"
        );
    }

    /// @notice 역할 기반 배팅: 무효 role(>1) 시도 → InvalidBetAmount 리버트
    function test_PlaceBetByRole_RevertWhen_InvalidRole() public {
        // 풀 오픈: 팩맨 = AgentA
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        vm.prank(alice);
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 2);
    }

    /// @notice 역할 기반 배팅: 일반 배팅과 혼합 시나리오 — 동일 사이드면 누적 가능
    function test_PlaceBetByRole_MixedWithRegularBet_SameSide() public {
        // 풀 오픈: 팩맨 = AgentA
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        // alice: 일반 배팅 AgentA 1 ETH
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        // bob: 역할 기반 배팅 PACMAN (AgentA) 2 ETH
        vm.prank(bob);
        wagerPool.placeBetByRole{value: 2 ether}(MATCH_ID, 0);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 3 ether, unicode"일반 + 역할 배팅 totalA 합산");
        assertEq(totalB, 0, unicode"totalB는 0");

        (,uint256 poolTotalA,,,uint256 pacmanSide,,,) = wagerPool.pools(MATCH_ID);
        assertEq(poolTotalA, 3 ether, unicode"pool.totalA 합산");
        assertEq(pacmanSide, 2 ether, unicode"pacmanSide는 역할 배팅만 포함");
    }

    // ──────────────────────────────────────────────
    //  2-C. openPool 및 역할 역전 테스트
    // ──────────────────────────────────────────────

    /// @notice openPool 정상 호출 — roleAssigned가 true로 설정되고 이벤트 발생
    function test_OpenPool_Success() public {
        vm.expectEmit(true, false, false, true);
        emit IWagerPool.PoolOpened(MATCH_ID, IWagerPool.Side.AgentA);

        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        (,,,,,,IWagerPool.Side pacmanSideEnum, bool roleAssigned) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(pacmanSideEnum), uint8(IWagerPool.Side.AgentA), unicode"pacmanSideEnum이 AgentA여야 함");
        assertTrue(roleAssigned, unicode"roleAssigned가 true여야 함");
    }

    /// @notice openPool 중복 호출 시 InvalidPoolStatus로 리버트
    function test_OpenPool_RevertWhen_AlreadyAssigned() public {
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentA);

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.openPool(MATCH_ID, IWagerPool.Side.AgentB);
    }

    /// @notice openPool 아레나 매니저가 아닌 계정이 호출 시 Unauthorized로 리버트
    function test_OpenPool_RevertWhen_Unauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.openPool(MATCH_ID, IWagerPool.Side.AgentA);
    }

    /// @notice openPool이 호출되지 않은 상태에서 placeBetByRole 호출 시 InvalidPoolStatus로 리버트
    function test_PlaceBetByRole_RevertWhen_RoleNotAssigned() public {
        vm.prank(alice);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 0);
    }

    /// @notice 팩맨이 AgentB인 경우 — PACMAN(role=0) 배팅이 AgentB에 매핑되는지 확인
    function test_PlaceBetByRole_PacmanIsAgentB() public {
        // 풀 오픈: 팩맨 = AgentB
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentB);

        // alice: PACMAN(role=0) 배팅 → AgentB에 매핑되어야 함
        vm.prank(alice);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 0);

        (IWagerPool.Side side, uint256 amount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(uint8(side), uint8(IWagerPool.Side.AgentB), unicode"PACMAN 배팅이 AgentB에 매핑되어야 함");
        assertEq(amount, 1 ether, unicode"배팅 금액 1 ETH");

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 0, unicode"totalA는 0이어야 함");
        assertEq(totalB, 1 ether, unicode"totalB에 1 ETH 반영");

        // bob: GHOST(role=1) 배팅 → 팩맨의 반대 = AgentA에 매핑
        vm.prank(bob);
        wagerPool.placeBetByRole{value: 2 ether}(MATCH_ID, 1);

        (IWagerPool.Side bobSide,,) = wagerPool.getBet(MATCH_ID, bob);
        assertEq(uint8(bobSide), uint8(IWagerPool.Side.AgentA), unicode"GHOST 배팅이 AgentA에 매핑되어야 함");

        (totalA, totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 2 ether, unicode"totalA에 2 ETH 반영");
        assertEq(totalB, 1 ether, unicode"totalB에 1 ETH 유지");
    }

    /// @notice 팩맨이 AgentB인 경우 전체 정산 플로우 — 역할 역전 시 배당금 계산 정확성 검증
    function test_PlaceBetByRole_SettlementCorrect_WhenPacmanIsAgentB() public {
        // 풀 오픈: 팩맨 = AgentB (역전된 매핑)
        _openPoolAs(MATCH_ID, IWagerPool.Side.AgentB);

        // alice: PACMAN(role=0) → AgentB에 1 ETH
        vm.prank(alice);
        wagerPool.placeBetByRole{value: 1 ether}(MATCH_ID, 0);

        // bob: GHOST(role=1) → AgentA에 2 ETH
        vm.prank(bob);
        wagerPool.placeBetByRole{value: 2 ether}(MATCH_ID, 1);

        _lockBetsAs(MATCH_ID);

        // AgentB 승리 = 팩맨(alice) 승리
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentB);

        uint256 totalPool = 3 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        // alice는 유일한 AgentB 배팅자 → distributablePool 전액 수령
        uint256 expectedPayout = (1 ether * distributablePool) / 1 ether;

        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);

        assertEq(
            alice.balance - aliceBalanceBefore,
            expectedPayout,
            unicode"역전 매핑 시 PACMAN 승리 배당금 정확"
        );

        // bob(GHOST=AgentA)은 패배 → 수령 불가
        vm.prank(bob);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(MATCH_ID);
    }

    // ══════════════════════════════════════════════
    //  3. lockBets 테스트
    // ══════════════════════════════════════════════

    /// @notice 정상 잠금 — 풀 상태가 Locked로 변경되고 이벤트 발생
    function test_LockBets_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);

        vm.expectEmit(true, false, false, true);
        emit IWagerPool.BetsLocked(MATCH_ID, 3 ether);

        _lockBetsAs(MATCH_ID);

        (IWagerPool.PoolStatus status,,,,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Locked), unicode"풀 상태가 Locked여야 함");
    }

    /// @notice Open 상태가 아닌 풀 잠금 시 InvalidPoolStatus로 리버트
    function test_LockBets_RevertWhen_AlreadyLocked() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.lockBets(MATCH_ID);
    }

    /// @notice 아레나 매니저가 아닌 계정이 잠금 시도하면 Unauthorized로 리버트
    function test_LockBets_RevertWhen_Unauthorized() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.lockBets(MATCH_ID);
    }

    /// @notice 배팅 없이 빈 풀 잠금 — 총 풀 0으로 이벤트 발생
    function test_LockBets_EmptyPool_Success() public {
        vm.expectEmit(true, false, false, true);
        emit IWagerPool.BetsLocked(MATCH_ID, 0);

        _lockBetsAs(MATCH_ID);

        (IWagerPool.PoolStatus status,,,,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Locked), unicode"빈 풀도 잠금 가능해야 함");
    }

    // ══════════════════════════════════════════════
    //  4. settleBets 테스트
    // ══════════════════════════════════════════════

    /// @notice 정상 정산 — 풀 상태가 Settled로 변경되고 수수료가 누적됨
    function test_SettleBets_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _lockBetsAs(MATCH_ID);

        uint256 totalPool = 3 ether;
        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR;

        vm.expectEmit(true, false, false, true);
        emit IWagerPool.BetsSettled(MATCH_ID, IWagerPool.Side.AgentA, totalPool);

        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        (IWagerPool.PoolStatus status,,, IWagerPool.Side winningSide,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Settled), unicode"풀 상태가 Settled여야 함");
        assertEq(uint8(winningSide), uint8(IWagerPool.Side.AgentA), unicode"승리 사이드가 AgentA여야 함");

        assertEq(
            wagerPool.accumulatedTreasuryFees(), expectedTreasuryFee, unicode"재무부 수수료 누적 불일치"
        );
        assertEq(wagerPool.accumulatedManagerFees(), expectedManagerFee, unicode"매니저 수수료 누적 불일치");
    }

    /// @notice Locked 상태가 아닌 풀 정산 시 InvalidPoolStatus로 리버트 (Open 상태)
    function test_SettleBets_RevertWhen_PoolIsOpen() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.settleBets(MATCH_ID, IWagerPool.Side.AgentA);
    }

    /// @notice 이미 정산된 풀 재정산 시 AlreadySettled로 리버트
    function test_SettleBets_RevertWhen_AlreadySettled() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        vm.prank(arenaManager);
        vm.expectRevert(IWagerPool.AlreadySettled.selector);
        wagerPool.settleBets(MATCH_ID, IWagerPool.Side.AgentB);
    }

    /// @notice 아레나 매니저가 아닌 계정이 정산 시도하면 Unauthorized로 리버트
    function test_SettleBets_RevertWhen_Unauthorized() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.settleBets(MATCH_ID, IWagerPool.Side.AgentA);
    }

    /// @notice 승리 사이드에 배팅자가 없으면 수수료가 누적되지 않음
    function test_SettleBets_NoWinningSideBets_NoFeesAccumulated() public {
        // AgentA에만 배팅하고 AgentB를 승리로 정산 → 승리 사이드 총액 0
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentB);

        assertEq(wagerPool.accumulatedTreasuryFees(), 0, unicode"재무부 수수료 0이어야 함");
        assertEq(wagerPool.accumulatedManagerFees(), 0, unicode"매니저 수수료 0이어야 함");
    }

    /// @notice Refunded 상태에서 정산 시도 — InvalidPoolStatus 리버트
    function test_SettleBets_RevertWhen_PoolIsRefunded() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _voidMatchAs(MATCH_ID);

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.settleBets(MATCH_ID, IWagerPool.Side.AgentA);
    }

    // ══════════════════════════════════════════════
    //  5. claimWinnings 테스트
    // ══════════════════════════════════════════════

    /// @notice 승리 사이드 배팅자의 정상 배당금 수령 — 비례 배당 계산 검증
    function test_ClaimWinnings_WinningSide_Success() public {
        // alice: AgentA 1 ETH, bob: AgentB 2 ETH → AgentA 승리
        _setupStandardSettledMatch();

        uint256 totalPool = 3 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        // alice의 배당금 = (1 ETH / 1 ETH) * distributablePool = distributablePool
        uint256 expectedPayout = (1 ether * distributablePool) / 1 ether;

        uint256 aliceBalanceBefore = alice.balance;

        vm.expectEmit(true, true, false, true);
        emit IWagerPool.WinningsClaimed(MATCH_ID, alice, expectedPayout);

        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);

        uint256 aliceBalanceAfter = alice.balance;
        assertEq(
            aliceBalanceAfter - aliceBalanceBefore,
            expectedPayout,
            unicode"alice 배당금이 distributablePool과 동일해야 함"
        );

        // claimed 플래그 확인
        (,, bool claimed) = wagerPool.getBet(MATCH_ID, alice);
        assertTrue(claimed, unicode"claimed가 true여야 함");
    }

    /// @notice 패배 사이드 배팅자가 수령 시도하면 NotOnWinningSide로 리버트
    function test_ClaimWinnings_RevertWhen_LosingSide() public {
        _setupStandardSettledMatch();

        vm.prank(bob);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(MATCH_ID);
    }

    /// @notice 배팅 기록 없는 사용자가 수령 시도하면 NoBetFound로 리버트
    function test_ClaimWinnings_RevertWhen_NoBetFound() public {
        _setupStandardSettledMatch();

        vm.prank(charlie);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.claimWinnings(MATCH_ID);
    }

    /// @notice 이미 수령한 사용자가 재수령 시도하면 AlreadyClaimed로 리버트
    function test_ClaimWinnings_RevertWhen_AlreadyClaimed() public {
        _setupStandardSettledMatch();

        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);

        vm.prank(alice);
        vm.expectRevert(WagerPool.AlreadyClaimed.selector);
        wagerPool.claimWinnings(MATCH_ID);
    }

    /// @notice Settled 상태가 아닌 풀에서 수령 시도 — InvalidPoolStatus 리버트
    function test_ClaimWinnings_RevertWhen_NotSettled() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);

        vm.prank(alice);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.claimWinnings(MATCH_ID);
    }

    /// @notice 승리 사이드에 배팅자가 없으면 전원 원금 환불 (수수료 없음)
    function test_ClaimWinnings_NoWinningSideBets_RefundsAll() public {
        // AgentA에만 배팅 → AgentB 승리 → 승리 사이드 총액 0
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentA, 2 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentB);

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;

        // alice 환불
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(alice.balance - aliceBalanceBefore, 1 ether, unicode"alice 원금 1 ETH 환불");

        // bob 환불
        vm.prank(bob);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(bob.balance - bobBalanceBefore, 2 ether, unicode"bob 원금 2 ETH 환불");
    }

    /// @notice 여러 승리자의 비례 배당 계산 검증
    function test_ClaimWinnings_MultipleWinners_ProportionalPayout() public {
        // alice: AgentA 1 ETH, charlie: AgentA 3 ETH, bob: AgentB 4 ETH → AgentA 승리
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(charlie, MATCH_ID, IWagerPool.Side.AgentA, 3 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 4 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        uint256 totalPool = 8 ether;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 winningSideTotal = 4 ether; // AgentA: alice(1) + charlie(3)

        uint256 expectedAlicePayout = (1 ether * distributablePool) / winningSideTotal;
        uint256 expectedCharliePayout = (3 ether * distributablePool) / winningSideTotal;

        // alice 수령
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(alice.balance - aliceBefore, expectedAlicePayout, unicode"alice 비례 배당 불일치");

        // charlie 수령
        uint256 charlieBefore = charlie.balance;
        vm.prank(charlie);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(charlie.balance - charlieBefore, expectedCharliePayout, unicode"charlie 비례 배당 불일치");
    }

    /// @notice 재진입 공격 방지 — ReentrancyGuard에 의해 차단
    function test_ClaimWinnings_RevertWhen_ReentrancyAttack() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(wagerPool));
        vm.deal(address(attacker), 100 ether);

        // 공격자가 배팅
        attacker.placeBet{value: 1 ether}(MATCH_ID, IWagerPool.Side.AgentA);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        // 재진입 공격 시도 — ReentrancyGuardReentrantCall로 리버트 예상
        vm.expectRevert();
        attacker.attack();
    }

    // ══════════════════════════════════════════════
    //  6. voidMatch 테스트
    // ══════════════════════════════════════════════

    /// @notice Open 상태에서 매치 무효화 성공
    function test_VoidMatch_FromOpen_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.expectEmit(true, false, false, false);
        emit WagerPool.MatchVoided(MATCH_ID);

        _voidMatchAs(MATCH_ID);

        (IWagerPool.PoolStatus status,,,,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Refunded), unicode"풀 상태가 Refunded여야 함");
    }

    /// @notice Locked 상태에서 매치 무효화 성공
    function test_VoidMatch_FromLocked_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _lockBetsAs(MATCH_ID);

        _voidMatchAs(MATCH_ID);

        (IWagerPool.PoolStatus status,,,,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Refunded), unicode"Locked에서 무효화 가능해야 함");
    }

    /// @notice Settled 상태에서 매치 무효화 시 InvalidPoolStatus로 리버트
    function test_VoidMatch_RevertWhen_PoolIsSettled() public {
        _setupStandardSettledMatch();

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.voidMatch(MATCH_ID);
    }

    /// @notice Refunded 상태에서 매치 무효화 시 InvalidPoolStatus로 리버트
    function test_VoidMatch_RevertWhen_PoolIsRefunded() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _voidMatchAs(MATCH_ID);

        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.voidMatch(MATCH_ID);
    }

    /// @notice 아레나 매니저가 아닌 계정이 무효화 시도하면 Unauthorized로 리버트
    function test_VoidMatch_RevertWhen_Unauthorized() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.voidMatch(MATCH_ID);
    }

    // ══════════════════════════════════════════════
    //  7. refund 테스트
    // ══════════════════════════════════════════════

    /// @notice 매치 무효화 후 정상 환불 — 원금이 정확히 돌아오는지 확인
    function test_Refund_Success() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _voidMatchAs(MATCH_ID);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.expectEmit(true, true, false, true);
        emit IWagerPool.WinningsClaimed(MATCH_ID, alice, 1 ether);

        vm.prank(alice);
        wagerPool.refund(MATCH_ID);
        assertEq(alice.balance - aliceBefore, 1 ether, unicode"alice 환불 1 ETH");

        vm.prank(bob);
        wagerPool.refund(MATCH_ID);
        assertEq(bob.balance - bobBefore, 2 ether, unicode"bob 환불 2 ETH");
    }

    /// @notice Refunded 상태가 아닌 풀에서 환불 시도 — InvalidPoolStatus 리버트
    function test_Refund_RevertWhen_NotRefundedStatus() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        vm.prank(alice);
        vm.expectRevert(WagerPool.InvalidPoolStatus.selector);
        wagerPool.refund(MATCH_ID);
    }

    /// @notice 배팅 기록 없는 사용자가 환불 시도 — NoBetFound 리버트
    function test_Refund_RevertWhen_NoBetFound() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _voidMatchAs(MATCH_ID);

        vm.prank(charlie);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.refund(MATCH_ID);
    }

    /// @notice 이미 환불받은 사용자가 재환불 시도 — AlreadyClaimed 리버트
    function test_Refund_RevertWhen_AlreadyClaimed() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _voidMatchAs(MATCH_ID);

        vm.prank(alice);
        wagerPool.refund(MATCH_ID);

        vm.prank(alice);
        vm.expectRevert(WagerPool.AlreadyClaimed.selector);
        wagerPool.refund(MATCH_ID);
    }

    /// @notice 환불 시 재진입 공격 방지
    function test_Refund_RevertWhen_ReentrancyAttack() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(wagerPool));
        vm.deal(address(attacker), 100 ether);

        attacker.placeBet{value: 1 ether}(MATCH_ID, IWagerPool.Side.AgentA);
        _voidMatchAs(MATCH_ID);

        vm.expectRevert();
        attacker.attackRefund();
    }

    // ══════════════════════════════════════════════
    //  8. withdrawFees 테스트
    // ══════════════════════════════════════════════

    /// @notice 정산 후 수수료 출금 — 재무부와 매니저에게 올바르게 분배되는지 확인
    function test_WithdrawFees_Success() public {
        _setupStandardSettledMatch();

        uint256 totalPool = 3 ether;
        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR;

        uint256 treasuryBefore = treasury.balance;
        uint256 managerBefore = arenaManager.balance;

        vm.expectEmit(true, false, true, true);
        emit WagerPool.FeesWithdrawn(treasury, expectedTreasuryFee, arenaManager, expectedManagerFee);

        wagerPool.withdrawFees();

        assertEq(treasury.balance - treasuryBefore, expectedTreasuryFee, unicode"재무부 수수료 수령 불일치");
        assertEq(
            arenaManager.balance - managerBefore, expectedManagerFee, unicode"매니저 수수료 수령 불일치"
        );

        // 누적 수수료가 0으로 초기화되었는지 확인
        assertEq(wagerPool.accumulatedTreasuryFees(), 0, unicode"재무부 수수료 잔액 0이어야 함");
        assertEq(wagerPool.accumulatedManagerFees(), 0, unicode"매니저 수수료 잔액 0이어야 함");
    }

    /// @notice 수수료 없을 때 출금 시도 — NoFeesToWithdraw 리버트
    function test_WithdrawFees_RevertWhen_NoFees() public {
        vm.expectRevert(WagerPool.NoFeesToWithdraw.selector);
        wagerPool.withdrawFees();
    }

    /// @notice 소유자가 아닌 계정이 출금 시도 — Unauthorized 리버트
    function test_WithdrawFees_RevertWhen_Unauthorized() public {
        _setupStandardSettledMatch();

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.withdrawFees();
    }

    /// @notice 여러 매치에서 수수료 누적 후 일괄 출금
    function test_WithdrawFees_MultipleMatches_AccumulatedFees() public {
        // 매치 1 정산
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        // 매치 2 정산
        _placeBetAs(charlie, MATCH_ID_2, IWagerPool.Side.AgentA, 3 ether);
        _placeBetAs(dave, MATCH_ID_2, IWagerPool.Side.AgentB, 5 ether);
        vm.prank(arenaManager);
        wagerPool.lockBets(MATCH_ID_2);
        vm.prank(arenaManager);
        wagerPool.settleBets(MATCH_ID_2, IWagerPool.Side.AgentB);

        uint256 totalPool1 = 3 ether;
        uint256 totalPool2 = 8 ether;
        uint256 expectedTreasuryFee =
            (totalPool1 * TREASURY_FEE_BPS) / BPS_DENOMINATOR + (totalPool2 * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        uint256 expectedManagerFee =
            (totalPool1 * MANAGER_FEE_BPS) / BPS_DENOMINATOR + (totalPool2 * MANAGER_FEE_BPS) / BPS_DENOMINATOR;

        uint256 treasuryBefore = treasury.balance;
        uint256 managerBefore = arenaManager.balance;

        wagerPool.withdrawFees();

        assertEq(
            treasury.balance - treasuryBefore, expectedTreasuryFee, unicode"복수 매치 재무부 수수료 합산"
        );
        assertEq(
            arenaManager.balance - managerBefore, expectedManagerFee, unicode"복수 매치 매니저 수수료 합산"
        );
    }

    // ══════════════════════════════════════════════
    //  9. 관리 함수 (pause / unpause / set*) 테스트
    // ══════════════════════════════════════════════

    /// @notice pause → unpause 정상 동작
    function test_PauseUnpause_Success() public {
        wagerPool.pause();

        // 일시정지 상태에서 배팅 불가
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        wagerPool.unpause();

        // 재개 후 배팅 가능
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        (, uint256 amount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(amount, 1 ether, unicode"unpause 후 배팅 가능해야 함");
    }

    /// @notice 소유자가 아닌 계정이 pause 시도 — Unauthorized 리버트
    function test_Pause_RevertWhen_Unauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.pause();
    }

    /// @notice 소유자가 아닌 계정이 unpause 시도 — Unauthorized 리버트
    function test_Unpause_RevertWhen_Unauthorized() public {
        wagerPool.pause();

        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.unpause();
    }

    /// @notice arenaManager 주소 변경 성공
    function test_SetArenaManager_Success() public {
        address newManager = makeAddr("newManager");
        wagerPool.setArenaManager(newManager);
        assertEq(wagerPool.arenaManager(), newManager, unicode"arenaManager 변경 불일치");
    }

    /// @notice arenaManager를 제로 주소로 변경 시 ZeroAddress 리버트
    function test_SetArenaManager_RevertWhen_ZeroAddress() public {
        vm.expectRevert(WagerPool.ZeroAddress.selector);
        wagerPool.setArenaManager(address(0));
    }

    /// @notice 소유자가 아닌 계정이 arenaManager 변경 시도 — Unauthorized 리버트
    function test_SetArenaManager_RevertWhen_Unauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.setArenaManager(makeAddr("newManager"));
    }

    /// @notice treasury 주소 변경 성공
    function test_SetTreasury_Success() public {
        address newTreasury = makeAddr("newTreasury");
        wagerPool.setTreasury(newTreasury);
        assertEq(wagerPool.treasury(), newTreasury, unicode"treasury 변경 불일치");
    }

    /// @notice treasury를 제로 주소로 변경 시 ZeroAddress 리버트
    function test_SetTreasury_RevertWhen_ZeroAddress() public {
        vm.expectRevert(WagerPool.ZeroAddress.selector);
        wagerPool.setTreasury(address(0));
    }

    /// @notice 소유자가 아닌 계정이 treasury 변경 시도 — Unauthorized 리버트
    function test_SetTreasury_RevertWhen_Unauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.setTreasury(makeAddr("newTreasury"));
    }

    // ══════════════════════════════════════════════
    //  10. 뷰 함수 테스트
    // ══════════════════════════════════════════════

    /// @notice getTotalPool — 양쪽 배팅 합산이 올바른지 확인
    function test_GetTotalPool() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);

        uint256 totalPool = wagerPool.getTotalPool(MATCH_ID);
        assertEq(totalPool, 3 ether, unicode"총 풀 3 ETH");
    }

    /// @notice getPoolAmounts — 각 사이드별 금액이 올바른지 확인
    function test_GetPoolAmounts() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 1 ether, unicode"AgentA 총액 1 ETH");
        assertEq(totalB, 2 ether, unicode"AgentB 총액 2 ETH");
    }

    /// @notice getBet — 배팅 정보가 올바른지 확인
    function test_GetBet() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentB, 5 ether);

        (IWagerPool.Side side, uint256 amount, bool claimed) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(uint8(side), uint8(IWagerPool.Side.AgentB), unicode"배팅 방향 AgentB");
        assertEq(amount, 5 ether, unicode"배팅 금액 5 ETH");
        assertFalse(claimed, unicode"미수령 상태");
    }

    /// @notice 빈 매치에 대한 뷰 함수 호출 — 기본값 반환
    function test_ViewFunctions_EmptyMatch_DefaultValues() public view {
        uint256 totalPool = wagerPool.getTotalPool(999);
        assertEq(totalPool, 0, unicode"빈 매치 총 풀 0");

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(999);
        assertEq(totalA, 0, unicode"빈 매치 AgentA 0");
        assertEq(totalB, 0, unicode"빈 매치 AgentB 0");

        (IWagerPool.Side side, uint256 amount, bool claimed) = wagerPool.getBet(999, alice);
        assertEq(uint8(side), 0, unicode"기본 side는 AgentA(0)");
        assertEq(amount, 0, unicode"기본 amount 0");
        assertFalse(claimed, unicode"기본 claimed false");
    }

    // ══════════════════════════════════════════════
    //  11. 퍼즈 테스트 (Fuzz Tests)
    // ══════════════════════════════════════════════

    /// @notice 퍼즈: 유효 범위 내 금액으로 배팅 — 항상 성공해야 함
    /// @param amount MIN_BET ~ MAX_BET 사이의 임의 금액
    function testFuzz_PlaceBet(uint256 amount) public {
        amount = bound(amount, MIN_BET, MAX_BET);

        vm.deal(alice, amount);
        vm.prank(alice);
        wagerPool.placeBet{value: amount}(MATCH_ID, IWagerPool.Side.AgentA);

        (, uint256 betAmount,) = wagerPool.getBet(MATCH_ID, alice);
        assertEq(betAmount, amount, unicode"퍼즈: 배팅 금액이 정확해야 함");

        (uint256 totalA,) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, amount, unicode"퍼즈: 풀 금액이 정확해야 함");
    }

    /// @notice 퍼즈: 다양한 배팅 비율에서 배당금 계산 정확성 검증
    /// @dev 양쪽에 배팅 후 정산, 승리 사이드 배당금이 수학적으로 정확한지 확인
    /// @param betA AgentA 배팅 금액
    /// @param betB AgentB 배팅 금액
    function testFuzz_PayoutCalculation(uint256 betA, uint256 betB) public {
        betA = bound(betA, MIN_BET, MAX_BET);
        betB = bound(betB, MIN_BET, MAX_BET);

        vm.deal(alice, betA);
        vm.deal(bob, betB);

        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, betA);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, betB);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        uint256 totalPool = betA + betB;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 expectedPayout = (betA * distributablePool) / betA; // alice가 유일한 승리자

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        uint256 actualPayout = alice.balance - aliceBefore;

        assertEq(actualPayout, expectedPayout, unicode"퍼즈: 배당금이 distributablePool과 동일해야 함");
        assertEq(actualPayout, distributablePool, unicode"퍼즈: 유일 승리자는 distributablePool 전액 수령");
    }

    /// @notice 퍼즈: 무효 범위 금액으로 배팅 시 반드시 리버트
    /// @param amount 0 ~ MIN_BET-1 또는 MAX_BET+1 이상의 임의 금액
    function testFuzz_PlaceBet_InvalidAmount(uint256 amount) public {
        // MIN_BET 미만 또는 MAX_BET 초과 범위만 테스트
        vm.assume(amount < MIN_BET || amount > MAX_BET);
        // 극단적으로 큰 값은 deal 실패 방지
        amount = bound(amount, 0, 1000 ether);
        vm.assume(amount < MIN_BET || amount > MAX_BET);

        vm.deal(alice, amount);
        vm.prank(alice);
        vm.expectRevert(IWagerPool.InvalidBetAmount.selector);
        wagerPool.placeBet{value: amount}(MATCH_ID, IWagerPool.Side.AgentA);
    }

    /// @notice 퍼즈: 복수 승리자 비례 배당 — 총 배당금이 distributablePool 이하
    /// @param betA1 alice의 AgentA 배팅 금액
    /// @param betA2 charlie의 AgentA 배팅 금액
    /// @param betB bob의 AgentB 배팅 금액
    function testFuzz_MultipleWinnersPayout(uint256 betA1, uint256 betA2, uint256 betB) public {
        betA1 = bound(betA1, MIN_BET, MAX_BET);
        betA2 = bound(betA2, MIN_BET, MAX_BET);
        betB = bound(betB, MIN_BET, MAX_BET);

        vm.deal(alice, betA1);
        vm.deal(charlie, betA2);
        vm.deal(bob, betB);

        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, betA1);
        _placeBetAs(charlie, MATCH_ID, IWagerPool.Side.AgentA, betA2);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, betB);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        uint256 totalPool = betA1 + betA2 + betB;
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        uint256 winningSideTotal = betA1 + betA2;

        uint256 expectedAlice = (betA1 * distributablePool) / winningSideTotal;
        uint256 expectedCharlie = (betA2 * distributablePool) / winningSideTotal;

        // alice 수령
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(alice.balance - aliceBefore, expectedAlice, unicode"퍼즈: alice 배당금 불일치");

        // charlie 수령
        uint256 charlieBefore = charlie.balance;
        vm.prank(charlie);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(charlie.balance - charlieBefore, expectedCharlie, unicode"퍼즈: charlie 배당금 불일치");

        // 총 배당금이 distributablePool 이하 (반올림 손실 가능)
        uint256 totalPaid = expectedAlice + expectedCharlie;
        assertLe(totalPaid, distributablePool, unicode"퍼즈: 총 배당금이 distributablePool 초과 불가");
    }

    // ══════════════════════════════════════════════
    //  12. 통합 테스트 (Integration Tests)
    // ══════════════════════════════════════════════

    /// @notice 전체 수명주기 테스트: 복수 배팅 → 잠금 → 정산 → 배당 수령 → 수수료 출금
    /// @dev 모든 금액의 정합성을 단계별로 검증한다
    function test_Integration_FullLifecycle() public {
        // ── 1단계: 배팅 배치 ──
        // alice: AgentA 2 ETH
        // bob: AgentB 3 ETH
        // charlie: AgentA 1 ETH
        // dave: AgentB 4 ETH
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 2 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 3 ether);
        _placeBetAs(charlie, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(dave, MATCH_ID, IWagerPool.Side.AgentB, 4 ether);

        // 풀 상태 확인
        uint256 totalPool = wagerPool.getTotalPool(MATCH_ID);
        assertEq(totalPool, 10 ether, unicode"통합: 총 풀 10 ETH");

        (uint256 totalA, uint256 totalB) = wagerPool.getPoolAmounts(MATCH_ID);
        assertEq(totalA, 3 ether, unicode"통합: AgentA 총 3 ETH");
        assertEq(totalB, 7 ether, unicode"통합: AgentB 총 7 ETH");

        // ── 2단계: 배팅 잠금 ──
        _lockBetsAs(MATCH_ID);

        // 잠금 후 배팅 불가 확인
        vm.expectRevert(IWagerPool.BettingWindowClosed.selector);
        _placeBetAs(eve, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        // ── 3단계: AgentA 승리로 정산 ──
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        uint256 expectedTreasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR; // 0.3 ETH
        uint256 expectedManagerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR; // 0.2 ETH
        uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR; // 9.5 ETH

        assertEq(wagerPool.accumulatedTreasuryFees(), expectedTreasuryFee, unicode"통합: 재무부 수수료 0.3 ETH");
        assertEq(wagerPool.accumulatedManagerFees(), expectedManagerFee, unicode"통합: 매니저 수수료 0.2 ETH");

        // ── 4단계: 승리자 배당금 수령 ──
        uint256 winningSideTotal = totalA; // 3 ETH

        // alice: (2/3) * 9.5 ETH
        uint256 aliceExpected = (2 ether * distributablePool) / winningSideTotal;
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(alice.balance - aliceBefore, aliceExpected, unicode"통합: alice 배당금");

        // charlie: (1/3) * 9.5 ETH
        uint256 charlieExpected = (1 ether * distributablePool) / winningSideTotal;
        uint256 charlieBefore = charlie.balance;
        vm.prank(charlie);
        wagerPool.claimWinnings(MATCH_ID);
        assertEq(charlie.balance - charlieBefore, charlieExpected, unicode"통합: charlie 배당금");

        // 패배자 수령 불가 확인
        vm.prank(bob);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(MATCH_ID);

        vm.prank(dave);
        vm.expectRevert(WagerPool.NotOnWinningSide.selector);
        wagerPool.claimWinnings(MATCH_ID);

        // ── 5단계: 수수료 출금 ──
        uint256 treasuryBefore = treasury.balance;
        uint256 managerBefore = arenaManager.balance;

        wagerPool.withdrawFees();

        assertEq(treasury.balance - treasuryBefore, expectedTreasuryFee, unicode"통합: 재무부 수수료 수령");
        assertEq(arenaManager.balance - managerBefore, expectedManagerFee, unicode"통합: 매니저 수수료 수령");

        // ── 6단계: 컨트랙트 잔액 정합성 검증 ──
        // 반올림 손실로 약간의 먼지(dust)가 남을 수 있음
        uint256 contractBalance = address(wagerPool).balance;
        uint256 totalPaidOut = aliceExpected + charlieExpected + expectedTreasuryFee + expectedManagerFee;
        uint256 dust = totalPool - totalPaidOut;
        assertEq(contractBalance, dust, unicode"통합: 컨트랙트 잔여 = 반올림 먼지");
        // 먼지가 1 gwei 미만이어야 정상
        assertLt(dust, 1 gwei, unicode"통합: 반올림 먼지가 1 gwei 미만이어야 함");
    }

    /// @notice 매치 무효화 수명주기 테스트: 배팅 → 무효화 → 전원 환불
    function test_Integration_VoidMatchLifecycle() public {
        // 배팅 배치
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 2 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 3 ether);
        _placeBetAs(charlie, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 charlieBefore = charlie.balance;

        // 매치 무효화
        _voidMatchAs(MATCH_ID);

        // 전원 환불
        vm.prank(alice);
        wagerPool.refund(MATCH_ID);
        assertEq(alice.balance - aliceBefore, 2 ether, unicode"무효화: alice 환불 2 ETH");

        vm.prank(bob);
        wagerPool.refund(MATCH_ID);
        assertEq(bob.balance - bobBefore, 3 ether, unicode"무효화: bob 환불 3 ETH");

        vm.prank(charlie);
        wagerPool.refund(MATCH_ID);
        assertEq(charlie.balance - charlieBefore, 1 ether, unicode"무효화: charlie 환불 1 ETH");

        // 컨트랙트 잔액 0 확인
        assertEq(address(wagerPool).balance, 0, unicode"무효화: 컨트랙트 잔액 0");
    }

    /// @notice 복수 매치 독립성 테스트 — 서로 다른 매치가 간섭하지 않는지 확인
    function test_Integration_MultipleMatchesIndependence() public {
        // 매치 1: AgentA 승리
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 1 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        // 매치 2: 무효화
        _placeBetAs(charlie, MATCH_ID_2, IWagerPool.Side.AgentA, 2 ether);
        _placeBetAs(dave, MATCH_ID_2, IWagerPool.Side.AgentB, 2 ether);
        _voidMatchAs(MATCH_ID_2);

        // 매치 1: alice 배당 수령
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.claimWinnings(MATCH_ID);
        assertGt(alice.balance, aliceBefore, unicode"매치1: alice 배당 수령 성공");

        // 매치 2: charlie, dave 환불
        uint256 charlieBefore = charlie.balance;
        vm.prank(charlie);
        wagerPool.refund(MATCH_ID_2);
        assertEq(charlie.balance - charlieBefore, 2 ether, unicode"매치2: charlie 환불 2 ETH");

        uint256 daveBefore = dave.balance;
        vm.prank(dave);
        wagerPool.refund(MATCH_ID_2);
        assertEq(dave.balance - daveBefore, 2 ether, unicode"매치2: dave 환불 2 ETH");

        // 교차 간섭 없는지 확인: 매치1에서 charlie 수령 시도 → NoBetFound
        vm.prank(charlie);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.claimWinnings(MATCH_ID);

        // 교차 간섭 없는지 확인: 매치2에서 alice 환불 시도 → NoBetFound
        vm.prank(alice);
        vm.expectRevert(WagerPool.NoBetFound.selector);
        wagerPool.refund(MATCH_ID_2);
    }

    /// @notice Locked 상태에서 무효화 후 환불 — 잠금 이후에도 무효화 가능 확인
    function test_Integration_VoidAfterLock_Refund() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 5 ether);
        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 3 ether);
        _lockBetsAs(MATCH_ID);

        // Locked 상태에서 무효화
        _voidMatchAs(MATCH_ID);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        wagerPool.refund(MATCH_ID);
        assertEq(alice.balance - aliceBefore, 5 ether, unicode"잠금후무효화: alice 환불 5 ETH");

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        wagerPool.refund(MATCH_ID);
        assertEq(bob.balance - bobBefore, 3 ether, unicode"잠금후무효화: bob 환불 3 ETH");
    }

    /// @notice ETH 수신 거부 컨트랙트에 대한 TransferFailed 테스트 (claimWinnings)
    function test_ClaimWinnings_RevertWhen_TransferFailed() public {
        ETHRejecter rejecter = new ETHRejecter(address(wagerPool));
        vm.deal(address(rejecter), 100 ether);

        // rejecter가 배팅
        vm.prank(address(rejecter));
        wagerPool.placeBet{value: 1 ether}(MATCH_ID, IWagerPool.Side.AgentA);

        _placeBetAs(bob, MATCH_ID, IWagerPool.Side.AgentB, 2 ether);
        _lockBetsAs(MATCH_ID);
        _settleBetsAs(MATCH_ID, IWagerPool.Side.AgentA);

        // ETH 수신 거부 → TransferFailed
        vm.expectRevert(WagerPool.TransferFailed.selector);
        rejecter.claimWinnings(MATCH_ID);
    }

    /// @notice ETH 수신 거부 컨트랙트에 대한 TransferFailed 테스트 (refund)
    function test_Refund_RevertWhen_TransferFailed() public {
        ETHRejecter rejecter = new ETHRejecter(address(wagerPool));
        vm.deal(address(rejecter), 100 ether);

        // rejecter가 배팅
        vm.prank(address(rejecter));
        wagerPool.placeBet{value: 1 ether}(MATCH_ID, IWagerPool.Side.AgentA);

        _voidMatchAs(MATCH_ID);

        // ETH 수신 거부 → TransferFailed
        vm.expectRevert(WagerPool.TransferFailed.selector);
        rejecter.claimRefund(MATCH_ID);
    }

    /// @notice arenaManager 변경 후 기존 매니저는 권한 상실, 신규 매니저가 동작
    function test_Integration_ManagerChangeAuthority() public {
        _placeBetAs(alice, MATCH_ID, IWagerPool.Side.AgentA, 1 ether);

        address newManager = makeAddr("newManager");
        wagerPool.setArenaManager(newManager);

        // 기존 매니저는 권한 없음
        vm.prank(arenaManager);
        vm.expectRevert(WagerPool.Unauthorized.selector);
        wagerPool.lockBets(MATCH_ID);

        // 신규 매니저로 잠금 성공
        vm.prank(newManager);
        wagerPool.lockBets(MATCH_ID);

        (IWagerPool.PoolStatus status,,,,,,,) = wagerPool.pools(MATCH_ID);
        assertEq(uint8(status), uint8(IWagerPool.PoolStatus.Locked), unicode"신규 매니저 잠금 성공");
    }

    /// @notice 수수료 출금 후 재정산하여 다시 수수료 누적 — 이중 출금 방지 확인
    function test_Integration_FeeWithdrawAndReaccumulate() public {
        // 매치 1 정산 및 수수료 출금
        _setupStandardSettledMatch();
        wagerPool.withdrawFees();

        assertEq(wagerPool.accumulatedTreasuryFees(), 0, unicode"출금 후 재무부 수수료 0");
        assertEq(wagerPool.accumulatedManagerFees(), 0, unicode"출금 후 매니저 수수료 0");

        // 재출금 시도 → NoFeesToWithdraw
        vm.expectRevert(WagerPool.NoFeesToWithdraw.selector);
        wagerPool.withdrawFees();

        // 매치 2 정산하여 수수료 재누적
        _placeBetAs(charlie, MATCH_ID_2, IWagerPool.Side.AgentA, 5 ether);
        _placeBetAs(dave, MATCH_ID_2, IWagerPool.Side.AgentB, 5 ether);
        vm.prank(arenaManager);
        wagerPool.lockBets(MATCH_ID_2);
        vm.prank(arenaManager);
        wagerPool.settleBets(MATCH_ID_2, IWagerPool.Side.AgentA);

        uint256 totalPool2 = 10 ether;
        uint256 expectedTreasuryFee2 = (totalPool2 * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
        assertEq(
            wagerPool.accumulatedTreasuryFees(), expectedTreasuryFee2, unicode"매치2 재무부 수수료 재누적"
        );
    }

    // ══════════════════════════════════════════════
    //  13. 불변식 아이디어 (Invariant Ideas)
    // ══════════════════════════════════════════════

    // 아래 불변식들은 Foundry invariant 테스트로 확장 가능한 아이디어이다:
    //
    // 불변식 1: 총 풀 == totalA + totalB
    //   - 어떤 상태에서든 pools[matchId].totalA + pools[matchId].totalB == getTotalPool(matchId)
    //   - 배팅이 추가될 때마다 양쪽 합산이 정확히 증가하는지 검증
    //
    // 불변식 2: 모든 배당금 합산 + 수수료 <= 총 풀
    //   - 정산 후 승리자 배당금 총합 + 재무부 수수료 + 매니저 수수료 <= totalA + totalB
    //   - 정수 나눗셈에 의한 반올림 손실(dust)은 컨트랙트에 잔류
    //
    // 불변식 3: 환불 시 원금 보전
    //   - 무효화된 매치에서 각 사용자의 환불액 == 원래 배팅액
    //   - 모든 사용자 환불 완료 후 컨트랙트 잔액 == 0
    //
    // 불변식 4: 풀 상태 전이 제약
    //   - Open → Locked (lockBets만 가능)
    //   - Locked → Settled (settleBets만 가능)
    //   - Open/Locked → Refunded (voidMatch만 가능)
    //   - 역방향 전이 불가
    //
    // 불변식 5: claimed 플래그 단방향
    //   - claimed는 false → true로만 변경 가능, 역방향 불가
    //   - claimed == true인 배팅은 재수령/재환불 불가
}
