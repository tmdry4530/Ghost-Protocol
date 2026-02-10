// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWagerPool
/// @notice 아레나 모드 패리뮤추얼 배팅 풀 인터페이스
/// @dev 각 매치별 독립적인 배팅 풀 관리
interface IWagerPool {
    /// @notice 배팅 방향
    enum Side {
        AgentA,
        AgentB
    }

    /// @notice 배팅 풀 상태
    enum PoolStatus {
        Open,
        Locked,
        Settled,
        Refunded
    }

    /// @notice 배팅 배치 시 발생
    event BetPlaced(uint256 indexed matchId, address indexed bettor, Side side, uint256 amount);

    /// @notice 배팅 잠금 시 발생
    event BetsLocked(uint256 indexed matchId, uint256 totalPool);

    /// @notice 배팅 정산 시 발생
    event BetsSettled(uint256 indexed matchId, Side winner, uint256 totalPool);

    /// @notice 배당금 수령 시 발생
    event WinningsClaimed(uint256 indexed matchId, address indexed bettor, uint256 amount);

    /// @notice 배팅 풀 오픈 시 발생 — 역할 매핑 설정 완료
    event PoolOpened(uint256 indexed matchId, Side pacmanSide);

    /// @notice 배팅 창 닫힘
    error BettingWindowClosed();

    /// @notice 배팅 금액 범위 초과
    error InvalidBetAmount();

    /// @notice 이미 정산된 풀
    error AlreadySettled();

    /// @notice 배팅 풀 오픈 — 매치별 역할 매핑 설정 (아레나 매니저 전용)
    /// @param matchId 매치 ID
    /// @param _pacmanSide 팩맨 역할이 속한 사이드 (AgentA 또는 AgentB)
    function openPool(uint256 matchId, Side _pacmanSide) external;

    /// @notice 배팅 배치
    /// @param matchId 매치 ID
    /// @param side 배팅 방향 (AgentA 또는 AgentB)
    function placeBet(uint256 matchId, Side side) external payable;

    /// @notice 배팅 잠금 (아레나 매니저 전용)
    /// @param matchId 매치 ID
    function lockBets(uint256 matchId) external;

    /// @notice 배팅 정산 (아레나 매니저 전용)
    /// @param matchId 매치 ID
    /// @param winner 승리 방향
    function settleBets(uint256 matchId, Side winner) external;

    /// @notice 배당금 수령
    /// @param matchId 매치 ID
    function claimWinnings(uint256 matchId) external;

    /// @notice 환불 (매치 취소 시)
    /// @param matchId 매치 ID
    function refund(uint256 matchId) external;
}
