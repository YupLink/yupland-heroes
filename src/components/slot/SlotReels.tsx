// Окно барабанов 5×3 в золотой рамке с номерами линий по бокам. Пока крутятся —
// лента символов едет вниз; барабаны встают слева направо, в «ожидании бонуса»
// крутятся дольше и светятся; на остановке — отскок. После остановки
// выигрышные линии показываются по очереди.
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { REELS, ROWS } from "@/lib/slot/lines";
import { rollSymbol } from "@/lib/slot/reels";
import { BONUS, symbolOf } from "@/lib/slot/symbols";
import { reelTiming } from "@/lib/slot/timing";
import type { Grid, LineWin, SymbolId } from "@/lib/slot/types";
import { SlotLineBadges } from "./SlotLineBadges";
import { SlotLinesOverlay } from "./SlotLinesOverlay";

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
          "absolute inset-[10%] h-[80%] w-[80%] object-contain",
          (pulse || gold) && "animate-slot-pulse",
          gold && "drop-shadow-[0_0_14px_#f3ca62]",
        )}
      />
    </div>
  );
}

function ReelStrip({ reel, spinId, slow }: { reel: number; spinId: number; slow: boolean }) {
  const strip = useMemo(() => {
    const s: SymbolId[] = [];
    for (let i = 0; i < 6; i++) s.push(rollSymbol(reel));
    return [...s, ...s];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel, spinId]);
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 grid",
        slow ? "animate-slot-reel-slow blur-[0.5px]" : "animate-slot-reel blur-[1.5px]",
      )}
      style={{ gridTemplateRows: "repeat(12, 1fr)", height: "400%" }}
    >
      {strip.map((id, i) => (
        <Cell key={i} id={id} dim={false} pulse={false} />
      ))}
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
  const [stopped, setStopped] = useState(REELS);
  const timing = useMemo(() => reelTiming(spinning ? grid : null), [grid, spinning]);
  // Новый спин — все барабаны крутятся. Остановки ставим, только когда сервер
  // прислал итог: до ответа барабаны просто крутятся, не вставая на старое.
  useEffect(() => {
    if (spinning) setStopped(0);
  }, [spinning, spinId]);
  useEffect(() => {
    if (!spinning || !grid) return;
    const timers = timing.stops.map((ms, i) => window.setTimeout(() => setStopped(i + 1), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [spinning, spinId, grid, timing]);

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
  const shown = grid ?? EMPTY;
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
    <div className="slot-reels p-2">
      {/* Номера линий — поверх боковых полей, высоту задаёт только окно барабанов
          (иначе на узком экране колонка номеров растягивала окно пустой полосой). */}
      <div className="relative px-6">
        <div className="absolute inset-y-1 left-0 w-5">
          <SlotLineBadges side="left" active={activeLines} />
        </div>
        <div className="absolute inset-y-1 right-0 w-5">
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
                    "relative overflow-hidden",
                    anticipating && "animate-slot-anticipate",
                  )}
                  style={{ aspectRatio: `1 / ${ROWS}` }}
                >
                  {running ? (
                    <ReelStrip reel={reel} spinId={spinId} slow={anticipating} />
                  ) : (
                    <div className={cn("grid h-full grid-rows-3", spinning && "animate-slot-stop")}>
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
