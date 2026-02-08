// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/GhostArena.sol";

/// @title GhostArenaTest
/// @notice GhostArena 컨트랙트에 대한 포괄적 테스트 스위트
/// @dev 단위 테스트, 퍼즈 테스트, 통합 테스트를 포함
contract GhostArenaTest is Test {
    // ===== 테스트 환경 변수 =====

    GhostArena public arena;

    /// @dev 컨트랙트 배포자 겸 소유자
    address public deployer = address(this);

    /// @dev 아레나 매니저 역할 주소
    address public arenaManager = makeAddr("arenaManager");

    /// @dev 트레저리(수수료 수취) 주소
    address public treasury = makeAddr("treasury");

    /// @dev 권한 없는 일반 사용자 주소
    address public unauthorized = makeAddr("unauthorized");

    /// @dev 기본 등록 수수료 (0.01 ETH)
    uint256 constant REGISTRATION_FEE = 0.01 ether;

    /// @dev 기본 평판 점수
    uint256 constant DEFAULT_REPUTATION = 1000;

    /// @dev _registerAgents 호출 간 고유 주소 생성을 위한 전역 카운터
    uint256 private _agentCounter;

    // ===== 설정 =====

    /// @notice 각 테스트 실행 전 GhostArena 컨트랙트를 새로 배포
    function setUp() public {
        arena = new GhostArena(arenaManager, treasury);
    }

    // ===== 헬퍼 함수 =====

    /// @notice 지정된 수만큼 에이전트를 등록하는 헬퍼
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

    /// @notice 8명의 에이전트를 등록하고 토너먼트를 생성하는 헬퍼
    /// @return tournamentId 생성된 토너먼트 ID
    /// @return participants 참가 에이전트 주소 배열
    function _createTournamentWith8() internal returns (uint256 tournamentId, address[] memory participants) {
        participants = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(participants, 8);
        tournamentId = 0; // 첫 번째 토너먼트의 ID
    }

    /// @notice 특정 라운드의 모든 매치 결과를 제출하는 헬퍼 (항상 agentA가 승리)
    /// @param tournamentId 토너먼트 ID
    /// @param round 라운드 인덱스
    function _submitAllRoundResults(uint256 tournamentId, uint256 round) internal {
        uint256[] memory matchIds = arena.getRoundMatches(tournamentId, round);
        for (uint256 i = 0; i < matchIds.length; i++) {
            uint256 matchId = matchIds[i];
            (,, address agentA,,,,,,,) = arena.matches(matchId);
            vm.prank(arenaManager);
            arena.submitResult(
                matchId,
                100,
                50,
                agentA,
                keccak256(abi.encodePacked("gameLog", matchId)),
                string(abi.encodePacked("ipfs://replay", vm.toString(matchId)))
            );
        }
    }

    /// @notice 토너먼트를 끝까지 진행하여 완료 상태로 만드는 헬퍼 (8인 토너먼트 전용)
    /// @param tid 토너먼트 ID
    function _completeTournament(uint256 tid) internal {
        // 라운드 0 → 라운드 1
        _submitAllRoundResults(tid, 0);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 1 → 라운드 2
        _submitAllRoundResults(tid, 1);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 2 (결승) → 완료
        _submitAllRoundResults(tid, 2);
        vm.prank(arenaManager);
        arena.advanceBracket(tid);
    }

    // =========================================================================
    //                       1. 단위 테스트 - 에이전트 등록
    // =========================================================================

    /// @notice 에이전트 등록 성공 - 올바른 수수료와 함께 에이전트가 정상 등록되는지 확인
    function test_RegisterAgent_Success() public {
        address agent = makeAddr("newAgent");
        vm.deal(agent, 1 ether);

        // AgentRegistered 이벤트 발생 확인
        vm.expectEmit(true, false, false, true, address(arena));
        emit IGhostArena.AgentRegistered(agent, "GhostBot");

        vm.prank(agent);
        arena.registerAgent{value: REGISTRATION_FEE}("GhostBot", "ipfs://ghost");

        // 에이전트 상태 검증
        (
            address owner_,
            string memory name_,,
            uint256 wins_,
            uint256 losses_,
            uint256 totalScore_,
            uint256 reputation_,
            bool active_
        ) = arena.agents(agent);

        assertEq(owner_, agent, unicode"에이전트 소유자가 호출자와 일치해야 함");
        assertEq(name_, "GhostBot", unicode"에이전트 이름이 일치해야 함");
        assertEq(wins_, 0, unicode"초기 승수는 0이어야 함");
        assertEq(losses_, 0, unicode"초기 패수는 0이어야 함");
        assertEq(totalScore_, 0, unicode"초기 총점은 0이어야 함");
        assertEq(reputation_, DEFAULT_REPUTATION, unicode"초기 평판은 1000이어야 함");
        assertTrue(active_, unicode"에이전트가 활성 상태여야 함");
    }

    /// @notice 등록 수수료 부족 시 InsufficientRegistrationFee 에러 발생 확인
    function test_RegisterAgent_RevertIf_InsufficientFee() public {
        address agent = makeAddr("cheapAgent");
        vm.deal(agent, 1 ether);

        vm.prank(agent);
        vm.expectRevert(IGhostArena.InsufficientRegistrationFee.selector);
        arena.registerAgent{value: 0.001 ether}("CheapBot", "ipfs://cheap");
    }

    /// @notice 수수료 0으로 등록 시도 시 에러 발생 확인
    function test_RegisterAgent_RevertIf_ZeroFee() public {
        address agent = makeAddr("freeAgent");
        vm.deal(agent, 1 ether);

        vm.prank(agent);
        vm.expectRevert(IGhostArena.InsufficientRegistrationFee.selector);
        arena.registerAgent{value: 0}("FreeBot", "ipfs://free");
    }

    /// @notice 이미 등록된 에이전트가 재등록 시 AgentAlreadyRegistered 에러 발생 확인
    function test_RegisterAgent_RevertIf_AlreadyRegistered() public {
        address agent = makeAddr("dupAgent");
        vm.deal(agent, 2 ether);

        vm.startPrank(agent);
        arena.registerAgent{value: REGISTRATION_FEE}("FirstBot", "ipfs://first");

        vm.expectRevert(IGhostArena.AgentAlreadyRegistered.selector);
        arena.registerAgent{value: REGISTRATION_FEE}("SecondBot", "ipfs://second");
        vm.stopPrank();
    }

    /// @notice 컨트랙트 일시정지 시 에이전트 등록 불가 확인
    function test_RegisterAgent_RevertIf_Paused() public {
        arena.pause();

        address agent = makeAddr("pausedAgent");
        vm.deal(agent, 1 ether);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        arena.registerAgent{value: REGISTRATION_FEE}("PausedBot", "ipfs://paused");
    }

    /// @notice 정확히 등록 수수료만큼만 보내도 성공하는지 확인
    function test_RegisterAgent_ExactFee() public {
        address agent = makeAddr("exactFeeAgent");
        vm.deal(agent, 1 ether);

        vm.prank(agent);
        arena.registerAgent{value: REGISTRATION_FEE}("ExactBot", "ipfs://exact");

        (,,,,,,, bool active_) = arena.agents(agent);
        assertTrue(active_, unicode"정확한 수수료로 등록이 성공해야 함");
    }

    /// @notice 등록 수수료보다 많은 ETH를 보내도 등록 성공 확인
    function test_RegisterAgent_OverpayFee() public {
        address agent = makeAddr("overpayAgent");
        vm.deal(agent, 1 ether);

        vm.prank(agent);
        arena.registerAgent{value: 0.05 ether}("OverpayBot", "ipfs://overpay");

        (,,,,,,, bool active_) = arena.agents(agent);
        assertTrue(active_, unicode"초과 수수료로도 등록이 성공해야 함");
    }

    // =========================================================================
    //                     2. 단위 테스트 - 토너먼트 생성
    // =========================================================================

    /// @notice 8명 참가 토너먼트 생성 성공 확인
    function test_CreateTournament_With8Players() public {
        address[] memory participants = _registerAgents(8);

        // TournamentCreated 이벤트 발생 확인
        vm.expectEmit(true, false, false, true, address(arena));
        emit IGhostArena.TournamentCreated(0, 8);

        vm.prank(arenaManager);
        arena.createTournament(participants, 8);

        // 토너먼트 상태 확인
        (, uint8 bracketSize_, uint256 prizePool_, IGhostArena.TournamentStatus status_, uint256 createdAt_) =
            arena.tournaments(0);
        assertEq(bracketSize_, 8, unicode"브래킷 크기가 8이어야 함");
        assertEq(prizePool_, 0, unicode"초기 상금 풀은 0이어야 함");
        assertEq(
            uint256(status_),
            uint256(IGhostArena.TournamentStatus.Active),
            unicode"토너먼트 상태가 Active여야 함"
        );
        assertGt(createdAt_, 0, unicode"생성 시간이 0보다 커야 함");

        // 라운드 0 매치 생성 확인 (4매치)
        uint256[] memory round0Matches = arena.getRoundMatches(0, 0);
        assertEq(round0Matches.length, 4, unicode"라운드 0에 4개의 매치가 생성되어야 함");

        // 참가자 목록 확인
        address[] memory fetchedParticipants = arena.getTournamentParticipants(0);
        assertEq(fetchedParticipants.length, 8, unicode"참가자가 8명이어야 함");

        // 자동 증가 ID 확인
        assertEq(arena.nextTournamentId(), 1, unicode"다음 토너먼트 ID가 1이어야 함");
        assertEq(arena.nextMatchId(), 4, unicode"다음 매치 ID가 4여야 함 (4매치 생성)");
    }

    /// @notice 16명 참가 토너먼트 생성 성공 확인
    function test_CreateTournament_With16Players() public {
        address[] memory participants = _registerAgents(16);

        vm.prank(arenaManager);
        arena.createTournament(participants, 16);

        (, uint8 bracketSize_,,,) = arena.tournaments(0);
        assertEq(bracketSize_, 16, unicode"브래킷 크기가 16이어야 함");

        // 라운드 0 매치 생성 확인 (8매치)
        uint256[] memory round0Matches = arena.getRoundMatches(0, 0);
        assertEq(round0Matches.length, 8, unicode"라운드 0에 8개의 매치가 생성되어야 함");
    }

    /// @notice 유효하지 않은 브래킷 크기(4) 사용 시 InvalidBracketSize 에러 발생 확인
    function test_CreateTournament_RevertIf_InvalidBracketSize4() public {
        address[] memory participants = _registerAgents(4);

        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.InvalidBracketSize.selector);
        arena.createTournament(participants, 4);
    }

    /// @notice 유효하지 않은 브래킷 크기(32) 사용 시 InvalidBracketSize 에러 발생 확인
    function test_CreateTournament_RevertIf_InvalidBracketSize32() public {
        address[] memory participants = _registerAgents(8);

        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.InvalidBracketSize.selector);
        arena.createTournament(participants, 32);
    }

    /// @notice 참가자 수와 브래킷 크기 불일치 시 ParticipantCountMismatch 에러 발생 확인
    function test_CreateTournament_RevertIf_ParticipantCountMismatch() public {
        address[] memory participants = _registerAgents(6);

        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.ParticipantCountMismatch.selector);
        arena.createTournament(participants, 8);
    }

    /// @notice 미등록 에이전트 포함 시 AgentNotRegistered 에러 발생 확인
    function test_CreateTournament_RevertIf_UnregisteredParticipant() public {
        address[] memory registered = _registerAgents(7);
        address[] memory participants = new address[](8);
        for (uint256 i = 0; i < 7; i++) {
            participants[i] = registered[i];
        }
        // 8번째 참가자는 미등록 주소
        participants[7] = makeAddr("unregistered");

        vm.prank(arenaManager);
        vm.expectRevert(IGhostArena.AgentNotRegistered.selector);
        arena.createTournament(participants, 8);
    }

    /// @notice 아레나 매니저가 아닌 주소로 토너먼트 생성 시 Unauthorized 에러 발생 확인
    function test_CreateTournament_RevertIf_Unauthorized() public {
        address[] memory participants = _registerAgents(8);

        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.createTournament(participants, 8);
    }

    /// @notice 컨트랙트 일시정지 시 토너먼트 생성 불가 확인
    function test_CreateTournament_RevertIf_Paused() public {
        address[] memory participants = _registerAgents(8);
        arena.pause();

        vm.prank(arenaManager);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        arena.createTournament(participants, 8);
    }

    /// @notice 매치의 agentA, agentB가 올바른 순서로 배정되었는지 확인
    function test_CreateTournament_MatchPairingOrder() public {
        address[] memory participants = _registerAgents(8);

        vm.prank(arenaManager);
        arena.createTournament(participants, 8);

        uint256[] memory round0 = arena.getRoundMatches(0, 0);

        // 매치 0: participants[0] vs participants[1]
        (,, address a0, address b0,,,,,,) = arena.matches(round0[0]);
        assertEq(a0, participants[0], unicode"매치 0의 agentA가 participants[0]이어야 함");
        assertEq(b0, participants[1], unicode"매치 0의 agentB가 participants[1]이어야 함");

        // 매치 1: participants[2] vs participants[3]
        (,, address a1, address b1,,,,,,) = arena.matches(round0[1]);
        assertEq(a1, participants[2], unicode"매치 1의 agentA가 participants[2]이어야 함");
        assertEq(b1, participants[3], unicode"매치 1의 agentB가 participants[3]이어야 함");
    }

    // =========================================================================
    //                     3. 단위 테스트 - 매치 결과 제출
    // =========================================================================

    /// @notice 매치 결과 제출 성공 - 점수, 승자, 상태가 올바르게 기록되는지 확인
    function test_SubmitResult_Success() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];

        // MatchCompleted 이벤트 발생 확인
        vm.expectEmit(true, false, false, true, address(arena));
        emit IGhostArena.MatchCompleted(matchId, participants[0], 100, 50);

        vm.prank(arenaManager);
        arena.submitResult(matchId, 100, 50, participants[0], keccak256("log"), "ipfs://replay0");

        // 매치 결과 검증
        (
            ,,,,
            uint256 scoreA_,
            uint256 scoreB_,
            address winner_,,
            string memory replayURI_,
            IGhostArena.MatchStatus status_
        ) = arena.matches(matchId);

        assertEq(scoreA_, 100, unicode"agentA 점수가 100이어야 함");
        assertEq(scoreB_, 50, unicode"agentB 점수가 50이어야 함");
        assertEq(winner_, participants[0], unicode"승자가 agentA여야 함");
        assertEq(replayURI_, "ipfs://replay0", unicode"리플레이 URI가 일치해야 함");
        assertEq(
            uint256(status_), uint256(IGhostArena.MatchStatus.Completed), unicode"매치 상태가 Completed여야 함"
        );

        // 승자 통계 확인
        (,,, uint256 wins_,, uint256 totalScore_,,) = arena.agents(participants[0]);
        assertEq(wins_, 1, unicode"승자의 승수가 1이어야 함");
        assertEq(totalScore_, 100, unicode"승자의 총점이 100이어야 함");

        // 패자 통계 확인
        (,,,, uint256 losses_,,,) = arena.agents(participants[1]);
        assertEq(losses_, 1, unicode"패자의 패수가 1이어야 함");
    }

    /// @notice agentB가 승리하는 결과 제출 성공 확인
    function test_SubmitResult_AgentBWins() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];

        vm.prank(arenaManager);
        arena.submitResult(matchId, 30, 80, participants[1], keccak256("log"), "ipfs://replay");

        (,,,,,, address winner_,,,) = arena.matches(matchId);
        assertEq(winner_, participants[1], unicode"승자가 agentB여야 함");

        // agentB 승리 통계 확인
        (,,, uint256 winsB_,, uint256 totalScoreB_,,) = arena.agents(participants[1]);
        assertEq(winsB_, 1, unicode"agentB의 승수가 1이어야 함");
        assertEq(totalScoreB_, 80, unicode"agentB의 총점이 80이어야 함");

        // agentA 패배 통계 확인
        (,,,, uint256 lossesA_,,,) = arena.agents(participants[0]);
        assertEq(lossesA_, 1, unicode"agentA의 패수가 1이어야 함");
    }

    /// @notice 존재하지 않는 매치에 결과 제출 시 InvalidMatch 에러 발생 확인
    function test_SubmitResult_RevertIf_InvalidMatchId() public {
        _createTournamentWith8();

        vm.prank(arenaManager);
        vm.expectRevert(IGhostArena.InvalidMatch.selector);
        arena.submitResult(999, 100, 50, address(1), keccak256("log"), "ipfs://replay");
    }

    /// @notice agentA도 agentB도 아닌 제3자를 승자로 지정 시 InvalidWinner 에러 발생 확인
    function test_SubmitResult_RevertIf_InvalidWinner() public {
        (uint256 tid,) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];
        address thirdParty = makeAddr("thirdParty");

        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.InvalidWinner.selector);
        arena.submitResult(matchId, 100, 50, thirdParty, keccak256("log"), "ipfs://replay");
    }

    /// @notice 이미 완료된 매치에 다시 결과 제출 시 MatchNotCompletable 에러 발생 확인
    function test_SubmitResult_RevertIf_AlreadyCompleted() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];

        // 첫 번째 결과 제출 (성공)
        vm.prank(arenaManager);
        arena.submitResult(matchId, 100, 50, participants[0], keccak256("log"), "ipfs://replay");

        // 두 번째 결과 제출 (이미 Completed이므로 실패)
        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.MatchNotCompletable.selector);
        arena.submitResult(matchId, 80, 70, participants[1], keccak256("log2"), "ipfs://replay2");
    }

    /// @notice 아레나 매니저가 아닌 주소로 결과 제출 시 Unauthorized 에러 발생 확인
    function test_SubmitResult_RevertIf_Unauthorized() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];

        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.submitResult(matchId, 100, 50, participants[0], keccak256("log"), "ipfs://replay");
    }

    // =========================================================================
    //                     4. 단위 테스트 - 브래킷 진행
    // =========================================================================

    /// @notice 8인 토너먼트 전체 라이프사이클 - 라운드 0 → 1 → 2 → 우승자 결정
    function test_AdvanceBracket_Full8PlayerLifecycle() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();

        // --- 라운드 0: 4매치, 모두 agentA 승리 ---
        _submitAllRoundResults(tid, 0);

        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 1 매치 확인 (2매치)
        uint256[] memory round1 = arena.getRoundMatches(tid, 1);
        assertEq(round1.length, 2, unicode"라운드 1에 2개의 매치가 생성되어야 함");
        assertEq(arena.tournamentCurrentRound(tid), 1, unicode"현재 라운드가 1이어야 함");

        // 라운드 1 매치 참가자 확인 (라운드 0 승자들)
        (,, address r1m0a, address r1m0b,,,,,,) = arena.matches(round1[0]);
        assertEq(r1m0a, participants[0], unicode"라운드 1 매치 0의 agentA가 participants[0]이어야 함");
        assertEq(r1m0b, participants[2], unicode"라운드 1 매치 0의 agentB가 participants[2]이어야 함");

        // --- 라운드 1: 2매치, 모두 agentA 승리 ---
        _submitAllRoundResults(tid, 1);

        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 라운드 2 매치 확인 (1매치 = 결승전)
        uint256[] memory round2 = arena.getRoundMatches(tid, 2);
        assertEq(round2.length, 1, unicode"라운드 2(결승)에 1개의 매치가 생성되어야 함");
        assertEq(arena.tournamentCurrentRound(tid), 2, unicode"현재 라운드가 2여야 함");

        // --- 라운드 2 (결승): 1매치 ---
        _submitAllRoundResults(tid, 2);

        // TournamentCompleted 이벤트 발생 확인
        vm.expectEmit(true, false, false, true, address(arena));
        emit IGhostArena.TournamentCompleted(tid, participants[0]);

        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 토너먼트 완료 상태 확인
        (,,, IGhostArena.TournamentStatus status_,) = arena.tournaments(tid);
        assertEq(
            uint256(status_),
            uint256(IGhostArena.TournamentStatus.Completed),
            unicode"토너먼트 상태가 Completed여야 함"
        );
        assertEq(arena.tournamentChampion(tid), participants[0], unicode"우승자가 participants[0]이어야 함");
    }

    /// @notice 라운드가 완료되지 않은 상태에서 브래킷 진행 시 RoundNotComplete 에러 발생 확인
    function test_AdvanceBracket_RevertIf_RoundNotComplete() public {
        (uint256 tid,) = _createTournamentWith8();

        // 라운드 0의 4매치 중 1매치만 제출
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        (,, address agentA,,,,,,,) = arena.matches(round0[0]);
        vm.prank(arenaManager);
        arena.submitResult(round0[0], 100, 50, agentA, keccak256("log"), "ipfs://replay");

        // 나머지 매치가 미완료 상태에서 진행 시도
        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.RoundNotComplete.selector);
        arena.advanceBracket(tid);
    }

    /// @notice 활성 상태가 아닌 토너먼트에서 브래킷 진행 시 TournamentNotActive 에러 발생 확인
    function test_AdvanceBracket_RevertIf_TournamentNotActive() public {
        // 존재하지 않는 토너먼트 (기본 상태 Upcoming = 0이므로 Active가 아님)
        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.TournamentNotActive.selector);
        arena.advanceBracket(999);
    }

    /// @notice 이미 완료된 토너먼트에서 브래킷 진행 시 TournamentNotActive 에러 발생 확인
    function test_AdvanceBracket_RevertIf_AlreadyCompleted() public {
        (uint256 tid,) = _createTournamentWith8();

        // 전체 토너먼트를 완료까지 진행
        _completeTournament(tid);

        // 완료된 토너먼트에서 다시 진행 시도
        vm.prank(arenaManager);
        vm.expectRevert(GhostArena.TournamentNotActive.selector);
        arena.advanceBracket(tid);
    }

    // =========================================================================
    //                       5. 단위 테스트 - 상금 수령
    // =========================================================================

    /// @notice 토너먼트 우승자가 상금을 성공적으로 수령하는지 확인
    function test_ClaimPrize_Success() public {
        // 에이전트 등록 및 토너먼트 생성
        address[] memory participants = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(participants, 8);
        uint256 tid = 0;

        // Active 상태에서 상금 풀 충전
        uint256 prizeAmount = 1 ether;
        arena.fundTournament{value: prizeAmount}(tid);

        // 토너먼트 완료 진행
        _completeTournament(tid);

        address champion = arena.tournamentChampion(tid);
        uint256 balanceBefore = champion.balance;

        // PrizeClaimed 이벤트 발생 확인
        vm.expectEmit(true, false, false, true, address(arena));
        emit IGhostArena.PrizeClaimed(tid, champion, prizeAmount);

        vm.prank(champion);
        arena.claimPrize(tid);

        uint256 balanceAfter = champion.balance;
        assertEq(balanceAfter - balanceBefore, prizeAmount, unicode"우승자 잔액이 상금만큼 증가해야 함");
        assertTrue(arena.prizeClaimed(tid), unicode"상금 수령 플래그가 true여야 함");
    }

    /// @notice 우승자가 아닌 주소가 상금 수령 시 NotChampion 에러 발생 확인
    function test_ClaimPrize_RevertIf_NotChampion() public {
        (uint256 tid,) = _createTournamentWith8();
        _completeTournament(tid);

        vm.prank(unauthorized);
        vm.expectRevert(GhostArena.NotChampion.selector);
        arena.claimPrize(tid);
    }

    /// @notice 미완료 토너먼트에서 상금 수령 시 TournamentNotCompleted 에러 발생 확인
    function test_ClaimPrize_RevertIf_TournamentNotCompleted() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();

        // 토너먼트가 아직 Active 상태에서 수령 시도
        vm.prank(participants[0]);
        vm.expectRevert(GhostArena.TournamentNotCompleted.selector);
        arena.claimPrize(tid);
    }

    /// @notice 이미 수령한 상금을 다시 수령 시 PrizeAlreadyClaimed 에러 발생 확인
    function test_ClaimPrize_RevertIf_AlreadyClaimed() public {
        address[] memory p = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(p, 8);
        uint256 tid = 0;

        // 상금 풀 충전
        arena.fundTournament{value: 1 ether}(tid);

        // 토너먼트 완료 진행
        _completeTournament(tid);

        address champion = arena.tournamentChampion(tid);

        // 첫 번째 수령 (성공)
        vm.prank(champion);
        arena.claimPrize(tid);

        // 두 번째 수령 (이중 수령 방지)
        vm.prank(champion);
        vm.expectRevert(GhostArena.PrizeAlreadyClaimed.selector);
        arena.claimPrize(tid);
    }

    // =========================================================================
    //                     6. 단위 테스트 - 평판 업데이트
    // =========================================================================

    /// @notice 에이전트 평판 업데이트 성공 확인
    function test_UpdateReputation_Success() public {
        address[] memory agents_ = _registerAgents(1);
        address agent = agents_[0];

        vm.prank(arenaManager);
        arena.updateReputation(agent, 1500);

        (,,,,,, uint256 reputation_,) = arena.agents(agent);
        assertEq(reputation_, 1500, unicode"평판이 1500으로 업데이트되어야 함");
    }

    /// @notice 미등록 에이전트 평판 업데이트 시 AgentNotRegistered 에러 발생 확인
    function test_UpdateReputation_RevertIf_AgentNotRegistered() public {
        address unregistered = makeAddr("unregisteredAgent");

        vm.prank(arenaManager);
        vm.expectRevert(IGhostArena.AgentNotRegistered.selector);
        arena.updateReputation(unregistered, 1500);
    }

    /// @notice 아레나 매니저가 아닌 주소로 평판 업데이트 시 Unauthorized 에러 발생 확인
    function test_UpdateReputation_RevertIf_Unauthorized() public {
        address[] memory agents_ = _registerAgents(1);

        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.updateReputation(agents_[0], 1500);
    }

    // =========================================================================
    //                       7. 단위 테스트 - 관리자 함수
    // =========================================================================

    /// @notice 아레나 매니저 주소 변경 성공 확인
    function test_SetArenaManager_Success() public {
        address newManager = makeAddr("newManager");
        arena.setArenaManager(newManager);
        assertEq(arena.arenaManager(), newManager, unicode"아레나 매니저가 새 주소로 변경되어야 함");
    }

    /// @notice 소유자가 아닌 주소로 아레나 매니저 변경 시 Unauthorized 에러 발생 확인
    function test_SetArenaManager_RevertIf_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.setArenaManager(makeAddr("newManager"));
    }

    /// @notice 컨트랙트 일시정지 및 해제 정상 동작 확인
    function test_PauseUnpause_Success() public {
        // 일시정지
        arena.pause();

        address agent = makeAddr("pauseTestAgent");
        vm.deal(agent, 1 ether);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        arena.registerAgent{value: REGISTRATION_FEE}("PBot", "ipfs://p");

        // 일시정지 해제
        arena.unpause();

        vm.prank(agent);
        arena.registerAgent{value: REGISTRATION_FEE}("PBot", "ipfs://p");
        (,,,,,,, bool active_) = arena.agents(agent);
        assertTrue(active_, unicode"일시정지 해제 후 등록이 가능해야 함");
    }

    /// @notice 소유자가 아닌 주소로 일시정지 시 Unauthorized 에러 발생 확인
    function test_Pause_RevertIf_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.pause();
    }

    /// @notice 소유자가 아닌 주소로 일시정지 해제 시 Unauthorized 에러 발생 확인
    function test_Unpause_RevertIf_Unauthorized() public {
        arena.pause();

        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.unpause();
    }

    /// @notice 토너먼트 상금 풀에 ETH 추가 성공 확인
    function test_FundTournament_Success() public {
        (uint256 tid,) = _createTournamentWith8();

        uint256 fundAmount = 0.5 ether;
        arena.fundTournament{value: fundAmount}(tid);

        (,, uint256 prizePool_,,) = arena.tournaments(tid);
        assertEq(prizePool_, fundAmount, unicode"상금 풀에 전송된 금액이 반영되어야 함");

        // 추가 충전으로 누적 확인
        arena.fundTournament{value: 0.3 ether}(tid);
        (,, uint256 prizePool2_,,) = arena.tournaments(tid);
        assertEq(prizePool2_, fundAmount + 0.3 ether, unicode"상금 풀에 추가 금액이 누적되어야 함");
    }

    /// @notice 비활성 토너먼트에 상금 추가 시 TournamentNotActive 에러 발생 확인
    function test_FundTournament_RevertIf_TournamentNotActive() public {
        vm.expectRevert(GhostArena.TournamentNotActive.selector);
        arena.fundTournament{value: 0.5 ether}(999);
    }

    /// @notice 트레저리 주소 변경 성공 확인
    function test_SetTreasury_Success() public {
        address newTreasury = makeAddr("newTreasury");
        arena.setTreasury(newTreasury);
        assertEq(arena.treasury(), newTreasury, unicode"트레저리가 새 주소로 변경되어야 함");
    }

    /// @notice 소유자가 아닌 주소로 트레저리 변경 시 Unauthorized 에러 발생 확인
    function test_SetTreasury_RevertIf_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.setTreasury(makeAddr("newTreasury"));
    }

    /// @notice 등록 수수료 변경 성공 확인 및 변경된 수수료로 등록 동작 검증
    function test_SetRegistrationFee_Success() public {
        uint256 newFee = 0.05 ether;
        arena.setRegistrationFee(newFee);
        assertEq(arena.registrationFee(), newFee, unicode"등록 수수료가 새 값으로 변경되어야 함");

        // 변경된 수수료로 등록 시도
        address agent = makeAddr("newFeeAgent");
        vm.deal(agent, 1 ether);

        // 이전 수수료(0.01 ETH)로는 실패
        vm.prank(agent);
        vm.expectRevert(IGhostArena.InsufficientRegistrationFee.selector);
        arena.registerAgent{value: REGISTRATION_FEE}("Bot", "ipfs://bot");

        // 새 수수료(0.05 ETH)로는 성공
        vm.prank(agent);
        arena.registerAgent{value: newFee}("Bot", "ipfs://bot");
        (,,,,,,, bool active_) = arena.agents(agent);
        assertTrue(active_, unicode"변경된 수수료로 등록이 성공해야 함");
    }

    /// @notice 소유자가 아닌 주소로 등록 수수료 변경 시 Unauthorized 에러 발생 확인
    function test_SetRegistrationFee_RevertIf_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.setRegistrationFee(0.05 ether);
    }

    /// @notice 트레저리로 축적된 수수료 인출 성공 확인
    function test_WithdrawToTreasury_Success() public {
        // 에이전트 5명 등록으로 수수료 축적
        _registerAgents(5);
        uint256 expectedBalance = REGISTRATION_FEE * 5;

        assertEq(
            address(arena).balance,
            expectedBalance,
            unicode"컨트랙트 잔액이 축적된 수수료와 일치해야 함"
        );

        uint256 treasuryBefore = treasury.balance;

        arena.withdrawToTreasury();

        assertEq(address(arena).balance, 0, unicode"인출 후 컨트랙트 잔액이 0이어야 함");
        assertEq(
            treasury.balance - treasuryBefore,
            expectedBalance,
            unicode"트레저리 잔액이 인출 금액만큼 증가해야 함"
        );
    }

    /// @notice 잔액이 0인 상태에서 인출 시 TransferFailed 에러 발생 확인
    function test_WithdrawToTreasury_RevertIf_ZeroBalance() public {
        vm.expectRevert(GhostArena.TransferFailed.selector);
        arena.withdrawToTreasury();
    }

    /// @notice 소유자가 아닌 주소로 인출 시 Unauthorized 에러 발생 확인
    function test_WithdrawToTreasury_RevertIf_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.withdrawToTreasury();
    }

    // =========================================================================
    //                       8. 단위 테스트 - 뷰 함수
    // =========================================================================

    /// @notice getRoundMatches가 올바른 매치 ID 배열을 반환하는지 확인
    function test_GetRoundMatches_Success() public {
        (uint256 tid,) = _createTournamentWith8();

        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        assertEq(round0.length, 4, unicode"라운드 0에 4개의 매치가 있어야 함");

        // 각 매치 ID가 순차적으로 할당되었는지 확인
        for (uint256 i = 0; i < round0.length; i++) {
            assertEq(round0[i], i, unicode"매치 ID가 순차적이어야 함");
        }
    }

    /// @notice 존재하지 않는 라운드 조회 시 빈 배열 반환 확인
    function test_GetRoundMatches_EmptyForNonExistentRound() public {
        (uint256 tid,) = _createTournamentWith8();
        uint256[] memory noRound = arena.getRoundMatches(tid, 99);
        assertEq(noRound.length, 0, unicode"존재하지 않는 라운드는 빈 배열을 반환해야 함");
    }

    /// @notice getTournamentParticipants가 올바른 참가자 배열을 반환하는지 확인
    function test_GetTournamentParticipants_Success() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();

        address[] memory fetched = arena.getTournamentParticipants(tid);
        assertEq(fetched.length, participants.length, unicode"참가자 수가 일치해야 함");

        for (uint256 i = 0; i < participants.length; i++) {
            assertEq(fetched[i], participants[i], unicode"각 참가자 주소가 일치해야 함");
        }
    }

    /// @notice 존재하지 않는 토너먼트 참가자 조회 시 빈 배열 반환 확인
    function test_GetTournamentParticipants_EmptyForNonExistentTournament() public {
        address[] memory fetched = arena.getTournamentParticipants(999);
        assertEq(
            fetched.length, 0, unicode"존재하지 않는 토너먼트는 빈 참가자 배열을 반환해야 함"
        );
    }

    // =========================================================================
    //                       9. 단위 테스트 - 생성자 및 초기 상태
    // =========================================================================

    /// @notice 생성자가 owner, arenaManager, treasury를 올바르게 설정하는지 확인
    function test_Constructor_InitialState() public view {
        assertEq(arena.owner(), deployer, unicode"소유자가 배포자와 일치해야 함");
        assertEq(
            arena.arenaManager(), arenaManager, unicode"아레나 매니저가 생성자 인자와 일치해야 함"
        );
        assertEq(arena.treasury(), treasury, unicode"트레저리가 생성자 인자와 일치해야 함");
        assertEq(arena.registrationFee(), REGISTRATION_FEE, unicode"기본 등록 수수료가 0.01 ether여야 함");
        assertEq(arena.nextTournamentId(), 0, unicode"초기 토너먼트 ID가 0이어야 함");
        assertEq(arena.nextMatchId(), 0, unicode"초기 매치 ID가 0이어야 함");
    }

    /// @notice receive 함수를 통해 ETH를 직접 수신할 수 있는지 확인
    function test_Receive_AcceptsEth() public {
        uint256 amount = 1 ether;
        (bool success,) = address(arena).call{value: amount}("");
        assertTrue(success, unicode"컨트랙트가 ETH를 직접 수신할 수 있어야 함");
        assertEq(address(arena).balance, amount, unicode"컨트랙트 잔액이 전송된 금액과 일치해야 함");
    }

    // =========================================================================
    //                       10. 퍼즈 테스트
    // =========================================================================

    /// @notice 다양한 수수료 금액으로 에이전트 등록을 퍼징하여 경계값 동작 확인
    /// @param fee 퍼징할 등록 수수료 금액
    function testFuzz_RegisterAgent(uint256 fee) public {
        fee = bound(fee, 0, 10 ether);

        address agent = makeAddr("fuzzAgent");
        vm.deal(agent, 11 ether);

        if (fee < REGISTRATION_FEE) {
            // 수수료 부족 시 revert 확인
            vm.prank(agent);
            vm.expectRevert(IGhostArena.InsufficientRegistrationFee.selector);
            arena.registerAgent{value: fee}("FuzzBot", "ipfs://fuzz");
        } else {
            // 수수료 충분 시 정상 등록 확인
            vm.prank(agent);
            arena.registerAgent{value: fee}("FuzzBot", "ipfs://fuzz");

            (,,,,,,, bool active_) = arena.agents(agent);
            assertTrue(active_, unicode"충분한 수수료일 때 등록이 성공해야 함");
        }
    }

    /// @notice 다양한 평판 값으로 업데이트를 퍼징하여 임의의 uint256 값이 올바르게 저장되는지 확인
    /// @param newRating 퍼징할 새 평판 점수
    function testFuzz_UpdateReputation(uint256 newRating) public {
        address[] memory agents_ = _registerAgents(1);
        address agent = agents_[0];

        vm.prank(arenaManager);
        arena.updateReputation(agent, newRating);

        (,,,,,, uint256 reputation_,) = arena.agents(agent);
        assertEq(reputation_, newRating, unicode"퍼징된 평판 값이 올바르게 저장되어야 함");
    }

    /// @notice 다양한 금액으로 토너먼트 상금 풀 충전을 퍼징
    /// @param amount 퍼징할 충전 금액
    function testFuzz_FundTournament(uint256 amount) public {
        amount = bound(amount, 0, 100 ether);

        (uint256 tid,) = _createTournamentWith8();

        vm.deal(address(this), amount + 1 ether);
        arena.fundTournament{value: amount}(tid);

        (,, uint256 prizePool_,,) = arena.tournaments(tid);
        assertEq(prizePool_, amount, unicode"퍼징된 충전 금액이 상금 풀에 올바르게 반영되어야 함");
    }

    // =========================================================================
    //                       11. 통합 테스트 - 전체 토너먼트 라이프사이클
    // =========================================================================

    /// @notice 전체 8인 토너먼트 라이프사이클 통합 테스트
    /// @dev 에이전트 등록 → 토너먼트 생성 → 라운드별 결과 제출 → 브래킷 진행
    ///      → 우승자 결정 → 상금 풀 충전 → 상금 수령까지 전체 흐름 검증
    function test_Integration_FullTournamentLifecycle() public {
        // --- 1단계: 8명의 에이전트 등록 ---
        address[] memory participants = _registerAgents(8);

        // 각 에이전트의 초기 상태 확인
        for (uint256 i = 0; i < 8; i++) {
            (address owner_,,,,,, uint256 rep_, bool active_) = arena.agents(participants[i]);
            assertEq(owner_, participants[i], unicode"에이전트 소유자가 일치해야 함");
            assertEq(rep_, DEFAULT_REPUTATION, unicode"초기 평판이 1000이어야 함");
            assertTrue(active_, unicode"에이전트가 활성 상태여야 함");
        }

        // --- 2단계: 토너먼트 생성 ---
        vm.prank(arenaManager);
        arena.createTournament(participants, 8);
        uint256 tid = 0;

        // --- 3단계: 상금 풀 충전 (Active 상태에서만 가능) ---
        uint256 totalPrize = 5 ether;
        vm.deal(address(this), totalPrize);
        arena.fundTournament{value: totalPrize}(tid);

        (,, uint256 prizePool_,,) = arena.tournaments(tid);
        assertEq(prizePool_, totalPrize, unicode"상금 풀이 5 ETH여야 함");

        // --- 4단계: 라운드 0 - 8강전 (4매치, 다양한 승자) ---
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        assertEq(round0.length, 4, unicode"8강전에 4개 매치가 있어야 함");

        // 매치 0: participants[0] 승리 (100 vs 60)
        vm.prank(arenaManager);
        arena.submitResult(round0[0], 100, 60, participants[0], keccak256("r0m0"), "ipfs://r0m0");

        // 매치 1: participants[3] 승리 (45 vs 90)
        vm.prank(arenaManager);
        arena.submitResult(round0[1], 45, 90, participants[3], keccak256("r0m1"), "ipfs://r0m1");

        // 매치 2: participants[4] 승리 (75 vs 30)
        vm.prank(arenaManager);
        arena.submitResult(round0[2], 75, 30, participants[4], keccak256("r0m2"), "ipfs://r0m2");

        // 매치 3: participants[7] 승리 (55 vs 85)
        vm.prank(arenaManager);
        arena.submitResult(round0[3], 55, 85, participants[7], keccak256("r0m3"), "ipfs://r0m3");

        // 라운드 0 승자 통계 확인
        (,,, uint256 w0,,,,) = arena.agents(participants[0]);
        assertEq(w0, 1, unicode"participants[0]의 승수가 1이어야 함");

        (,,, uint256 w3,,,,) = arena.agents(participants[3]);
        assertEq(w3, 1, unicode"participants[3]의 승수가 1이어야 함");

        // --- 5단계: 브래킷 진행 (라운드 0 → 1) ---
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        uint256[] memory round1 = arena.getRoundMatches(tid, 1);
        assertEq(round1.length, 2, unicode"4강전에 2개 매치가 있어야 함");

        // 라운드 1 매치 참가자 확인 (라운드 0 승자끼리 대전)
        (,, address r1m0a, address r1m0b,,,,,,) = arena.matches(round1[0]);
        assertEq(r1m0a, participants[0], unicode"4강 매치 0의 agentA가 라운드 0의 첫 번째 승자여야 함");
        assertEq(r1m0b, participants[3], unicode"4강 매치 0의 agentB가 라운드 0의 두 번째 승자여야 함");

        (,, address r1m1a, address r1m1b,,,,,,) = arena.matches(round1[1]);
        assertEq(r1m1a, participants[4], unicode"4강 매치 1의 agentA가 라운드 0의 세 번째 승자여야 함");
        assertEq(r1m1b, participants[7], unicode"4강 매치 1의 agentB가 라운드 0의 네 번째 승자여야 함");

        // --- 6단계: 라운드 1 - 4강전 (2매치) ---
        // 매치: participants[0] 승리
        vm.prank(arenaManager);
        arena.submitResult(round1[0], 120, 80, participants[0], keccak256("r1m0"), "ipfs://r1m0");

        // 매치: participants[7] 승리
        vm.prank(arenaManager);
        arena.submitResult(round1[1], 60, 110, participants[7], keccak256("r1m1"), "ipfs://r1m1");

        // --- 7단계: 브래킷 진행 (라운드 1 → 2) ---
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        uint256[] memory round2 = arena.getRoundMatches(tid, 2);
        assertEq(round2.length, 1, unicode"결승전에 1개 매치가 있어야 함");

        // 결승전 참가자 확인
        (,, address finalA, address finalB,,,,,,) = arena.matches(round2[0]);
        assertEq(finalA, participants[0], unicode"결승전 agentA가 participants[0]이어야 함");
        assertEq(finalB, participants[7], unicode"결승전 agentB가 participants[7]이어야 함");

        // --- 8단계: 결승전 ---
        vm.prank(arenaManager);
        arena.submitResult(round2[0], 150, 140, participants[0], keccak256("final"), "ipfs://final");

        // --- 9단계: 최종 브래킷 진행 → 우승자 결정 ---
        vm.prank(arenaManager);
        arena.advanceBracket(tid);

        // 토너먼트 완료 상태 확인
        (,,, IGhostArena.TournamentStatus finalStatus_,) = arena.tournaments(tid);
        assertEq(
            uint256(finalStatus_),
            uint256(IGhostArena.TournamentStatus.Completed),
            unicode"토너먼트가 Completed 상태여야 함"
        );

        address champion = arena.tournamentChampion(tid);
        assertEq(champion, participants[0], unicode"우승자가 participants[0]이어야 함");

        // 우승자 최종 통계 확인 (3승 0패, 총점 = 100 + 120 + 150 = 370)
        (,,, uint256 champWins, uint256 champLosses, uint256 champScore,,) = arena.agents(champion);
        assertEq(champWins, 3, unicode"우승자의 총 승수가 3이어야 함");
        assertEq(champLosses, 0, unicode"우승자의 총 패수가 0이어야 함");
        assertEq(champScore, 100 + 120 + 150, unicode"우승자의 총점이 370이어야 함");

        // --- 10단계: 상금 수령 ---
        uint256 balanceBefore = champion.balance;

        vm.prank(champion);
        arena.claimPrize(tid);

        uint256 balanceAfter = champion.balance;
        assertEq(
            balanceAfter - balanceBefore, totalPrize, unicode"우승자가 전체 상금(5 ETH)을 수령해야 함"
        );
        assertTrue(arena.prizeClaimed(tid), unicode"상금 수령 플래그가 true여야 함");

        // --- 11단계: 이중 수령 방지 확인 ---
        vm.prank(champion);
        vm.expectRevert(GhostArena.PrizeAlreadyClaimed.selector);
        arena.claimPrize(tid);
    }

    /// @notice 여러 토너먼트를 연속으로 생성하고 독립적으로 진행되는지 확인
    function test_Integration_MultipleTournaments() public {
        // 토너먼트 1 생성
        address[] memory p1 = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(p1, 8);
        uint256 tid1 = 0;

        // 토너먼트 2 생성 (새 에이전트 8명)
        address[] memory p2 = _registerAgents(8);
        vm.prank(arenaManager);
        arena.createTournament(p2, 8);
        uint256 tid2 = 1;

        // 각 토너먼트가 독립적인 매치를 가지는지 확인
        uint256[] memory t1r0 = arena.getRoundMatches(tid1, 0);
        uint256[] memory t2r0 = arena.getRoundMatches(tid2, 0);

        assertEq(t1r0.length, 4, unicode"토너먼트 1 라운드 0에 4매치가 있어야 함");
        assertEq(t2r0.length, 4, unicode"토너먼트 2 라운드 0에 4매치가 있어야 함");

        // 매치 ID가 겹치지 않는지 확인
        for (uint256 i = 0; i < t1r0.length; i++) {
            for (uint256 j = 0; j < t2r0.length; j++) {
                assertTrue(t1r0[i] != t2r0[j], unicode"서로 다른 토너먼트의 매치 ID가 겹치면 안 됨");
            }
        }

        // 자동 증가 ID 확인
        assertEq(arena.nextTournamentId(), 2, unicode"두 토너먼트 생성 후 ID가 2여야 함");
        assertEq(arena.nextMatchId(), 8, unicode"총 8개의 매치가 생성되어야 함 (토너먼트당 4매치)");
    }

    // =========================================================================
    //                       12. 엣지 케이스 테스트
    // =========================================================================

    /// @notice 상금 풀이 0인 토너먼트에서 상금 수령 시 0 ETH 전송 성공 확인
    function test_ClaimPrize_ZeroPrizePool() public {
        (uint256 tid,) = _createTournamentWith8();

        // 상금 풀 충전 없이 토너먼트 완료
        _completeTournament(tid);

        address champion = arena.tournamentChampion(tid);
        uint256 balanceBefore = champion.balance;

        // 상금 0이어도 수령 트랜잭션 자체는 성공해야 함
        vm.prank(champion);
        arena.claimPrize(tid);

        assertEq(champion.balance, balanceBefore, unicode"상금 0일 때 잔액 변화가 없어야 함");
        assertTrue(arena.prizeClaimed(tid), unicode"상금 0이어도 수령 플래그가 설정되어야 함");
    }

    /// @notice 동일 점수로 매치 결과 제출이 가능한지 확인 (승자가 명시적으로 지정됨)
    function test_SubmitResult_TiedScore() public {
        (uint256 tid, address[] memory participants) = _createTournamentWith8();
        uint256[] memory round0 = arena.getRoundMatches(tid, 0);
        uint256 matchId = round0[0];

        // 동점이지만 승자를 agentA로 명시적 지정
        vm.prank(arenaManager);
        arena.submitResult(matchId, 50, 50, participants[0], keccak256("tie"), "ipfs://tie");

        (,,,,,, address winner_,,,) = arena.matches(matchId);
        assertEq(
            winner_, participants[0], unicode"동점이어도 명시적으로 지정된 승자가 기록되어야 함"
        );
    }

    /// @notice 아레나 매니저 변경 후 이전 매니저 권한 박탈 및 새 매니저 권한 부여 확인
    function test_SetArenaManager_RevokeOldGrantNew() public {
        address newManager = makeAddr("newManager");
        arena.setArenaManager(newManager);

        address[] memory agents_ = _registerAgents(1);

        // 이전 매니저로는 호출 불가
        vm.prank(arenaManager);
        vm.expectRevert(IGhostArena.Unauthorized.selector);
        arena.updateReputation(agents_[0], 2000);

        // 새 매니저로는 호출 가능
        vm.prank(newManager);
        arena.updateReputation(agents_[0], 2000);

        (,,,,,, uint256 rep_,) = arena.agents(agents_[0]);
        assertEq(rep_, 2000, unicode"새 매니저로 평판 업데이트가 성공해야 함");
    }

    /// @notice 등록 수수료를 0으로 설정하면 무료 등록이 가능한지 확인
    function test_SetRegistrationFee_ZeroAllowsFreeRegistration() public {
        arena.setRegistrationFee(0);

        address agent = makeAddr("freeRegAgent");
        vm.prank(agent);
        arena.registerAgent{value: 0}("FreeBot", "ipfs://free");

        (,,,,,,, bool active_) = arena.agents(agent);
        assertTrue(active_, unicode"수수료 0일 때 무료 등록이 가능해야 함");
    }
}
