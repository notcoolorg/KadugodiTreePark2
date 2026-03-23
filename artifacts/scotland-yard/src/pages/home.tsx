import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useCreateGame,
  useJoinGame,
  usePublicLobbies,
  joinMatchmakingQueue,
  leaveMatchmakingQueue,
  useMatchmakingQueue,
  type MatchmakingStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Users, Globe, Lock, Loader2, Play, X } from "lucide-react";
import { playTabSwitch, playJoinGame, playCreateGame } from "@/lib/sounds";

function useElapsedTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      startRef.current = null;
      setElapsed(0);
    }
  }, [running]);

  return elapsed;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const [queueEntry, setQueueEntry] = useState<MatchmakingStatus | null>(null);
  const [isJoiningQueue, setIsJoiningQueue] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const isInQueue = !!queueEntry && !queueEntry.gameRoomCode;
  const elapsed = useElapsedTimer(isInQueue);

  const createGameMutation = useCreateGame();
  const joinGameMutation   = useJoinGame();
  const { data: publicLobbies, isLoading: lobbiesLoading } = usePublicLobbies();

  const { data: matchmakingPoll } = useMatchmakingQueue(queueEntry?.queueId ?? null);

  useEffect(() => {
    if (matchmakingPoll?.gameRoomCode && matchmakingPoll?.myPlayerId) {
      localStorage.setItem("playerId", matchmakingPoll.myPlayerId);
      localStorage.setItem("playerName", playerName);
      setLocation(`/lobby/${matchmakingPoll.gameRoomCode}`);
    }
  }, [matchmakingPoll, playerName, setLocation]);

  const handleJoinQueue = async () => {
    if (!playerName.trim()) return;
    setIsJoiningQueue(true);
    setQueueError(null);
    try {
      const entry = await joinMatchmakingQueue(playerName.trim());
      if (entry.gameRoomCode && entry.myPlayerId) {
        localStorage.setItem("playerId", entry.myPlayerId);
        localStorage.setItem("playerName", playerName);
        setLocation(`/lobby/${entry.gameRoomCode}`);
      } else {
        setQueueEntry(entry);
      }
    } catch {
      setQueueError("Failed to join the queue. Please try again.");
    } finally {
      setIsJoiningQueue(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!queueEntry) return;
    try {
      await leaveMatchmakingQueue(queueEntry.queueId);
    } catch {
    }
    setQueueEntry(null);
    setQueueError(null);
  };

  const handleCreate = () => {
    if (!playerName) return;
    playCreateGame();
    createGameMutation.mutate(
      { data: { playerName, role: "detective", isPublic } as never },
      {
        onSuccess: (data) => {
          const newPlayer = data.players[0];
          localStorage.setItem("playerId", newPlayer.id);
          localStorage.setItem("playerName", playerName);
          setLocation(`/lobby/${data.roomCode}`);
        },
      }
    );
  };

  const handleJoin = (code?: string) => {
    const target = (code ?? roomCode).toUpperCase();
    if (!playerName || !target) return;
    playJoinGame();
    joinGameMutation.mutate(
      { roomCode: target, data: { playerName, role: "detective" } },
      {
        onSuccess: (data) => {
          const newPlayer = data.players[data.players.length - 1];
          localStorage.setItem("playerId", newPlayer.id);
          localStorage.setItem("playerName", playerName);
          setLocation(`/lobby/${data.roomCode}`);
        },
      }
    );
  };

  const queueSize = matchmakingPoll?.queueSize ?? queueEntry?.queueSize ?? 0;

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative">
      <div className="absolute inset-0 bg-black/60 z-0" />
      <img
        src={`${import.meta.env.BASE_URL}images/london-fog-bg.png`}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover -z-10 opacity-40 mix-blend-overlay"
      />

      <div className="z-10 w-full max-w-md px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 filter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] mb-2 leading-tight">
            KADUGODI TREE PARK
          </h1>
          <p className="text-primary font-medium tracking-[0.3em] uppercase text-xs sm:text-sm">
            The Hunt for Mr. X
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6">
            <Tabs defaultValue="play" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-background/50 mb-6">
                <TabsTrigger
                  value="play"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
                  onClick={playTabSwitch}
                >
                  Play
                </TabsTrigger>
                <TabsTrigger
                  value="join"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
                  onClick={playTabSwitch}
                >
                  Join
                </TabsTrigger>
                <TabsTrigger
                  value="create"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
                  onClick={playTabSwitch}
                >
                  Create
                </TabsTrigger>
                <TabsTrigger
                  value="browse"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
                  onClick={playTabSwitch}
                >
                  Browse
                </TabsTrigger>
              </TabsList>

              {/* ── PLAY (auto-matchmaking) ── */}
              <TabsContent value="play">
                <div className="space-y-4">
                  {!isInQueue ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="playerNamePlay">Agent Name</Label>
                        <Input
                          id="playerNamePlay"
                          placeholder="Enter your name"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          disabled={isJoiningQueue}
                          onKeyDown={(e) => e.key === "Enter" && handleJoinQueue()}
                        />
                      </div>

                      <div className="rounded-lg border border-border/50 p-3 bg-muted/10 text-sm text-muted-foreground">
                        <p>You'll be automatically matched with up to <span className="text-foreground font-semibold">8 players</span>. The game starts as soon as the squad is full.</p>
                      </div>

                      <Button
                        className="w-full mt-2 gap-2"
                        size="lg"
                        onClick={handleJoinQueue}
                        disabled={isJoiningQueue || !playerName.trim()}
                      >
                        {isJoiningQueue ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {isJoiningQueue ? "Joining queue…" : "Play"}
                      </Button>

                      {queueError && (
                        <p className="text-destructive text-sm text-center">{queueError}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-5 py-4">
                      <div className="relative flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full border-4 border-primary/30 border-t-primary animate-spin absolute" />
                        <div className="text-center">
                          <p className="text-2xl font-mono font-bold tabular-nums text-foreground">
                            {formatTime(elapsed)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">elapsed</p>
                        </div>
                      </div>

                      <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-foreground">Finding agents…</p>
                        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span className="text-xs tabular-nums">
                            {queueSize} / 8 agents in queue
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-1.5 mt-1">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full transition-all duration-300 ${
                              i < queueSize
                                ? "bg-primary scale-110"
                                : "bg-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 mt-2"
                        onClick={handleLeaveQueue}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── JOIN by code ── */}
              <TabsContent value="join">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="playerNameJoin">Agent Name</Label>
                    <Input
                      id="playerNameJoin"
                      placeholder="Enter your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roomCode">Room Code</Label>
                    <Input
                      id="roomCode"
                      placeholder="e.g. ABCDEF"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      className="uppercase font-mono tracking-widest text-lg text-center"
                      maxLength={6}
                    />
                  </div>
                  <Button
                    className="w-full mt-6"
                    size="lg"
                    onClick={() => handleJoin()}
                    disabled={joinGameMutation.isPending || !playerName || roomCode.length < 6}
                  >
                    {joinGameMutation.isPending ? "Connecting..." : "Join Assignment"}
                  </Button>
                  {joinGameMutation.isError && (
                    <p className="text-destructive text-sm text-center mt-2">
                      Failed to join. Check room code.
                    </p>
                  )}
                </div>
              </TabsContent>

              {/* ── CREATE ── */}
              <TabsContent value="create">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hostName">Agent Name</Label>
                    <Input
                      id="hostName"
                      placeholder="Enter your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-muted/20">
                    <div className="flex items-center gap-2">
                      {isPublic ? (
                        <Globe className="h-4 w-4 text-primary" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium leading-none">
                          {isPublic ? "Public Lobby" : "Private Lobby"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isPublic
                            ? "Anyone can find and join your game"
                            : "Share your code to invite players"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isPublic}
                      onCheckedChange={setIsPublic}
                    />
                  </div>

                  <Button
                    className="w-full mt-6"
                    size="lg"
                    onClick={handleCreate}
                    disabled={createGameMutation.isPending || !playerName}
                  >
                    {createGameMutation.isPending ? "Initializing..." : "Initialize New Operation"}
                  </Button>
                </div>
              </TabsContent>

              {/* ── BROWSE public lobbies ── */}
              <TabsContent value="browse">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="playerNameBrowse">Your Agent Name</Label>
                    <Input
                      id="playerNameBrowse"
                      placeholder="Enter your name before joining"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {lobbiesLoading && (
                      <p className="text-muted-foreground text-sm text-center py-6">
                        Scanning for operations…
                      </p>
                    )}
                    {!lobbiesLoading && (!publicLobbies || publicLobbies.length === 0) && (
                      <p className="text-muted-foreground text-sm text-center py-6">
                        No public operations found. Create one!
                      </p>
                    )}
                    {publicLobbies?.map((lobby) => (
                      <div
                        key={lobby.roomCode}
                        className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-muted/10 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                            <Users className="h-3.5 w-3.5" />
                            <span className="text-xs font-mono">
                              {lobby.playerCount}/{lobby.maxPlayers}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium font-mono tracking-wider">
                              {lobby.roomCode}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {lobby.players.map(p => p.name).join(", ")}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={joinGameMutation.isPending || !playerName}
                          onClick={() => handleJoin(lobby.roomCode)}
                        >
                          Join
                        </Button>
                      </div>
                    ))}
                  </div>

                  {joinGameMutation.isError && (
                    <p className="text-destructive text-sm text-center">
                      Failed to join. The lobby may be full or closed.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
