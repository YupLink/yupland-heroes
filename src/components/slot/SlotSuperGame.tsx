// Супер-бонус «Ночной раскоп»: под одной из двух кучек клад (магический сундук),
// под другой — адский босс. Выкопал клад — +25 ставок и следующая попытка (до 10),
// босс — конец. Набранное остаётся.
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SUPER_ATTEMPTS, SUPER_PRIZE, type SuperState } from "@/lib/slot/bonus";
import { EyesIcon } from "./SlotArt";
import { MAP_ART } from "@/lib/gameArt";

const STARS =
  "bg-[radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.8)_1px,transparent_2px),radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.7)_1px,transparent_2px),radial-gradient(circle_at_55%_28%,rgba(255,255,255,0.6)_1px,transparent_2px),radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.5)_1px,transparent_2px),radial-gradient(circle_at_92%_45%,rgba(255,255,255,0.6)_1px,transparent_2px)]";

function Mound({
  side,
  state,
  onPick,
  prize,
}: {
  side: 0 | 1;
  state: SuperState;
  onPick: (s: 0 | 1) => void;
  prize: number;
}) {
  const canPick = !state.done && state.lastPick === null;
  const revealed = state.lastPick !== null;
  const playedStep = state.lastPick === "hit" ? state.step - 1 : state.step;
  const isYupik = state.friend[Math.max(0, Math.min(playedStep, SUPER_ATTEMPTS - 1))] === side;
  const lit = state.lastSide === side;
  return (
    <button
      type="button"
      disabled={!canPick}
      onClick={() => onPick(side)}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-2xl transition",
        canPick && "hover:scale-[1.03]",
      )}
    >
      {lit && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(255,213,74,0.55),transparent_60%)]" />
      )}
      {!revealed && (
        <EyesIcon className="absolute left-1/2 top-[28%] w-14 -translate-x-1/2 animate-pulse" />
      )}
      <img
        src={lit ? MAP_ART.digHole : MAP_ART.lootMound}
        alt=""
        className={cn(
          "w-[88%] object-contain",
          lit ? "mb-3 h-[45%]" : "h-[80%]",
          !lit && revealed && "opacity-40",
        )}
      />
      {revealed && (
        <div
          className={cn(
            "animate-slot-pop absolute inset-0 flex flex-col items-center justify-center pb-5",
            !lit && "opacity-50",
          )}
        >
          {isYupik ? (
            <img
              src="/slot/chest-magic.webp"
              alt=""
              className="h-[62%] w-[62%] object-contain drop-shadow-[0_0_12px_rgba(167,139,250,0.9)]"
            />
          ) : (
            <img
              src="/slot/boss.webp"
              alt=""
              className="h-[70%] w-[70%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]"
            />
          )}
          {isYupik && (
            <span className="rounded-full bg-black/85 px-2 py-0.5 font-display text-sm font-bold text-gold ring-1 ring-gold/60">
              +{prize}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export function SlotSuperGame({
  superGame,
  stake,
  onPick,
  onNext,
}: {
  superGame: SuperState;
  stake: number;
  onPick: (side: 0 | 1) => void;
  onNext: () => void;
}) {
  const t = useT();
  const prize = SUPER_PRIZE * stake;
  useEffect(() => {
    if (superGame.lastPick !== "hit" || superGame.done) return;
    const id = window.setTimeout(onNext, 1300);
    return () => window.clearTimeout(id);
  }, [superGame.lastPick, superGame.step, superGame.done, onNext]);

  const status =
    superGame.lastPick === "miss"
      ? t("slot.super.miss")
      : superGame.done
        ? t("slot.super.done")
        : superGame.lastPick === "hit"
          ? t("slot.super.hit", { x: prize })
          : t("slot.super.step", { n: superGame.step + 1, m: SUPER_ATTEMPTS, x: prize });

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="font-display text-lg font-bold text-gold">{t("slot.super.title")}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("slot.super.pot")}
          </div>
          <div className="font-display text-2xl font-bold tabular-nums text-gold">
            {superGame.pot}
          </div>
        </div>
      </div>
      <div className="slot-reels relative overflow-hidden bg-[radial-gradient(ellipse_at_bottom,#141a2a,#05060a_70%)] p-3">
        <div className={cn("pointer-events-none absolute inset-0", STARS)} />
        <div className="relative mb-2 text-center text-xs text-foreground/80">
          {t("slot.super.hint")}
        </div>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Mound side={0} state={superGame} onPick={onPick} prize={prize} />
          <div className="flex flex-col items-center gap-1 pb-2">
            <img src="/slot/bonus.webp" alt="" className="h-12 w-12 object-contain" />
            <img src="/slot/shovel.webp" alt="" className="h-10 w-10 object-contain" />
          </div>
          <Mound side={1} state={superGame} onPick={onPick} prize={prize} />
        </div>
        <div className="relative mt-2 flex justify-center gap-1">
          {Array.from({ length: SUPER_ATTEMPTS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-4 rounded-full",
                i < superGame.step ? "bg-gold shadow-[0_0_6px_#f5b301]" : "bg-secondary",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
