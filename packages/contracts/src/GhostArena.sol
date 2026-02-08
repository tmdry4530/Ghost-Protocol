// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IGhostArena.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GhostArena
/// @notice Ghost Protocol 메인 아레나 컨트랙트 - 에이전트 등록, 토너먼트 관리, 매치 결과 기록
/// @dev IGhostArena 인터페이스를 구현하며, ReentrancyGuard와 Pausable을 상속하여 보안 강화
contract GhostArena is IGhostArena, ReentrancyGuard, Pausable {
    // ===== 상태 변수 =====

    /// @dev 에이전트 등록 정보 매핑 (에이전트 주소 => Agent 구조체)
    mapping(address => Agent) public agents;

    /// @dev 토너먼트 정보 매핑 (토너먼트 ID => Tournament 구조체)
    mapping(uint256 => Tournament) public tournaments;

    /// @dev 매치 정보 매핑 (매치 ID => Match 구조체)
    mapping(uint256 => Match) public matches;

    /// @dev 다음 토너먼트 ID (자동 증가)
    uint256 public nextTournamentId;

    /// @dev 다음 매치 ID (자동 증가)
    uint256 public nextMatchId;

    /// @dev 아레나 매니저 주소 (결과 제출 및 토너먼트 관리 권한)
    address public arenaManager;

    /// @dev 컨트랙트 소유자
    address public owner;

    /// @dev 에이전트 등록 수수료
    uint256 public registrationFee = 0.01 ether;

    /// @dev 토너먼트 라운드별 매치 ID 매핑 (토너먼트 ID => 라운드 => 매치 ID 배열)
    mapping(uint256 => mapping(uint256 => uint256[])) public tournamentRoundMatches;

    /// @dev 토너먼트 현재 라운드 인덱스
    mapping(uint256 => uint256) public tournamentCurrentRound;

    /// @dev 토너먼트 우승자 주소
    mapping(uint256 => address) public tournamentChampion;

    /// @dev 상금 수령 여부
    mapping(uint256 => bool) public prizeClaimed;

    /// @dev 수수료 수취 트레저리 주소
    address public treasury;

    // ===== 수정자 =====

    /// @dev 소유자 전용 수정자 - 호출자가 소유자가 아니면 거부
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /// @dev 아레나 매니저 전용 수정자 - 호출자가 아레나 매니저가 아니면 거부
    modifier onlyArenaManager() {
        if (msg.sender != arenaManager) revert Unauthorized();
        _;
    }

    // ===== 커스텀 에러 (인터페이스 미포함 항목) =====

    /// @notice 유효하지 않은 브래킷 크기 (8 또는 16만 허용)
    error InvalidBracketSize();

    /// @notice 참가자 수가 브래킷 크기와 불일치
    error ParticipantCountMismatch();

    /// @notice 유효하지 않은 승자 주소 (agentA 또는 agentB만 가능)
    error InvalidWinner();

    /// @notice 매치가 완료 가능한 상태가 아님 (Pending 또는 Active만 가능)
    error MatchNotCompletable();

    /// @notice 토너먼트가 활성 상태가 아님
    error TournamentNotActive();

    /// @notice 현재 라운드의 모든 매치가 완료되지 않음
    error RoundNotComplete();

    /// @notice 토너먼트가 완료 상태가 아님
    error TournamentNotCompleted();

    /// @notice 호출자가 토너먼트 우승자가 아님
    error NotChampion();

    /// @notice 상금이 이미 수령됨
    error PrizeAlreadyClaimed();

    /// @notice ETH 전송 실패
    error TransferFailed();

    // ===== 생성자 =====

    /// @notice 컨트랙트 초기화
    /// @param _arenaManager 아레나 매니저 주소
    /// @param _treasury 트레저리(수수료 수취) 주소
    constructor(address _arenaManager, address _treasury) {
        owner = msg.sender;
        arenaManager = _arenaManager;
        treasury = _treasury;
    }

    // ===== 외부 함수 =====

    /// @notice 새 에이전트 등록 - 등록 수수료(0.01 ETH)를 지불하고 에이전트를 등록
    /// @param name 에이전트 이름
    /// @param metadataURI IPFS 메타데이터 URI
    /// @dev 이미 등록된 에이전트는 재등록 불가, 일시정지 시 호출 불가
    function registerAgent(string calldata name, string calldata metadataURI) external payable override whenNotPaused {
        if (msg.value < registrationFee) revert InsufficientRegistrationFee();
        if (agents[msg.sender].active) revert AgentAlreadyRegistered();

        agents[msg.sender] = Agent({
            owner: msg.sender,
            name: name,
            metadataURI: metadataURI,
            wins: 0,
            losses: 0,
            totalScore: 0,
            reputation: 1000,
            active: true
        });

        emit AgentRegistered(msg.sender, name);
    }

    /// @notice 토너먼트 생성 - 참가자 배열과 브래킷 크기로 새 토너먼트 생성
    /// @param participants 참가 에이전트 주소 배열
    /// @param bracketSize 브래킷 크기 (8 또는 16만 허용)
    /// @dev 아레나 매니저만 호출 가능, 일시정지 시 호출 불가
    /// @dev 첫 번째 라운드 매치를 자동으로 생성 (participants[0] vs participants[1], ...)
    function createTournament(address[] calldata participants, uint8 bracketSize)
        external
        override
        onlyArenaManager
        whenNotPaused
    {
        // 브래킷 크기 유효성 검사 (8 또는 16만 허용)
        if (bracketSize != 8 && bracketSize != 16) revert InvalidBracketSize();

        // 참가자 수가 브래킷 크기와 일치하는지 검증
        if (participants.length != bracketSize) revert ParticipantCountMismatch();

        // 모든 참가자가 등록된 에이전트인지 검증
        for (uint256 i = 0; i < participants.length; i++) {
            if (!agents[participants[i]].active) revert AgentNotRegistered();
        }

        uint256 tournamentId = nextTournamentId++;

        // 토너먼트 정보 저장 (Active 상태로 시작)
        Tournament storage t = tournaments[tournamentId];
        t.id = tournamentId;
        t.bracketSize = bracketSize;
        t.prizePool = 0;
        t.status = TournamentStatus.Active;
        t.createdAt = block.timestamp;

        // participants 배열을 storage에 복사
        for (uint256 i = 0; i < participants.length; i++) {
            t.participants.push(participants[i]);
        }

        // 첫 번째 라운드(라운드 0) 매치 생성 - 인접한 참가자끼리 대전
        uint256 matchCount = participants.length / 2;
        for (uint256 i = 0; i < matchCount; i++) {
            uint256 matchId = nextMatchId++;
            matches[matchId] = Match({
                id: matchId,
                tournamentId: tournamentId,
                agentA: participants[i * 2],
                agentB: participants[i * 2 + 1],
                scoreA: 0,
                scoreB: 0,
                winner: address(0),
                gameLogHash: bytes32(0),
                replayURI: "",
                status: MatchStatus.Pending
            });
            tournamentRoundMatches[tournamentId][0].push(matchId);
        }

        // 현재 라운드를 0으로 초기화
        tournamentCurrentRound[tournamentId] = 0;

        emit TournamentCreated(tournamentId, bracketSize);
    }

    /// @notice 매치 결과 제출 - 완료된 매치의 점수, 승자, 게임 로그를 기록
    /// @param matchId 매치 ID
    /// @param scoreA 에이전트 A 점수
    /// @param scoreB 에이전트 B 점수
    /// @param winner 승자 주소 (agentA 또는 agentB 중 하나)
    /// @param gameLogHash 게임 로그의 keccak256 해시 (무결성 검증용)
    /// @param replayURI 리플레이 IPFS URI
    /// @dev 아레나 매니저만 호출 가능, 매치가 Pending 또는 Active 상태여야 함
    function submitResult(
        uint256 matchId,
        uint256 scoreA,
        uint256 scoreB,
        address winner,
        bytes32 gameLogHash,
        string calldata replayURI
    ) external override onlyArenaManager {
        Match storage m = matches[matchId];

        // 매치 존재 여부 확인 (agentA가 0이면 존재하지 않는 매치)
        if (m.agentA == address(0)) revert InvalidMatch();

        // 매치 상태 확인 (Pending 또는 Active만 결과 제출 가능)
        if (m.status != MatchStatus.Pending && m.status != MatchStatus.Active) {
            revert MatchNotCompletable();
        }

        // 승자가 agentA 또는 agentB인지 검증
        if (winner != m.agentA && winner != m.agentB) revert InvalidWinner();

        // 매치 결과 저장
        m.scoreA = scoreA;
        m.scoreB = scoreB;
        m.winner = winner;
        m.gameLogHash = gameLogHash;
        m.replayURI = replayURI;
        m.status = MatchStatus.Completed;

        // 에이전트 통계 업데이트 - 승자의 승수/점수 증가, 패자의 패수 증가
        address loser = (winner == m.agentA) ? m.agentB : m.agentA;
        uint256 winnerScore = (winner == m.agentA) ? scoreA : scoreB;

        agents[winner].wins += 1;
        agents[winner].totalScore += winnerScore;

        agents[loser].losses += 1;

        emit MatchCompleted(matchId, winner, scoreA, scoreB);
    }

    /// @notice 브래킷 진행 - 현재 라운드가 완료되면 다음 라운드 매치 생성 또는 토너먼트 종료
    /// @param tournamentId 토너먼트 ID
    /// @dev 아레나 매니저만 호출 가능
    /// @dev 현재 라운드의 모든 매치가 완료되어야 다음 라운드로 진행 가능
    /// @dev 승자가 1명만 남으면 토너먼트를 완료하고 우승자를 기록
    function advanceBracket(uint256 tournamentId) external override onlyArenaManager {
        Tournament storage t = tournaments[tournamentId];

        // 토너먼트 존재 및 활성 상태 확인
        if (t.status != TournamentStatus.Active) revert TournamentNotActive();

        uint256 currentRound = tournamentCurrentRound[tournamentId];
        uint256[] storage currentMatchIds = tournamentRoundMatches[tournamentId][currentRound];
        uint256 matchCount = currentMatchIds.length;

        // 현재 라운드의 모든 매치가 완료되었는지 확인
        address[] memory winners = new address[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            Match storage m = matches[currentMatchIds[i]];
            if (m.status != MatchStatus.Completed) revert RoundNotComplete();
            winners[i] = m.winner;
        }

        // 승자가 1명이면 토너먼트 완료 처리
        if (winners.length == 1) {
            t.status = TournamentStatus.Completed;
            tournamentChampion[tournamentId] = winners[0];
            emit TournamentCompleted(tournamentId, winners[0]);
            return;
        }

        // 다음 라운드 매치 생성 - 이전 라운드 승자끼리 대전
        uint256 nextRound = currentRound + 1;
        uint256 nextMatchCount = winners.length / 2;

        for (uint256 i = 0; i < nextMatchCount; i++) {
            uint256 matchId = nextMatchId++;
            matches[matchId] = Match({
                id: matchId,
                tournamentId: tournamentId,
                agentA: winners[i * 2],
                agentB: winners[i * 2 + 1],
                scoreA: 0,
                scoreB: 0,
                winner: address(0),
                gameLogHash: bytes32(0),
                replayURI: "",
                status: MatchStatus.Pending
            });
            tournamentRoundMatches[tournamentId][nextRound].push(matchId);
        }

        // 현재 라운드 인덱스를 다음 라운드로 업데이트
        tournamentCurrentRound[tournamentId] = nextRound;
    }

    /// @notice 상금 수령 - 토너먼트 우승자가 상금 풀의 ETH를 인출
    /// @param tournamentId 토너먼트 ID
    /// @dev 재진입 공격 방지를 위해 nonReentrant 수정자 적용
    /// @dev call{value:}("") 패턴으로 ETH 전송 (transfer() 미사용)
    function claimPrize(uint256 tournamentId) external override nonReentrant {
        Tournament storage t = tournaments[tournamentId];

        // 토너먼트가 완료 상태인지 확인
        if (t.status != TournamentStatus.Completed) revert TournamentNotCompleted();

        // 호출자가 우승자인지 확인
        if (msg.sender != tournamentChampion[tournamentId]) revert NotChampion();

        // 이중 수령 방지
        if (prizeClaimed[tournamentId]) revert PrizeAlreadyClaimed();

        // 상금 수령 플래그를 먼저 설정 (재진입 방지용 Checks-Effects-Interactions 패턴)
        prizeClaimed[tournamentId] = true;

        uint256 amount = t.prizePool;

        // ETH 전송 - call 패턴 사용
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit PrizeClaimed(tournamentId, msg.sender, amount);
    }

    /// @notice 에이전트 평판(ELO) 업데이트 - 아레나 매니저가 외부 ELO 계산 결과를 반영
    /// @param agentAddress 대상 에이전트 주소
    /// @param newRating 새로운 ELO 레이팅 점수
    /// @dev 아레나 매니저만 호출 가능, 에이전트가 등록되어 있어야 함
    function updateReputation(address agentAddress, uint256 newRating) external onlyArenaManager {
        if (!agents[agentAddress].active) revert AgentNotRegistered();
        agents[agentAddress].reputation = newRating;
    }

    /// @notice 아레나 매니저 주소 변경 (소유자 전용)
    /// @param _newManager 새 아레나 매니저 주소
    function setArenaManager(address _newManager) external onlyOwner {
        arenaManager = _newManager;
    }

    /// @notice 컨트랙트 일시정지 (소유자 전용)
    /// @dev 긴급 상황 발생 시 주요 기능을 중단하기 위해 사용
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice 컨트랙트 일시정지 해제 (소유자 전용)
    /// @dev 긴급 상황이 해소된 후 정상 운영을 재개하기 위해 사용
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice 토너먼트 상금 풀에 ETH 추가
    /// @param tournamentId 토너먼트 ID
    /// @dev 토너먼트가 Active 상태일 때만 추가 가능
    function fundTournament(uint256 tournamentId) external payable {
        Tournament storage t = tournaments[tournamentId];
        if (t.status != TournamentStatus.Active) revert TournamentNotActive();
        t.prizePool += msg.value;
    }

    /// @notice 트레저리 주소 변경 (소유자 전용)
    /// @param _newTreasury 새 트레저리 주소
    function setTreasury(address _newTreasury) external onlyOwner {
        treasury = _newTreasury;
    }

    /// @notice 등록 수수료 변경 (소유자 전용)
    /// @param _newFee 새 등록 수수료 (단위: wei)
    function setRegistrationFee(uint256 _newFee) external onlyOwner {
        registrationFee = _newFee;
    }

    /// @notice 트레저리로 축적된 등록 수수료 인출 (소유자 전용)
    /// @dev 토너먼트 상금 풀과 분리된 컨트랙트 잔액을 인출
    function withdrawToTreasury() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert TransferFailed();

        (bool success,) = payable(treasury).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    // ===== 뷰 함수 =====

    /// @notice 특정 토너먼트의 특정 라운드 매치 ID 목록 조회
    /// @param tournamentId 토너먼트 ID
    /// @param round 라운드 인덱스 (0부터 시작)
    /// @return matchIds 해당 라운드의 매치 ID 배열
    function getRoundMatches(uint256 tournamentId, uint256 round) external view returns (uint256[] memory) {
        return tournamentRoundMatches[tournamentId][round];
    }

    /// @notice 특정 토너먼트의 참가자 목록 조회
    /// @param tournamentId 토너먼트 ID
    /// @return participants 참가 에이전트 주소 배열
    function getTournamentParticipants(uint256 tournamentId) external view returns (address[] memory) {
        return tournaments[tournamentId].participants;
    }

    /// @notice ETH 수신 허용 (상금 풀 충전용)
    receive() external payable {}
}
