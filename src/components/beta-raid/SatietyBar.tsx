// Шкала сытости выбранного героя (lib/hero/satiety): полоска, как у жизней.
// Убывает на глазах — шаг правит её в кэше состояния карты до ответа сервера
// (stepCache), бой и захват перечитывают состояние. На нуле — значок голода
// и красная полоска: характеристики героя ×0,5.
import { useQuery } from "@tanstack/react-query";
import { Apple, UtensilsCrossed } from "lucide-react";
import { getBetaRaidState } from "@/server/api/beta-raid";
import type { RaidState } from "./useBetaRaidData";
import "./satiety-bar.css";

type Sat = { now: number; max: number; hungry: boolean };

export function useSatiety(enabled = true): Sat | null {
  const q = useQuery({ queryKey: ["beta-raid-state"], queryFn: () => getBetaRaidState(), enabled });
  const s = (q.data as RaidState | undefined)?.hero?.satiety;
  return s && s.max > 0 ? s : null;
}

const fmt = (n: number, ru: boolean) =>
  Math.floor(n).toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });

export function satietyLabel(s: Sat, ru: boolean): string {
  return ru
    ? `Сытость ${fmt(s.now, ru)} из ${fmt(s.max, ru)}${s.hungry ? ". Голод: характеристики −50%" : ""}`
    : `Satiety ${fmt(s.now, ru)} of ${fmt(s.max, ru)}${s.hungry ? ". Hungry: stats −50%" : ""}`;
}

/** compact — под героем, ring — вокруг портрета в рейде, full — со значениями. */
export function SatietyBar({
  ru,
  variant = "full",
  className = "",
}: {
  ru: boolean;
  variant?: "full" | "compact" | "ring";
  className?: string;
}) {
  const s = useSatiety();
  if (!s) return null;
  const pct = Math.max(0, Math.min(100, (s.now / s.max) * 100));
  const tone = s.hungry ? "hungry" : pct < 25 ? "low" : pct < 50 ? "mid" : "ok";
  const label = satietyLabel(s, ru);
  const Icon = s.hungry ? UtensilsCrossed : Apple;
  return (
    <div
      className={`satiety-bar satiety-bar--${variant} satiety-bar--${tone} ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={s.max}
      aria-valuenow={Math.floor(s.now)}
      aria-label={label}
      title={label}
    >
      {variant !== "ring" && <Icon className="satiety-bar__icon" aria-hidden="true" />}
      <span
        className="satiety-bar__track"
        style={variant === "ring" ? {
          background: `conic-gradient(from -90deg, #e6534b 0 ${pct}%, #303533 ${pct}% 100%)`,
        } : undefined}
      >
        {variant !== "ring" && <span className="satiety-bar__fill" style={{ width: `${pct}%` }} />}
      </span>
      {variant === "full" && (
        <span className="satiety-bar__num">
          {fmt(s.now, ru)}/{fmt(s.max, ru)}
        </span>
      )}
    </div>
  );
}
