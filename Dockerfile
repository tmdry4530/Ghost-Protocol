# Stage 1: 빌드 스테이지
FROM node:20-alpine AS builder

# isolated-vm 네이티브 모듈 컴파일을 위한 빌드 도구 설치
RUN apk add --no-cache python3 make g++

# pnpm 활성화
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 의존성 파일 복사 (캐싱 최적화)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY tsconfig.base.json ./

# shared 먼저 빌드 (workspace 의존성)
RUN pnpm --filter @ghost-protocol/shared build

# backend 빌드
RUN pnpm --filter @ghost-protocol/backend build

# Stage 2: 프로덕션 런타임
FROM node:20-alpine

# healthcheck용 curl 설치
RUN apk add --no-cache curl

# pnpm 활성화
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 의존성 파일 복사
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# 프로덕션 의존성만 설치
RUN pnpm install --frozen-lockfile --prod

# 빌드 결과물 복사
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=3001

# 포트 노출
EXPOSE 3001

# 헬스체크 설정 (30초마다 확인, 시작 후 10초 대기)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3001/health || exit 1

# 애플리케이션 실행
CMD ["node", "packages/backend/dist/index.js"]
