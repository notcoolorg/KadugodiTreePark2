import { pgTable, text, jsonb, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().unique(),
  status: text("status").notNull().default("lobby"),
  players: jsonb("players").notNull().default([]),
  currentTurn: text("current_turn"),
  round: integer("round").notNull().default(0),
  maxRounds: integer("max_rounds").notNull().default(24),
  mrxRevealRounds: jsonb("mrx_reveal_rounds").notNull().default([3, 8, 13, 18, 24]),
  mrxMoveLog: jsonb("mrx_move_log").notNull().default([]),
  turnOrder: jsonb("turn_order").notNull().default([]),
  turnIndex: integer("turn_index").notNull().default(0),
  winner: text("winner"),
  mrxStartQuarter: integer("mrx_start_quarter"),
  decoyQuarter: integer("decoy_quarter"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertGame = z.infer<typeof insertGameSchema>;
export type GameRow = typeof gamesTable.$inferSelect;
