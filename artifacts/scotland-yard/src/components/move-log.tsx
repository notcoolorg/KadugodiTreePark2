import { Game } from "@workspace/api-client-react";
import { TrainFront, Bus, CarFront, FileQuestion, Anchor, ChevronsRight } from "lucide-react";

interface MoveLogProps {
  game: Game;
}

export function MoveLog({ game }: MoveLogProps) {
  const renderIcon = (transport: string) => {
    switch (transport) {
      case 'taxi': return <CarFront size={14} className="text-[#cca01d]" />;
      case 'bus': return <Bus size={14} className="text-[#128c5a]" />;
      case 'underground': return <TrainFront size={14} className="text-[#d92139]" />;
      case 'black': return <FileQuestion size={14} className="text-gray-300" />;
      case 'boat': return <Anchor size={14} className="text-[#1a6fa8]" />;
      default: return <div className="w-3 h-3 rounded-full bg-gray-700" />;
    }
  };

  const renderTransportLabel = (transport: string) => {
    if (transport === 'black') {
      return (
        <span className="font-mono text-[9px] font-bold text-gray-300 bg-gray-700/60 px-1 rounded tracking-widest">
          BLACK
        </span>
      );
    }
    return renderIcon(transport);
  };

  // Group moves by round — a double move produces two entries at the same round
  // Collect all moves, then display them with the round grid
  const movesByRound = game.mrxMoveLog.reduce<Record<number, typeof game.mrxMoveLog>>((acc, m) => {
    if (!acc[m.round]) acc[m.round] = [];
    acc[m.round].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-2 w-full bg-card/90 backdrop-blur-lg border-l border-border/50 h-full p-4">
      <h2 className="font-display tracking-widest text-xl text-primary border-b border-border/50 pb-2 mb-2 uppercase text-right">
        Mr. X Moves
      </h2>

      <div className="flex flex-col gap-1 overflow-y-auto">
        {Array.from({ length: game.maxRounds }).map((_, i) => {
          const round = i + 1;
          const isReveal = game.mrxRevealRounds.includes(round);
          const movesThisRound = movesByRound[round] ?? [];

          if (movesThisRound.length === 0) {
            // No moves yet for this round
            return (
              <div
                key={round}
                className={`flex items-center justify-between px-2 py-1.5 rounded border text-sm ${
                  isReveal ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-background/50'
                } ${round === game.round && game.currentTurn !== game.turnOrder[0] ? 'border-white/50' : ''}`}
              >
                <span className="text-muted-foreground w-5 text-xs">{round}</span>
                <div className="flex-1 flex justify-center">
                  <span className="opacity-20 text-xs">—</span>
                </div>
                <span className="font-mono text-xs w-6 text-right text-muted-foreground">
                  {isReveal ? '?' : ''}
                </span>
              </div>
            );
          }

          // Double move: two entries for the same round
          return movesThisRound.map((move, idx) => (
            <div
              key={`${round}-${idx}`}
              className={`flex items-center justify-between px-2 py-1.5 rounded border text-sm ${
                isReveal ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-background/50'
              } ${move.isDoubleMove ? 'border-l-2 border-l-yellow-500/50' : ''}`}
            >
              <span className="text-muted-foreground w-5 text-xs">
                {idx === 0 ? round : ''}
                {move.isDoubleMove && idx === 0 && (
                  <ChevronsRight size={8} className="inline text-yellow-500 ml-0.5" />
                )}
              </span>
              <div className="flex-1 flex justify-center items-center gap-1">
                {renderTransportLabel(move.transport)}
                {move.isDoubleMove && idx === 1 && (
                  <ChevronsRight size={8} className="text-yellow-500 opacity-60" />
                )}
              </div>
              <span className="font-mono text-xs w-6 text-right">
                {move.station ? move.station : (isReveal ? '?' : '')}
              </span>
            </div>
          ));
        })}
      </div>

      {/* Legend */}
      <div className="mt-auto pt-2 border-t border-border/30 flex flex-col gap-1">
        <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Legend</div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <CarFront size={10} className="text-[#cca01d]" /> Taxi
          <Bus size={10} className="text-[#128c5a]" /> Bus
          <TrainFront size={10} className="text-[#d92139]" /> Underground
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <FileQuestion size={10} className="text-gray-300" />
          <span className="font-mono text-[9px] bg-gray-700/60 px-1 rounded">BLACK</span> Hidden
          <Anchor size={10} className="text-[#1a6fa8]" /> Boat
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="w-2 h-2 border-l-2 border-yellow-500" />
          <ChevronsRight size={10} className="text-yellow-500" /> Double move
        </div>
      </div>
    </div>
  );
}
