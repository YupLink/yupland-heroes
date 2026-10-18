// Сцена босса: фон показан ПОЛНОСТЬЮ (object-contain, не урезан/не растянут; для
// нефоновой формы — блюр-заливка позади, чтобы не было чёрных полос), босс стоит
// ВНУТРИ сцены на её дне (PNG, белый фон вырезается опцией removeWhite), HP-шкала
// прикручена к нижнему краю. Имя/цифры HP рисует ВЫЗЫВАЮЩИЙ снаружи, снизу.
// Один и тот же компонент — в игре и в превью админки.
import { cn } from "@/lib/utils";
import { thumb, bossImg } from "@/lib/image";
import { Swords, Crown, Check, Package } from "lucide-react";

export function BossScene({
  imageUrl,
  backgroundUrl,
  removeWhite,
  locationBg,
  hpPct,
  dead = false,
  isFinal = false,
  anim = "breathe",
  label,
  badgeTone = "boss",
}: {
  imageUrl: string | null;
  backgroundUrl?: string | null;
  removeWhite?: boolean;
  locationBg?: string | null;
  hpPct: number; // 0..100
  dead?: boolean;
  isFinal?: boolean;
  anim?: "breathe" | "hit" | "none";
  label?: string | null; // кастомный текст бейджа (иначе «Босс»/«Финал ветки»)
  /** Тон бейджа: боевая цель (красный) или добыча — сундук/шахта (золотой). */
  badgeTone?: "boss" | "loot";
}) {
  const badgeText = (label && label.trim()) || (isFinal ? "Финал ветки" : "Босс");
  const bg = backgroundUrl || locationBg || null;
  const animClass = dead
    ? "opacity-70 grayscale"
    : anim === "hit"
      ? "animate-boss-hit"
      : anim === "breathe"
        ? "animate-boss-breathe"
        : "";
  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl border",
        dead ? "border-border" : "border-red-500/25 shadow-boss"
      )}
    >
      {/* Блюр-заливка позади (чтобы не было чёрных полос у нефоновой формы) */}
      {bg && (
        <img
          src={thumb(bg, 640)}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
        />
      )}
      {/* Фон ПОЛНОСТЬЮ */}
      {bg ? (
        <img
          src={thumb(bg, 640)}
          alt=""
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-contain",
            dead && "grayscale"
          )}
        />
      ) : (
        <div className="absolute inset-0 bg-boss-vault" />
      )}

      {/* Босс стоит на дне сцены */}
      <div className="absolute inset-0 flex items-end justify-center pb-5">
        {imageUrl ? (
          <img
            src={bossImg(imageUrl, 512, removeWhite)}
            alt=""
            className={cn(
              "max-h-[70%] w-auto max-w-[88%] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.5)]",
              animClass
            )}
          />
        ) : (
          <span className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-500/40 bg-secondary/70 text-gold">
            <Swords className="h-8 w-8" />
          </span>
        )}
      </div>

      {/* Бейдж босса — яркий, с кастомным текстом (задаётся в админке) */}
      <span
        className={cn(
          "absolute left-1/2 top-2.5 inline-flex max-w-[92%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
          isFinal || badgeTone === "loot"
            ? "border-gold/60 bg-gold text-black"
            : "border-red-300/60 bg-red-600 text-white"
        )}
      >
        {isFinal ? (
          <Crown className="h-3.5 w-3.5 shrink-0" />
        ) : badgeTone === "loot" ? (
          <Package className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Swords className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{badgeText}</span>
      </span>

      {dead && (
        <span className="absolute inset-0 flex items-center justify-center text-neon">
          <Check className="h-14 w-14 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
        </span>
      )}

      {/* HP-шкала прикручена к нижнему краю картинки */}
      <div className="absolute inset-x-0 bottom-0 h-2.5 bg-black/55">
        <div
          className={cn(
            "h-full transition-[width] duration-700 ease-out",
            dead ? "bg-secondary" : "gradient-boss-hp"
          )}
          style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
        />
      </div>
    </div>
  );
}
