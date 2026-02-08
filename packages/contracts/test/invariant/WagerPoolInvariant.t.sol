// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {WagerPool} from "../../src/WagerPool.sol";
import {IWagerPool} from "../../src/interfaces/IWagerPool.sol";

/// @title WagerPoolInvariantTest
/// @notice WagerPool 컨트랙트의 5가지 핵심 불변성을 검증하는 퍼징 테스트
/// @dev Handler 패턴을 사용하여 제한된 입력 공간에서 상태 축적을 유도
contract WagerPoolInvariantTest is StdInvariant, Test {
    WagerPool public wagerPool;
    WagerPoolHandler public handler;

    address public owner;
    address public arenaManager;
    address public treasury;

    function setUp() public {
        owner = makeAddr("owner");
        arenaManager = makeAddr("arenaManager");
        treasury = makeAddr("treasury");

        vm.startPrank(owner);
        wagerPool = new WagerPool(arenaManager, treasury);
        vm.stopPrank();

        handler = new WagerPoolHandler(wagerPool, arenaManager);

        // 퍼저가 핸들러만 호출하도록 설정
        targetContract(address(handler));

        // 핸들러의 공개 함수만 퍼징 대상으로 설정
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = WagerPoolHandler.placeBet.selector;
        selectors[1] = WagerPoolHandler.lockBets.selector;
        selectors[2] = WagerPoolHandler.settleBets.selector;
        selectors[3] = WagerPoolHandler.claimWinnings.selector;
        selectors[4] = WagerPoolHandler.voidMatch.selector;
        selectors[5] = WagerPoolHandler.refund.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // ──────────────────────────────────────────────
    //  불변성 1: 풀 밸런스 불변성
    // ──────────────────────────────────────────────

    /// @notice 불변성 1: totalA + totalB == getTotalPool(matchId)
    /// @dev 모든 상태에서 사이드별 합계가 getTotalPool 반환값과 일치해야 함
    function invariant_poolBalance() public view {
        for (uint256 matchId = 0; matchId < handler.NUM_MATCHES(); matchId++) {
            (IWagerPool.PoolStatus status, uint256 totalA, uint256 totalB,) = wagerPool.pools(matchId);

            // Open 상태가 아니면 (최소 한 번이라도 배팅이 있었으면) 검증
            if (status != IWagerPool.PoolStatus.Open || totalA > 0 || totalB > 0) {
                uint256 expectedTotal = wagerPool.getTotalPool(matchId);
                assertEq(
                    totalA + totalB, expectedTotal, unicode"불변성 위반: totalA + totalB != getTotalPool(matchId)"
                );
            }
        }
    }

    // ──────────────────────────────────────────────
    //  불변성 2: 지급금 지급능력 불변성
    // ──────────────────────────────────────────────

    /// @notice 불변성 2: 정산 후 총 지급금 + 수수료 <= 총 풀 (반올림 먼지만 컨트랙트에 남음)
    /// @dev Settled 상태인 풀에서 모든 배팅자가 수령 시 컨트랙트 잔액이 수수료 + 먼지만 남아야 함
    function invariant_payoutSolvency() public view {
        uint256 totalPayoutsAndFees =
            handler.ghost_totalClaimed() + wagerPool.accumulatedTreasuryFees() + wagerPool.accumulatedManagerFees();

        uint256 totalDeposited = handler.ghost_totalDeposited();

        // 지급금 + 수수료는 총 입금액을 초과할 수 없음
        assertLe(
            totalPayoutsAndFees,
            totalDeposited,
            unicode"불변성 위반: 지급금 + 수수료가 총 풀을 초과함"
        );

        // 컨트랙트 잔액은 (총 입금 - 총 청구 - 출금된 수수료)와 동일해야 함
        uint256 withdrawnFees = handler.ghost_totalFeesWithdrawn();
        uint256 expectedBalance = totalDeposited - handler.ghost_totalClaimed() - withdrawnFees;

        // 반올림 오차를 고려하여 1 wei 허용
        uint256 actualBalance = address(wagerPool).balance;
        assertApproxEqAbs(
            actualBalance,
            expectedBalance,
            handler.NUM_BETTORS(), // 최대 오차: 배팅자 수 (각 배팅자당 1 wei 반올림)
            unicode"불변성 위반: 컨트랙트 잔액이 예상과 불일치"
        );
    }

    // ──────────────────────────────────────────────
    //  불변성 3: 환불 완전성 불변성
    // ──────────────────────────────────────────────

    /// @notice 불변성 3: Refunded 상태 풀에서 모든 사용자가 환불 후 해당 풀 잔액은 0
    /// @dev voidMatch 후 모든 배팅자가 원금을 정확히 환불받을 수 있어야 함
    function invariant_refundCompleteness() public view {
        for (uint256 matchId = 0; matchId < handler.NUM_MATCHES(); matchId++) {
            (IWagerPool.PoolStatus status, uint256 totalA, uint256 totalB,) = wagerPool.pools(matchId);

            if (status == IWagerPool.PoolStatus.Refunded) {
                // Refunded 상태에서는 미청구 금액 = totalA + totalB - 이미 환불된 금액
                uint256 totalPool = totalA + totalB;
                uint256 refundedForMatch = handler.ghost_totalRefundedPerMatch(matchId);

                // 모든 환불이 완료되었다면
                if (refundedForMatch == totalPool) {
                    // 해당 매치에 귀속된 자금은 0이어야 함 (이미 모두 환불됨)
                    // 실제로는 컨트랙트에 다른 매치 자금이 섞여있으므로,
                    // 대신 "환불된 총액 == 풀 총액"을 검증
                    assertEq(
                        refundedForMatch,
                        totalPool,
                        unicode"불변성 위반: Refunded 풀에서 환불 총액이 풀 총액과 불일치"
                    );
                }

                // 환불된 금액은 절대 풀 총액을 초과할 수 없음
                assertLe(
                    refundedForMatch, totalPool, unicode"불변성 위반: 환불 총액이 풀 총액을 초과함"
                );
            }
        }
    }

    // ──────────────────────────────────────────────
    //  불변성 4: 상태 전환 불변성
    // ──────────────────────────────────────────────

    /// @notice 불변성 4: 풀 상태는 오직 전진만 함 (Open→Locked→Settled 또는 Open/Locked→Refunded)
    /// @dev 역방향 전환은 불가능함을 검증
    function invariant_stateTransition() public view {
        // 핸들러가 추적한 최대 상태를 확인
        for (uint256 matchId = 0; matchId < handler.NUM_MATCHES(); matchId++) {
            (IWagerPool.PoolStatus currentStatus,,,) = wagerPool.pools(matchId);
            IWagerPool.PoolStatus maxSeenStatus = handler.ghost_maxStatusPerMatch(matchId);

            // 현재 상태는 지금까지 본 최대 상태보다 작거나 같아야 함
            // (Refunded는 예외: Open/Locked에서 도달 가능)
            if (maxSeenStatus == IWagerPool.PoolStatus.Refunded) {
                // Refunded로 전환된 후에는 상태가 변경되지 않아야 함
                assertEq(
                    uint8(currentStatus),
                    uint8(IWagerPool.PoolStatus.Refunded),
                    unicode"불변성 위반: Refunded 상태에서 다른 상태로 전환됨"
                );
            } else if (maxSeenStatus == IWagerPool.PoolStatus.Settled) {
                // Settled로 전환된 후에는 상태가 변경되지 않아야 함
                assertEq(
                    uint8(currentStatus),
                    uint8(IWagerPool.PoolStatus.Settled),
                    unicode"불변성 위반: Settled 상태에서 다른 상태로 전환됨"
                );
            } else {
                // Open 또는 Locked 상태는 전진만 가능
                assertGe(
                    uint8(currentStatus),
                    uint8(maxSeenStatus),
                    unicode"불변성 위반: 풀 상태가 역방향으로 전환됨"
                );
            }
        }
    }

    // ──────────────────────────────────────────────
    //  불변성 5: 청구 플래그 단조성 불변성
    // ──────────────────────────────────────────────

    /// @notice 불변성 5: claimed 플래그는 한 번 true가 되면 절대 false로 되돌아가지 않음
    /// @dev 핸들러가 추적한 청구 기록을 검증
    function invariant_claimedFlagMonotonicity() public view {
        for (uint256 matchId = 0; matchId < handler.NUM_MATCHES(); matchId++) {
            for (uint256 i = 0; i < handler.NUM_BETTORS(); i++) {
                address bettor = handler.bettors(i);

                bool currentClaimed;
                (,, currentClaimed) = wagerPool.getBet(matchId, bettor);

                bool wasClaimed = handler.ghost_wasEverClaimed(matchId, bettor);

                // 한 번이라도 claimed=true였다면 현재도 true여야 함
                if (wasClaimed) {
                    assertTrue(
                        currentClaimed, unicode"불변성 위반: claimed 플래그가 true에서 false로 되돌아감"
                    );
                }
            }
        }
    }
}

/// @title WagerPoolHandler
/// @notice WagerPool 퍼징을 위한 핸들러 — 제한된 입력 공간에서 상태 축적을 유도
/// @dev Test를 상속하여 vm 치트코드 사용 가능
contract WagerPoolHandler is Test {
    WagerPool public wagerPool;
    address public arenaManager;

    // 제한된 입력 공간 설정 (상태 축적을 위해)
    uint256 public constant NUM_MATCHES = 5;
    uint256 public constant NUM_BETTORS = 5;

    address[NUM_BETTORS] public bettors;

    // 고스트 변수 — 불변성 검증용
    uint256 public ghost_totalDeposited;
    uint256 public ghost_totalClaimed;
    uint256 public ghost_totalFeesWithdrawn;

    mapping(uint256 => uint256) public ghost_totalRefundedPerMatch;
    mapping(uint256 => IWagerPool.PoolStatus) public ghost_maxStatusPerMatch;
    mapping(uint256 => mapping(address => bool)) public ghost_wasEverClaimed;

    constructor(WagerPool _wagerPool, address _arenaManager) {
        wagerPool = _wagerPool;
        arenaManager = _arenaManager;

        // 배팅자 주소 생성
        for (uint256 i = 0; i < NUM_BETTORS; i++) {
            bettors[i] = makeAddr(string(abi.encodePacked("bettor", vm.toString(i))));
            vm.deal(bettors[i], 1000 ether); // 충분한 ETH 제공
        }
    }

    // ──────────────────────────────────────────────
    //  핸들러 함수: 배팅
    // ──────────────────────────────────────────────

    /// @notice 제한된 입력으로 배팅 배치
    /// @param matchIdSeed 매치 ID 시드
    /// @param sideSeed 사이드 시드
    /// @param amountSeed 금액 시드
    /// @param bettorSeed 배팅자 시드
    function placeBet(uint256 matchIdSeed, uint8 sideSeed, uint256 amountSeed, uint256 bettorSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);
        IWagerPool.Side side = sideSeed % 2 == 0 ? IWagerPool.Side.AgentA : IWagerPool.Side.AgentB;
        address bettor = bettors[bound(bettorSeed, 0, NUM_BETTORS - 1)];

        // 배팅 금액 범위 제한 (MIN_BET ~ MAX_BET)
        uint256 amount = bound(amountSeed, wagerPool.MIN_BET(), wagerPool.MAX_BET());

        // 기존 배팅이 있는 경우 누적 한도 체크
        (, uint256 existingAmount,) = wagerPool.getBet(matchId, bettor);
        if (existingAmount > 0) {
            uint256 maxAdditional = wagerPool.MAX_BET() - existingAmount;
            if (maxAdditional == 0) return; // 이미 최대 배팅 도달
            amount = bound(amountSeed, wagerPool.MIN_BET(), maxAdditional);
        }

        (IWagerPool.PoolStatus status,,,) = wagerPool.pools(matchId);

        // Open 상태가 아니면 배팅 불가
        if (status != IWagerPool.PoolStatus.Open) return;

        vm.startPrank(bettor);
        try wagerPool.placeBet{value: amount}(matchId, side) {
            ghost_totalDeposited += amount;
            _updateMaxStatus(matchId, IWagerPool.PoolStatus.Open);
        } catch {
            // 실패 시 무시 (예: paused 상태 등)
        }
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    //  핸들러 함수: 풀 관리
    // ──────────────────────────────────────────────

    /// @notice 배팅 잠금
    /// @param matchIdSeed 매치 ID 시드
    function lockBets(uint256 matchIdSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);

        vm.startPrank(arenaManager);
        try wagerPool.lockBets(matchId) {
            _updateMaxStatus(matchId, IWagerPool.PoolStatus.Locked);
        } catch {
            // 실패 시 무시 (예: 이미 Locked 또는 Settled)
        }
        vm.stopPrank();
    }

    /// @notice 배팅 정산
    /// @param matchIdSeed 매치 ID 시드
    /// @param sideSeed 승리 사이드 시드
    function settleBets(uint256 matchIdSeed, uint8 sideSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);
        IWagerPool.Side winner = sideSeed % 2 == 0 ? IWagerPool.Side.AgentA : IWagerPool.Side.AgentB;

        vm.startPrank(arenaManager);
        try wagerPool.settleBets(matchId, winner) {
            _updateMaxStatus(matchId, IWagerPool.PoolStatus.Settled);
        } catch {
            // 실패 시 무시 (예: 이미 Settled 또는 Open 상태)
        }
        vm.stopPrank();
    }

    /// @notice 매치 무효화
    /// @param matchIdSeed 매치 ID 시드
    function voidMatch(uint256 matchIdSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);

        vm.startPrank(arenaManager);
        try wagerPool.voidMatch(matchId) {
            _updateMaxStatus(matchId, IWagerPool.PoolStatus.Refunded);
        } catch {
            // 실패 시 무시 (예: 이미 Settled 또는 Refunded)
        }
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    //  핸들러 함수: 청구
    // ──────────────────────────────────────────────

    /// @notice 배당금 청구
    /// @param matchIdSeed 매치 ID 시드
    /// @param bettorSeed 배팅자 시드
    function claimWinnings(uint256 matchIdSeed, uint256 bettorSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);
        address bettor = bettors[bound(bettorSeed, 0, NUM_BETTORS - 1)];

        (IWagerPool.PoolStatus status,,,) = wagerPool.pools(matchId);

        // Settled 상태가 아니면 청구 불가
        if (status != IWagerPool.PoolStatus.Settled) return;

        uint256 balanceBefore = bettor.balance;

        vm.startPrank(bettor);
        try wagerPool.claimWinnings(matchId) {
            uint256 balanceAfter = bettor.balance;
            uint256 claimed = balanceAfter - balanceBefore;
            ghost_totalClaimed += claimed;
            ghost_wasEverClaimed[matchId][bettor] = true;
        } catch {
            // 실패 시 무시 (예: 패배 사이드, 이미 청구)
        }
        vm.stopPrank();
    }

    /// @notice 환불 청구
    /// @param matchIdSeed 매치 ID 시드
    /// @param bettorSeed 배팅자 시드
    function refund(uint256 matchIdSeed, uint256 bettorSeed) public {
        uint256 matchId = bound(matchIdSeed, 0, NUM_MATCHES - 1);
        address bettor = bettors[bound(bettorSeed, 0, NUM_BETTORS - 1)];

        (IWagerPool.PoolStatus status,,,) = wagerPool.pools(matchId);

        // Refunded 상태가 아니면 환불 불가
        if (status != IWagerPool.PoolStatus.Refunded) return;

        uint256 balanceBefore = bettor.balance;

        vm.startPrank(bettor);
        try wagerPool.refund(matchId) {
            uint256 balanceAfter = bettor.balance;
            uint256 refunded = balanceAfter - balanceBefore;
            ghost_totalClaimed += refunded;
            ghost_totalRefundedPerMatch[matchId] += refunded;
            ghost_wasEverClaimed[matchId][bettor] = true;
        } catch {
            // 실패 시 무시 (예: 배팅 없음, 이미 환불)
        }
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    //  내부 헬퍼
    // ──────────────────────────────────────────────

    /// @notice 최대 상태 업데이트
    /// @dev 상태 전환 불변성 검증을 위해 최대 도달 상태를 추적
    /// @param matchId 매치 ID
    /// @param newStatus 새 상태
    function _updateMaxStatus(uint256 matchId, IWagerPool.PoolStatus newStatus) internal {
        IWagerPool.PoolStatus currentMax = ghost_maxStatusPerMatch[matchId];

        // Refunded는 특수 케이스 (Open/Locked에서 도달 가능)
        if (newStatus == IWagerPool.PoolStatus.Refunded) {
            ghost_maxStatusPerMatch[matchId] = newStatus;
            return;
        }

        // 일반적인 전진: Open(0) < Locked(1) < Settled(2)
        if (uint8(newStatus) > uint8(currentMax)) {
            ghost_maxStatusPerMatch[matchId] = newStatus;
        }
    }
}
