import { Router, type IRouter } from "express";
import { joinQueue, leaveQueue, getQueueEntry, getQueueSize } from "../lib/matchmaking.js";

const router: IRouter = Router();

// POST /games/matchmaking/queue — join the matchmaking queue
router.post("/games/matchmaking/queue", (req, res): void => {
  const playerName = req.body?.playerName;
  if (!playerName || typeof playerName !== "string" || !playerName.trim()) {
    res.status(400).json({ error: "playerName is required" });
    return;
  }

  const entry = joinQueue(playerName.trim());
  res.status(201).json({
    queueId: entry.queueId,
    queueSize: getQueueSize(),
    gameRoomCode: entry.gameRoomCode,
    myPlayerId: entry.myPlayerId,
  });
});

// GET /games/matchmaking/queue/:queueId — poll for match status
router.get("/games/matchmaking/queue/:queueId", (req, res): void => {
  const { queueId } = req.params;
  const entry = getQueueEntry(queueId);

  if (!entry) {
    res.status(404).json({ error: "Queue entry not found" });
    return;
  }

  res.json({
    queueId: entry.queueId,
    queueSize: getQueueSize(),
    gameRoomCode: entry.gameRoomCode,
    myPlayerId: entry.myPlayerId,
  });
});

// DELETE /games/matchmaking/queue/:queueId — leave the queue
router.delete("/games/matchmaking/queue/:queueId", (req, res): void => {
  const { queueId } = req.params;
  const removed = leaveQueue(queueId);
  res.json({ removed });
});

export default router;
