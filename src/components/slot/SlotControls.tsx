// Кнопочная панель автомата: линии 1/3/5/7/9, ставка одной кнопкой по кругу,
// макс, авто, риск и большой «Старт».
import { BarChart3, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { LINE_OPTIONS } from "@/lib/slot/bets";
import type { Phase } from "@/lib/slot/state";

const KEY = "slot-key px-2 py-2.5 text-sm tabular-nums transition active:translate-y-px";
const KEY_OFF = "";
const KEY_ON = "";

export function SlotControls({
  phase,
  lines,
  bet,
  auto,
  canSpin,
  lastWin,
  onLines,
  onBet,
  onMax,
  onAuto,
  onSpin,
  onRisk,
  onRules,
  onStats,
}: {
  phase: Phase;
  lines: number;
  bet: number;
  auto: boolean;
  canSpin: boolean;
  lastWin: number;
  onLines: (n: number) => void;
  onBet: () => void;
  onMax: () => void;
  onAuto: () => void;
  onSpin: () => void;
  onRisk: () => void;
  onRules: () => void;
  /** Только у админа: окно статистики казино. */
  onStats?: () => void;
}) {
  const t = useT();
  const idle = phase === "idle" || phase === "won";

  return (
    <div className="space-y-2 p-1">
      <div className="grid grid-cols-5 gap-1.5">
        {LINE_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={!idle}
            onClick={() => onLines(n)}
            className={cn(KEY, n === lines ? KEY_ON : KEY_OFF)}
            data-on={n === lines}
          >
            {n}
            <span className="block text-[8px] font-normal uppercase tracking-wider opacity-70">
              {t("slot.lines")}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!idle}
          onClick={onBet}
          className={cn(KEY, KEY_OFF, "text-gold")}
        >
          {bet}
          <span className="block text-[8px] font-normal uppercase tracking-wider opacity-70">
            {t("slot.bet")}
          </span>
        </button>
        <button type="button" disabled={!idle} onClick={onMax} className={cn(KEY, KEY_OFF)}>
          {t("slot.max_bet")}
        </button>
        <button
          type="button"
          onClick={onAuto}
          className={cn(KEY, auto ? KEY_ON : KEY_OFF)}
          data-on={auto}
        >
          {t("slot.auto")}
        </button>
      </div>
      <div
        className={cn(
          "grid gap-1.5",
          phase === "won" && lastWin > 0 ? "grid-cols-[1fr_2fr]" : "grid-cols-1",
        )}
      >
        {phase === "won" && lastWin > 0 && (
          <button type="button" onClick={onRisk} className={cn(KEY, "!text-[#4fd6e0]")}>
            {t("slot.risk")}
          </button>
        )}
        <button
          type="button"
          onClick={onSpin}
          disabled={!canSpin && !auto}
          className={cn(
            "slot-start py-3.5 text-base uppercase transition active:translate-y-px",
            (canSpin || auto) && "animate-slot-glow-soft",
          )}
        >
          {auto
            ? t("slot.stop")
            : phase === "spinning"
              ? t("slot.spinning")
              : idle && !canSpin
                ? t("slot.no_credits")
                : t("slot.spin")}
        </button>
      </div>
      <div className="flex items-center justify-between px-1 text-xs">
        <button
          type="button"
          onClick={onRules}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-4 w-4" />
          {t("slot.rules")}
        </button>
        {onStats && (
          <button
            type="button"
            onClick={onStats}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
            {t("slot.admin_stats")}
          </button>
        )}
      </div>
    </div>
  );
}
