/**
 * Survival Mode play page
 * Full-screen gameplay + HUD overlay
 * Dark arcade theme + neon purple/yellow accents
 *
 * Uses local game engine to run directly in the browser without a WebSocket server.
 * LocalGameEngine calculates game state every tick (60fps),
 * and injects state into the Phaser GameScene for rendering.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhaserGame, getActiveGame } from '../game/PhaserGame';
import { HUD, PowerUpBar } from '../components/game/HUD';
import {
  TensionMeter,
  TouchControls,
  GameOverScreen,
} from '../components/survival';
import { useGameStore } from '../stores/gameStore';
import { LocalGameEngine } from '../game/engine/LocalGameEngine';
import { GameScene } from '../game/scenes/GameScene';
import { TICK_RATE } from '@ghost-protocol/shared';
import type { Direction } from '@ghost-protocol/shared';

type GamePhase = 'lobby' | 'playing' | 'gameover';

/** Tier preview colors by difficulty */
const TIER_PREVIEW_COLORS = [
  'rgba(59,130,246,0.5)',   // Tier 1 — Blue
  'rgba(16,185,129,0.5)',   // Tier 2 — Green
  'rgba(245,158,11,0.5)',   // Tier 3 — Yellow
  'rgba(249,115,22,0.5)',   // Tier 4 — Orange
  'rgba(239,68,68,0.5)',    // Tier 5 — Red
];

/**
 * Get GameScene from Phaser game instance
 * @returns GameScene instance or null
 */
function getGameScene(): GameScene | null {
  const game = getActiveGame();
  if (!game) return null;
  return game.scene.getScene('GameScene') as GameScene | null;
}

export function SurvivalPlay() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [playTime, setPlayTime] = useState(0);
  const [personalBest, setPersonalBest] = useState({ round: 0, score: 0 });
  const [paused, setPaused] = useState(false);
  const playTimeRef = useRef<number | null>(null);

  /** Local game engine instance */
  const engineRef = useRef<LocalGameEngine | null>(null);
  /** Game loop interval ID */
  const gameLoopRef = useRef<number | null>(null);
  /** Ref for accessing pause state inside game loop */
  const pausedRef = useRef(false);
  /** Ref for storing touch input (mobile support) */
  const touchInputRef = useRef<Direction | null>(null);

  const { gameState, difficulty, startGame, stopGame, setGameState, setDifficulty } =
    useGameStore();

  // Sync pausedRef
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /**
   * Clean up game loop — release interval and engine instance
   */
  const cleanupGameLoop = useCallback(() => {
    if (gameLoopRef.current !== null) {
      clearInterval(gameLoopRef.current);
      gameLoopRef.current = null;
    }
    engineRef.current = null;
  }, []);

  // Start game
  const handleStartGame = useCallback(() => {
    // Clean up previous game loop
    cleanupGameLoop();

    setDifficulty(1);
    startGame();
    setPhase('playing');
    setPlayTime(0);

    // Create local game engine (seed: current time, difficulty: 1, maze: classic)
    const engine = new LocalGameEngine('classic', 1, Date.now());
    engineRef.current = engine;

    // Inject initial state immediately (render as soon as Phaser scene is ready)
    const initialState = engine.getState();
    setGameState(initialState);

    // Start 60fps game loop
    const tickInterval = Math.round(1000 / TICK_RATE);
    gameLoopRef.current = window.setInterval(() => {
      // Skip tick if paused
      if (pausedRef.current) return;

      const currentEngine = engineRef.current;
      if (!currentEngine) return;

      // Read keyboard input from Phaser GameScene (touch input as fallback)
      const scene = getGameScene();
      const sceneReady = scene !== null && scene.getIsReady();
      const input = sceneReady ? (scene.getCurrentInput() ?? touchInputRef.current) : touchInputRef.current;

      // Execute engine tick (pass input)
      const state = currentEngine.tick(input ?? undefined);

      // Only inject state after Phaser scene create() completes (prevent black screen)
      if (sceneReady) {
        scene.updateGameState(state);
      }

      // Update zustand store (for HUD, game over detection, etc.)
      setGameState(state);
    }, tickInterval) as unknown as number;

    // Start play timer (increment every second)
    playTimeRef.current = window.setInterval(() => {
      setPlayTime((prev) => prev + 1);
    }, 1000) as unknown as number;
  }, [startGame, setDifficulty, setGameState, cleanupGameLoop]);

  // Restart game
  const handleRestart = useCallback(() => {
    cleanupGameLoop();
    stopGame();
    if (playTimeRef.current !== null) {
      clearInterval(playTimeRef.current);
      playTimeRef.current = null;
    }
    setPhase('lobby');
    setPlayTime(0);
  }, [stopGame, cleanupGameLoop]);

  // Navigate to dashboard
  const handleDashboard = useCallback(() => {
    cleanupGameLoop();
    stopGame();
    if (playTimeRef.current !== null) {
      clearInterval(playTimeRef.current);
      playTimeRef.current = null;
    }
    void navigate('/');
  }, [stopGame, navigate, cleanupGameLoop]);

  // Toggle pause with ESC key
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPaused((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [phase]);

  // Detect game over
  useEffect(() => {
    if (!gameState || phase !== 'playing') return;

    if (gameState.lives <= 0) {
      // Stop game loop (no more ticks needed)
      cleanupGameLoop();

      // Stop play timer
      if (playTimeRef.current !== null) {
        clearInterval(playTimeRef.current);
        playTimeRef.current = null;
      }

      // Check for new record
      const isNewRecord =
        gameState.round > personalBest.round ||
        (gameState.round === personalBest.round && gameState.score > personalBest.score);

      if (isNewRecord) {
        setPersonalBest({ round: gameState.round, score: gameState.score });
      }

      // Show game over screen (slight delay)
      setTimeout(() => {
        setPhase('gameover');
      }, 1500);
    }
  }, [gameState, phase, personalBest, cleanupGameLoop]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (playTimeRef.current !== null) {
        clearInterval(playTimeRef.current);
      }
      cleanupGameLoop();
      stopGame();
    };
  }, [stopGame, cleanupGameLoop]);

  // Pause/resume timer
  useEffect(() => {
    if (phase !== 'playing') return;

    if (paused && playTimeRef.current !== null) {
      clearInterval(playTimeRef.current);
      playTimeRef.current = null;
    } else if (!paused && playTimeRef.current === null) {
      playTimeRef.current = window.setInterval(() => {
        setPlayTime((prev) => prev + 1);
      }, 1000) as unknown as number;
    }
  }, [paused, phase]);

  // Update difficulty (round-based)
  useEffect(() => {
    if (!gameState) return;

    // Round 1-3: Difficulty 1
    // Round 4-6: Difficulty 2
    // Round 7-10: Difficulty 3
    // Round 11-15: Difficulty 4
    // Round 16+: Difficulty 5
    let newDifficulty: typeof difficulty = 1;
    if (gameState.round >= 16) newDifficulty = 5;
    else if (gameState.round >= 11) newDifficulty = 4;
    else if (gameState.round >= 7) newDifficulty = 3;
    else if (gameState.round >= 4) newDifficulty = 2;

    if (newDifficulty !== difficulty) {
      setDifficulty(newDifficulty);
    }
  }, [gameState, difficulty, setDifficulty]);

  const currentRound = gameState?.round ?? 1;
  const currentScore = gameState?.score ?? 0;
  const isRecord =
    currentRound > personalBest.round ||
    (currentRound === personalBest.round && currentScore > personalBest.score);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-dark-bg">
      {/* Background tension meter */}
      <TensionMeter difficulty={difficulty} />

      {/* ===== Lobby screen ===== */}
      {phase === 'lobby' && (
        <div className="scanline-overlay grid-bg absolute inset-0 z-20 flex items-center justify-center">
          {/* 뒤로가기 */}
          <button
            onClick={() => { void navigate('/'); }}
            className="absolute left-4 top-4 z-30 inline-flex items-center gap-1.5 text-xs tracking-wider text-gray-500 transition-colors hover:text-ghost-violet"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            BACK
          </button>

          {/* Background decoration: floating ghost SVGs (12) */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {[
              { left: '5%', top: '8%', size: 48, color: 'rgba(124,58,237,0.10)', eyeColor: 'rgba(124,58,237,0.18)', duration: '8s', delay: '0s' },
              { left: '85%', top: '12%', size: 36, color: 'rgba(251,191,36,0.07)', eyeColor: 'rgba(251,191,36,0.12)', duration: '11s', delay: '1s' },
              { left: '15%', top: '35%', size: 32, color: 'rgba(124,58,237,0.07)', eyeColor: 'rgba(124,58,237,0.10)', duration: '13s', delay: '3s' },
              { left: '75%', top: '30%', size: 42, color: 'rgba(236,72,153,0.07)', eyeColor: 'rgba(236,72,153,0.10)', duration: '10s', delay: '2s' },
              { left: '45%', top: '15%', size: 28, color: 'rgba(34,211,238,0.06)', eyeColor: 'rgba(34,211,238,0.10)', duration: '14s', delay: '5s' },
              { left: '25%', top: '55%', size: 34, color: 'rgba(251,191,36,0.05)', eyeColor: 'rgba(251,191,36,0.08)', duration: '12s', delay: '4s' },
              { left: '65%', top: '50%', size: 44, color: 'rgba(124,58,237,0.05)', eyeColor: 'rgba(124,58,237,0.08)', duration: '9s', delay: '1.5s' },
              { left: '90%', top: '60%', size: 30, color: 'rgba(236,72,153,0.05)', eyeColor: 'rgba(236,72,153,0.07)', duration: '15s', delay: '6s' },
              { left: '10%', top: '75%', size: 40, color: 'rgba(34,211,238,0.04)', eyeColor: 'rgba(34,211,238,0.06)', duration: '11s', delay: '3.5s' },
              { left: '50%', top: '70%', size: 33, color: 'rgba(124,58,237,0.06)', eyeColor: 'rgba(124,58,237,0.09)', duration: '10s', delay: '2.5s' },
              { left: '35%', top: '85%', size: 26, color: 'rgba(251,191,36,0.04)', eyeColor: 'rgba(251,191,36,0.06)', duration: '13s', delay: '7s' },
              { left: '80%', top: '80%', size: 36, color: 'rgba(236,72,153,0.04)', eyeColor: 'rgba(236,72,153,0.06)', duration: '12s', delay: '4.5s' },
            ].map((ghost, i) => (
              <svg
                key={`ghost-particle-${String(i)}`}
                className="animate-float-ghost absolute"
                style={{
                  left: ghost.left,
                  top: ghost.top,
                  '--ghost-duration': ghost.duration,
                  animationDelay: ghost.delay,
                } as React.CSSProperties}
                width={String(ghost.size)}
                height={String(Math.round(ghost.size * 1.125))}
                viewBox="0 0 64 72"
                fill="none"
              >
                <path
                  d="M32 0C14.3 0 0 14.3 0 32v28c0 2 1 4 3 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s4-2 5-4l4-6 4 6c1 2 3 4 5 4s3-2 3-4V32C64 14.3 49.7 0 32 0z"
                  fill={ghost.color}
                />
                <circle cx="22" cy="28" r="5" fill={ghost.eyeColor} />
                <circle cx="42" cy="28" r="5" fill={ghost.eyeColor} />
              </svg>
            ))}
          </div>

          {/* Lobby card */}
          <div className="relative z-10 max-w-lg w-full mx-4">
            {/* Title */}
            <h1
              className="animate-text-glow text-center text-5xl sm:text-6xl tracking-widest mb-10"
              style={{
                fontFamily: 'var(--font-display)',
                color: '#7c3aed',
              }}
            >
              SURVIVAL MODE
            </h1>

            <div className="space-y-4 mb-8">
              {/* How to play card */}
              <div className="border border-ghost-violet/20 bg-arena-surface/60 backdrop-blur-sm rounded-xl p-5">
                <h3
                  className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  How to Play
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Ghosts get smarter with each round.
                  <br />How many rounds can you survive?
                </p>
              </div>

              {/* Personal best card */}
              {personalBest.round > 0 && (
                <div className="border border-ghost-violet/20 bg-arena-surface/60 backdrop-blur-sm rounded-xl p-5">
                  <h3
                    className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Personal Best
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-sm">Round: {personalBest.round}</span>
                    <span
                      className="neon-text-purple text-lg font-bold"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {personalBest.score.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Controls card */}
              <div className="border border-ghost-violet/20 bg-arena-surface/60 backdrop-blur-sm rounded-xl p-5">
                <h3
                  className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Controls
                </h3>
                <p className="text-gray-300 text-sm">
                  Keyboard: Arrow keys or WASD
                  <br />
                  Mobile: Touch controls at bottom of screen
                </p>
              </div>
            </div>

            {/* Difficulty preview: 5-tier ghost icons */}
            <div className="flex justify-center items-end gap-3 mb-8">
              {TIER_PREVIEW_COLORS.map((color, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <svg
                    width={20 + i * 3}
                    height={22 + i * 3}
                    viewBox="0 0 24 26"
                    fill="none"
                  >
                    <path
                      d="M12 2C7.58 2 4 5.58 4 10V20.5L6.5 18L9 20.5L12 17.5L15 20.5L17.5 18L20 20.5V10C20 5.58 16.42 2 12 2Z"
                      fill={color}
                    />
                    <circle cx="9" cy="9" r="1.5" fill="rgba(255,255,255,0.4)" />
                    <circle cx="15" cy="9" r="1.5" fill="rgba(255,255,255,0.4)" />
                  </svg>
                  <span
                    className="text-[8px] text-muted-foreground"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    T{i + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* 고스트 AI 티어 설명 */}
            <div className="mx-auto mt-6 max-w-md space-y-2 mb-8">
              <h3 className="text-center text-xs font-bold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'var(--font-display)' }}>Ghost AI Tiers</h3>
              <div className="space-y-1.5">
                {[
                  { tier: 'T1', name: 'Random', desc: 'Random movement — Unpredictable', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                  { tier: 'T2', name: 'Chase', desc: 'Direct chase — Manhattan distance', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                  { tier: 'T3', name: 'Ambush', desc: 'Path prediction ambush — Targets 4 tiles ahead', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                  { tier: 'T4', name: 'Patrol', desc: 'A* pathfinding + Area patrol — Pellet cluster watch', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                  { tier: 'T5', name: 'Adaptive', desc: 'Claude LLM strategy — Player pattern learning + Coordinated siege', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
                ].map((t) => (
                  <div key={t.tier} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${t.bg}`}>
                    <span className={`font-display text-xs font-bold ${t.color}`}>{t.tier}</span>
                    <span className={`text-xs font-semibold ${t.color}`}>{t.name}</span>
                    <span className="text-xs text-gray-400">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Start button — no server connection needed with local engine */}
            <button
              onClick={handleStartGame}
              className="animate-neon-pulse w-full py-4 px-6 rounded-lg text-lg transition-all duration-200 hover:scale-105 border border-ghost-violet/40 bg-ghost-violet/10 text-ghost-violet hover:bg-ghost-violet/25 hover:text-white"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {/* ===== Gameplay screen ===== */}
      {phase === 'playing' && (
        <>
          {/* Vignette + grid background */}
          <div className="absolute inset-0 z-0">
            {/* Subtle grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: 'linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Vignette overlay — darkens edges, focuses center */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(10,10,15,0.8) 100%)',
              }}
            />
          </div>

          {/* Game container — HUD above maze, centered */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center">
              {/* HUD bar above maze */}
              <div
                className="w-full rounded-t-lg border border-b-0 border-ghost-violet/20 bg-arena-surface/80 backdrop-blur-sm"
                style={{ minWidth: '560px' }}
              >
                <HUD />
              </div>

              {/* Phaser game canvas — neon border */}
              <div
                className="border border-ghost-violet/30 overflow-hidden"
                style={{
                  boxShadow: '0 0 40px rgba(124,58,237,0.15), 0 0 80px rgba(124,58,237,0.05)',
                }}
              >
                <PhaserGame />
              </div>

              {/* Power-up bar below maze */}
              <div className="w-full">
                <PowerUpBar />
              </div>

              {/* Play time below maze */}
              <div
                className="mt-2 text-ghost-violet/40 text-[10px] tracking-widest text-center"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {Math.floor(playTime / 60)}:{String(playTime % 60).padStart(2, '0')}
              </div>
            </div>
          </div>

          {/* Settings/pause button — small gear icon top-right */}
          <button
            onClick={() => { setPaused(true); }}
            className="absolute top-4 right-4 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-ghost-violet/20 bg-arena-surface/60 text-gray-500 backdrop-blur-sm transition-all hover:border-ghost-violet/40 hover:text-white"
            aria-label="Pause"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* Death overlay — red flash when losing a life */}
          {gameState?.dying === true && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div
                className="absolute inset-0 animate-pulse-fast"
                style={{ background: 'radial-gradient(circle at 50% 50%, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.1) 50%, transparent 70%)' }}
              />
              <div
                className="text-2xl font-black tracking-widest text-red-500"
                style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 20px rgba(239,68,68,0.8)' }}
              >
                {(gameState?.lives ?? 0) > 0 ? `LIVES: ${String(gameState?.lives ?? 0)}` : 'GAME OVER'}
              </div>
            </div>
          )}

          {/* Pause overlay */}
          {paused && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="max-w-sm w-full mx-4 rounded-xl border border-ghost-violet/30 bg-arena-surface/90 p-8 text-center">
                <h2
                  className="text-2xl tracking-widest text-ghost-violet mb-6"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  PAUSED
                </h2>
                <div className="space-y-3">
                  <button
                    onClick={() => { setPaused(false); }}
                    className="w-full rounded-lg border border-ghost-violet/40 bg-ghost-violet/10 px-6 py-3 text-sm text-ghost-violet transition-all hover:bg-ghost-violet/20 hover:text-white"
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                  >
                    Resume
                  </button>
                  <button
                    onClick={handleRestart}
                    className="w-full rounded-lg border border-gray-600 bg-transparent px-6 py-3 text-sm text-gray-400 transition-all hover:border-gray-400 hover:text-white"
                  >
                    Restart
                  </button>
                  <button
                    onClick={handleDashboard}
                    className="w-full rounded-lg border border-gray-700 bg-transparent px-6 py-3 text-sm text-gray-500 transition-all hover:border-gray-500 hover:text-gray-300"
                  >
                    Exit to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Touch controls (mobile) — store input in ref, read in game loop */}
          <TouchControls
            onDirectionChange={(dir) => {
              touchInputRef.current = dir;
            }}
          />
        </>
      )}

      {/* ===== Game over screen ===== */}
      {phase === 'gameover' && (
        <GameOverScreen
          finalRound={currentRound}
          finalScore={currentScore}
          isRecord={isRecord}
          onRestart={handleRestart}
          onDashboard={handleDashboard}
        />
      )}
    </div>
  );
}
