// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISurvivalBet
/// @notice 서바이벌 모드 예측 시장 인터페이스
/// @dev 라운드 기반 예측 배팅 및 정확도 가중 정산
interface ISurvivalBet {
    /// @notice 세션 상태
    enum SessionStatus {
        Betting,
        Active,
        Settled
    }

    /// @notice 예측 배치 시 발생
    event PredictionPlaced(uint256 indexed sessionId, address indexed bettor, uint8 predictedRound, uint256 amount);

    /// @notice 라운드 생존 기록 시 발생
    event RoundSurvived(uint256 indexed sessionId, uint8 round);

    /// @notice 세션 정산 시 발생
    event SessionSettled(uint256 indexed sessionId, uint8 eliminationRound, uint256 totalPool);

    /// @notice 유효하지 않은 세션
    error InvalidSession();

    /// @notice 유효하지 않은 라운드
    error InvalidRound();

    /// @notice 세션 생성
    /// @param player 플레이어 주소
    /// @return sessionId 새 세션 ID
    function createSession(address player) external returns (uint256 sessionId);

    /// @notice 예측 배치
    /// @param sessionId 세션 ID
    /// @param predictedRound 예측 탈락 라운드
    function placePrediction(uint256 sessionId, uint8 predictedRound) external payable;

    /// @notice 라운드 생존 기록 (아레나 매니저 전용)
    /// @param sessionId 세션 ID
    /// @param round 생존한 라운드
    function recordRoundSurvived(uint256 sessionId, uint8 round) external;

    /// @notice 세션 정산 (아레나 매니저 전용)
    /// @param sessionId 세션 ID
    /// @param eliminationRound 탈락 라운드
    function settleSession(uint256 sessionId, uint8 eliminationRound) external;

    /// @notice 배당금 수령
    /// @param sessionId 세션 ID
    function claimPayout(uint256 sessionId) external;
}
