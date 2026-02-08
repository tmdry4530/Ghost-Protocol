// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGhostArena
/// @notice Ghost Protocol 아레나 컨트랙트 인터페이스
/// @dev 토너먼트 관리, 에이전트 등록, 매치 결과 기록
interface IGhostArena {
    // ===== 구조체 =====

    /// @notice 등록된 에이전트 정보
    struct Agent {
        address owner;
        string name;
        string metadataURI;
        uint256 wins;
        uint256 losses;
        uint256 totalScore;
        uint256 reputation;
        bool active;
    }

    /// @notice 토너먼트 상태 열거형
    enum TournamentStatus {
        Upcoming,
        Active,
        Completed
    }

    /// @notice 토너먼트 정보
    struct Tournament {
        uint256 id;
        address[] participants;
        uint8 bracketSize;
        uint256 prizePool;
        TournamentStatus status;
        uint256 createdAt;
    }

    /// @notice 매치 상태 열거형
    enum MatchStatus {
        Pending,
        Active,
        Completed,
        Cancelled
    }

    /// @notice 개별 매치 정보
    struct Match {
        uint256 id;
        uint256 tournamentId;
        address agentA;
        address agentB;
        uint256 scoreA;
        uint256 scoreB;
        address winner;
        bytes32 gameLogHash;
        string replayURI;
        MatchStatus status;
    }

    // ===== 이벤트 =====

    /// @notice 에이전트 등록 시 발생
    event AgentRegistered(address indexed agent, string name);

    /// @notice 토너먼트 생성 시 발생
    event TournamentCreated(uint256 indexed id, uint8 bracketSize);

    /// @notice 매치 완료 시 발생
    event MatchCompleted(uint256 indexed matchId, address winner, uint256 scoreA, uint256 scoreB);

    /// @notice 토너먼트 완료 시 발생
    event TournamentCompleted(uint256 indexed id, address champion);

    /// @notice 상금 수령 시 발생
    event PrizeClaimed(uint256 indexed tournamentId, address winner, uint256 amount);

    // ===== 커스텀 에러 =====

    /// @notice 권한 없는 접근
    error Unauthorized();

    /// @notice 이미 등록된 에이전트
    error AgentAlreadyRegistered();

    /// @notice 등록비 부족
    error InsufficientRegistrationFee();

    /// @notice 유효하지 않은 토너먼트
    error InvalidTournament();

    /// @notice 유효하지 않은 매치
    error InvalidMatch();

    /// @notice 에이전트 미등록
    error AgentNotRegistered();

    // ===== 함수 =====

    /// @notice 새 에이전트 등록
    /// @param name 에이전트 이름
    /// @param metadataURI IPFS 메타데이터 URI
    function registerAgent(string calldata name, string calldata metadataURI) external payable;

    /// @notice 토너먼트 생성 (아레나 매니저 전용)
    /// @param participants 참가 에이전트 주소 배열
    /// @param bracketSize 브래킷 크기 (8 또는 16)
    function createTournament(address[] calldata participants, uint8 bracketSize) external;

    /// @notice 매치 결과 제출 (아레나 매니저 전용)
    /// @param matchId 매치 ID
    /// @param scoreA 에이전트 A 점수
    /// @param scoreB 에이전트 B 점수
    /// @param winner 승자 주소
    /// @param gameLogHash 게임 로그 해시
    /// @param replayURI 리플레이 IPFS URI
    function submitResult(
        uint256 matchId,
        uint256 scoreA,
        uint256 scoreB,
        address winner,
        bytes32 gameLogHash,
        string calldata replayURI
    ) external;

    /// @notice 브래킷 진행 (아레나 매니저 전용)
    /// @param tournamentId 토너먼트 ID
    function advanceBracket(uint256 tournamentId) external;

    /// @notice 상금 수령 (토너먼트 우승자)
    /// @param tournamentId 토너먼트 ID
    function claimPrize(uint256 tournamentId) external;
}
