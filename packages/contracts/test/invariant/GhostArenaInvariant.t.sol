// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../src/GhostArena.sol";

/// @title GhostArenaInvariant
/// @notice GhostArena 컨트랙트의 불변 속성 테스트 — 상태 머신, 상금 풀 보존, 승패 일관성 검증
contract GhostArenaInvariant is StdInvariant, Test {
    GhostArena public arena;
    GhostArenaHandler public handler;

    address arenaManager = address(0x1111);
    address treasury = address(0x2222);

    function setUp() public {
        arena = new GhostArena(arenaManager, treasury);
        handler = new GhostArenaHandler(arena, arenaManager, treasury);

        // 핸들러를 타겟으로 설정
        targetContract(address(handler));

        // 핸들러의 공개 함수만 퍼징 대상으로 설정
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = GhostArenaHandler.registerAgent.selector;
        selectors[1] = GhostArenaHandler.createTournament.selector;
        selectors[2] = GhostArenaHandler.submitResult.selector;
        selectors[3] = GhostArenaHandler.advanceBracket.selector;
        selectors[4] = GhostArenaHandler.fundTournament.selector;
        selectors[5] = GhostArenaHandler.claimPrize.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// @notice 불변 속성 1: 상금 풀 보존 — 모든 토너먼트의 미수령 상금 합계가 컨트랙트 잔액 이하
    /// @dev 수령 완료된 토너먼트의 상금은 제외
    function invariant_PrizePoolConservation() public view {
        uint256 totalUnclaimedPrize = 0;
        for (uint256 i = 0; i < handler.nextTournamentId(); i++) {
            // tournaments() getter: (id, bracketSize, prizePool, status, createdAt)
            (,, uint256 prizePool, IGhostArena.TournamentStatus status,) = arena.tournaments(i);

            // 완료되었지만 아직 수령하지 않은 상금, 또는 활성 토너먼트의 상금
            if (status == IGhostArena.TournamentStatus.Completed && arena.prizeClaimed(i)) {
                continue; // 이미 수령됨
            }
            totalUnclaimedPrize += prizePool;
        }
        assertLe(
            totalUnclaimedPrize,
            address(arena).balance,
            unicode"불변성 위반: 미수령 상금 합계가 컨트랙트 잔액 초과"
        );
    }

    /// @notice 불변 속성 2: 승패 일관성 — 핸들러가 추적한 승패 수와 실제 에이전트 통계 일치
    /// @dev 매치 결과 제출 시 정확히 한 명의 승자와 한 명의 패자가 기록되어야 함
    function invariant_WinLossConsistency() public view {
        address[] memory actors = handler.getActors();
        for (uint256 i = 0; i < actors.length; i++) {
            address actor = actors[i];
            if (!handler.isAgentRegistered(actor)) continue;

            // agents() getter: (owner, name, metadataURI, wins, losses, totalScore, reputation, active) = 8개 필드
            (,,, uint256 wins, uint256 losses,,,) = arena.agents(actor);

            assertEq(wins, handler.agentWins(actor), unicode"불변성 위반: 승수 불일치");
            assertEq(losses, handler.agentLosses(actor), unicode"불변성 위반: 패수 불일치");
        }
    }

    /// @notice 불변 속성 3: 토너먼트 상태 머신 — 상태는 Active→Completed 순서로만 전환
    /// @dev Completed 상태인 토너먼트는 절대 Active로 돌아가지 않음
    function invariant_TournamentStateMachine() public view {
        for (uint256 i = 0; i < handler.nextTournamentId(); i++) {
            (,,, IGhostArena.TournamentStatus status,) = arena.tournaments(i);

            IGhostArena.TournamentStatus previousStatus = handler.tournamentPreviousStatus(i);

            // Completed → Active 전환 금지
            if (previousStatus == IGhostArena.TournamentStatus.Completed) {
                assertEq(
                    uint8(status),
                    uint8(IGhostArena.TournamentStatus.Completed),
                    unicode"불변성 위반: Completed 토너먼트가 Active로 되돌아감"
                );
            }
        }
    }

    /// @notice 불변 속성 4: 매치 상태 머신 — Completed 매치는 절대 Pending으로 되돌아가지 않음
    function invariant_MatchStateMachine() public view {
        for (uint256 i = 0; i < handler.nextMatchId(); i++) {
            // matches() getter: (id, tournamentId, agentA, agentB, scoreA, scoreB, winner, gameLogHash, status)
            // — replayURI (string)은 제외됨 = 9개 필드
            (,,,,,,,,, IGhostArena.MatchStatus status) = arena.matches(i);

            IGhostArena.MatchStatus previousStatus = handler.matchPreviousStatus(i);

            if (previousStatus == IGhostArena.MatchStatus.Completed) {
                assertEq(
                    uint8(status),
                    uint8(IGhostArena.MatchStatus.Completed),
                    unicode"불변성 위반: Completed 매치가 Pending으로 되돌아감"
                );
            }
        }
    }

    /// @notice 불변 속성 5: 에이전트 등록 불변성 — 한 번 등록된 에이전트의 active는 항상 true
    /// @dev 비활성화 함수가 존재하지 않으므로, 등록 후 active는 절대 false로 변경되지 않음
    function invariant_AgentRegistrationImmutability() public view {
        address[] memory actors = handler.getActors();
        for (uint256 i = 0; i < actors.length; i++) {
            address actor = actors[i];
            if (handler.isAgentRegistered(actor)) {
                (,,,,,,, bool active) = arena.agents(actor);
                assertTrue(active, unicode"불변성 위반: 등록된 에이전트가 비활성 상태");
            }
        }
    }
}

/// @title GhostArenaHandler
/// @notice GhostArena 컨트랙트에 대한 퍼즈 액션 핸들러 — 유효한 작업만 수행
/// @dev 고스트 변수를 추적하여 불변 속성 검증을 지원
contract GhostArenaHandler is Test {
    GhostArena public arena;
    address public arenaManager;
    address public treasury;

    // 테스트 액터 (에이전트 소유자) — 토너먼트에 8명 필요
    address[] public actors;
    mapping(address => bool) public isRegistered;

    // 고스트 변수 — 실제 상태 추적용
    mapping(address => uint256) public agentWins;
    mapping(address => uint256) public agentLosses;
    mapping(uint256 => IGhostArena.TournamentStatus) public tournamentPreviousStatus;
    mapping(uint256 => IGhostArena.MatchStatus) public matchPreviousStatus;

    uint256 public nextTournamentId;
    uint256 public nextMatchId;

    constructor(GhostArena _arena, address _arenaManager, address _treasury) {
        arena = _arena;
        arenaManager = _arenaManager;
        treasury = _treasury;

        // 테스트 액터 초기화 (8명 — 토너먼트 최소 요구사항)
        for (uint256 i = 0; i < 8; i++) {
            actors.push(address(uint160(0x1001 + i)));
        }
    }

    /// @notice 에이전트 등록 액션
    /// @param actorSeed 액터 인덱스 시드
    function registerAgent(uint256 actorSeed) public {
        address actor = actors[bound(actorSeed, 0, actors.length - 1)];

        if (isRegistered[actor]) return;

        vm.deal(actor, 1 ether);
        vm.prank(actor);
        arena.registerAgent{value: 0.01 ether}("TestAgent", "ipfs://test");

        isRegistered[actor] = true;
    }

    /// @notice 토너먼트 생성 액션
    /// @dev 아레나 매니저가 등록된 에이전트로 토너먼트 생성 (브래킷 크기 8)
    function createTournament() public {
        // 모든 8명이 등록되었는지 확인
        for (uint256 i = 0; i < 8; i++) {
            if (!isRegistered[actors[i]]) return;
        }

        address[] memory participants = new address[](8);
        for (uint256 i = 0; i < 8; i++) {
            participants[i] = actors[i];
        }

        // 매치 생성 추적을 위해 이전 nextMatchId 저장
        uint256 matchIdBefore = arena.nextMatchId();

        vm.prank(arenaManager);
        arena.createTournament(participants, 8);

        uint256 matchIdAfter = arena.nextMatchId();

        // 새로 생성된 매치 추적
        for (uint256 i = matchIdBefore; i < matchIdAfter; i++) {
            matchPreviousStatus[i] = IGhostArena.MatchStatus.Pending;
        }
        nextMatchId = matchIdAfter;

        // 고스트 변수 업데이트
        tournamentPreviousStatus[nextTournamentId] = IGhostArena.TournamentStatus.Active;
        nextTournamentId++;
    }

    /// @notice 매치 결과 제출 액션
    /// @param matchSeed 매치 ID 시드
    /// @param scoreSeed 점수 시드
    function submitResult(uint256 matchSeed, uint256 scoreSeed) public {
        if (nextMatchId == 0) return;

        uint256 matchId = bound(matchSeed, 0, nextMatchId - 1);
        // matches() getter: (id, tournamentId, agentA, agentB, scoreA, scoreB, winner, gameLogHash, status)
        (,, address agentA, address agentB,,,,,, IGhostArena.MatchStatus status) = arena.matches(matchId);

        if (agentA == address(0) || status != IGhostArena.MatchStatus.Pending) return;

        uint256 scoreA = bound(scoreSeed, 100, 1000);
        uint256 scoreB = bound(scoreSeed + 1, 100, 999); // agentA가 승리하도록 설정
        address winner = agentA;

        vm.prank(arenaManager);
        arena.submitResult(matchId, scoreA, scoreB, winner, keccak256("gamelog"), "ipfs://replay");

        // 고스트 변수 업데이트
        matchPreviousStatus[matchId] = IGhostArena.MatchStatus.Completed;
        agentWins[winner]++;
        agentLosses[agentB]++;
    }

    /// @notice 브래킷 진행 액션
    /// @param tournamentSeed 토너먼트 ID 시드
    function advanceBracket(uint256 tournamentSeed) public {
        if (nextTournamentId == 0) return;

        uint256 tournamentId = bound(tournamentSeed, 0, nextTournamentId - 1);
        (,,, IGhostArena.TournamentStatus status,) = arena.tournaments(tournamentId);

        if (status != IGhostArena.TournamentStatus.Active) return;

        // 현재 라운드의 모든 매치가 완료되었는지 확인
        uint256 currentRound = arena.tournamentCurrentRound(tournamentId);
        uint256[] memory matchIds = arena.getRoundMatches(tournamentId, currentRound);

        bool allCompleted = true;
        for (uint256 i = 0; i < matchIds.length; i++) {
            (,,,,,,,,, IGhostArena.MatchStatus matchStatus) = arena.matches(matchIds[i]);
            if (matchStatus != IGhostArena.MatchStatus.Completed) {
                allCompleted = false;
                break;
            }
        }

        if (!allCompleted) return;

        // 매치 생성 추적
        uint256 matchIdBefore = arena.nextMatchId();

        vm.prank(arenaManager);
        arena.advanceBracket(tournamentId);

        uint256 matchIdAfter = arena.nextMatchId();
        for (uint256 i = matchIdBefore; i < matchIdAfter; i++) {
            matchPreviousStatus[i] = IGhostArena.MatchStatus.Pending;
        }
        if (matchIdAfter > nextMatchId) {
            nextMatchId = matchIdAfter;
        }

        // 토너먼트 상태 추적
        (,,, IGhostArena.TournamentStatus newStatus,) = arena.tournaments(tournamentId);
        tournamentPreviousStatus[tournamentId] = newStatus;
    }

    /// @notice 토너먼트 상금 풀에 ETH 추가 액션
    /// @param tournamentSeed 토너먼트 ID 시드
    /// @param amountSeed 금액 시드
    function fundTournament(uint256 tournamentSeed, uint256 amountSeed) public {
        if (nextTournamentId == 0) return;

        uint256 tournamentId = bound(tournamentSeed, 0, nextTournamentId - 1);
        (,,, IGhostArena.TournamentStatus status,) = arena.tournaments(tournamentId);

        if (status != IGhostArena.TournamentStatus.Active) return;

        uint256 amount = bound(amountSeed, 0.001 ether, 0.1 ether);
        vm.deal(address(this), amount);
        arena.fundTournament{value: amount}(tournamentId);
    }

    /// @notice 상금 수령 액션
    /// @param tournamentSeed 토너먼트 ID 시드
    function claimPrize(uint256 tournamentSeed) public {
        if (nextTournamentId == 0) return;

        uint256 tournamentId = bound(tournamentSeed, 0, nextTournamentId - 1);
        (,,, IGhostArena.TournamentStatus status,) = arena.tournaments(tournamentId);

        if (status != IGhostArena.TournamentStatus.Completed) return;
        if (arena.prizeClaimed(tournamentId)) return;

        address champion = arena.tournamentChampion(tournamentId);
        if (champion == address(0)) return;

        vm.prank(champion);
        arena.claimPrize(tournamentId);
    }

    // ===== 뷰 함수 =====

    function getActors() external view returns (address[] memory) {
        return actors;
    }

    function isAgentRegistered(address actor) external view returns (bool) {
        return isRegistered[actor];
    }
}
