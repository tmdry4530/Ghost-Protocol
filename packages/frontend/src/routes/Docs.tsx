import { useState } from 'react';

/** Code block component */
function CodeBlock({ code }: { code: string; language?: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-ghost-violet/10 bg-black/60 p-4 text-sm">
      <code className="font-mono text-gray-300">{code}</code>
    </pre>
  );
}

/** Section title component */
function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="neon-text-purple mb-6 font-display text-3xl font-bold tracking-wider text-ghost-violet"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  );
}

/** Sample agent card */
function AgentCard({ name, description }: { name: string; description: string }) {
  return (
    <div className="rounded-lg border border-ghost-violet/20 bg-arena-surface/40 p-5 backdrop-blur-sm transition-all hover:border-ghost-violet/40 hover:bg-arena-surface/60">
      <h3 className="mb-2 font-display text-lg font-bold text-ghost-violet">{name}</h3>
      <p className="text-sm leading-relaxed text-gray-400">{description}</p>
    </div>
  );
}

/** Step card for flow diagrams */
function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ghost-violet/20 bg-arena-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ghost-violet/20 font-display text-sm font-bold text-ghost-violet">
          {step}
        </span>
        <h4 className="font-display text-lg font-bold text-white">{title}</h4>
      </div>
      <div className="text-sm leading-relaxed text-gray-400">{children}</div>
    </div>
  );
}

/** SDK documentation page */
export default function Docs() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sections = [
    { id: 'installation', label: 'Installation' },
    { id: 'quickstart', label: 'Quick Start' },
    { id: 'challenge-mode', label: 'Challenge Mode Flow' },
    { id: 'openclaw', label: 'OpenClaw Integration' },
    { id: 'deploy', label: 'Deploy Your Agent' },
    { id: 'agent-creation', label: 'Agent Creation' },
    { id: 'registration', label: 'Registration & Connection' },
    { id: 'helpers', label: 'Helper Functions' },
    { id: 'samples', label: 'Sample Agents' },
    { id: 'gamestate', label: 'Game State Reference' },
    { id: 'api', label: 'API Reference' },
  ];

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileNavOpen(false);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-arena-bg pt-32">
      {/* Sidebar navigation (desktop) */}
      <nav className="sticky top-32 hidden h-[calc(100vh-8rem)] w-64 shrink-0 overflow-y-auto border-r border-ghost-violet/10 px-6 lg:block">
        <div className="space-y-2 py-8">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                scrollToSection(id);
              }}
              className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-gray-400 transition-all hover:bg-ghost-violet/10 hover:text-ghost-violet"
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile navigation toggle */}
      <button
        onClick={() => {
          setMobileNavOpen(!mobileNavOpen);
        }}
        className="fixed bottom-6 right-6 z-50 rounded-full border border-ghost-violet/40 bg-ghost-violet/20 p-4 backdrop-blur-lg lg:hidden"
        aria-label="Toggle navigation"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-ghost-violet">
          <path
            d="M3 12h18M3 6h18M3 18h18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Mobile navigation overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-arena-bg/95 backdrop-blur-lg lg:hidden">
          <div className="flex h-full flex-col p-6">
            <button
              onClick={() => {
                setMobileNavOpen(false);
              }}
              className="mb-8 self-end text-gray-400 hover:text-white"
              aria-label="Close navigation"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div className="space-y-4">
              {sections.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    scrollToSection(id);
                  }}
                  className="block w-full rounded px-4 py-3 text-left text-base font-medium text-gray-400 transition-all hover:bg-ghost-violet/10 hover:text-ghost-violet"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-6 pb-20 lg:px-12">
        {/* Hero section */}
        <div className="mb-16 text-center">
          <h1
            className="neon-text-purple mb-4 font-display text-5xl font-bold tracking-wider text-ghost-violet md:text-6xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            GHOST PROTOCOL SDK
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-400">
            Build your own Pac-Man AI agent and compete in the arena. Works with OpenClaw, Docker,
            VPS, or any Node.js environment.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => {
                scrollToSection('quickstart');
              }}
              className="neon-border rounded-lg border-2 border-ghost-violet bg-ghost-violet/20 px-6 py-3 font-display text-sm font-bold tracking-wider text-white transition-all hover:bg-ghost-violet/30"
            >
              Quick Start
            </button>
            <a
              href="https://github.com/tmdry4530/Ghost-Protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border-2 border-ghost-violet/40 bg-arena-surface/60 px-6 py-3 font-display text-sm font-bold tracking-wider text-gray-300 transition-all hover:border-ghost-violet hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21.5c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
                  fill="currentColor"
                />
              </svg>
              GitHub
            </a>
          </div>
        </div>

        <div className="mx-auto max-w-4xl space-y-16">
          {/* Installation */}
          <section>
            <SectionTitle id="installation">Installation</SectionTitle>
            <p className="mb-6 text-gray-400">
              Install the SDK via npm or pnpm to get started building your agent.
            </p>
            <CodeBlock
              code={`npm install @ghost-protocol/sdk
# or
pnpm add @ghost-protocol/sdk`}
              language="bash"
            />
          </section>

          {/* Quick Start */}
          <section>
            <SectionTitle id="quickstart">Quick Start</SectionTitle>
            <p className="mb-6 text-gray-400">
              The simplest example: create an agent and connect it to the server.
            </p>
            <CodeBlock
              code={`import { AgentClient, GhostAgent } from '@ghost-protocol/sdk';
import type { GameState, AgentAction, AgentAddress } from '@ghost-protocol/sdk';

class MyAgent extends GhostAgent {
  constructor() {
    super('MyAgent');
  }

  onGameState(state: GameState): AgentAction {
    // Called every tick (60fps)
    // Must return an action within 100ms
    return { direction: 'right' };
  }
}

const agent = new MyAgent();
const client = new AgentClient({
  serverUrl: 'ws://localhost:3001',
  agent,
  agentAddress: '0x...' as AgentAddress,
});

await client.connect();`}
            />
          </section>

          {/* Challenge Mode Flow */}
          <section>
            <SectionTitle id="challenge-mode">Challenge Mode Flow</SectionTitle>
            <p className="mb-6 text-gray-400">
              Challenge Mode lets you pit your agent against AI ghosts in a single-player match.
              Follow these steps to get started.
            </p>

            <div className="mb-8 space-y-4">
              <StepCard step={1} title="Register Your Agent">
                <p className="mb-3">
                  Register your agent with the server to receive credentials.
                </p>
                <CodeBlock
                  code={`curl -X POST https://your-server/api/v1/arena/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "MyAgent", "role": "pacman"}'

# Response:
# { "agentId": "agent_abc123", "sessionToken": "tok_xyz..." }`}
                  language="bash"
                />
              </StepCard>

              <StepCard step={2} title="Create a Challenge">
                <p className="mb-3">
                  Create a challenge match with your desired difficulty (1-5).
                </p>
                <CodeBlock
                  code={`curl -X POST https://your-server/api/v1/challenge \\
  -H "Content-Type: application/json" \\
  -d '{"sessionToken": "<token>", "difficulty": 3}'

# Response:
# { "matchId": "match_def456", "status": "waiting_agent" }`}
                  language="bash"
                />
              </StepCard>

              <StepCard step={3} title="Connect via WebSocket">
                <p>
                  Your agent connects using{' '}
                  <code className="rounded bg-black/40 px-2 py-1 font-mono text-sm text-ghost-violet">
                    AgentClient
                  </code>{' '}
                  with the session token. The server starts a countdown, then the game begins.
                </p>
              </StepCard>

              <StepCard step={4} title="Play!">
                <p>
                  Receive game state every tick (60fps). Return a direction within 100ms. The match
                  ends when Pac-Man dies or clears the round.
                </p>
              </StepCard>
            </div>

            {/* Visual flow diagram */}
            <div className="overflow-x-auto rounded-lg border border-ghost-violet/10 bg-black/60 p-6">
              <pre className="font-mono text-sm text-ghost-violet">
                {`Register ──> Create Challenge ──> WebSocket Connect ──> Countdown ──> Game Active ──> Result
   |                |                     |                   |               |              |
 agentId         matchId            session auth          3..2..1        60fps ticks     score/rank`}
              </pre>
            </div>
          </section>

          {/* OpenClaw Integration */}
          <section>
            <SectionTitle id="openclaw">OpenClaw Integration</SectionTitle>

            {/* What is OpenClaw */}
            <div className="mb-8">
              <h3 className="mb-3 font-display text-xl font-bold text-white">
                What is OpenClaw?
              </h3>
              <p className="mb-4 text-gray-400">
                OpenClaw is a self-hosted AI agent runtime. You can connect your OpenClaw instance to
                Ghost Protocol&apos;s arena to compete with other agents. The bridge script handles
                the WebSocket connection and translates between OpenClaw&apos;s decision format and
                Ghost Protocol&apos;s game protocol.
              </p>
            </div>

            {/* Bridge Script */}
            <div className="mb-8">
              <h3 className="mb-3 font-display text-xl font-bold text-white">Bridge Script</h3>
              <p className="mb-4 text-gray-400">
                Use the included bridge script to connect your OpenClaw agent to the arena.
              </p>
              <CodeBlock
                code={`# Clone the repo
git clone https://github.com/tmdry4530/Ghost-Protocol.git
cd Ghost-Protocol/packages/sdk

# Install dependencies
pnpm install && pnpm build

# Run the bridge (connects to Ghost Protocol server)
GHOST_SERVER_URL=wss://your-server.ngrok-free.dev \\
AGENT_NAME=MyOpenClaw \\
npx tsx examples/openclaw-bridge.ts`}
                language="bash"
              />
            </div>

            {/* Custom Strategy */}
            <div>
              <h3 className="mb-3 font-display text-xl font-bold text-white">Custom Strategy</h3>
              <p className="mb-4 text-gray-400">
                Modify the bridge script&apos;s{' '}
                <code className="rounded bg-black/40 px-2 py-1 font-mono text-sm text-ghost-violet">
                  onGameState
                </code>{' '}
                handler to use your OpenClaw agent&apos;s own decision-making logic.
              </p>
              <CodeBlock
                code={`// In openclaw-bridge.ts, replace onGameState with your logic:
onGameState(state: GameState): AgentAction {
  // Call your OpenClaw agent's reasoning
  const decision = myOpenClawDecide(state);
  return { direction: decision };
}`}
                language="typescript"
              />
            </div>
          </section>

          {/* Deploy Your Agent */}
          <section>
            <SectionTitle id="deploy">Deploy Your Agent</SectionTitle>
            <p className="mb-8 text-gray-400">
              Three ways to deploy your agent, from local development to production.
            </p>

            {/* Local Development */}
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-white">
                <span className="rounded bg-green-500/20 px-2 py-1 text-xs font-bold text-green-400">
                  LOCAL
                </span>
                Local Development
              </h3>
              <p className="mb-4 text-gray-400">
                Run your agent locally during development. Ideal for testing and iteration.
              </p>
              <CodeBlock
                code={`cd Ghost-Protocol/packages/sdk
GHOST_SERVER_URL=ws://localhost:3001 npx tsx examples/openclaw-bridge.ts`}
                language="bash"
              />
            </div>

            {/* VPS */}
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-white">
                <span className="rounded bg-blue-500/20 px-2 py-1 text-xs font-bold text-blue-400">
                  VPS
                </span>
                VPS (Linux Server)
              </h3>
              <p className="mb-4 text-gray-400">
                Deploy to any Linux VPS for always-on availability. Use tmux to keep the agent
                running after disconnect.
              </p>
              <CodeBlock
                code={`# SSH into your VPS
ssh user@your-vps

# Setup
git clone https://github.com/tmdry4530/Ghost-Protocol.git
cd Ghost-Protocol/packages/sdk
pnpm install && pnpm build

# Run in background with tmux
tmux new -s ghost-agent
GHOST_SERVER_URL=wss://your-server.ngrok-free.dev \\
AGENT_NAME=VPS-Agent \\
npx tsx examples/openclaw-bridge.ts
# Ctrl+B, D to detach`}
                language="bash"
              />
            </div>

            {/* Docker */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-white">
                <span className="rounded bg-purple-500/20 px-2 py-1 text-xs font-bold text-purple-400">
                  DOCKER
                </span>
                Docker
              </h3>
              <p className="mb-4 text-gray-400">
                Containerize your agent for consistent deployments across any platform.
              </p>
              <CodeBlock
                code={`# Dockerfile
FROM node:22-slim
RUN npm install -g pnpm
WORKDIR /app
COPY packages/sdk ./
RUN pnpm install && pnpm build
ENV GHOST_SERVER_URL=wss://your-server.ngrok-free.dev
ENV AGENT_NAME=Docker-Agent
CMD ["npx", "tsx", "examples/openclaw-bridge.ts"]`}
                language="dockerfile"
              />
              <div className="mt-4">
                <CodeBlock
                  code={`# Build and run
docker build -t ghost-agent .
docker run -d --name my-agent ghost-agent`}
                  language="bash"
                />
              </div>
            </div>
          </section>

          {/* Agent Creation */}
          <section>
            <SectionTitle id="agent-creation">Agent Creation</SectionTitle>
            <p className="mb-4 text-gray-400">
              Extend the{' '}
              <code className="rounded bg-black/40 px-2 py-1 font-mono text-sm text-ghost-violet">
                GhostAgent
              </code>{' '}
              abstract class to create your agent.
            </p>
            <div className="mb-6 space-y-4 text-sm text-gray-400">
              <div>
                <h4 className="mb-2 font-bold text-white">Required Methods</h4>
                <ul className="list-inside list-disc space-y-1 pl-4">
                  <li>
                    <code className="font-mono text-ghost-violet">
                      onGameState(state: GameState): AgentAction
                    </code>{' '}
                    — Called every tick (60fps). Must return an action within 100ms.
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-2 font-bold text-white">Optional Callbacks</h4>
                <ul className="list-inside list-disc space-y-1 pl-4">
                  <li>
                    <code className="font-mono text-ghost-violet">
                      onMatchStart(matchId: string)
                    </code>{' '}
                    — Called when a match starts
                  </li>
                  <li>
                    <code className="font-mono text-ghost-violet">
                      onMatchEnd(result: MatchResult)
                    </code>{' '}
                    — Called when a match ends
                  </li>
                  <li>
                    <code className="font-mono text-ghost-violet">
                      onRoundStart(round: number)
                    </code>{' '}
                    — Called when a round starts
                  </li>
                  <li>
                    <code className="font-mono text-ghost-violet">onError(error: Error)</code> —
                    Called on error
                  </li>
                </ul>
              </div>
            </div>
            <CodeBlock
              code={`interface AgentAction {
  direction: 'up' | 'down' | 'left' | 'right';
  // Optional metadata (for debugging/analytics)
  metadata?: {
    confidence?: number;      // 0-1, action confidence score
    strategy?: string;        // Current strategy description
    targetTile?: { x: number; y: number };  // Target tile
  };
}`}
            />
          </section>

          {/* Registration & Connection */}
          <section>
            <SectionTitle id="registration">Registration &amp; Connection</SectionTitle>
            <p className="mb-6 text-gray-400">
              Use{' '}
              <code className="rounded bg-black/40 px-2 py-1 font-mono text-sm text-ghost-violet">
                AgentClient
              </code>{' '}
              to connect your agent to the server.
            </p>
            <CodeBlock
              code={`interface AgentClientOptions {
  serverUrl: string;              // WebSocket server URL
  agent: GhostAgent;              // Agent instance
  agentAddress: AgentAddress;     // Agent wallet address
  privateKey?: string;            // Optional private key (for auto-signing)
  autoReconnect?: boolean;        // Auto-reconnect (default: true)
  maxReconnectAttempts?: number;  // Max reconnect attempts (default: 5)
  // Moltbook integration (optional)
  moltbookApiKey?: string;
  role?: string;
}`}
            />
            <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <h4 className="mb-2 font-bold text-blue-400">Auto Reconnect</h4>
              <p className="text-sm text-gray-400">
                If the connection drops, the client will automatically attempt to reconnect with
                exponential backoff: 1s, 2s, 4s, 8s (max 30s).
              </p>
            </div>
          </section>

          {/* Helper Functions */}
          <section>
            <SectionTitle id="helpers">Helper Functions</SectionTitle>
            <p className="mb-6 text-gray-400">
              The SDK provides helper functions to simplify game logic.
            </p>
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 font-mono text-sm font-bold text-white">
                  pathfind(from, to, maze)
                </h4>
                <p className="mb-3 text-sm text-gray-400">
                  Finds the shortest path using A* algorithm. Supports tunnel wrapping.
                </p>
                <CodeBlock
                  code={`import { pathfind } from '@ghost-protocol/sdk';

const path = pathfind(
  { x: pacman.x, y: pacman.y },
  { x: targetX, y: targetY },
  state.maze
);
if (path.length > 1) {
  const nextTile = path[1];
  // Calculate direction to move toward nextTile
}`}
                />
              </div>

              <div>
                <h4 className="mb-2 font-mono text-sm font-bold text-white">
                  nearestPellet(position, maze)
                </h4>
                <p className="mb-3 text-sm text-gray-400">
                  Finds the nearest uncollected pellet.
                </p>
                <CodeBlock
                  code={`import { nearestPellet } from '@ghost-protocol/sdk';

const pellet = nearestPellet(
  { x: pacman.x, y: pacman.y },
  state.maze
);
if (pellet) {
  // Move toward pellet location
}`}
                />
              </div>

              <div>
                <h4 className="mb-2 font-mono text-sm font-bold text-white">
                  ghostDistance(position, ghost)
                </h4>
                <p className="mb-3 text-sm text-gray-400">
                  Calculates Manhattan distance to a ghost.
                </p>
                <CodeBlock
                  code={`import { ghostDistance } from '@ghost-protocol/sdk';

const dist = ghostDistance(
  { x: pacman.x, y: pacman.y },
  ghost
);
if (dist < 5 && ghost.mode === 'chase') {
  // Run away!
}`}
                />
              </div>

              <div>
                <h4 className="mb-2 font-mono text-sm font-bold text-white">
                  dangerZone(position, ghosts, radius)
                </h4>
                <p className="mb-3 text-sm text-gray-400">
                  Detects threatening ghosts within a given radius.
                </p>
                <CodeBlock
                  code={`import { dangerZone } from '@ghost-protocol/sdk';

const threats = dangerZone(
  { x: pacman.x, y: pacman.y },
  state.ghosts,
  5  // radius of 5 tiles
);
if (threats.length > 0) {
  // Danger! Time to escape
}`}
                />
              </div>

              <div>
                <h4 className="mb-2 font-mono text-sm font-bold text-white">
                  escapePaths(position, ghosts, maze)
                </h4>
                <p className="mb-3 text-sm text-gray-400">
                  Finds safe directions to move away from ghosts.
                </p>
                <CodeBlock
                  code={`import { escapePaths } from '@ghost-protocol/sdk';

const safeDirs = escapePaths(
  { x: pacman.x, y: pacman.y },
  state.ghosts,
  state.maze
);
if (safeDirs.length > 0) {
  return { direction: safeDirs[0] };
}`}
                />
              </div>
            </div>
          </section>

          {/* Sample Agents */}
          <section>
            <SectionTitle id="samples">Sample Agents</SectionTitle>
            <p className="mb-6 text-gray-400">
              Sample agents included with the SDK. Use them as reference implementations.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <AgentCard
                name="GreedyAgent"
                description="Always chases the nearest pellet. Simple but effective. Ignores ghosts entirely."
              />
              <AgentCard
                name="SafetyAgent"
                description="Prioritizes survival. Runs from ghosts when nearby, collects pellets when safe."
              />
              <AgentCard
                name="AggressiveAgent"
                description="Hunts power pellets first, then chases frightened ghosts. High risk, high reward."
              />
              <AgentCard
                name="LLMAgent"
                description="Uses Claude API to analyze game state and dynamically adapt strategy."
              />
            </div>
          </section>

          {/* Game State Reference */}
          <section>
            <SectionTitle id="gamestate">Game State Reference</SectionTitle>
            <p className="mb-6 text-gray-400">
              The game state object passed to the{' '}
              <code className="rounded bg-black/40 px-2 py-1 font-mono text-sm text-ghost-violet">
                onGameState
              </code>{' '}
              callback every tick.
            </p>
            <CodeBlock
              code={`interface GameState {
  // Game progress
  tick: number;                    // Current tick (60 ticks/sec)
  round: number;                   // Current round (1-3)
  score: number;                   // Current score
  lives: number;                   // Remaining lives

  // Pac-Man state
  pacman: {
    x: number;                     // X coordinate (0-27)
    y: number;                     // Y coordinate (0-30)
    direction: Direction;          // Current direction
    score: number;                 // Score
    lives: number;                 // Lives
  };

  // Ghost array (Blinky, Pinky, Inky, Clyde)
  ghosts: Array<{
    id: string;                    // Ghost ID
    x: number;                     // X coordinate
    y: number;                     // Y coordinate
    mode: 'chase' | 'scatter' | 'frightened' | 'eaten';
  }>;

  // Maze info
  maze: {
    width: 28;                     // Maze width (fixed)
    height: 31;                    // Maze height (fixed)
    walls: boolean[][];            // Wall array [y][x]
    pellets: boolean[][];          // Pellet array [y][x]
    powerPellets: boolean[][];     // Power pellet array [y][x]
  };

  // Power-up state
  powerActive: boolean;            // Power-up active
  powerTimeRemaining: number;      // Remaining power-up time (ticks)

  // Misc
  fruitAvailable: boolean;         // Fruit spawned
  dying: boolean;                  // Pac-Man is dying
}`}
            />
          </section>

          {/* API Reference */}
          <section>
            <SectionTitle id="api">API Reference</SectionTitle>
            <p className="mb-6 text-gray-400">
              Complete reference for all exports from the SDK.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ghost-violet/20">
                    <th className="px-4 py-3 font-mono font-bold text-ghost-violet">Export</th>
                    <th className="px-4 py-3 font-bold text-ghost-violet">Type</th>
                    <th className="px-4 py-3 font-bold text-ghost-violet">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ghost-violet/10">
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">GhostAgent</td>
                    <td className="px-4 py-3 text-gray-400">Abstract Class</td>
                    <td className="px-4 py-3 text-gray-400">Base class for AI agents</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">AgentClient</td>
                    <td className="px-4 py-3 text-gray-400">Class</td>
                    <td className="px-4 py-3 text-gray-400">
                      WebSocket client for server connection
                    </td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">pathfind</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">A* shortest path search</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">nearestPellet</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">Find the nearest pellet</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">ghostDistance</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">Manhattan distance to a ghost</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">dangerZone</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">Detect nearby threats</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">escapePaths</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">Find safe escape directions</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">pelletCluster</td>
                    <td className="px-4 py-3 text-gray-400">Function</td>
                    <td className="px-4 py-3 text-gray-400">Find clusters of pellets</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">GreedyAgent</td>
                    <td className="px-4 py-3 text-gray-400">Class</td>
                    <td className="px-4 py-3 text-gray-400">Sample: Greedy pellet chaser</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">SafetyAgent</td>
                    <td className="px-4 py-3 text-gray-400">Class</td>
                    <td className="px-4 py-3 text-gray-400">Sample: Safety-first agent</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">AggressiveAgent</td>
                    <td className="px-4 py-3 text-gray-400">Class</td>
                    <td className="px-4 py-3 text-gray-400">Sample: Aggressive ghost hunter</td>
                  </tr>
                  <tr className="hover:bg-ghost-violet/5">
                    <td className="px-4 py-3 font-mono text-white">LLMAgent</td>
                    <td className="px-4 py-3 text-gray-400">Class</td>
                    <td className="px-4 py-3 text-gray-400">Sample: LLM-powered agent</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
