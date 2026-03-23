import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { gamesTable } from "@workspace/db";
import { initializeGame, DETECTIVE_EMOJIS } from "./gameEngine.js";
import type { GameState, Player, Tickets } from "./gameEngine.js";
import { broadcastToRoom } from "./wsManager.js";
import { scheduleTurnTimer, getTurnStartedAt } from "./turnTimer.js";

const DETECTIVE_TICKETS: Tickets = { taxi: 10, bus: 8, underground: 4, black: 0, double: 0 };
const MRX_TICKETS: Tickets       = { taxi: 4,  bus: 3,  underground: 3, black: 5, double: 2 };
const QUEUE_CAPACITY = 8;

export interface QueueEntry {
  queueId: string;
  playerName: string;
  joinedAt: number;
  gameRoomCode: string | null;
  myPlayerId: string | null;
}

const waitingQueue: QueueEntry[] = [];
const allEntries = new Map<string, QueueEntry>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function pickDetectiveEmoji(existingPlayers: Player[]): string {
  const used = new Set(existingPlayers.map(p => p.emoji).filter(Boolean));
  const available = DETECTIVE_EMOJIS.filter(e => !used.has(e));
  const pool = available.length > 0 ? available : DETECTIVE_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
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

async function persistAndLaunchGame(
  entries: QueueEntry[],
  roomCode: string,
  playerIds: string[]
): Promise<void> {
  const gameId = randomUUID();

  const players: Player[] = entries.map((entry, i) => ({
    id: playerIds[i],
    name: entry.playerName,
    role: "detective" as const,
    position: null,
    tickets: { ...DETECTIVE_TICKETS },
    isConnected: true,
    doubleMoveActive: false,
    emoji: "",
  }));

  for (let i = 0; i < players.length; i++) {
    players[i].emoji = pickDetectiveEmoji(players.slice(0, i));
  }

  const mrxIndex = Math.floor(Math.random() * players.length);
  const playersWithRoles: Player[] = players.map((p, i) => ({
    ...p,
    role: i === mrxIndex ? "mrx" as const : "detective" as const,
    tickets: i === mrxIndex ? { ...MRX_TICKETS } : { ...DETECTIVE_TICKETS },
    emoji: i === mrxIndex ? undefined : p.emoji,
  }));

  const gameState: GameState = {
    id: gameId,
    roomCode,
    status: "lobby",
    players: playersWithRoles,
    currentTurn: null,
    round: 0,
    maxRounds: 24,
    mrxRevealRounds: [3, 8, 13, 18, 24],
    mrxMoveLog: [],
    turnOrder: [],
    turnIndex: 0,
    winner: null,
  };

  const initializedGame = initializeGame(gameState);

  await db.insert(gamesTable).values({
    id: gameId,
    roomCode,
    isPublic: false,
    ...gameStateToRow(initializedGame),
  } as typeof gamesTable.$inferInsert);

  scheduleTurnTimer(roomCode, initializedGame);
  const turnStartedAt = getTurnStartedAt(roomCode);
  broadcastToRoom(roomCode, { ...initializedGame, isPublic: false, turnStartedAt });
}

export function joinQueue(playerName: string): QueueEntry {
  const entry: QueueEntry = {
    queueId: randomUUID(),
    playerName,
    joinedAt: Date.now(),
    gameRoomCode: null,
    myPlayerId: null,
  };

  waitingQueue.push(entry);
  allEntries.set(entry.queueId, entry);

  if (waitingQueue.length >= QUEUE_CAPACITY) {
    const batch = waitingQueue.splice(0, QUEUE_CAPACITY);

    // Assign room code and player IDs synchronously so polls see them immediately
    const roomCode = generateRoomCode();
    const playerIds = batch.map(() => randomUUID());
    for (let i = 0; i < batch.length; i++) {
      batch[i].gameRoomCode = roomCode;
      batch[i].myPlayerId = playerIds[i];
    }

    persistAndLaunchGame(batch, roomCode, playerIds).catch(console.error);
  }

  return entry;
}

export function leaveQueue(queueId: string): boolean {
  const idx = waitingQueue.findIndex(e => e.queueId === queueId);
  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
    allEntries.delete(queueId);
    return true;
  }
  return false;
}

export function getQueueEntry(queueId: string): QueueEntry | null {
  return allEntries.get(queueId) ?? null;
}

export function getQueueSize(): number {
  return waitingQueue.length;
}
