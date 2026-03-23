import { canMoveToStation, getValidMoves } from "./gameMap.js";
import type { Transport } from "./gameMap.js";

export interface Tickets {
  taxi: number;
  bus: number;
  underground: number;
  black: number;
  double: number;
}

export interface Player {
  id: string;
  name: string;
  role: "mrx" | "detective";
  position: number | null;
  tickets: Tickets;
  isConnected: boolean;
  doubleMoveActive?: boolean;
  emoji?: string;
}

export const DETECTIVE_EMOJIS = [
  "🕵️", "🦁", "🐯", "🦊", "🐺", "🦝", "🐻", "🦅",
  "🦉", "🐸", "🦈", "🐲", "🦄", "🐙", "🦋", "🐬",
];

export interface MrXMove {
  round: number;
  transport: string;
  station: number | null;
  isDoubleMove?: boolean;
}

export interface GameState {
  id: string;
  roomCode: string;
  status: "lobby" | "playing" | "mrx_won" | "detectives_won";
  players: Player[];
  currentTurn: string | null;
  round: number;
  maxRounds: number;
  mrxRevealRounds: number[];
  mrxMoveLog: MrXMove[];
  turnOrder: string[];
  turnIndex: number;
  winner: string | null;
  mrxStartQuarter?: number | null;
  decoyQuarter?: number | null;
}

// 28 designated starting stations spread across all four map quarters of the 200-node board.
// Q1 (NW): top-left quadrant  Q2 (NE): top-right quadrant
// Q3 (SW): bottom-left        Q4 (SE): bottom-right
// Note: node 108 does not exist on the real board; replaced with 109.
export const ALL_START_STATIONS = [
  13, 18, 24, 27, 31, 37, 43, 51,
  57, 65, 73, 84, 92, 100,
  109, 115, 120, 127, 135, 144,
  150, 157, 163, 170, 176, 185, 189, 198,
];

export const MRX_REVEAL_ROUNDS = [3, 8, 13, 18, 24];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Quarter assignments for start stations (1=NW, 2=NE, 3=SW, 4=SE)
const STATION_QUARTER: Record<number, 1 | 2 | 3 | 4> = {
  13:2, 18:1, 24:2, 27:2,
  31:1, 37:2, 43:1, 51:2,
  57:1, 65:2, 73:1, 84:2,
  92:1, 100:2,
  109:3, 115:4, 120:3, 127:4, 135:4, 144:3,
  150:3, 157:4, 163:3, 170:4, 176:3, 185:4, 189:3, 198:4,
};

/** Return the quarter (1–4) that a station belongs to. */
function getQuarter(station: number): number {
  return STATION_QUARTER[station] ?? 1;
}

// Advance turn index, auto-skipping detectives who have no legal moves.
// Returns updated { turnIndex, round, currentTurn }.
function advanceTurn(
  currentTurnIndex: number,
  currentRound: number,
  turnOrder: string[],
  players: Player[]
): { turnIndex: number; round: number; currentTurn: string | null } {
  let turnIndex = (currentTurnIndex + 1) % turnOrder.length;
  let round = currentRound;
  if (turnIndex === 0) round = currentRound + 1;

  // Skip detectives with no legal moves (due to empty tickets).
  // Run at most turnOrder.length times to avoid infinite loops.
  for (let guard = 0; guard < turnOrder.length; guard++) {
    const playerId = turnOrder[turnIndex];
    const player = players.find(p => p.id === playerId);
    if (!player) break;
    // Mr. X never skips; unspawned detectives (position === null) never skip.
    if (player.role === "mrx" || player.position === null) break;

    const legalMoves = getValidMoves(player.position, player.tickets, false);
    if (legalMoves.length > 0) break; // has moves — stop skipping

    // No legal moves: skip this detective.
    turnIndex = (turnIndex + 1) % turnOrder.length;
    if (turnIndex === 0) round = round + 1;
  }

  return { turnIndex, round, currentTurn: turnOrder[turnIndex] ?? null };
}

export function initializeGame(game: GameState): GameState {
  // Shuffle the start station pool and assign a unique slot to every player.
  const pool = [...ALL_START_STATIONS].sort(() => Math.random() - 0.5);

  if (game.players.length > pool.length) {
    throw new Error("Too many players for the available starting stations.");
  }

  const players: Player[] = game.players.map((p, i) => ({
    ...p,
    position: pool[i],
    doubleMoveActive: false,
    tickets: p.role === "mrx"
      ? { taxi: 4, bus: 3, underground: 3, black: 5, double: 2 }
      : { taxi: 10, bus: 8, underground: 4, black: 0, double: 0 },
  }));

  // Compute the deception hint: real quarter vs random decoy quarter.
  const mrxPlayer = players.find(p => p.role === "mrx");
  let mrxStartQuarter: number | null = null;
  let decoyQuarter: number | null = null;

  if (mrxPlayer?.position != null) {
    mrxStartQuarter = getQuarter(mrxPlayer.position);
    const otherQuarters = [1, 2, 3, 4].filter(q => q !== mrxStartQuarter);
    decoyQuarter = randomFrom(otherQuarters);
  }

  const mrx = players.find(p => p.role === "mrx");
  const detectives = players.filter(p => p.role === "detective");
  const turnOrder = [
    ...(mrx ? [mrx.id] : []),
    ...detectives.map(d => d.id),
  ];

  return {
    ...game,
    status: "playing",
    players,
    turnOrder,
    turnIndex: 0,
    currentTurn: turnOrder[0] ?? null,
    round: 1,
    mrxStartQuarter,
    decoyQuarter,
  };
}

export function applyMove(
  game: GameState,
  playerId: string,
  toStation: number,
  transport: Transport,
  useDouble?: boolean
): { game: GameState; error?: string } {
  if (game.status !== "playing") return { game, error: "Game is not in progress" };
  if (game.currentTurn !== playerId) return { game, error: "Not your turn" };

  const playerIdx = game.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return { game, error: "Player not found" };

  const player = game.players[playerIdx];
  const isMrX = player.role === "mrx";
  const isSecondDoubleMove = isMrX && player.doubleMoveActive === true;
  const newPlayers = [...game.players];

  // ── Double move pre-validation ────────────────────────────────────────────
  if (useDouble && isMrX) {
    if (player.tickets.double <= 0) return { game, error: "No double move tickets remaining" };
    if (isSecondDoubleMove) return { game, error: "Already making second part of double move" };
  }

  // ── Spawn move (safety fallback — should not occur after auto-assignment) ──
  if (player.position === null) {
    if (toStation < 1 || toStation > 200 || toStation === 108) return { game, error: "Invalid station" };
    const occupied = new Set(game.players.filter(p => p.id !== playerId).map(p => p.position));
    if (occupied.has(toStation)) return { game, error: "Station is occupied" };

    newPlayers[playerIdx] = { ...player, position: toStation };
  } else {
    // ── Normal move ──────────────────────────────────────────────────────────
    if (!canMoveToStation(player.position, toStation, transport, player.tickets)) {
      return { game, error: "Invalid move" };
    }
    // Mr. X cannot move onto a station occupied by a detective
    if (isMrX) {
      const detectivePositions = new Set(
        game.players.filter(p => p.role === "detective").map(p => p.position)
      );
      if (detectivePositions.has(toStation)) {
        return { game, error: "Mr. X cannot move to a station occupied by a detective" };
      }
    }

    // Deduct ticket (boat is free — no ticket cost)
    const updatedTickets: Tickets = transport === 'boat'
      ? player.tickets
      : { ...player.tickets, [transport]: (player.tickets as Record<string, number>)[transport] - 1 } as Tickets;
    newPlayers[playerIdx] = { ...player, position: toStation, tickets: updatedTickets };

    // Detectives' tickets (taxi/bus/underground) are given to Mr. X
    if (!isMrX && transport !== "black" && transport !== "boat") {
      const mrxIdx = newPlayers.findIndex(p => p.role === "mrx");
      if (mrxIdx !== -1) {
        newPlayers[mrxIdx] = {
          ...newPlayers[mrxIdx],
          tickets: {
            ...newPlayers[mrxIdx].tickets,
            [transport]: newPlayers[mrxIdx].tickets[transport] + 1,
          },
        };
      }
    }
  }

  // ── Mr. X move log ────────────────────────────────────────────────────────
  // Both parts of a double move are logged at the SAME round number so the
  // logbook shows them together in one row (no blank '-' rows in between).
  // For the first double-move step the round hasn't changed yet (we no longer
  // increment it), so game.round is correct for both halves.
  // Station reveal: only expose the final destination (second half).  The
  // intermediate stop during a double move is always hidden.
  let mrxMoveLog = [...game.mrxMoveLog];
  if (isMrX && player.position !== null) {
    const isFirstDouble = !!useDouble && !isSecondDoubleMove;
    const reveal = !isFirstDouble && game.mrxRevealRounds.includes(game.round);
    const isDoubleEntry = useDouble || isSecondDoubleMove;
    mrxMoveLog = [
      ...mrxMoveLog,
      {
        round: game.round,
        transport,
        station: reveal ? toStation : null,
        isDoubleMove: isDoubleEntry || undefined,
      },
    ];
  }

  // ── First step of double move ─────────────────────────────────────────────
  if (isMrX && useDouble && !isSecondDoubleMove) {
    newPlayers[playerIdx] = {
      ...newPlayers[playerIdx],
      tickets: {
        ...newPlayers[playerIdx].tickets,
        double: newPlayers[playerIdx].tickets.double - 1,
      },
      doubleMoveActive: true,
    };

    const mrxPos = newPlayers[playerIdx].position;
    const detectivePlayers = newPlayers.filter(p => p.role === "detective");
    if (detectivePlayers.some(d => d.position === mrxPos)) {
      return {
        game: {
          ...game,
          players: newPlayers,
          mrxMoveLog,
          status: "detectives_won",
          winner: "detectives",
        },
      };
    }

    return {
      game: {
        ...game,
        players: newPlayers,
        mrxMoveLog,
        // Keep game.round unchanged — both halves of a double move share the
        // same round number so the logbook groups them together in one row.
        currentTurn: playerId, // stay on Mr. X
      },
    };
  }

  // ── Clear double move flag on the second step ─────────────────────────────
  if (isSecondDoubleMove) {
    newPlayers[playerIdx] = {
      ...newPlayers[playerIdx],
      doubleMoveActive: false,
    };
  }

  // ── Advance turn (with auto-skip for stuck detectives) ────────────────────
  const advanceFromRound = game.round;
  const { turnIndex: newTurnIndex, round: newRound, currentTurn: newCurrentTurn } =
    advanceTurn(game.turnIndex, advanceFromRound, game.turnOrder, newPlayers);

  // ── Win conditions ────────────────────────────────────────────────────────
  const mrxPlayer = newPlayers.find(p => p.role === "mrx");
  const detectivePlayers = newPlayers.filter(p => p.role === "detective");
  let newStatus: GameState["status"] = game.status;
  let winner: string | null = game.winner;

  if (mrxPlayer && detectivePlayers.some(d => d.position === mrxPlayer.position)) {
    newStatus = "detectives_won";
    winner = "detectives";
  } else if (newRound > game.maxRounds) {
    newStatus = "mrx_won";
    winner = "mrx";
  } else if (newCurrentTurn === mrxPlayer?.id && mrxPlayer.position !== null) {
    const mrxMoves = getValidMoves(mrxPlayer.position, mrxPlayer.tickets, true);
    const detectivePositions = new Set(detectivePlayers.map(d => d.position));
    if (mrxMoves.filter(m => !detectivePositions.has(m.station)).length === 0) {
      newStatus = "detectives_won";
      winner = "detectives";
    }
  }

  return {
    game: {
      ...game,
      players: newPlayers,
      mrxMoveLog,
      turnIndex: newTurnIndex,
      currentTurn: newCurrentTurn,
      round: newRound,
      status: newStatus,
      winner,
    },
  };
}
