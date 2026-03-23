import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { gamesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateGameBody,
  JoinGameBody,
  StartGameBody,
  MakeMoveBody,
} from "@workspace/api-zod";
import { initializeGame, applyMove, DETECTIVE_EMOJIS } from "../lib/gameEngine.js";
import type { GameState, Player, Tickets } from "../lib/gameEngine.js";
import { broadcastToRoom } from "../lib/wsManager.js";
import { scheduleTurnTimer, cancelTurnTimer, getTurnStartedAt } from "../lib/turnTimer.js";

const router: IRouter = Router();

const DETECTIVE_TICKETS: Tickets = { taxi: 10, bus: 8, underground: 4, black: 0, double: 0 };
const MRX_TICKETS: Tickets       = { taxi: 4,  bus: 3,  underground: 3, black: 5, double: 2 };

function pickDetectiveEmoji(existingPlayers: Player[]): string {
  const used = new Set(existingPlayers.map(p => p.emoji).filter(Boolean));
  const available = DETECTIVE_EMOJIS.filter(e => !used.has(e));
  const pool = available.length > 0 ? available : DETECTIVE_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function rowToGameState(row: typeof gamesTable.$inferSelect): GameState & { isPublic: boolean } {
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
    isPublic: row.isPublic,
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

// POST /games — create new game
router.post("/games", async (req, res): Promise<void> => {
  const parsed = CreateGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { playerName } = parsed.data;
  const isPublic: boolean = req.body.isPublic === true;

  const gameId   = randomUUID();
  const playerId = randomUUID();

  let roomCode = generateRoomCode();
  const existing = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
  if (existing.length > 0) roomCode = generateRoomCode();

  // In lobby: everyone starts as a detective (roles assigned randomly at game start)
  const player: Player = {
    id:              playerId,
    name:            playerName,
    role:            "detective",
    position:        null,
    tickets:         { ...DETECTIVE_TICKETS },
    isConnected:     true,
    doubleMoveActive: false,
    emoji:           pickDetectiveEmoji([]),
  };

  const gameState: GameState = {
    id:             gameId,
    roomCode,
    status:         "lobby",
    players:        [player],
    currentTurn:    null,
    round:          0,
    maxRounds:      24,
    mrxRevealRounds: [3, 8, 13, 18, 24],
    mrxMoveLog:     [],
    turnOrder:      [],
    turnIndex:      0,
    winner:         null,
  };

  await db.insert(gamesTable).values({
    id: gameId,
    roomCode,
    isPublic,
    ...gameStateToRow(gameState),
  } as typeof gamesTable.$inferInsert);

  res.status(201).json({ ...gameState, isPublic, _myPlayerId: playerId });
});

// GET /games/public — list public lobby games available to join
router.get("/games/public", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.status, "lobby"), eq(gamesTable.isPublic, true)));

  const games = rows
    .filter(r => (r.players as Player[]).length < 8)
    .map(r => ({
      roomCode:    r.roomCode,
      playerCount: (r.players as Player[]).length,
      maxPlayers:  8,
      players:     (r.players as Player[]).map(p => ({ name: p.name })),
      createdAt:   r.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(games);
});

// GET /games/:roomCode
router.get("/games/:roomCode", async (req, res): Promise<void> => {
  const roomCode = Array.isArray(req.params.roomCode) ? req.params.roomCode[0] : req.params.roomCode;
  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));

  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const game = rowToGameState(row);
  res.json({ ...game, turnStartedAt: getTurnStartedAt(roomCode) });
});

// POST /games/:roomCode/join
router.post("/games/:roomCode/join", async (req, res): Promise<void> => {
  const roomCode = Array.isArray(req.params.roomCode) ? req.params.roomCode[0] : req.params.roomCode;
  const parsed = JoinGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { playerName } = parsed.data;
  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const game = rowToGameState(row);
  if (game.status !== "lobby") {
    res.status(400).json({ error: "Game has already started" });
    return;
  }

  if (game.players.length >= 8) {
    res.status(400).json({ error: "Game is full" });
    return;
  }

  const playerId = randomUUID();

  const newPlayer: Player = {
    id:              playerId,
    name:            playerName,
    role:            "detective",
    position:        null,
    tickets:         { ...DETECTIVE_TICKETS },
    isConnected:     true,
    doubleMoveActive: false,
    emoji:           pickDetectiveEmoji(game.players),
  };

  const updatedGame: GameState = {
    ...game,
    players: [...game.players, newPlayer],
  };

  await db.update(gamesTable)
    .set(gameStateToRow(updatedGame))
    .where(eq(gamesTable.roomCode, roomCode));

  broadcastToRoom(roomCode, { ...updatedGame, isPublic: game.isPublic });
  res.json({ ...updatedGame, isPublic: game.isPublic, _myPlayerId: playerId });
});

// POST /games/:roomCode/start — randomly assigns Mr. X from all players
router.post("/games/:roomCode/start", async (req, res): Promise<void> => {
  const roomCode = Array.isArray(req.params.roomCode) ? req.params.roomCode[0] : req.params.roomCode;
  const parsed = StartGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { playerId: hostId } = parsed.data;

  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const game = rowToGameState(row);
  if (game.status !== "lobby") {
    res.status(400).json({ error: "Game has already started" });
    return;
  }

  if (game.players[0]?.id !== hostId) {
    res.status(403).json({ error: "Only the host can start the game" });
    return;
  }

  if (game.players.length < 2) {
    res.status(400).json({ error: "Need at least 2 players to start" });
    return;
  }

  // Randomly select one player to be Mr. X
  const mrxIndex = Math.floor(Math.random() * game.players.length);
  const playersWithRoles: Player[] = game.players.map((p, i) => ({
    ...p,
    role:    i === mrxIndex ? "mrx" : "detective",
    tickets: i === mrxIndex ? { ...MRX_TICKETS } : { ...DETECTIVE_TICKETS },
    emoji:   i === mrxIndex ? undefined : (p.emoji ?? pickDetectiveEmoji(game.players)),
  }));

  const gameWithRoles: GameState = { ...game, players: playersWithRoles };
  const initializedGame = initializeGame(gameWithRoles);

  await db.update(gamesTable)
    .set(gameStateToRow(initializedGame))
    .where(eq(gamesTable.roomCode, roomCode));

  scheduleTurnTimer(roomCode, initializedGame);
  const startedAt = getTurnStartedAt(roomCode);
  broadcastToRoom(roomCode, { ...initializedGame, isPublic: game.isPublic, turnStartedAt: startedAt });
  res.json({ ...initializedGame, isPublic: game.isPublic, turnStartedAt: startedAt });
});

// POST /games/:roomCode/move
router.post("/games/:roomCode/move", async (req, res): Promise<void> => {
  const roomCode = Array.isArray(req.params.roomCode) ? req.params.roomCode[0] : req.params.roomCode;
  const parsed = MakeMoveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { playerId, toStation, transport, useDouble } = parsed.data;

  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const game = rowToGameState(row);
  const { game: updatedGame, error } = applyMove(
    game,
    playerId,
    toStation,
    transport as "taxi" | "bus" | "underground" | "black" | "boat",
    useDouble
  );

  if (error) {
    res.status(400).json({ error });
    return;
  }

  await db.update(gamesTable)
    .set(gameStateToRow(updatedGame))
    .where(eq(gamesTable.roomCode, roomCode));

  if (updatedGame.status === "playing") {
    scheduleTurnTimer(roomCode, updatedGame);
  } else {
    cancelTurnTimer(roomCode);
  }

  const startedAt = getTurnStartedAt(roomCode);
  broadcastToRoom(roomCode, { ...updatedGame, isPublic: game.isPublic, turnStartedAt: startedAt });
  res.json({ ...updatedGame, isPublic: game.isPublic, turnStartedAt: startedAt });
});

// POST /games/:roomCode/set-role (kept for backwards compat but role override now only in lobby)
router.post("/games/:roomCode/set-role", async (req, res): Promise<void> => {
  res.status(400).json({ error: "Roles are now assigned randomly when the game starts" });
});

// DELETE /games/:roomCode/players/:targetPlayerId?hostId=xxx — kick a player
router.delete("/games/:roomCode/players/:targetPlayerId", async (req, res): Promise<void> => {
  const roomCode       = req.params.roomCode;
  const targetPlayerId = req.params.targetPlayerId;
  const hostId         = req.query.hostId as string | undefined;

  if (!hostId) {
    res.status(400).json({ error: "hostId query param required" });
    return;
  }

  const [row] = await db.select().from(gamesTable).where(eq(gamesTable.roomCode, roomCode));
  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const game = rowToGameState(row);

  if (game.players[0]?.id !== hostId) {
    res.status(403).json({ error: "Only the host can kick players" });
    return;
  }
  if (targetPlayerId === hostId) {
    res.status(400).json({ error: "Cannot kick yourself" });
    return;
  }
  if (game.status !== "lobby" && game.status !== "playing") {
    res.status(400).json({ error: "Game is not active" });
    return;
  }

  const kicked = game.players.find(p => p.id === targetPlayerId);
  if (!kicked) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  let updatedPlayers = game.players.filter(p => p.id !== targetPlayerId);
  let newStatus      = game.status;
  let winner         = game.winner;
  let currentTurn    = game.currentTurn;
  let turnOrder      = game.turnOrder.filter(id => id !== targetPlayerId);
  let turnIndex      = game.turnIndex;

  if (game.status === "playing") {
    if (kicked.role === "mrx") {
      newStatus = "detectives_won";
      winner    = "detectives";
    } else {
      const detectivesLeft = updatedPlayers.filter(p => p.role === "detective");
      if (detectivesLeft.length === 0) {
        newStatus = "mrx_won";
        winner    = "mrx";
      } else if (game.currentTurn === targetPlayerId) {
        // Advance to next player in the new turnOrder
        if (turnOrder.length > 0) {
          turnIndex   = game.turnIndex % turnOrder.length;
          currentTurn = turnOrder[turnIndex];
        }
      }
    }
  }

  const updatedGame: GameState = {
    ...game,
    players:     updatedPlayers,
    status:      newStatus,
    winner,
    currentTurn,
    turnOrder,
    turnIndex,
  };

  await db.update(gamesTable).set(gameStateToRow(updatedGame)).where(eq(gamesTable.roomCode, roomCode));

  if (newStatus !== "playing") {
    cancelTurnTimer(roomCode);
  } else if (game.currentTurn === targetPlayerId) {
    // Reschedule timer for the new current player
    scheduleTurnTimer(roomCode, updatedGame);
  }

  const startedAt = getTurnStartedAt(roomCode);
  broadcastToRoom(roomCode, { ...updatedGame, isPublic: game.isPublic, turnStartedAt: startedAt ?? undefined });
  res.json({ ...updatedGame, isPublic: game.isPublic });
});

export default router;
