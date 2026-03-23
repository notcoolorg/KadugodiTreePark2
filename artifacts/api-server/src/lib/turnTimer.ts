import { db } from "@workspace/db";
import { gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { applyMove } from "./gameEngine.js";
import { getValidMoves } from "./gameMap.js";
import { broadcastToRoom } from "./wsManager.js";
import type { GameState, Player } from "./gameEngine.js";

export const TURN_TIMEOUT_MS = 90_000;

// Active timers keyed by roomCode
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// Track when each turn started (roomCode -> ISO string)
const turnStartedAt = new Map<string, string>();

function rowToGameState(row: typeof gamesTable.$inferSelect): GameState {
  return {
    id: row.id,
    roomCode: row.roomCode,
    status: row.status as GameState["status"],
    players: (row.players as Player[]) ?? [],
    currentTurn: row.currentTurn ?? null,
    round: row.round,
    maxRounds: row.maxRounds,
    mrxRevealRounds: (row.mrxRevealRounds as number[]) ?? [3, 8, 13, 18, 24],
    mrxMoveLog: (row.mrxMoveLog as GameState["mrxMoveLog"]) ?? [],
    turnOrder: (row.turnOrder as string[]) ?? [],
    turnIndex: row.turnIndex,
    winner: row.winner ?? null,
    mrxStartQuarter: row.mrxStartQuarter ?? null,
    decoyQuarter: row.decoyQuarter ?? null,
  };
}

function gameStateToRow(state: GameState): Partial<typeof gamesTable.$inferInsert> {
  return {
    status: state.status,
    players: state.players as unknown as never[],
    currentTurn: state.currentTurn ?? undefined,
    round: state.round,
    maxRounds: state.maxRounds,
    mrxRevealRounds: state.mrxRevealRounds as unknown as never[],
    mrxMoveLog: state.mrxMoveLog as unknown as never[],
    turnOrder: state.turnOrder as unknown as never[],
    turnIndex: state.turnIndex,
    winner: state.winner ?? undefined,
    mrxStartQuarter: state.mrxStartQuarter ?? undefined,
    decoyQuarter: state.decoyQuarter ?? undefined,
    updatedAt: new Date(),
  };
}

export function getTurnStartedAt(roomCode: string): string | null {
  return turnStartedAt.get(roomCode) ?? null;
}

export function scheduleTurnTimer(roomCode: string, game: GameState): void {
  cancelTurnTimer(roomCode);

  if (game.status !== "playing" || !game.currentTurn) return;

  const expectedPlayerId = game.currentTurn;
  const startedAt = new Date().toISOString();
  turnStartedAt.set(roomCode, startedAt);

  const timerId = setTimeout(async () => {
    timers.delete(roomCode);

    try {
      const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
      if (!row) return;

      const currentGame = rowToGameState(row);

      if (currentGame.currentTurn !== expectedPlayerId) return;
      if (currentGame.status !== "playing") return;

      const player = currentGame.players.find(p => p.id === expectedPlayerId);
      if (!player || player.position === null) return;

      const isMrX = player.role === "mrx";
      const validMoves = getValidMoves(player.position, player.tickets, isMrX);

      let filteredMoves = validMoves;
      if (isMrX) {
        const detectivePositions = new Set(
          currentGame.players.filter(p => p.role === "detective").map(p => p.position)
        );
        filteredMoves = validMoves.filter(m => !detectivePositions.has(m.station));
      }

      if (filteredMoves.length === 0) return;

      const randomMove = filteredMoves[Math.floor(Math.random() * filteredMoves.length)];

      const { game: updatedGame, error } = applyMove(
        currentGame,
        expectedPlayerId,
        randomMove.station,
        randomMove.transport
      );

      if (error) {
        console.error(`[TurnTimer] Auto-move failed for ${roomCode}: ${error}`);
        return;
      }

      await db.update(gamesTable)
        .set(gameStateToRow(updatedGame))
        .where(eq(gamesTable.roomCode, roomCode));

      broadcastToRoom(roomCode, { ...updatedGame, turnStartedAt: null });
      console.log(`[TurnTimer] Auto-moved ${player.name} (${randomMove.transport} → ${randomMove.station}) in room ${roomCode}`);

      if (updatedGame.status === "playing") {
        scheduleTurnTimer(roomCode, updatedGame);
      } else {
        turnStartedAt.delete(roomCode);
      }
    } catch (err) {
      console.error(`[TurnTimer] Error in room ${roomCode}:`, err);
    }
  }, TURN_TIMEOUT_MS);

  timers.set(roomCode, timerId);
}

export function cancelTurnTimer(roomCode: string): void {
  const existing = timers.get(roomCode);
  if (existing !== undefined) {
    clearTimeout(existing);
    timers.delete(roomCode);
  }
  turnStartedAt.delete(roomCode);
}
