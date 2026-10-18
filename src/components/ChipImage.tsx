// Карточка фишки: круглое изображение + цветной ободок по уровню +
// звёзды по дуге СПРАВА на полумесяц-подложке (вариант H из showcase).
//
// Применяется везде: инвентарь, коллекции, паки, reveal/craft модалы.
//
// Уровни 1..5 шагом 0.5. Звёзды — inline-SVG с partial-fill (X.5 = полузалитая).

import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useId } from "react";

interface Props {
  src: string;
  /** Уровень 1..5 с шагом 0.5. Кратные 0.5: 1, 1.5, 2, …, 5 */
  level: number;
  alt?: string;
  /** className контейнера */
  className?: string;
  /** Скрыть overlay звёзд (для preview без рейтинга) */
  hideStars?: boolean;
  /** Вариант подложки под звёздами (для showcase). По умолчанию 'thick'. */
  arcVariant?: ArcVariant;
}

// ──────── Цвет ободка/glow по уровню ────────

function levelToRingClass(level: number): string {
  const h = Math.round(level * 2) / 2;
  if (h >= 5)
    return "border-amber-300 shadow-[0_0_18px_rgba(255,184,0,0.55),inset_0_0_24px_rgba(255,184,0,0.45)]";
  if (h >= 4)
    return "border-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.50),inset_0_0_20px_rgba(168,85,247,0.35)]";
  if (h >= 3)
    return "border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.45),inset_0_0_18px_rgba(56,189,248,0.30)]";
  if (h >= 2)
    return "border-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.40),inset_0_0_16px_rgba(34,197,94,0.25)]";
  return "border-slate-400/70 shadow-[inset_0_0_14px_rgba(148,163,184,0.25)]";
}

/**
 * Классы для внешней плашки-карточки фишки.
 * БЕЗ обводки (border) — только цветной фон + inset-glow + outer-glow по уровню.
 * Эффект «свечение по rarity» теперь у самой подложки, не у явной рамки.
 */
export function chipPanelClasses(level: number): string {
  const h = Math.round(level * 2) / 2;
  if (h >= 5)
    return "border-0 bg-[radial-gradient(70%_70%_at_50%_30%,rgba(255,184,0,0.30),rgba(255,140,0,0.05))] shadow-[0_0_24px_rgba(255,184,0,0.55),inset_0_0_28px_rgba(255,184,0,0.30)]";
  if (h >= 4)
    return "border-0 bg-[radial-gradient(70%_70%_at_50%_30%,rgba(168,85,247,0.28),rgba(120,80,200,0.05))] shadow-[0_0_20px_rgba(168,85,247,0.50),inset_0_0_24px_rgba(168,85,247,0.25)]";
  if (h >= 3)
    return "border-0 bg-[radial-gradient(70%_70%_at_50%_30%,rgba(56,189,248,0.26),rgba(40,120,200,0.05))] shadow-[0_0_18px_rgba(56,189,248,0.45),inset_0_0_22px_rgba(56,189,248,0.22)]";
  if (h >= 2)
    return "border-0 bg-[radial-gradient(70%_70%_at_50%_30%,rgba(34,197,94,0.24),rgba(20,140,80,0.05))] shadow-[0_0_14px_rgba(34,197,94,0.40),inset_0_0_20px_rgba(34,197,94,0.20)]";
  return "border-0 bg-[radial-gradient(70%_70%_at_50%_30%,rgba(148,163,184,0.16),rgba(100,116,139,0.04))] shadow-[inset_0_0_16px_rgba(148,163,184,0.18)]";
}

// ──────── Inline-SVG звезда с partial-fill ────────

function Star({ fill, size }: { fill: number; size: number }) {
  const id = useId();
  const stop = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="block shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset={`${stop}%`} stopColor="#ffb800" />
          <stop offset={`${stop}%`} stopColor="rgba(255,255,255,0.22)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.92 6.5 6.58.6-5 4.6 1.5 6.8-6-3.5-6 3.5 1.5-6.8-5-4.6 6.58-.6z"
        fill={`url(#${id})`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.7"
      />
    </svg>
  );
}

// ──────── Дуга-серп подложки + звёзды по дуге справа ────────

export type ArcVariant = "thin" | "thick" | "deep" | "clip" | "gradient";

export function ArcStarsTop({
  level,
  variant = "thick",
}: {
  level: number;
  variant?: ArcVariant;
}) {
  const maskId = useId();
  const cells = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, level - i)));
  // Подложка: cy сдвинута на 10% выше (78 → 68).
  // Звёзды: centerY сдвинута на 20% выше (48 → 28), radius уменьшен
  //         чтобы звёзды не вылетали за круг.
  const arcDeg = 90;
  const step = arcDeg / (cells.length - 1);
  const startAngle = -135;
  const radiusPct = 41;
  const centerY = 50;
  const starPct = 11;

  let underlay: React.ReactNode = null;
  if (variant === "thin") {
    underlay = (
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <mask id={maskId}>
            <rect width="100" height="100" fill="white" />
            <circle cx="50" cy="75" r="50" fill="black" />
          </mask>
        </defs>
        <circle cx="50" cy="50" r="50" fill="black" fillOpacity="0.78" mask={`url(#${maskId})`} />
      </svg>
    );
  } else if (variant === "deep") {
    underlay = (
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <mask id={maskId}>
            <rect width="100" height="100" fill="white" />
            <circle cx="50" cy="55" r="50" fill="black" />
          </mask>
        </defs>
        <circle cx="50" cy="50" r="50" fill="black" fillOpacity="0.92" mask={`url(#${maskId})`} />
      </svg>
    );
  } else if (variant === "clip") {
    underlay = (
      <div
        className="absolute inset-0 bg-black/85"
        style={{ clipPath: "ellipse(60% 28% at 50% 8%)" }}
      />
    );
  } else if (variant === "gradient") {
    underlay = (
      <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black/90 via-black/55 to-transparent" />
    );
  } else {
    // thick (default) — сдвинут на 10% выше
    underlay = (
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <mask id={maskId}>
            <rect width="100" height="100" fill="white" />
            <circle cx="50" cy="68" r="50" fill="black" />
          </mask>
        </defs>
        <circle cx="50" cy="50" r="50" fill="black" fillOpacity="0.85" mask={`url(#${maskId})`} />
      </svg>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {underlay}
      {cells.map((f, i) => {
        const angle = startAngle + i * step;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + radiusPct * Math.cos(rad);
        const y = centerY + radiusPct * Math.sin(rad);
        const tilt = angle + 90;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${starPct}%`,
              height: `${starPct}%`,
              transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
            }}
          >
            <StarFit fill={f} />
          </div>
        );
      })}
    </div>
  );
}

function StarFit({ fill }: { fill: number }) {
  // Использует размер родителя (через 100% width)
  const id = useId();
  const stop = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      className="block drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset={`${stop}%`} stopColor="#ffb800" />
          <stop offset={`${stop}%`} stopColor="rgba(255,255,255,0.22)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.92 6.5 6.58.6-5 4.6 1.5 6.8-6-3.5-6 3.5 1.5-6.8-5-4.6 6.58-.6z"
        fill={`url(#${id})`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.7"
      />
    </svg>
  );
}

export function ChipImage({
  src,
  level,
  alt,
  className,
  hideStars,
  arcVariant,
}: Props) {
  const ring = levelToRingClass(level);
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-full border-2 bg-secondary/40",
        ring,
        className
      )}
    >
      {/* Пустой src (напр. триал-фишка без картинки) → не рендерим <img>,
          иначе браузер рисует значок «битой картинки». Показываем мягкий
          градиент-подложку, поверх — звёзды по уровню. */}
      {src ? (
        <img
          // Превью через ресайз-прокси (аватарки фишек мелкие; исходники бывают
          // 1+ МБ). 200px хватает под ретину в сетках/шапках.
          src={thumb(src, 200)}
          alt={alt ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_50%_35%,rgba(148,163,184,0.20),rgba(15,23,42,0.6))]" />
      )}
      {!hideStars && <ArcStarsTop level={level} variant={arcVariant} />}
    </div>
  );
}

/** Маленький индикатор только звёзды (для compact-режимов). */
export function ChipStarsBar({
  level,
  size = 12,
  className,
}: {
  level: number;
  size?: number;
  className?: string;
}) {
  const cells = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, level - i)));
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {cells.map((f, i) => (
        <Star key={i} fill={f} size={size} />
      ))}
    </div>
  );
}
