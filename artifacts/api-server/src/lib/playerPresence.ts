import { db } from "@workspace/db";
import { gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { broadcastToRoom } from "./wsManager.js";
import { cancelTurnTimer, getTurnStartedAt } from "./turnTimer.js";
import type { GameState, Player } from "./gameEngine.js";

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

function broadcast(roomCode: string, game: GameState) {
  broadcastToRoom(roomCode, { ...game, turnStartedAt: getTurnStartedAt(roomCode) });
}

export async function handlePlayerConnect(roomCode: string, playerId: string): Promise<void> {
  try {
    const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
    if (!row) return;

    const game = rowToGameState(row);
    const player = game.players.find(p => p.id === playerId);
    if (!player || player.isConnected) return; // already marked connected

    const updatedGame: GameState = {
      ...game,
      players: game.players.map(p => p.id === playerId ? { ...p, isConnected: true } : p),
    };

    await db.update(gamesTable).set(gameStateToRow(updatedGame)).where(eq(gamesTable.roomCode, roomCode));
    broadcast(roomCode, updatedGame);
    console.log(`[Presence] ${player.name} reconnected to room ${roomCode}`);
  } catch (err) {
    console.error(`[Presence] Error on connect for ${roomCode}/${playerId}:`, err);
  }
}

export async function handlePlayerDisconnect(roomCode: string, playerId: string): Promise<void> {
  try {
    const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
    if (!row) return;

    const game = rowToGameState(row);
    const disconnectedPlayer = game.players.find(p => p.id === playerId);
    if (!disconnectedPlayer) return;

    const updatedPlayers = game.players.map(p =>
      p.id === playerId ? { ...p, isConnected: false } : p
    );

    // Only check for forfeit win conditions during an active game
    if (game.status !== 'playing') {
      const updatedGame: GameState = { ...game, players: updatedPlayers };
      await db.update(gamesTable).set(gameStateToRow(updatedGame)).where(eq(gamesTable.roomCode, roomCode));
      broadcast(roomCode, updatedGame);
      return;
    }

    let newStatus = game.status;
    let winner = game.winner;

    if (disconnectedPlayer.role === 'mrx') {
      // Mr. X left — detectives win by forfeit
      newStatus = 'detectives_won';
      winner = 'detectives';
      console.log(`[Presence] Mr. X left room ${roomCode} — detectives win by forfeit`);
    } else {
      // Check if every detective is now disconnected
      const allDetectives = updatedPlayers.filter(p => p.role === 'detective');
      const anyDetectiveStillOn = allDetectives.some(d => d.isConnected);
      if (!anyDetectiveStillOn) {
        newStatus = 'mrx_won';
        winner = 'mrx';
        console.log(`[Presence] All detectives left room ${roomCode} — Mr. X wins by forfeit`);
      }
    }

    const updatedGame: GameState = { ...game, players: updatedPlayers, status: newStatus, winner };
    await db.update(gamesTable).set(gameStateToRow(updatedGame)).where(eq(gamesTable.roomCode, roomCode));
    broadcast(roomCode, updatedGame);

    if (newStatus !== 'playing') {
      cancelTurnTimer(roomCode);
    }
  } catch (err) {
    console.error(`[Presence] Error on disconnect for ${roomCode}/${playerId}:`, err);
  }
}
