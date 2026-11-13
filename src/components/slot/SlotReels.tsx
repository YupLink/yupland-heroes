// Окно барабанов 5×3 в золотой рамке с номерами линий по бокам. Пока крутятся —
// настоящая лента символов (ReelColumn, lib/slot/reelMotion.ts): разгон, бег,
// торможение с отскоком; барабаны встают по очереди слева направо, в «ожидании
// бонуса» тормозят дольше и светятся. После остановки выигрышные линии — по очереди.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { REELS, ROWS } from "@/lib/slot/lines";
import { BONUS, SYMBOLS, symbolOf } from "@/lib/slot/symbols";
import { ANTICIPATION_MS, reelTiming } from "@/lib/slot/timing";
import type { Grid, LineWin, SymbolId } from "@/lib/slot/types";
import { SlotLineBadges } from "./SlotLineBadges";
import { SlotLinesOverlay } from "./SlotLinesOverlay";
import { notifyReelLanding } from "./music/reelSounds";
import "./slot-reels-layout.css";
import "./slot-reels-motion.css";
import { ReelColumn } from "./ReelColumn";

// Картинки символов — заранее в кэш, чтобы лента не мигала при смене кадра.
if (typeof window !== "undefined")
  for (const s of SYMBOLS) {
    const img = new Image();
    img.src = s.img;
    void img.decode?.().catch(() => {});
  }

const EMPTY: Grid = [0, 1, 2, 3, 4].map(() => ["bar1", "bar2", "bar3"] as SymbolId[]);
const LINE_CYCLE_MS = 900;

function Cell({
  id,
  dim,
  pulse,
  gold,
}: {
  id: SymbolId;
  dim: boolean;
  pulse: boolean;
  gold?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative transition-opacity",
        dim && "opacity-35",
        gold && "bg-[radial-gradient(circle,rgba(243,202,98,0.45),transparent_70%)]",
      )}
    >
      {/* Плитка ячейки: видна и в покое, и когда лента крутится. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-[4%] rounded-md border border-[#655a43]/50 bg-[radial-gradient(ellipse_at_center,#1b2027,#0c1014_75%)] shadow-[inset_0_0_10px_rgba(0,0,0,0.7)]",
          gold && "border-[#f3ca62]/70",
        )}
      />
      <img
        src={symbolOf(id).img}
        alt=""
        className={cn(
          "slot-symbol absolute object-contain",
          (pulse || gold) && "animate-slot-pulse",
          gold && "drop-shadow-[0_0_14px_#f3ca62]",
        )}
      />
    </div>
  );
}

export function SlotReels({
  grid,
  spinning,
  spinId,
  wins,
  activeLines,
  showLines,
  highlightBonus = false,
}: {
  grid: Grid | null;
  spinning: boolean;
  spinId: number;
  wins: LineWin[];
  activeLines: number;
  showLines: boolean;
  /** Выиграна бонус-игра: все «Бонусы» на экране горят золотом. */
  highlightBonus?: boolean;
}) {
  const timing = useMemo(() => reelTiming(spinning ? grid : null), [grid, spinning]);
  // Что было в окне до спина — с этого лента и трогается (21.10: «каждый прокрут
  // начинался с одной картинки» — первый кадр спина показывал заготовку EMPTY).
  const lastGrid = useRef<Grid>(EMPTY);
  if (!spinning && grid) lastGrid.current = grid;
  // Сколько барабанов этого спина встало. Счёт привязан к спину: с первого же кадра
  // нового спина все барабаны крутятся (раньше счётчик сбрасывался эффектом — на
  // один кадр окно стояло пустым, отсюда дёрганье).
  const [landed, setLanded] = useState({ spinId, count: REELS });
  const stopped = landed.spinId === spinId ? landed.count : spinning ? 0 : REELS;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const onStop = useCallback(
    (reel: number) => {
      if (gridRef.current) notifyReelLanding(spinId, gridRef.current, reel);
    },
    [spinId],
  );
  const onLand = useCallback(
    (reel: number) =>
      setLanded((l) => ({ spinId, count: Math.max(l.spinId === spinId ? l.count : 0, reel + 1) })),
    [spinId],
  );

  // Перебор выигрышных линий по одной.
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    setCycle(0);
    if (spinning || wins.length < 2) return;
    const id = window.setInterval(() => setCycle((c) => c + 1), LINE_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [spinning, wins]);
  const shownWins = wins.length < 2 ? wins : [wins[cycle % wins.length]];

  const litCells = useMemo(() => {
    const set = new Set<string>();
    if (!spinning) for (const w of shownWins) for (const [r, c] of w.cells) set.add(`${r}:${c}`);
    return set;
  }, [shownWins, spinning]);
  const shown = grid ?? lastGrid.current;
  const overlayLines =
    showLines && !spinning ? Array.from({ length: activeLines }, (_, i) => i + 1) : [];
  const overlayWins = !spinning && !showLines ? shownWins : [];
  const bonusLanded = spinning
    ? shown
        .slice(0, stopped)
        .flat()
        .filter((s) => s === BONUS).length
    : 0;

  return (
    <div className="slot-reels">
      {/* Номера линий — поверх боковых полей, высоту задаёт только окно барабанов
          (иначе на узком экране колонка номеров растягивала окно пустой полосой). */}
      <div className="slot-reels-layout relative">
        <div className="slot-line-rail absolute inset-y-1 left-0">
          <SlotLineBadges side="left" active={activeLines} />
        </div>
        <div className="slot-line-rail absolute inset-y-1 right-0">
          <SlotLineBadges side="right" active={activeLines} />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
          <div className="grid grid-cols-5 gap-[2px] bg-[#0c1014] p-[2px]">
            {Array.from({ length: REELS }, (_, reel) => {
              const running = spinning && stopped <= reel;
              const anticipating =
                running && timing.anticipate[reel] && stopped === reel && bonusLanded >= 2;
              return (
                <div
                  key={reel}
                  className={cn(
                    "slot-reel-column relative overflow-hidden",
                    anticipating && "slot-reel-anticipating",
                  )}
                  data-spinning={running}
                  style={{ aspectRatio: `1 / ${ROWS}` }}
                >
                  {running ? (
                    <ReelColumn
                      reel={reel}
                      spinId={spinId}
                      prev={lastGrid.current[reel]}
                      final={grid ? grid[reel] : null}
                      stopIn={timing.stops[reel]}
                      anticipate={timing.anticipate[reel]}
                      anticipationMs={ANTICIPATION_MS}
                      onStop={onStop}
                      onLand={onLand}
                    />
                  ) : (
                    <div className="grid h-full grid-rows-3">
                      {Array.from({ length: ROWS }, (_, row) => {
                        const id = shown[reel][row];
                        const key = `${reel}:${row}`;
                        const bonusPulse = spinning && id === BONUS && bonusLanded >= 2;
                        const gold = highlightBonus && id === BONUS;
                        return (
                          <Cell
                            key={row}
                            id={id}
                            dim={
                              !gold &&
                              ((litCells.size > 0 && !litCells.has(key)) ||
                                (highlightBonus && !gold))
                            }
                            pulse={litCells.has(key) || bonusPulse}
                            gold={gold}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <SlotLinesOverlay lines={overlayLines} wins={overlayWins} />
        </div>
      </div>
    </div>
  );
}
