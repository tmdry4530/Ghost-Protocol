// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ISurvivalBet.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SurvivalBet
/// @notice 서바이벌 모드 예측 시장 컨트랙트 — 플레이어의 탈락 라운드를 예측하고 정확도 기반 가중 정산 수행
/// @dev 라운드 기반 예측 배팅, 정확도 가중 배당, 생존 보너스 및 고점 보너스 지원
contract SurvivalBet is ISurvivalBet, ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  커스텀 에러
    // ──────────────────────────────────────────────

    /// @notice 아레나 매니저만 호출 가능한 함수에 다른 주소가 접근했을 때
    error OnlyArenaManager();

    /// @notice 최소 배팅 금액 미달
    error BetTooSmall();

    /// @notice 예측 라운드가 0일 때
    error RoundMustBePositive();

    /// @notice 이미 해당 세션에 예측을 배치한 경우
    error AlreadyPredicted();

    /// @notice 세션이 정산되지 않았을 때 수령 시도
    error SessionNotSettled();

    /// @notice 이미 배당금을 수령한 경우
    error AlreadyClaimed();

    /// @notice 배당 가중치가 0인 경우 (예측 오차가 너무 큼)
    error NoPayout();

    /// @notice ETH 전송 실패
    error TransferFailed();

    /// @notice 호출자가 세션 플레이어가 아닌 경우
    error NotSessionPlayer();

    /// @notice 플레이어 보너스가 이미 수령된 경우
    error BonusAlreadyClaimed();

    /// @notice 수령 가능한 보너스가 없는 경우
    error NoBonusAvailable();

    // ──────────────────────────────────────────────
    //  구조체
    // ──────────────────────────────────────────────

    /// @notice 세션 데이터 구조체
    /// @dev 하나의 플레이어에 대한 배팅 세션 전체 상태를 관리
    struct Session {
        address player; // 대상 플레이어
        SessionStatus status; // 세션 상태
        uint256 totalPool; // 총 배팅 풀
        uint8 currentRound; // 현재 생존 라운드
        uint8 eliminationRound; // 탈락 라운드 (정산 후 설정)
        uint256 totalWeightedShares; // 가중 지분 총합 (정산 시 계산)
        bool playerBonusClaimed; // 플레이어 보너스 수령 여부
        uint256 playerBonusAmount; // 플레이어 보너스 금액 (정산 시 계산)
    }

    /// @notice 개별 예측 데이터 구조체
    struct Prediction {
        uint8 predictedRound; // 예측 탈락 라운드
        uint256 amount; // 배팅 금액
        bool claimed; // 수령 여부
    }

    // ──────────────────────────────────────────────
    //  상태 변수
    // ──────────────────────────────────────────────

    /// @notice 세션 ID → 세션 데이터
    mapping(uint256 => Session) public sessions;

    /// @notice 세션 ID → 배팅자 주소 → 예측 데이터
    mapping(uint256 => mapping(address => Prediction)) public predictions;

    /// @notice 세션별 배팅자 목록
    mapping(uint256 => address[]) public sessionBettors;

    /// @notice 다음 세션 ID (자동 증가)
    uint256 public nextSessionId;

    /// @notice 컨트랙트 소유자
    address public owner;

    /// @notice 트레저리 주소 (수수료 수령)
    address public treasury;

    /// @notice 아레나 매니저 주소
    address public arenaManager;

    /// @notice 최소 배팅 금액
    uint256 public constant MIN_BET = 0.001 ether;

    /// @notice 수수료 비율 (베이시스 포인트, 5%)
    uint256 public constant FEE_BPS = 500;

    /// @notice 서바이벌 보너스 비율 (베이시스 포인트, 10%)
    uint256 public constant SURVIVAL_BONUS_BPS = 1000;

    /// @notice 고점 보너스 비율 (베이시스 포인트, 5%)
    uint256 public constant HIGH_SCORE_BONUS_BPS = 500;

    // ──────────────────────────────────────────────
    //  수정자
    // ──────────────────────────────────────────────

    /// @dev 아레나 매니저 전용 수정자
    modifier onlyArenaManager() {
        if (msg.sender != arenaManager) revert OnlyArenaManager();
        _;
    }

    // ──────────────────────────────────────────────
    //  생성자
    // ──────────────────────────────────────────────

    /// @notice 컨트랙트 초기화
    /// @param _arenaManager 아레나 매니저 주소
    /// @param _treasury 트레저리 주소 (수수료 수령)
    constructor(address _arenaManager, address _treasury) {
        owner = msg.sender;
        arenaManager = _arenaManager;
        treasury = _treasury;
    }

    // ──────────────────────────────────────────────
    //  외부 함수 — 세션 관리 (아레나 매니저 전용)
    // ──────────────────────────────────────────────

    /// @notice 새로운 배팅 세션 생성
    /// @param player 대상 플레이어 주소
    /// @return sessionId 생성된 세션 ID
    function createSession(address player) external override onlyArenaManager returns (uint256) {
        uint256 sessionId = nextSessionId++;

        sessions[sessionId] = Session({
            player: player,
            status: SessionStatus.Betting,
            totalPool: 0,
            currentRound: 0,
            eliminationRound: 0,
            totalWeightedShares: 0,
            playerBonusClaimed: false,
            playerBonusAmount: 0
        });

        return sessionId;
    }

    /// @notice 탈락 라운드 예측 배치
    /// @dev 세션이 Betting 상태일 때만 가능하며, 한 세션당 한 번만 예측 가능
    /// @param sessionId 세션 ID
    /// @param predictedRound 예측 탈락 라운드 (1 이상)
    function placePrediction(uint256 sessionId, uint8 predictedRound) external payable override {
        Session storage session = sessions[sessionId];

        // 세션이 배팅 상태인지 확인
        if (session.status != SessionStatus.Betting) revert InvalidSession();

        // 최소 배팅 금액 확인
        if (msg.value < MIN_BET) revert BetTooSmall();

        // 예측 라운드는 1 이상이어야 함
        if (predictedRound == 0) revert RoundMustBePositive();

        // 중복 예측 방지 — amount가 0이면 아직 예측하지 않은 것
        if (predictions[sessionId][msg.sender].amount != 0) revert AlreadyPredicted();

        // 예측 데이터 저장
        predictions[sessionId][msg.sender] =
            Prediction({predictedRound: predictedRound, amount: msg.value, claimed: false});

        // 배팅자 목록에 추가
        sessionBettors[sessionId].push(msg.sender);

        // 총 배팅 풀에 합산
        session.totalPool += msg.value;

        emit PredictionPlaced(sessionId, msg.sender, predictedRound, msg.value);
    }

    /// @notice 라운드 생존 기록
    /// @dev 첫 호출 시 Betting → Active 상태 전환 수행
    /// @param sessionId 세션 ID
    /// @param round 생존한 라운드 번호
    function recordRoundSurvived(uint256 sessionId, uint8 round) external override onlyArenaManager {
        Session storage session = sessions[sessionId];

        // Betting 또는 Active 상태에서만 호출 가능
        if (session.status == SessionStatus.Settled) revert InvalidSession();

        // 첫 호출 시 Betting → Active 전환
        if (session.status == SessionStatus.Betting) {
            session.status = SessionStatus.Active;
        }

        // 라운드 번호는 현재 라운드보다 커야 함
        if (round <= session.currentRound) revert InvalidRound();

        session.currentRound = round;

        emit RoundSurvived(sessionId, round);
    }

    /// @notice 세션 정산 — 탈락 라운드 기록, 가중 지분 계산, 수수료 전송, 보너스 산정
    /// @dev 모든 배팅자를 순회하며 가중 지분을 계산하고, 중앙값 기반 서바이벌 보너스를 산정
    /// @param sessionId 세션 ID
    /// @param eliminationRound 실제 탈락 라운드
    function settleSession(uint256 sessionId, uint8 eliminationRound) external override onlyArenaManager {
        Session storage session = sessions[sessionId];

        // Active 상태에서만 정산 가능
        if (session.status != SessionStatus.Active) revert InvalidSession();

        session.eliminationRound = eliminationRound;

        address[] storage bettors = sessionBettors[sessionId];
        uint256 bettorCount = bettors.length;

        // 가중 지분 총합 계산
        uint256 totalWeighted = 0;
        for (uint256 i = 0; i < bettorCount; i++) {
            Prediction storage pred = predictions[sessionId][bettors[i]];
            uint256 weight = _calculateWeight(pred.predictedRound, eliminationRound);
            totalWeighted += pred.amount * weight;
        }
        session.totalWeightedShares = totalWeighted;

        // 수수료 계산 및 트레저리로 전송
        uint256 totalFee = (session.totalPool * FEE_BPS) / 10000;

        // 서바이벌 보너스 산정 — 탈락 라운드가 중앙값 예측보다 클 경우
        uint256 bonusAmount = 0;
        if (bettorCount > 0) {
            uint8 median = _calculateMedian(sessionId, bettorCount);
            if (eliminationRound > median) {
                bonusAmount = (session.totalPool * SURVIVAL_BONUS_BPS) / 10000;
            }
        }
        session.playerBonusAmount = bonusAmount;

        // 트레저리 수수료 전송 (보너스 금액은 풀에서 예약)
        if (totalFee > 0) {
            (bool success,) = treasury.call{value: totalFee}("");
            if (!success) revert TransferFailed();
        }

        session.status = SessionStatus.Settled;

        emit SessionSettled(sessionId, eliminationRound, session.totalPool);
    }

    /// @notice 배당금 수령 — 예측 정확도에 따라 가중 배당금 지급
    /// @dev 재진입 공격 방지를 위해 nonReentrant 적용, Check-Effects-Interactions 패턴 준수
    /// @param sessionId 세션 ID
    function claimPayout(uint256 sessionId) external override nonReentrant {
        Session storage session = sessions[sessionId];

        // 정산 완료 상태 확인
        if (session.status != SessionStatus.Settled) revert SessionNotSettled();

        Prediction storage pred = predictions[sessionId][msg.sender];

        // 예측이 존재하는지 확인
        if (pred.amount == 0) revert InvalidSession();

        // 이미 수령했는지 확인
        if (pred.claimed) revert AlreadyClaimed();

        // 가중치 계산
        uint256 weight = _calculateWeight(pred.predictedRound, session.eliminationRound);
        if (weight == 0) revert NoPayout();

        uint256 weightedShare = pred.amount * weight;

        // 배당 가능 풀 = 총 풀 - 수수료 - 플레이어 보너스
        uint256 totalFee = (session.totalPool * FEE_BPS) / 10000;
        uint256 distributablePool = session.totalPool - totalFee - session.playerBonusAmount;

        // 배당금 = (개인 가중 지분 / 총 가중 지분) * 배당 가능 풀
        uint256 payout = (weightedShare * distributablePool) / session.totalWeightedShares;

        // Effects: 수령 완료 표시
        pred.claimed = true;

        // Interactions: ETH 전송
        (bool success,) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();
    }

    /// @notice 플레이어 서바이벌 보너스 수령
    /// @dev 세션 플레이어만 호출 가능, 정산 시 산정된 보너스 금액 지급
    /// @param sessionId 세션 ID
    function claimPlayerBonus(uint256 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];

        // 정산 완료 상태 확인
        if (session.status != SessionStatus.Settled) revert SessionNotSettled();

        // 호출자가 세션 플레이어인지 확인
        if (msg.sender != session.player) revert NotSessionPlayer();

        // 이미 수령했는지 확인
        if (session.playerBonusClaimed) revert BonusAlreadyClaimed();

        // 보너스 금액이 있는지 확인
        if (session.playerBonusAmount == 0) revert NoBonusAvailable();

        uint256 bonus = session.playerBonusAmount;

        // Effects: 수령 완료 표시
        session.playerBonusClaimed = true;

        // Interactions: ETH 전송
        (bool success,) = msg.sender.call{value: bonus}("");
        if (!success) revert TransferFailed();
    }

    /// @notice 고점 보너스 트리거 — 아레나 매니저가 추가 보너스를 부여할 때 호출
    /// @dev 정산된 세션에 고점 보너스를 추가로 적용
    /// @param sessionId 세션 ID
    function triggerHighScoreBonus(uint256 sessionId) external onlyArenaManager {
        Session storage session = sessions[sessionId];

        // 정산 완료 상태 확인
        if (session.status != SessionStatus.Settled) revert InvalidSession();

        // 이미 보너스를 수령한 경우 추가 불가
        if (session.playerBonusClaimed) revert BonusAlreadyClaimed();

        uint256 highScoreBonus = (session.totalPool * HIGH_SCORE_BONUS_BPS) / 10000;
        session.playerBonusAmount += highScoreBonus;
    }

    // ──────────────────────────────────────────────
    //  조회 함수
    // ──────────────────────────────────────────────

    /// @notice 세션의 배팅자 수 조회
    /// @param sessionId 세션 ID
    /// @return count 배팅자 수
    function getBettorCount(uint256 sessionId) external view returns (uint256 count) {
        return sessionBettors[sessionId].length;
    }

    /// @notice 특정 배팅자의 예측 데이터 조회
    /// @param sessionId 세션 ID
    /// @param bettor 배팅자 주소
    /// @return predictedRound 예측 탈락 라운드
    /// @return amount 배팅 금액
    /// @return claimed 수령 여부
    function getPrediction(uint256 sessionId, address bettor)
        external
        view
        returns (uint8 predictedRound, uint256 amount, bool claimed)
    {
        Prediction storage pred = predictions[sessionId][bettor];
        return (pred.predictedRound, pred.amount, pred.claimed);
    }

    /// @notice 세션 정보 조회
    /// @param sessionId 세션 ID
    /// @return player 대상 플레이어
    /// @return status 세션 상태
    /// @return totalPool 총 배팅 풀
    /// @return currentRound 현재 라운드
    /// @return eliminationRound 탈락 라운드
    /// @return totalWeightedShares 가중 지분 총합
    /// @return playerBonusClaimed 플레이어 보너스 수령 여부
    /// @return playerBonusAmount 플레이어 보너스 금액
    function getSession(uint256 sessionId)
        external
        view
        returns (
            address player,
            SessionStatus status,
            uint256 totalPool,
            uint8 currentRound,
            uint8 eliminationRound,
            uint256 totalWeightedShares,
            bool playerBonusClaimed,
            uint256 playerBonusAmount
        )
    {
        Session storage s = sessions[sessionId];
        return (
            s.player,
            s.status,
            s.totalPool,
            s.currentRound,
            s.eliminationRound,
            s.totalWeightedShares,
            s.playerBonusClaimed,
            s.playerBonusAmount
        );
    }

    // ──────────────────────────────────────────────
    //  내부 함수
    // ──────────────────────────────────────────────

    /// @dev 예측 정확도 기반 가중치 계산
    /// @param predictedRound 예측 탈락 라운드
    /// @param actualRound 실제 탈락 라운드
    /// @return weight 가중치 (정확: 3, ±1: 2, ±2: 1, 그 외: 0)
    function _calculateWeight(uint8 predictedRound, uint8 actualRound) internal pure returns (uint256 weight) {
        uint8 diff;
        if (predictedRound >= actualRound) {
            diff = predictedRound - actualRound;
        } else {
            diff = actualRound - predictedRound;
        }

        if (diff == 0) return 3;
        if (diff == 1) return 2;
        if (diff == 2) return 1;
        return 0;
    }

    /// @dev 배팅자들의 예측 라운드 중앙값 계산
    /// @notice 가스 효율을 위해 삽입 정렬 사용 (배팅자 수가 제한적이라는 가정)
    /// @param sessionId 세션 ID
    /// @param bettorCount 배팅자 수
    /// @return median 예측 라운드 중앙값
    function _calculateMedian(uint256 sessionId, uint256 bettorCount) internal view returns (uint8 median) {
        // 메모리 배열에 예측 라운드 수집
        uint8[] memory rounds = new uint8[](bettorCount);
        address[] storage bettors = sessionBettors[sessionId];

        for (uint256 i = 0; i < bettorCount; i++) {
            rounds[i] = predictions[sessionId][bettors[i]].predictedRound;
        }

        // 삽입 정렬 (소규모 배열에 적합)
        for (uint256 i = 1; i < bettorCount; i++) {
            uint8 key = rounds[i];
            uint256 j = i;
            while (j > 0 && rounds[j - 1] > key) {
                rounds[j] = rounds[j - 1];
                j--;
            }
            rounds[j] = key;
        }

        // 중앙값 반환 — 짝수 개수일 경우 하위 중앙값 사용 (정수 나눗셈)
        if (bettorCount % 2 == 1) {
            return rounds[bettorCount / 2];
        } else {
            // 두 중앙값의 평균 (내림)
            return uint8((uint16(rounds[bettorCount / 2 - 1]) + uint16(rounds[bettorCount / 2])) / 2);
        }
    }
}
