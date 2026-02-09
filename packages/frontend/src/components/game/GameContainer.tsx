import { useEffect, useRef, useCallback } from 'react';
import { PhaserGame, getActiveGame } from '../../game/PhaserGame';
import { HUD } from './HUD';
import { useGameStore } from '../../stores/gameStore';
import { GameScene } from '../../game/scenes/GameScene';
import { useGameSocket } from '../../hooks/useGameSocket';
import { useGameAudio } from '../../hooks/useGameAudio.js';
import { useAudio } from '../../hooks/useAudio.js';
import type { Direction } from '@ghost-protocol/shared';

/** Game container - WebSocket-based server state rendering */
export function GameContainer() {
  const { isPlaying, difficulty, sessionId, startGame, stopGame, setSessionId, gameState } =
    useGameStore();
  const lastInputRef = useRef<Direction | null>(null);

  // Game event -> audio trigger connection
  useGameAudio();
  const { music, initialized: audioReady } = useAudio();

  // WebSocket connection (only when sessionId exists)
  const { connected, sendInput } = useGameSocket({ sessionId: sessionId ?? undefined });

  // Create server session and start game
  const handleStartGame = useCallback(async () => {
    try {
      const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api/v1';
      const response = await fetch(`${apiUrl}/survival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create server session: ${String(response.status)}`);
      }

      const data = (await response.json()) as { sessionId: string };
      setSessionId(data.sessionId);
      startGame();
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  }, [difficulty, setSessionId, startGame]);

  // Send keyboard input to server
  useEffect(() => {
    if (!isPlaying || !connected) return;

    const scene = getGameScene();
    if (!scene) return;

    const sendInputToServer = () => {
      const input = scene.getCurrentInput();
      if (input && input !== lastInputRef.current) {
        sendInput(input);
        lastInputRef.current = input;
      }
    };

    // Input polling (60fps)
    const intervalId = window.setInterval(sendInputToServer, 16);

    return () => {
      clearInterval(intervalId);
    };
  }, [isPlaying, connected, sendInput]);

  // Update Phaser scene on game state change
  useEffect(() => {
    if (!gameState) return;

    const scene = getGameScene();
    if (scene) {
      scene.updateGameState(gameState);
    }
  }, [gameState]);

  // Start/stop BGM (linked to game play state)
  useEffect(() => {
    if (!audioReady) return;

    if (isPlaying) {
      music.start();
    } else {
      music.stop();
    }
  }, [isPlaying, music, audioReady]);

  // Start/restart game with SPACE key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const isGameOver = gameState ? gameState.lives <= 0 : false;
        if (!isPlaying || isGameOver) {
          stopGame();
          setTimeout(() => {
            void handleStartGame();
          }, 50);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isPlaying, gameState, stopGame, handleStartGame]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ backgroundColor: '#0a0a1a' }}
    >
      <h1
        className="text-2xl font-bold mb-4"
        style={{ color: '#8B5CF6', fontFamily: "'Courier New', monospace" }}
      >
        GHOST PROTOCOL
      </h1>

      <div className="relative">
        <PhaserGame />
        <HUD />
      </div>

      {!isPlaying && (
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm mb-2">Use arrow keys or WASD to move</p>
          <button
            onClick={() => {
              void handleStartGame();
            }}
            className="px-6 py-3 text-white font-bold rounded-lg transition-all hover:scale-105"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            Start Game
          </button>
        </div>
      )}
    </div>
  );
}

/** Get GameScene from Phaser game instance */
function getGameScene(): GameScene | null {
  const game = getActiveGame();
  if (!game) return null;
  return game.scene.getScene('GameScene') as GameScene | null;
}
