# Ghost Protocol 컨트랙트 빌드 및 배포

# 환경 변수 로드
-include .env

.PHONY: deploy-monad export-addresses deploy-and-export build test gas-report clean help

# Monad 테스트넷 배포
deploy-monad:
	@echo "Monad 테스트넷에 배포 중..."
	forge script script/Deploy.s.sol:DeployScript \
		--rpc-url $(MONAD_RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# 배포 후 주소 내보내기
export-addresses:
	@echo "배포 주소 내보내기 중..."
	bash script/export-addresses.sh

# 배포 + 내보내기 한번에
deploy-and-export: deploy-monad export-addresses
	@echo "배포 및 내보내기 완료!"

# 빌드
build:
	@echo "컨트랙트 빌드 중..."
	forge build

# 테스트
test:
	@echo "테스트 실행 중..."
	forge test -vv

# 가스 리포트
gas-report:
	@echo "가스 리포트 생성 중..."
	forge test --gas-report

# 클린
clean:
	@echo "빌드 아티팩트 정리 중..."
	forge clean
	rm -rf deployments/

# 도움말
help:
	@echo "Ghost Protocol 컨트랙트 Makefile"
	@echo ""
	@echo "사용 가능한 명령어:"
	@echo "  make build              - 컨트랙트 빌드"
	@echo "  make test               - 테스트 실행"
	@echo "  make gas-report         - 가스 리포트 생성"
	@echo "  make deploy-monad       - Monad 테스트넷에 배포"
	@echo "  make export-addresses   - 배포된 주소를 shared 패키지로 내보내기"
	@echo "  make deploy-and-export  - 배포 + 내보내기 한번에"
	@echo "  make clean              - 빌드 아티팩트 정리"
	@echo "  make help               - 이 도움말 표시"
	@echo ""
	@echo "예시:"
	@echo "  make build && make test"
	@echo "  make deploy-and-export"
