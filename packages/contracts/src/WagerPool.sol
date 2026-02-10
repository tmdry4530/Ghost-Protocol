// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IWagerPool.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title WagerPool
/// @notice 아레나 모드 패리뮤추얼 배팅 풀 — 매치별 독립 풀, 승자 비례 배당
/// @dev ReentrancyGuard로 재진입 방지, Pausable로 긴급 중단 지원
contract WagerPool is IWagerPool, ReentrancyGuard, Pausable {
    // ──────────────────────────────────────────────
    //  커스텀 에러
    // ──────────────────────────────────────────────

    /// @notice 권한 없는 호출
    error Unauthorized();

    /// @notice 풀이 올바른 상태가 아님
    error InvalidPoolStatus();

    /// @notice 해당 매치에 배팅 기록 없음
    error NoBetFound();

    /// @notice 패배 사이드에 배팅함
    error NotOnWinningSide();

    /// @notice 이미 배당금/환불을 수령함
    error AlreadyClaimed();

    /// @notice 동일 매치에서 다른 사이드에 이미 배팅함
    error CannotSwitchSide();

    /// @notice ETH 전송 실패
    error TransferFailed();

    /// @notice 출금할 수수료 없음
    error NoFeesToWithdraw();

    /// @notice 제로 주소 사용 불가
    error ZeroAddress();

    // ──────────────────────────────────────────────
    //  이벤트 (인터페이스 외 추가)
    // ──────────────────────────────────────────────

    /// @notice 매치 무효화 시 발생
    event MatchVoided(uint256 indexed matchId);

    /// @notice 수수료 출금 시 발생
    event FeesWithdrawn(
        address indexed treasury, uint256 treasuryAmount, address indexed manager, uint256 managerAmount
    );

    // ──────────────────────────────────────────────
    //  자료 구조
    // ──────────────────────────────────────────────

    /// @notice 매치별 배팅 풀 정보
    struct Pool {
        PoolStatus status;
        uint256 totalA; // AgentA 사이드 총 배팅액
        uint256 totalB; // AgentB 사이드 총 배팅액
        Side winningSide; // 정산 시 결정되는 승리 사이드
        uint256 pacmanSide; // 팩맨 역할 사이드 총 배팅액 (역할 기반)
        uint256 ghostSide; // 고스트 역할 사이드 총 배팅액 (역할 기반)
        Side pacmanSideEnum; // 팩맨 역할이 AgentA인지 AgentB인지
        bool roleAssigned; // 역할이 할당되었는지 여부
    }

    /// @notice 개별 배팅 정보
    struct Bet {
        Side side; // 배팅 방향
        uint256 amount; // 배팅 금액 (누적 가능)
        bool claimed; // 수령 여부
        bool isRoleBased; // 역할 기반 베팅 여부
    }

    // ──────────────────────────────────────────────
    //  상수
    // ──────────────────────────────────────────────

    /// @notice 최소 배팅 금액
    uint256 public constant MIN_BET = 0.001 ether;

    /// @notice 최대 배팅 금액
    uint256 public constant MAX_BET = 10 ether;

    /// @notice 총 수수료율 (basis points) — 5%
    uint256 public constant FEE_BPS = 500;

    /// @notice 재무부 수수료율 (basis points) — 3%
    uint256 public constant TREASURY_FEE_BPS = 300;

    /// @notice 아레나 매니저 수수료율 (basis points) — 2%
    uint256 public constant MANAGER_FEE_BPS = 200;

    /// @notice BPS 기준값
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  상태 변수
    // ──────────────────────────────────────────────

    /// @notice 컨트랙트 소유자
    address public owner;

    /// @notice 아레나 매니저 주소
    address public arenaManager;

    /// @notice 재무부 주소
    address public treasury;

    /// @notice 매치별 풀 정보
    mapping(uint256 => Pool) public pools;

    /// @notice 매치별 사용자별 배팅 정보
    mapping(uint256 => mapping(address => Bet)) public bets;

    /// @notice 누적 재무부 수수료
    uint256 public accumulatedTreasuryFees;

    /// @notice 누적 매니저 수수료
    uint256 public accumulatedManagerFees;

    // ──────────────────────────────────────────────
    //  수정자
    // ──────────────────────────────────────────────

    /// @dev 소유자 전용 수정자
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /// @dev 아레나 매니저 전용 수정자
    modifier onlyArenaManager() {
        if (msg.sender != arenaManager) revert Unauthorized();
        _;
    }

    // ──────────────────────────────────────────────
    //  생성자
    // ──────────────────────────────────────────────

    /// @notice 컨트랙트 초기화
    /// @param _arenaManager 아레나 매니저 주소
    /// @param _treasury 재무부 주소
    constructor(address _arenaManager, address _treasury) {
        if (_arenaManager == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        owner = msg.sender;
        arenaManager = _arenaManager;
        treasury = _treasury;
    }

    // ──────────────────────────────────────────────
    //  핵심 함수: 풀 오픈 (역할 매핑)
    // ──────────────────────────────────────────────

    /// @notice 배팅 풀 오픈 — 매치별 역할 매핑을 설정한다
    /// @dev 아레나 매니저가 매치 시작 전에 팩맨 역할이 AgentA인지 AgentB인지 지정한다
    /// @param matchId 매치 ID
    /// @param _pacmanSide 팩맨 역할이 속한 사이드 (AgentA 또는 AgentB)
    function openPool(uint256 matchId, Side _pacmanSide) external onlyArenaManager {
        Pool storage pool = pools[matchId];

        // 풀이 Open 상태이고 아직 역할이 설정되지 않았는지 확인
        if (pool.status != PoolStatus.Open) revert InvalidPoolStatus();
        if (pool.roleAssigned) revert InvalidPoolStatus();

        pool.pacmanSideEnum = _pacmanSide;
        pool.roleAssigned = true;

        emit PoolOpened(matchId, _pacmanSide);
    }

    // ──────────────────────────────────────────────
    //  핵심 함수: 배팅
    // ──────────────────────────────────────────────

    /// @notice 배팅 배치 — 해당 매치의 AgentA 또는 AgentB에 ETH를 건다
    /// @dev 동일 매치에 추가 배팅 가능 (같은 사이드만). 풀이 Open 상태여야 함.
    /// @param matchId 매치 ID
    /// @param side 배팅 방향 (AgentA 또는 AgentB)
    function placeBet(uint256 matchId, Side side) external payable override whenNotPaused {
        Pool storage pool = pools[matchId];

        // 풀이 Open 상태인지 확인
        if (pool.status != PoolStatus.Open) revert BettingWindowClosed();

        // 배팅 금액 범위 검증
        if (msg.value < MIN_BET || msg.value > MAX_BET) revert InvalidBetAmount();

        Bet storage userBet = bets[matchId][msg.sender];

        if (userBet.amount > 0) {
            // 기존 배팅이 있으면 같은 사이드에만 추가 가능
            if (userBet.side != side) revert CannotSwitchSide();

            // 누적 금액이 MAX_BET를 초과하지 않는지 검증
            if (userBet.amount + msg.value > MAX_BET) revert InvalidBetAmount();

            userBet.amount += msg.value;
        } else {
            // 새 배팅 생성
            userBet.side = side;
            userBet.amount = msg.value;
            userBet.isRoleBased = false;
        }

        // 사이드별 총액 업데이트
        if (side == Side.AgentA) {
            pool.totalA += msg.value;
        } else {
            pool.totalB += msg.value;
        }

        emit BetPlaced(matchId, msg.sender, side, msg.value);
    }

    /// @notice 역할 기반 배팅 — 팩맨 또는 고스트 역할에 베팅
    /// @dev 에이전트가 아닌 역할(PACMAN/GHOST)에 베팅. 풀이 Open 상태이고 역할이 할당되어 있어야 함.
    /// @param matchId 매치 ID
    /// @param role 베팅 대상 역할 (0 = PACMAN, 1 = GHOST)
    function placeBetByRole(uint256 matchId, uint8 role) external payable nonReentrant whenNotPaused {
        Pool storage pool = pools[matchId];

        // 풀이 Open 상태인지 확인
        if (pool.status != PoolStatus.Open) revert BettingWindowClosed();

        // 역할이 할당되어 있는지 확인 — openPool 호출 필수
        if (!pool.roleAssigned) revert InvalidPoolStatus();

        // 배팅 금액 범위 검증
        if (msg.value < MIN_BET || msg.value > MAX_BET) revert InvalidBetAmount();

        // 역할 유효성 검증 (0 = PACMAN, 1 = GHOST)
        if (role > 1) revert InvalidBetAmount();

        Bet storage userBet = bets[matchId][msg.sender];

        // 역할 → 사이드 동적 매핑: pacmanSideEnum 기준으로 결정
        Side betSide;
        if (role == 0) {
            // PACMAN 배팅 → pool.pacmanSideEnum에 따라 사이드 결정
            betSide = pool.pacmanSideEnum;
        } else {
            // GHOST 배팅 → 팩맨의 반대 사이드
            betSide = (pool.pacmanSideEnum == Side.AgentA) ? Side.AgentB : Side.AgentA;
        }

        if (userBet.amount > 0) {
            // 기존 배팅이 있으면 같은 사이드에만 추가 가능
            if (userBet.side != betSide) revert CannotSwitchSide();

            // 누적 금액이 MAX_BET를 초과하지 않는지 검증
            if (userBet.amount + msg.value > MAX_BET) revert InvalidBetAmount();

            userBet.amount += msg.value;
        } else {
            // 새 배팅 생성
            userBet.side = betSide;
            userBet.amount = msg.value;
            userBet.isRoleBased = true;
        }

        // 역할별 풀 업데이트
        if (role == 0) {
            pool.pacmanSide += msg.value;
        } else {
            pool.ghostSide += msg.value;
        }

        // 사이드별 총액 업데이트
        if (betSide == Side.AgentA) {
            pool.totalA += msg.value;
        } else {
            pool.totalB += msg.value;
        }

        emit BetPlaced(matchId, msg.sender, betSide, msg.value);
    }

    // ──────────────────────────────────────────────
    //  핵심 함수: 풀 관리 (아레나 매니저 전용)
    // ──────────────────────────────────────────────

    /// @notice 배팅 잠금 — 매치 시작 전 추가 배팅을 차단한다
    /// @param matchId 매치 ID
    function lockBets(uint256 matchId) external override onlyArenaManager {
        Pool storage pool = pools[matchId];

        if (pool.status != PoolStatus.Open) revert InvalidPoolStatus();

        pool.status = PoolStatus.Locked;

        uint256 totalPool = pool.totalA + pool.totalB;
        emit BetsLocked(matchId, totalPool);
    }

    /// @notice 배팅 정산 — 매치 결과에 따라 승리 사이드를 결정하고 수수료를 계산한다
    /// @dev 수수료는 즉시 전송하지 않고 누적하여 withdrawFees로 일괄 출금
    /// @param matchId 매치 ID
    /// @param winner 승리 방향
    function settleBets(uint256 matchId, Side winner) external override onlyArenaManager {
        Pool storage pool = pools[matchId];

        // Locked가 아니면 거부 — Open이면 아직 잠기지 않았고, Settled/Refunded면 이미 처리됨
        if (pool.status == PoolStatus.Settled) revert AlreadySettled();
        if (pool.status != PoolStatus.Locked) revert InvalidPoolStatus();

        pool.winningSide = winner;
        pool.status = PoolStatus.Settled;

        uint256 totalPool = pool.totalA + pool.totalB;

        // 승리 사이드에 배팅한 사람이 있을 때만 수수료 누적
        uint256 winningSideTotal = (winner == Side.AgentA) ? pool.totalA : pool.totalB;
        if (winningSideTotal > 0 && totalPool > 0) {
            uint256 treasuryFee = (totalPool * TREASURY_FEE_BPS) / BPS_DENOMINATOR;
            uint256 managerFee = (totalPool * MANAGER_FEE_BPS) / BPS_DENOMINATOR;
            accumulatedTreasuryFees += treasuryFee;
            accumulatedManagerFees += managerFee;
        }
        // winningSideTotal == 0 이면 수수료 없이 전원 환불 (claimWinnings에서 처리)

        emit BetsSettled(matchId, winner, totalPool);
    }

    // ──────────────────────────────────────────────
    //  핵심 함수: 배당금 수령
    // ──────────────────────────────────────────────

    /// @notice 배당금 수령 — 승리 사이드 배팅자가 비례 배당금을 인출한다
    /// @dev 승리 사이드에 배팅한 사람이 없으면 전원 원금 환불
    /// @param matchId 매치 ID
    function claimWinnings(uint256 matchId) external override nonReentrant {
        Pool storage pool = pools[matchId];

        if (pool.status != PoolStatus.Settled) revert InvalidPoolStatus();

        Bet storage userBet = bets[matchId][msg.sender];

        if (userBet.amount == 0) revert NoBetFound();
        if (userBet.claimed) revert AlreadyClaimed();

        uint256 totalPool = pool.totalA + pool.totalB;
        uint256 winningSideTotal = (pool.winningSide == Side.AgentA) ? pool.totalA : pool.totalB;

        uint256 payout;

        if (winningSideTotal == 0) {
            // 승리 사이드에 아무도 배팅하지 않은 경우 — 전원 원금 환불 (수수료 없음)
            payout = userBet.amount;
        } else {
            // 패배 사이드는 수령 불가
            if (userBet.side != pool.winningSide) revert NotOnWinningSide();

            // 배분 가능 풀 = 총 풀 - 수수료 (5%)
            uint256 distributablePool = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;

            // 사용자 배당금 = (사용자 배팅 / 승리 사이드 총액) * 배분 가능 풀
            payout = (userBet.amount * distributablePool) / winningSideTotal;
        }

        // Check-Effects-Interactions: 상태 먼저 변경
        userBet.claimed = true;

        // ETH 전송
        (bool success,) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(matchId, msg.sender, payout);
    }

    // ──────────────────────────────────────────────
    //  핵심 함수: 환불
    // ──────────────────────────────────────────────

    /// @notice 매치 무효화 — 아레나 매니저가 매치를 취소하여 전원 환불 상태로 전환
    /// @dev Open 또는 Locked 상태의 풀만 무효화 가능
    /// @param matchId 매치 ID
    function voidMatch(uint256 matchId) external onlyArenaManager {
        Pool storage pool = pools[matchId];

        // Open 또는 Locked 상태만 무효화 가능
        if (pool.status != PoolStatus.Open && pool.status != PoolStatus.Locked) {
            revert InvalidPoolStatus();
        }

        pool.status = PoolStatus.Refunded;

        emit MatchVoided(matchId);
    }

    /// @notice 환불 — 매치 취소 시 원금을 돌려받는다
    /// @param matchId 매치 ID
    function refund(uint256 matchId) external override nonReentrant {
        Pool storage pool = pools[matchId];

        if (pool.status != PoolStatus.Refunded) revert InvalidPoolStatus();

        Bet storage userBet = bets[matchId][msg.sender];

        if (userBet.amount == 0) revert NoBetFound();
        if (userBet.claimed) revert AlreadyClaimed();

        uint256 amount = userBet.amount;

        // Check-Effects-Interactions: 상태 먼저 변경
        userBet.claimed = true;

        // ETH 전송
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(matchId, msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  관리 함수
    // ──────────────────────────────────────────────

    /// @notice 누적 수수료 출금 — 재무부와 매니저에게 각각 전송
    /// @dev 소유자만 호출 가능
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 tFee = accumulatedTreasuryFees;
        uint256 mFee = accumulatedManagerFees;

        if (tFee == 0 && mFee == 0) revert NoFeesToWithdraw();

        // 상태 먼저 초기화
        accumulatedTreasuryFees = 0;
        accumulatedManagerFees = 0;

        // 재무부에 전송
        if (tFee > 0) {
            (bool s1,) = payable(treasury).call{value: tFee}("");
            if (!s1) revert TransferFailed();
        }

        // 아레나 매니저에 전송
        if (mFee > 0) {
            (bool s2,) = payable(arenaManager).call{value: mFee}("");
            if (!s2) revert TransferFailed();
        }

        emit FeesWithdrawn(treasury, tFee, arenaManager, mFee);
    }

    /// @notice 긴급 일시정지 — 배팅을 중단시킨다
    /// @dev 소유자만 호출 가능
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice 일시정지 해제 — 배팅을 재개한다
    /// @dev 소유자만 호출 가능
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice 아레나 매니저 주소 변경
    /// @param _newManager 새 아레나 매니저 주소
    function setArenaManager(address _newManager) external onlyOwner {
        if (_newManager == address(0)) revert ZeroAddress();
        arenaManager = _newManager;
    }

    /// @notice 재무부 주소 변경
    /// @param _newTreasury 새 재무부 주소
    function setTreasury(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert ZeroAddress();
        treasury = _newTreasury;
    }

    // ──────────────────────────────────────────────
    //  뷰 함수
    // ──────────────────────────────────────────────

    /// @notice 매치의 총 배팅 풀 금액 조회
    /// @param matchId 매치 ID
    /// @return totalPool 총 배팅 금액
    function getTotalPool(uint256 matchId) external view returns (uint256 totalPool) {
        Pool storage pool = pools[matchId];
        totalPool = pool.totalA + pool.totalB;
    }

    /// @notice 매치의 사이드별 배팅 금액 조회
    /// @param matchId 매치 ID
    /// @return totalA AgentA 총 배팅액
    /// @return totalB AgentB 총 배팅액
    function getPoolAmounts(uint256 matchId) external view returns (uint256 totalA, uint256 totalB) {
        Pool storage pool = pools[matchId];
        totalA = pool.totalA;
        totalB = pool.totalB;
    }

    /// @notice 사용자의 배팅 정보 조회
    /// @param matchId 매치 ID
    /// @param bettor 배팅자 주소
    /// @return side 배팅 방향
    /// @return amount 배팅 금액
    /// @return claimed 수령 여부
    function getBet(uint256 matchId, address bettor) external view returns (Side side, uint256 amount, bool claimed) {
        Bet storage b = bets[matchId][bettor];
        side = b.side;
        amount = b.amount;
        claimed = b.claimed;
    }
}
