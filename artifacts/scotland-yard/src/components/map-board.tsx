import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Game, Player } from "@workspace/api-client-react";
import { stations, mapConnections, TransportType, getAvailableMoves } from "@/lib/map-data";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarFront, Bus, TrainFront, FileQuestion, Anchor, ChevronsRight, ZoomIn, ZoomOut, Crosshair } from "lucide-react";
import { getDetectiveColorByIndex, getDetectiveIndex } from "@/lib/detective";
import { playStationTap, playTransportSelect } from "@/lib/sounds";

// Board image lives in public/ and is served at BASE_URL + 'board.png'
const BOARD_URL = `${import.meta.env.BASE_URL}board.png`;

// ── Quarter overlay regions (fractions of the board) ─────────────────────────
function quarterStyle(q: number): React.CSSProperties {
  switch (q) {
    case 1: return { left: '0%',  top: '0%',  width: '50%', height: '50%' };
    case 2: return { left: '50%', top: '0%',  width: '50%', height: '50%' };
    case 3: return { left: '0%',  top: '50%', width: '50%', height: '50%' };
    case 4: return { left: '50%', top: '50%', width: '50%', height: '50%' };
    default: return {};
  }
}
function quarterName(q: number): string {
  return ['', 'North-West', 'North-East', 'South-West', 'South-East'][q] ?? '';
}

// ── Zoom constants ────────────────────────────────────────────────────────────
const MIN_SCALE  = 1;
const MAX_SCALE  = 6;
const ZOOM_STEP  = 1.4;

// ── Transport colours (for valid-move arc highlights) ────────────────────────
const TRANSPORT_COLORS: Record<string, string> = {
  taxi:        '#f5c518',
  bus:         '#22c55e',
  underground: '#ef4444',
  boat:        '#38bdf8',
  black:       '#a3a3a3',
};

interface MapBoardProps {
  game: Game;
  myPlayer: Player | null;
  onMove: (stationId: number, transport: TransportType) => void;
  useBlackCard?: boolean;
  useDoubleMove?: boolean;
}

export function MapBoard({ game, myPlayer, onMove, useBlackCard = false, useDoubleMove = false }: MapBoardProps) {

  // ── Modal / turn state ────────────────────────────────────────────────────
  const [selectedStation,      setSelectedStation]      = useState<number | null>(null);
  const [showTicketModal,      setShowTicketModal]      = useState(false);
  const [availableTransports,  setAvailableTransports]  = useState<TransportType[]>([]);
  const [hoveredStation,       setHoveredStation]       = useState<number | null>(null);

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const [scale,  setScale]  = useState(MIN_SCALE);
  const [panX,   setPanX]   = useState(0);
  const [panY,   setPanY]   = useState(0);
  const containerRef      = useRef<HTMLDivElement>(null);
  const isDragging        = useRef(false);
  const isPotentialDrag   = useRef(false);
  const didDrag           = useRef(false);
  const dragStart         = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // ── Quarter hint ──────────────────────────────────────────────────────────
  const [showQuarterHint, setShowQuarterHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGameJustStarted =
    game.status === 'playing' &&
    game.round   === 1 &&
    game.mrxMoveLog.length === 0 &&
    game.mrxStartQuarter != null &&
    game.decoyQuarter    != null;

  useEffect(() => {
    if (isGameJustStarted) {
      setShowQuarterHint(true);
      hintTimerRef.current = setTimeout(() => setShowQuarterHint(false), 3000);
    }
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); };
  }, [isGameJustStarted]);

  const isMrX              = myPlayer?.role === 'mrx';
  const isMyTurn           = game.currentTurn === myPlayer?.id && game.status === 'playing';
  const isSpawnTurn        = isMyTurn && myPlayer?.position === null && myPlayer?.role === 'detective';
  const isSecondDoubleMove = isMrX && myPlayer?.doubleMoveActive === true;

  const occupiedStations = useMemo(
    () => new Set(game.players.map(p => p.position).filter(Boolean) as number[]),
    [game.players]
  );

  const validMoves = useMemo(() => {
    if (!isMyTurn || isSpawnTurn) return [];
    const blocked = isMrX
      ? new Set(game.players.filter(p => p.role === 'detective' && p.position != null).map(p => p.position as number))
      : new Set<number>();
    return getAvailableMoves(
      myPlayer?.position ?? null,
      (myPlayer?.tickets ?? {}) as unknown as Record<string, number>,
      blocked,
      useBlackCard && isMrX
    );
  }, [isMyTurn, isSpawnTurn, myPlayer?.position, myPlayer?.tickets, isMrX, game.players, useBlackCard]);

  const validMoveSet = useMemo(() => new Set(validMoves.map(m => m.stationId)), [validMoves]);

  // ── Pan clamp ─────────────────────────────────────────────────────────────
  const clampPan = useCallback((px: number, py: number, s: number) => {
    const el = containerRef.current;
    if (!el) return { px, py };
    const maxX = (el.clientWidth  * (s - 1)) / 2;
    const maxY = (el.clientHeight * (s - 1)) / 2;
    return {
      px: Math.max(-maxX, Math.min(maxX, px)),
      py: Math.max(-maxY, Math.min(maxY, py)),
    };
  }, []);

  const applyZoom = useCallback((newScale: number) => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const { px, py } = clampPan(panX, panY, s);
    setScale(s); setPanX(px); setPanY(py);
  }, [panX, panY, clampPan]);

  const zoomIn  = () => applyZoom(scale * ZOOM_STEP);
  const zoomOut = () => {
    const ns = scale / ZOOM_STEP;
    if (ns <= MIN_SCALE) { setScale(MIN_SCALE); setPanX(0); setPanY(0); }
    else applyZoom(ns);
  };

  const returnToNode = useCallback(() => {
    const pos = myPlayer?.position;
    if (!pos) return;
    const station = stations[pos];
    if (!station || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const targetScale = Math.max(3, scale);
    const nodeX = (station.x / 100) * cw;
    const nodeY = (station.y / 100) * ch;
    const tx = (cw / 2 - nodeX) * targetScale / scale;
    const ty = (ch / 2 - nodeY) * targetScale / scale;
    const { px, py } = clampPan(tx, ty, targetScale);
    setScale(targetScale); setPanX(px); setPanY(py);
  }, [myPlayer?.position, scale, clampPan]);

  // ── Pointer / wheel events for pan ────────────────────────────────────────
  const DRAG_THRESHOLD = 6; // px — movement must exceed this to count as a drag

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= MIN_SCALE) return;
    isPotentialDrag.current = true;
    didDrag.current         = false;
    isDragging.current      = false;
    dragStart.current       = { x: e.clientX, y: e.clientY, panX, panY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isPotentialDrag.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!isDragging.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // Threshold exceeded — commit to drag, capture pointer
      isDragging.current = true;
      didDrag.current    = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const { px, py } = clampPan(dragStart.current.panX + dx, dragStart.current.panY + dy, scale);
    setPanX(px); setPanY(py);
  };
  const onPointerUp = () => {
    isPotentialDrag.current = false;
    isDragging.current      = false;
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? scale * 1.15 : scale / 1.15);
  };

  // ── Station click ─────────────────────────────────────────────────────────
  const handleStationClick = (id: number) => {
    if (didDrag.current) { didDrag.current = false; return; }
    if (!isMyTurn) return;
    if (isSpawnTurn) {
      if (occupiedStations.has(id)) return;
      playStationTap();
      onMove(id, 'taxi');
      return;
    }
    const move = validMoves.find(m => m.stationId === id);
    if (!move) return;
    playStationTap();
    if (useBlackCard && isMrX) { onMove(id, 'black'); return; }
    // Always show the transport picker so the player consciously chooses their mode
    setSelectedStation(id);
    setAvailableTransports(move.transports);
    setShowTicketModal(true);
  };

  const executeMove = (transport: TransportType) => {
    if (selectedStation !== null) {
      playTransportSelect();
      onMove(selectedStation, transport);
      setShowTicketModal(false);
      setSelectedStation(null);
    }
  };

  const getTransportIcon = (t: TransportType) => {
    switch (t) {
      case 'taxi':        return <CarFront className="text-[#cca01d]" />;
      case 'bus':         return <Bus className="text-[#128c5a]" />;
      case 'underground': return <TrainFront className="text-[#d92139]" />;
      case 'black':       return <FileQuestion className="text-gray-400" />;
      case 'boat':        return <Anchor className="text-[#1a6fa8]" />;
    }
  };
  const getTransportLabel = (t: TransportType) => {
    if (t === 'black') return 'Black Card (hidden)';
    if (t === 'boat')  return 'Boat (river)';
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  // ── SVG: draw thin colored lines from current station → valid destinations ──
  // (only when it's my turn, only for routes I can actually use)
  const validMoveLines = useMemo(() => {
    if (!isMyTurn || isSpawnTurn || !myPlayer?.position) return null;
    const fromStation = stations[myPlayer.position];
    if (!fromStation) return null;

    return validMoves.map(({ stationId, transports }) => {
      const toStation = stations[stationId];
      if (!toStation) return null;
      // Pick the "highest priority" transport color for the line
      const priority: TransportType[] = ['underground', 'boat', 'bus', 'taxi', 'black'];
      const t = priority.find(p => transports.includes(p)) ?? transports[0];
      return { fromStation, toStation, transport: t, stationId };
    }).filter(Boolean);
  }, [isMyTurn, isSpawnTurn, myPlayer?.position, validMoves]);

  const realQ  = game.mrxStartQuarter ?? null;
  const decoyQ = game.decoyQuarter    ?? null;
  const transform = `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`;

  return (
    <div
      className="relative w-full h-full rounded-xl overflow-hidden border border-border/40 shadow-2xl bg-[#0a0d14]"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      style={{ cursor: scale > MIN_SCALE ? (isDragging.current ? 'grabbing' : 'grab') : 'default' }}
    >
      {/* ── Zoom / controls ───────────────────────────────────────────────── */}
      <div
        className="absolute top-3 right-3 z-40 flex flex-col gap-1.5 pointer-events-auto"
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
      >
        <button onClick={zoomIn}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/70 border border-white/20 text-white hover:bg-black/90 active:scale-95 transition-all shadow">
          <ZoomIn size={15} />
        </button>
        <button onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/70 border border-white/20 text-white hover:bg-black/90 active:scale-95 transition-all shadow disabled:opacity-30">
          <ZoomOut size={15} />
        </button>
        {myPlayer?.position != null && (
          <button onClick={returnToNode}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/80 border border-primary/60 text-white hover:bg-primary active:scale-95 transition-all shadow">
            <Crosshair size={15} />
          </button>
        )}
        {scale > MIN_SCALE && (
          <div className="text-center text-[9px] text-white/60 font-mono leading-none mt-0.5">
            {Math.round(scale * 100)}%
          </div>
        )}
      </div>

      {/* ── Double-move indicator ─────────────────────────────────────────── */}
      {isMrX && isMyTurn && isSecondDoubleMove && (
        <div className="absolute top-3 left-3 z-40">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border bg-yellow-900/60 border-yellow-400 text-yellow-300 animate-pulse">
            <ChevronsRight size={12} />
            2nd double move — pick your destination
          </div>
        </div>
      )}

      {/* ── Quarter hint overlay (atop the scaled board) ─────────────────── */}
      <AnimatePresence>
        {showQuarterHint && realQ != null && decoyQ != null && (
          <>
            {[realQ, decoyQ].map(q => (
              <motion.div key={`quarter-${q}`}
                className="absolute pointer-events-none z-20 border-2 border-red-400 rounded-lg"
                style={{ ...quarterStyle(q), background: 'rgba(220,38,38,0.18)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-red-300 font-bold text-xs uppercase tracking-wider bg-black/60 px-2 py-1 rounded">
                    {quarterName(q)}
                  </span>
                </div>
              </motion.div>
            ))}
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              <div className="bg-black/88 border border-red-500 rounded-2xl px-8 py-5 text-center shadow-2xl max-w-xs">
                <div className="text-red-400 font-bold text-base uppercase tracking-widest mb-1 animate-pulse">⚠ Intelligence Report</div>
                <div className="text-white font-semibold text-sm leading-snug">Mr. X is hiding in one of these two quarters!</div>
                <div className="text-muted-foreground text-xs mt-2">{quarterName(realQ)} · {quarterName(decoyQ)}</div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Zoomable / pannable board ─────────────────────────────────────── */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{ transform, transformOrigin: 'center center', willChange: 'transform', transition: isDragging.current ? 'none' : 'transform 0.15s ease-out' }}
      >
        {/* ── The actual Scotland Yard board image ─────────────────────────── */}
        <img
          src={BOARD_URL}
          alt="Scotland Yard Board"
          className="absolute inset-0 w-full h-full select-none"
          style={{ objectFit: 'fill', pointerEvents: 'none', userSelect: 'none' }}
          draggable={false}
        />

        {/* ── SVG layer: valid-move route lines + optional hover indicator ─── */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Draw thin colored lines from current position → valid destinations */}
          {validMoveLines?.map(item => {
            if (!item) return null;
            const { fromStation, toStation, transport, stationId } = item;
            const isHovered = hoveredStation === stationId;
            return (
              <line
                key={`vml-${stationId}`}
                x1={fromStation.x} y1={fromStation.y}
                x2={toStation.x}   y2={toStation.y}
                stroke={TRANSPORT_COLORS[transport] ?? '#fff'}
                strokeWidth={isHovered ? 0.6 : 0.35}
                strokeOpacity={isHovered ? 0.9 : 0.55}
                strokeDasharray={transport === 'underground' ? '0.8 0.4' : transport === 'boat' ? '1 0.5' : undefined}
                strokeLinecap="round"
                style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
              />
            );
          })}
        </svg>

        {/* ── Station nodes ─────────────────────────────────────────────────── */}
        {Object.entries(stations).map(([idStr, s]) => {
          const id          = parseInt(idStr);
          const isValidMove = validMoveSet.has(id);
          const isSpawnable = isSpawnTurn && !occupiedStations.has(id);
          const isMyStation = myPlayer?.position === id;
          const highlight   = isValidMove || isSpawnable;
          const playersHere = game.players.filter(p => p.position === id);
          const isHov       = hoveredStation === id;

          return (
            <div
              key={id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center select-none
                ${highlight ? 'cursor-pointer z-20' : 'z-10'}
              `}
              style={{
                left:   `${s.x}%`,
                top:    `${s.y}%`,
                width:  highlight ? 22 : isMyStation ? 18 : 14,
                height: highlight ? 22 : isMyStation ? 18 : 14,
              }}
              onClick={() => handleStationClick(id)}
              onMouseEnter={() => setHoveredStation(id)}
              onMouseLeave={() => setHoveredStation(null)}
            >
              {/* Highlight ring for valid moves */}
              {highlight && (
                <>
                  {/* Ping ripple layer */}
                  <div
                    className={`absolute inset-0 rounded-full animate-ping ${
                      isSpawnable ? 'bg-cyan-400/60' : 'bg-yellow-300/60'
                    }`}
                  />
                  {/* Solid base ring */}
                  <div
                    className={`absolute inset-0 rounded-full border-2 ${
                      isSpawnable
                        ? 'border-cyan-300 bg-cyan-400/40'
                        : 'border-yellow-300 bg-yellow-300/40'
                    }`}
                  />
                </>
              )}

              {/* My station ring */}
              {isMyStation && !highlight && (
                <div className="absolute inset-0 rounded-full border-2 border-purple-400 bg-purple-500/20" />
              )}

              {/* Hover tooltip with station number only */}
              {(isHov || highlight) && (
                <div
                  className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/90 text-white font-bold font-mono px-1.5 py-0.5 rounded whitespace-nowrap border border-white/20 shadow pointer-events-none z-30"
                  style={{ fontSize: 9 }}
                >
                  {id}
                </div>
              )}

              {/* Player tokens */}
              <AnimatePresence>
                {playersHere.map((p, i) => {
                  const detectiveIdx   = p.role === 'detective' ? getDetectiveIndex(p.id, game.players) : -1;
                  const detectiveColor = detectiveIdx >= 0 ? getDetectiveColorByIndex(detectiveIdx) : undefined;
                  const isTheirTurn    = game.currentTurn === p.id && game.status === 'playing';
                  const initial        = p.name.trim()[0]?.toUpperCase() ?? '?';
                  const offsetX        = i * 14 - (playersHere.length - 1) * 7;

                  return (
                    <motion.div
                      key={p.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute flex items-center justify-center"
                      style={{ transform: `translate(${offsetX}px, -16px)`, zIndex: 30 }}
                    >
                      {/* Pulsing outer ring when it's this player's turn */}
                      {isTheirTurn && (
                        <div
                          className="absolute rounded-full animate-ping"
                          style={{
                            inset: -4,
                            background: p.role === 'mrx'
                              ? 'rgba(220,38,38,0.45)'
                              : `${detectiveColor}55`,
                          }}
                        />
                      )}

                      {/* Token */}
                      {p.role === 'mrx' ? (
                        /* ── Mr. X token ── */
                        <div
                          className="flex items-center justify-center rounded-full font-black text-white select-none"
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: 10,
                            background: '#000',
                            border: '2px solid #ef4444',
                            boxShadow: '0 0 0 1.5px #000, 0 0 8px rgba(239,68,68,0.7), 0 2px 5px rgba(0,0,0,1)',
                          }}
                        >
                          X
                        </div>
                      ) : (
                        /* ── Detective token ── */
                        <div
                          className="flex items-center justify-center rounded-full font-black text-white select-none"
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: 10,
                            background: detectiveColor ?? '#555',
                            /* White stroke + deep shadow for contrast on the busy map */
                            border: '2px solid #fff',
                            boxShadow: '0 0 0 1.5px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.95)',
                          }}
                        >
                          {initial}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ── Ticket modal ─────────────────────────────────────────────────────── */}
      <Dialog open={showTicketModal} onOpenChange={setShowTicketModal}>
        <DialogContent className="bg-card border-border/50 text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-center">
              {useDoubleMove ? 'Choose Transport — Double Move' : 'Choose Transport'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-4">
            {availableTransports.map(t => {
              const ticketKey = t === 'boat' ? 'black' : t;
              const count     = myPlayer?.tickets[ticketKey as keyof typeof myPlayer.tickets] ?? 0;
              const disabled  = count <= 0;
              return (
                <Button key={t} variant="outline" size="lg" disabled={disabled}
                  className={`flex items-center justify-between h-14 ${disabled ? 'opacity-30' : ''}`}
                  onClick={() => executeMove(t)}
                >
                  <div className="flex items-center gap-3">
                    {getTransportIcon(t)}
                    <span className="capitalize text-base">{getTransportLabel(t)}</span>
                  </div>
                  <span className="font-mono bg-background/50 px-3 py-1 rounded text-muted-foreground text-sm">
                    ×{count}
                  </span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
