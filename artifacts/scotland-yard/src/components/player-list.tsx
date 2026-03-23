import { Game } from "@workspace/api-client-react";
import { BadgeHelp, CarFront, Bus, TrainFront, FileQuestion, Anchor, ChevronsRight, CircleStar, UserX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDetectiveColorByIndex, getDetectiveIndex } from "@/lib/detective";
import { useState } from "react";
import { useKickPlayer } from "@workspace/api-client-react";

interface PlayerListProps {
  game: Game;
  myPlayerId: string | null;
}

const getTransportIcon = (transport: 'taxi' | 'bus' | 'underground' | 'black' | 'boat') => {
  switch (transport) {
    case 'taxi':        return <CarFront size={16} className="text-[#cca01d]" />;
    case 'bus':         return <Bus size={16} className="text-[#128c5a]" />;
    case 'underground': return <TrainFront size={16} className="text-[#d92139]" />;
    case 'black':       return <FileQuestion size={16} className="text-gray-400" />;
    case 'boat':        return <Anchor size={16} className="text-[#1a6fa8]" />;
  }
};

function TicketBox({ icon, count }: { icon: React.ReactNode; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center justify-center w-6 h-6 bg-background/80 border border-border/50 rounded">
        {icon}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground font-semibold">{count}x</span>
    </div>
  );
}

export function PlayerList({ game, myPlayerId }: PlayerListProps) {
  const myPlayer = game.players.find(p => p.id === myPlayerId);
  const amIMrX   = myPlayer?.role === 'mrx';
  const isHost   = game.players[0]?.id === myPlayerId;
  const isPlaying = game.status === 'playing';

  const [kickingId, setKickingId] = useState<string | null>(null);
  const kickMutation = useKickPlayer((game as { roomCode?: string }).roomCode ?? "");

  const handleKick = (targetPlayerId: string) => {
    if (!myPlayerId) return;
    setKickingId(targetPlayerId);
    kickMutation.mutate(
      { targetPlayerId, hostId: myPlayerId },
      { onSettled: () => setKickingId(null) }
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full bg-card/90 backdrop-blur-lg border-r border-border/50 h-full p-3 overflow-y-auto shrink-0">
      <h2 className="font-display tracking-widest text-lg text-primary border-b border-border/50 pb-2 uppercase">
        Players
      </h2>

      {game.players.map((p) => {
        const isMe = p.id === myPlayerId;
        const isTurn = game.currentTurn === p.id;
        const canSeeTickets = isMe || (amIMrX && p.role === 'detective');
        const isSpawning = p.role === 'detective' && p.position === null && game.status === 'playing';
        const detectiveIdx = p.role === 'detective' ? getDetectiveIndex(p.id, game.players) : -1;
        const detectiveColor = detectiveIdx >= 0 ? getDetectiveColorByIndex(detectiveIdx) : undefined;
        const canKick = isHost && !isMe && isPlaying;

        return (
          <div
            key={p.id}
            className={cn(
              "flex flex-col gap-2 p-2.5 rounded-lg border bg-background/50 transition-all",
              isTurn ? "border-primary shadow-[0_0_8px_rgba(230,40,70,0.25)]" : "border-border/30",
              !p.isConnected && "opacity-50 grayscale"
            )}
          >
            {/* Name row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {p.role === 'mrx' ? (
                  <div className="bg-black text-white p-0.5 rounded-full shrink-0"><BadgeHelp size={13} /></div>
                ) : (
                  <CircleStar size={18} style={{ color: detectiveColor }} strokeWidth={2} className="shrink-0" />
                )}
                <span className="font-semibold text-xs truncate max-w-[90px]" style={detectiveColor ? { color: detectiveColor } : {}}>
                  {p.name}{isMe && ' (You)'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isSpawning && <span className="text-[9px] text-blue-400 uppercase tracking-wide">choosing…</span>}
                {isTurn && !isSpawning && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                {canKick && (
                  <button
                    onClick={() => handleKick(p.id)}
                    disabled={kickingId === p.id}
                    className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 ml-0.5"
                    title={`Kick ${p.name}`}
                  >
                    {kickingId === p.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <UserX size={11} />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Position */}
            {p.role === 'detective' && (
              <div className="text-[10px] text-muted-foreground">
                {isSpawning ? 'Not placed yet' : `Station ${p.position ?? '?'}`}
              </div>
            )}

            {/* Tickets */}
            {canSeeTickets ? (
              <div className="flex flex-col gap-1.5 mt-0.5">
                <TicketBox icon={getTransportIcon('taxi')} count={p.tickets.taxi} />
                <TicketBox icon={getTransportIcon('bus')} count={p.tickets.bus} />
                <TicketBox icon={getTransportIcon('underground')} count={p.tickets.underground} />
                {p.role === 'mrx' && (
                  <>
                    <TicketBox icon={getTransportIcon('black')} count={p.tickets.black} />
                    <TicketBox icon={<ChevronsRight size={16} className="text-[#eab308]" />} count={p.tickets.double ?? 0} />
                  </>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground italic">
                {p.role === 'mrx' ? 'Tickets hidden' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
