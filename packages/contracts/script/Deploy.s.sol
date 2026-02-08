// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GhostArena.sol";
import "../src/WagerPool.sol";
import "../src/SurvivalBet.sol";

/// @notice Ghost Protocol 컨트랙트 배포 스크립트
/// @dev 3개 컨트랙트 배포 후 5개 빌트인 에이전트 자동 등록, 결과를 JSON 파일로 저장
contract DeployScript is Script {
    /// @notice 에이전트 등록 수수료 (0.01 ETH)
    uint256 constant REGISTRATION_FEE = 0.01 ether;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ARENA_MANAGER_PRIVATE_KEY");
        address arenaManager = vm.addr(deployerPrivateKey);

        console.log(unicode"======================================");
        console.log(unicode"Ghost Protocol 배포 시작");
        console.log(unicode"======================================");
        console.log(unicode"배포자 주소:", arenaManager);

        vm.startBroadcast(deployerPrivateKey);

        // === 1단계: 컨트랙트 배포 ===
        console.log(unicode"\n[1/4] 아레나 컨트랙트 배포 중...");
        GhostArena arena = new GhostArena(arenaManager, arenaManager);
        console.log(unicode"  ✓ GhostArena 배포 완료:", address(arena));

        console.log(unicode"\n[2/4] 배팅 풀 컨트랙트 배포 중...");
        WagerPool wagerPool = new WagerPool(arenaManager, arenaManager);
        console.log(unicode"  ✓ WagerPool 배포 완료:", address(wagerPool));

        console.log(unicode"\n[3/4] 서바이벌 배팅 컨트랙트 배포 중...");
        SurvivalBet survivalBet = new SurvivalBet(arenaManager, arenaManager);
        console.log(unicode"  ✓ SurvivalBet 배포 완료:", address(survivalBet));

        // === 2단계: 빌트인 에이전트 등록 ===
        console.log(unicode"\n[4/4] 빌트인 에이전트 등록 중...");

        arena.registerAgent{value: REGISTRATION_FEE}("GhostBlinky", "ipfs://ghost-blinky");
        console.log(unicode"  ✓ GhostBlinky 등록 완료");

        arena.registerAgent{value: REGISTRATION_FEE}("GhostPinky", "ipfs://ghost-pinky");
        console.log(unicode"  ✓ GhostPinky 등록 완료");

        arena.registerAgent{value: REGISTRATION_FEE}("GhostInky", "ipfs://ghost-inky");
        console.log(unicode"  ✓ GhostInky 등록 완료");

        arena.registerAgent{value: REGISTRATION_FEE}("GhostClyde", "ipfs://ghost-clyde");
        console.log(unicode"  ✓ GhostClyde 등록 완료");

        arena.registerAgent{value: REGISTRATION_FEE}("GhostSue", "ipfs://ghost-sue");
        console.log(unicode"  ✓ GhostSue 등록 완료");

        vm.stopBroadcast();

        // === 3단계: 배포 결과 JSON 저장 ===
        console.log(unicode"\n배포 결과를 JSON 파일로 저장 중...");

        string memory deploymentJson = string.concat(
            '{"ghostArena":"',
            vm.toString(address(arena)),
            '",',
            '"wagerPool":"',
            vm.toString(address(wagerPool)),
            '",',
            '"survivalBet":"',
            vm.toString(address(survivalBet)),
            '",',
            '"chainId":10143,',
            '"deployer":"',
            vm.toString(arenaManager),
            '"}'
        );

        vm.writeJson(deploymentJson, "deployments/monad-testnet.json");
        console.log(unicode"  ✓ 배포 정보 저장 완료: deployments/monad-testnet.json");

        // === 최종 요약 ===
        console.log(unicode"\n======================================");
        console.log(unicode"배포 완료!");
        console.log(unicode"======================================");
        console.log(unicode"GhostArena:", address(arena));
        console.log(unicode"WagerPool:", address(wagerPool));
        console.log(unicode"SurvivalBet:", address(survivalBet));
        console.log(unicode"등록된 에이전트: 5개");
        console.log(unicode"총 소비된 ETH:", (REGISTRATION_FEE * 5) / 1 ether, unicode"ETH (수수료)");
        console.log(unicode"======================================");
    }
}
