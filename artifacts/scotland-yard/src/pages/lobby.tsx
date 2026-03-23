import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useGetGame, useStartGame, getGetGameQueryKey, useKickPlayer } from "@workspace/api-client-react";
import { useGameWebSocket } from "@/hooks/use-game-websocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Loader2, LogOut, UserX, Shuffle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { playCopyCode, playStartGame } from "@/lib/sounds";

export default function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [kickingId, setKickingId] = useState<string | null>(null);

  const myPlayerId = localStorage.getItem("playerId");

  useGameWebSocket(roomCode, myPlayerId);

  const { data: game, isLoading } = useGetGame(roomCode || "", {
    query: { refetchInterval: 2000, queryKey: getGetGameQueryKey(roomCode || "") },
  });

  const startGameMutation = useStartGame();
  const kickPlayerMutation = useKickPlayer(roomCode || "");

  useEffect(() => {
    if (game?.status === "playing") {
      setLocation(`/game/${roomCode}`);
    }
  }, [game?.status, roomCode, setLocation]);

  useEffect(() => {
    if (!game || !myPlayerId || game.status !== "lobby") return;
    const stillInGame = game.players.some((p) => p.id === myPlayerId);
    if (!stillInGame) {
      localStorage.removeItem("playerId");
      localStorage.removeItem("playerName");
      toast({
        title: "Removed from lobby",
        description: "The host has removed you from this game.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [game, myPlayerId, setLocation, toast]);

  const copyCode = () => {
    if (roomCode) {
      playCopyCode();
      navigator.clipboard.writeText(roomCode);
      toast({ title: "Copied!", description: "Room code copied to clipboard." });
    }
  };

  const handleStart = () => {
    if (!roomCode || !myPlayerId) return;
    playStartGame();
    startGameMutation.mutate({ roomCode, data: { playerId: myPlayerId } });
  };

  const handleLeave = () => {
    localStorage.removeItem("playerId");
    localStorage.removeItem("playerName");
    setLocation("/");
  };

  const handleKick = (targetPlayerId: string, targetName: string) => {
    if (!myPlayerId) return;
    setKickingId(targetPlayerId);
    kickPlayerMutation.mutate(
      { targetPlayerId, hostId: myPlayerId },
      {
        onError: (err: Error) => {
          toast({
            title: "Could not kick player",
            description: err.message ?? "Unknown error",
            variant: "destructive",
          });
        },
        onSettled: () => setKickingId(null),
      }
    );
  };

  if (isLoading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const isHost = game.players[0]?.id === myPlayerId;

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4 py-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none" />

      <Card className="w-full max-w-lg z-10">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-sm font-sans tracking-[0.2em] text-muted-foreground uppercase mb-2">
            Operation Code
          </CardTitle>
          <div className="flex items-center justify-center gap-4">
            <span className="font-mono text-3xl sm:text-5xl tracking-widest text-primary font-bold filter drop-shadow-[0_0_10px_rgba(230,40,70,0.5)]">
              {roomCode}
            </span>
            <Button variant="outline" size="icon" onClick={copyCode} className="h-10 w-10">
              <Copy size={16} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="mt-4">
          {/* Random role notice */}
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
            <Shuffle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">Roles assigned randomly.</span>{" "}
              When the host starts the operation, the server will secretly pick one player to be{" "}
              <span className="text-primary font-medium">Mr. X</span>. Everyone else becomes a Detective.
            </p>
          </div>

          <div className="mb-4 flex justify-between items-end">
            <h3 className="font-display text-xl text-foreground">Agents Assembled</h3>
            <span className="text-sm text-muted-foreground">{game.players.length}/8 Players</span>
          </div>

          <div className="space-y-3 mb-8">
            {game.players.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground truncate">
                      {p.name} {p.id === myPlayerId && "(You)"}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      {i === 0 ? "Host" : "Agent"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!p.isConnected && (
                    <span className="text-xs text-destructive">Offline</span>
                  )}
                  {isHost && p.id !== myPlayerId && (
                    <button
                      onClick={() => handleKick(p.id, p.name)}
                      disabled={kickingId === p.id}
                      className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                      title={`Kick ${p.name}`}
                    >
                      {kickingId === p.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UserX size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {isHost ? (
              <Button
                size="lg"
                className="w-full text-lg h-14"
                onClick={handleStart}
                disabled={game.players.length < 2 || startGameMutation.isPending}
              >
                {startGameMutation.isPending ? "Commencing..." : "Commence Operation"}
              </Button>
            ) : (
              <div className="text-center p-4 border border-dashed border-border rounded-lg text-muted-foreground animate-pulse">
                Waiting for Host to commence…
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={handleLeave}>
              <LogOut size={16} className="mr-2" />
              Leave Lobby
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
