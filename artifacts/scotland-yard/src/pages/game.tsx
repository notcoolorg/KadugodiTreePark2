import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useGetGame, useMakeMove, getGetGameQueryKey } from "@workspace/api-client-react";
import { useGameWebSocket } from "@/hooks/use-game-websocket";
import { useTurnCountdown } from "@/hooks/use-turn-countdown";
import { MapBoard } from "@/components/map-board";
import { PlayerList } from "@/components/player-list";
import { MoveLog } from "@/components/move-log";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TransportType } from "@/lib/map-data";
import { Loader2, AlertTriangle, LogOut, FileQuestion, ChevronsRight, Timer, Users, LayoutList } from "lucide-react";
import { playLeave, playBlackCard, playDoubleMove, playReturnHQ } from "@/lib/sounds";

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const [, setLocation] = useLocation();
  const myPlayerId = localStorage.getItem('playerId');

  const [useBlackCard, setUseBlackCard] = useState(false);
  const [useDoubleMove, setUseDoubleMove] = useState(false);
  const [showPlayerSheet, setShowPlayerSheet] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);

  const { connected } = useGameWebSocket(roomCode, myPlayerId);

  const { data: game, isLoading } = useGetGame(roomCode || "", {
    query: { refetchInterval: 3000, queryKey: getGetGameQueryKey(roomCode || "") }
  });

  const turnStartedAt = (game as any)?.turnStartedAt as string | null | undefined;
  const { secondsLeft, isUrgent, isCritical, progress } = useTurnCountdown(turnStartedAt, game?.status ?? '');

  const moveMutation = useMakeMove();

  const myPlayer = game?.players.find(p => p.id === myPlayerId) || null;
  const isMyTurn = game?.currentTurn === myPlayerId && game?.status === 'playing';
  const isMrX = myPlayer?.role === 'mrx';
  const isSecondDoubleMove = isMrX && myPlayer?.doubleMoveActive === true;

  const filteredGame = useMemo(() => {
    if (!game || myPlayer?.role === 'mrx') return game;
    if (game.status !== 'playing') return game;
    const lastMrxMove = game.mrxMoveLog[game.mrxMoveLog.length - 1];
    const revealedThisRound =
      lastMrxMove?.station != null &&
      lastMrxMove?.round === game.round &&
      game.mrxRevealRounds.includes(game.round);
    if (revealedThisRound) return game;
    return {
      ...game,
      players: game.players.map(p =>
        p.role === 'mrx' ? { ...p, position: null } : p
      ),
    };
  }, [game, myPlayer?.role]);

  const handleMove = (stationId: number, transport: TransportType) => {
    if (!roomCode || !myPlayerId) return;
    moveMutation.mutate({
      roomCode,
      data: {
        playerId: myPlayerId,
        toStation: stationId,
        transport: transport as 'taxi' | 'bus' | 'underground' | 'black' | 'boat',
        useDouble: isSecondDoubleMove ? undefined : (useDoubleMove ? true : undefined),
      }
    });
    setUseBlackCard(false);
    setUseDoubleMove(false);
  };

  const handleLeave = () => {
    setLocation('/');
  };

  if (isLoading || !game || !filteredGame) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse text-sm">Establishing Secure Connection...</p>
        </div>
      </div>
    );
  }

  const showPowerButtons = isMrX && isMyTurn && !isSecondDoubleMove;

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background overflow-hidden relative">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 lg:h-16 border-b border-border/50 bg-card/80 backdrop-blur-md flex items-center justify-between px-3 lg:px-6 z-20">
        {/* Left */}
        <div className="flex items-center gap-2 lg:gap-6 min-w-0">
          <h1 className="font-display font-bold text-sm sm:text-base lg:text-xl text-primary tracking-widest truncate">
            <span className="hidden sm:inline">KADUGODI TREE PARK</span>
            <span className="sm:hidden">KGTP</span>
          </h1>
          <div className="hidden md:flex items-center gap-3">
            <div className="h-5 w-px bg-border/50" />
            <div className="font-mono text-xs">
              <span className="text-muted-foreground mr-1">ROOM:</span>
              <span className="font-bold text-foreground bg-secondary px-2 py-0.5 rounded tracking-widest">{filteredGame.roomCode}</span>
            </div>
          </div>
          {!connected && (
            <div className="flex items-center gap-1 text-destructive text-xs">
              <AlertTriangle size={12} />
              <span className="hidden sm:inline">Reconnecting...</span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 lg:gap-6 shrink-0">
          <div className="text-center">
            <div className="text-[9px] lg:text-[10px] text-muted-foreground uppercase tracking-widest">Round</div>
            <div className="font-mono font-bold text-sm lg:text-lg leading-none">
              {filteredGame.round} <span className="text-muted-foreground text-xs lg:text-sm">/ 24</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-10 lg:w-10" onClick={() => { playLeave(); handleLeave(); }}>
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop: Left Panel */}
        <div className="hidden lg:block w-60 shrink-0 h-full">
          <PlayerList game={filteredGame} myPlayerId={myPlayerId} />
        </div>

        {/* Main column */}
        <main className="flex-1 min-w-0 p-2 lg:p-4 relative flex flex-col gap-2 lg:gap-3">

          {/* Turn Alert + Countdown */}
          <div className="shrink-0 flex flex-wrap items-center justify-center gap-2">
            {isMyTurn ? (
              isSecondDoubleMove ? (
                <div className="bg-yellow-900/30 border border-yellow-500 text-yellow-300 px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs sm:text-sm animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.3)] text-center">
                  Double Move — Make your second move!
                </div>
              ) : (
                <div className="bg-primary/20 border border-primary text-primary px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs sm:text-sm animate-pulse shadow-[0_0_15px_rgba(230,40,70,0.3)] text-center">
                  Your turn — pick a station
                </div>
              )
            ) : filteredGame.status === 'playing' ? (
              <div className="text-muted-foreground font-mono uppercase tracking-widest text-xs bg-secondary px-4 py-1.5 rounded-full border border-border/50 text-center truncate max-w-full">
                Awaiting {filteredGame.players.find(p => p.id === filteredGame.currentTurn)?.name}'s move…
              </div>
            ) : null}

            {/* Countdown timer */}
            {filteredGame.status === 'playing' && turnStartedAt && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-mono text-xs sm:text-sm font-bold transition-colors ${
                isCritical
                  ? 'bg-red-900/40 border-red-500 text-red-400 animate-pulse'
                  : isUrgent
                  ? 'bg-orange-900/30 border-orange-500 text-orange-400'
                  : 'bg-secondary border-border/50 text-muted-foreground'
              }`}>
                <Timer size={12} />
                <span>{secondsLeft}s</span>
                <div className="w-10 h-1.5 bg-background/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCritical ? 'bg-red-500' : isUrgent ? 'bg-orange-400' : 'bg-primary'
                    }`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mr. X Power Cards */}
          {showPowerButtons && (
            <div className="shrink-0 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => { playBlackCard(); setUseBlackCard(v => !v); setUseDoubleMove(false); }}
                disabled={(myPlayer?.tickets.black ?? 0) <= 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  useBlackCard
                    ? 'bg-gray-700 border-gray-300 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                    : 'bg-card border-border/50 text-muted-foreground hover:border-gray-400 hover:text-white'
                }`}
              >
                <FileQuestion size={14} />
                <span className="hidden sm:inline">Black Card</span>
                <span className="sm:hidden">Black</span>
                <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.5 rounded ${useBlackCard ? 'bg-gray-900 text-white' : 'bg-secondary text-muted-foreground'}`}>
                  ×{myPlayer?.tickets.black ?? 0}
                </span>
              </button>

              <button
                onClick={() => { playDoubleMove(); setUseDoubleMove(v => !v); setUseBlackCard(false); }}
                disabled={(myPlayer?.tickets.double ?? 0) <= 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  useDoubleMove
                    ? 'bg-yellow-900/50 border-yellow-400 text-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.25)]'
                    : 'bg-card border-border/50 text-muted-foreground hover:border-yellow-600 hover:text-yellow-300'
                }`}
              >
                <ChevronsRight size={14} />
                <span className="hidden sm:inline">Double Move</span>
                <span className="sm:hidden">Double</span>
                <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.5 rounded ${useDoubleMove ? 'bg-yellow-900 text-yellow-200' : 'bg-secondary text-muted-foreground'}`}>
                  ×{myPlayer?.tickets.double ?? 0}
                </span>
              </button>

              {(useBlackCard || useDoubleMove) && (
                <span className="text-xs text-muted-foreground italic hidden sm:inline">
                  {useBlackCard ? 'Black Card active — pick any adjacent station' : 'Double Move active — you will move twice'}
                </span>
              )}
            </div>
          )}

          {/* Map */}
          <div className="flex-1 min-h-0 relative">
            <MapBoard
              game={filteredGame}
              myPlayer={myPlayer}
              onMove={handleMove}
              useBlackCard={useBlackCard}
              useDoubleMove={useDoubleMove}
            />

            {/* Mobile panel toggle buttons — only shown < lg */}
            <div className="absolute bottom-3 left-3 right-3 flex justify-between lg:hidden z-20 pointer-events-none">
              <button
                className="pointer-events-auto flex items-center gap-1.5 bg-card/90 backdrop-blur-sm border border-border/60 text-foreground px-3 py-2 rounded-xl shadow-lg text-xs font-semibold"
                onClick={() => setShowPlayerSheet(true)}
              >
                <Users size={14} />
                <span>Players</span>
                <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {filteredGame.players.length}
                </span>
              </button>
              <button
                className="pointer-events-auto flex items-center gap-1.5 bg-card/90 backdrop-blur-sm border border-border/60 text-foreground px-3 py-2 rounded-xl shadow-lg text-xs font-semibold"
                onClick={() => setShowMoveSheet(true)}
              >
                <LayoutList size={14} />
                <span>Mr. X Log</span>
              </button>
            </div>
          </div>
        </main>

        {/* Desktop: Right Panel */}
        <div className="hidden lg:block w-64 shrink-0 h-full">
          <MoveLog game={filteredGame} />
        </div>
      </div>

      {/* Mobile: Players Sheet */}
      <Sheet open={showPlayerSheet} onOpenChange={setShowPlayerSheet}>
        <SheetContent side="left" className="p-0 w-72 sm:w-80">
          <SheetTitle className="sr-only">Players</SheetTitle>
          <PlayerList game={filteredGame} myPlayerId={myPlayerId} />
        </SheetContent>
      </Sheet>

      {/* Mobile: Mr. X Moves Sheet */}
      <Sheet open={showMoveSheet} onOpenChange={setShowMoveSheet}>
        <SheetContent side="right" className="p-0 w-72 sm:w-80">
          <SheetTitle className="sr-only">Mr. X Move Log</SheetTitle>
          <MoveLog game={filteredGame} />
        </SheetContent>
      </Sheet>

      {/* Game Over Overlay */}
      {filteredGame.status !== 'playing' && filteredGame.status !== 'lobby' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border/50 p-6 sm:p-10 rounded-2xl max-w-lg w-full text-center shadow-2xl flex flex-col items-center">
            <h2 className="font-display text-2xl sm:text-4xl mb-3 sm:mb-4 uppercase tracking-widest">
              {filteredGame.status === 'mrx_won' ? (
                <span className="text-primary">Mr. X Escapes!</span>
              ) : (
                <span className="text-blue-500">Detectives Win!</span>
              )}
            </h2>
            <p className="text-muted-foreground mb-6 sm:mb-8 text-sm sm:text-lg">
              {filteredGame.status === 'mrx_won'
                ? (filteredGame.round > filteredGame.maxRounds
                    ? "The elusive Mr. X has evaded capture for 24 rounds. London remains in shadow."
                    : "All detectives have abandoned the mission. Mr. X roams free.")
                : (filteredGame.players.find(p => p.role === 'mrx')?.isConnected === false
                    ? "Mr. X fled the scene and forfeited. London is safe!"
                    : "Brilliant deductive work! Mr. X has been cornered and apprehended.")}
            </p>
            <Button size="lg" onClick={() => { playReturnHQ(); handleLeave(); }} className="w-full">
              Return to Headquarters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
