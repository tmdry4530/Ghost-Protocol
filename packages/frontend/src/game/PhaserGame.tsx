/**
 * Phaser 게임 캔버스를 감싸는 React 래퍼 컴포넌트
 * Phaser 인스턴스의 생명주기를 React 마운트/언마운트에 맞춰 관리
 *
 * 이 컴포넌트는 상태를 관리하지 않음.
 * GameContainer가 게임 루프를 담당:
 * 1. LocalGameEngine 인스턴스 생성
 * 2. 60fps setInterval로 engine.tick(input) 호출
 * 3. Phaser GameScene에서 scene.updateGameState(state) 호출
 * 4. scene.getCurrentInput()으로 입력 읽기
 */
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { MAZE_WIDTH, MAZE_HEIGHT } from '@ghost-protocol/shared';

/** 각 타일의 픽셀 크기 (GameScene과 동일) */
const TILE_SIZE = 24;

/** 모듈 레벨 Phaser 게임 인스턴스 참조 (GameContainer에서 씬 접근용) */
let activeGameInstance: Phaser.Game | null = null;

/** Phaser 초기화 진행 중 플래그 (React Strict Mode 이중 마운트 방어) */
let isInitializing = false;

/** 현재 활성 Phaser 게임 인스턴스 반환 */
export function getActiveGame(): Phaser.Game | null {
  return activeGameInstance;
}

/** Phaser 게임 캔버스 React 래퍼 */
export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // React 18 Strict Mode 이중 마운트 방어:
    // cleanup 후 재실행 시 이전 인스턴스가 아직 정리 중일 수 있음
    if (gameRef.current || isInitializing) return;

    // 이전 인스턴스의 잔여 캔버스가 남아있으면 제거
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    isInitializing = true;

    /** Phaser 게임 설정 */
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO, // WebGL 우선, Canvas 폴백
      width: MAZE_WIDTH * TILE_SIZE,
      height: MAZE_HEIGHT * TILE_SIZE,
      parent: containerRef.current,
      backgroundColor: '#0a0a1a',
      scene: [GameScene],
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // 안티앨리어싱 비활성화 (레트로 픽셀 느낌)
      render: {
        antialias: false,
        pixelArt: true,
      },
      // Phaser 오디오 관리 비활성화 (커스텀 AudioEngine 사용)
      audio: {
        disableWebAudio: true,
      },
    };

    gameRef.current = new Phaser.Game(config);
    activeGameInstance = gameRef.current;
    isInitializing = false;

    // 언마운트 시 Phaser 인스턴스 정리
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      activeGameInstance = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: MAZE_WIDTH * TILE_SIZE,
        height: MAZE_HEIGHT * TILE_SIZE,
      }}
    />
  );
}
