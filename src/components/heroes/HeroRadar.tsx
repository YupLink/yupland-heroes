// Лепестковая диаграмма характеристик героя (референс владельца 20.08).
// Шесть осей: атака / броня / интеллект / скорость / здоровье / удача.
// Чистый SVG, без библиотек — вписывается в бандл и в тему приложения.
import { useId } from "react";
import { HERO_STAT_KEYS, STAT_LABELS, type HeroStats, type HeroStatKey } from "@/lib/heroStats";
import { useLang } from "@/lib/i18n";

// Порядок осей по кругу: начинаем сверху и идём по часовой.
const AXES: HeroStatKey[] = ["spd", "atk", "luck", "hp", "int", "arm"];

// Короткие подписи-иконки на осях (эмодзи не используем — они «дешевят»).
const AXIS_GLYPH: Record<HeroStatKey, { ru: string; en: string }> = {
  spd: { ru: "СКР", en: "SPD" },
  atk: { ru: "АТК", en: "ATK" },
  luck: { ru: "УДЧ", en: "LCK" },
  hp: { ru: "ЗДР", en: "HP" },
  int: { ru: "ИНТ", en: "INT" },
  arm: { ru: "БРН", en: "ARM" },
};

export function HeroRadar({
  stats,
  size = 240,
  max,
  modifiers,
  selectedAxis,
  onAxisSelect,
}: {
  stats: HeroStats;
  size?: number;
  /** Верх шкалы. По умолчанию — по максимальному стату с запасом. */
  max?: number;
  /** Compact Tavern only: signed gear + effect delta, already included in stats. */
  modifiers?: Partial<Record<HeroStatKey, { total: number; hasParts: boolean }>>;
  selectedAxis?: HeroStatKey | null;
  onAxisSelect?: (axis: HeroStatKey) => void;
}) {
  const lang = useLang() === "en" ? "en" : "ru";
  // id градиента уникален на экземпляр — иначе несколько диаграмм на странице
  // делят один <defs> и ссылки ломаются.
  const fillId = `heroRadar-${useId()}`;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.34;
  const peak = Math.max(1, ...HERO_STAT_KEYS.map((k) => stats[k]));
  // Шкала кратно 10 — чтобы кольца были «круглыми» и читались.
  const top = max ?? Math.max(10, Math.ceil(peak / 10) * 10);

  const pointAt = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [cx + Math.cos(angle) * R * ratio, cy + Math.sin(angle) * R * ratio] as const;
  };

  const polygon = AXES.map((k, i) => pointAt(i, Math.min(1, stats[k] / top)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={onAxisSelect ? `-12 -12 ${size + 24} ${size + 24}` : `0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="max-w-full"
    >
      <defs>
        <radialGradient id={fillId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4fd6e0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5b9bff" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {/* кольца сетки */}
      {rings.map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={R * r}
          fill="none"
          stroke="#4fd6e0"
          strokeOpacity={r === 1 ? 0.45 : 0.15}
          strokeWidth={r === 1 ? 1.5 : 1}
        />
      ))}

      {/* оси + подписи */}
      {AXES.map((k, i) => {
        const [x, y] = pointAt(i, 1);
        const [lx, ly] = pointAt(i, 1.24);
        const modifier = modifiers?.[k];
        const signed = modifier?.hasParts
          ? modifier.total === 0 ? "(±0)" : `(${modifier.total > 0 ? "+" : ""}${Math.round(modifier.total)})`
          : null;
        return (
          <g
            key={k}
            data-game-button={onAxisSelect ? "surface" : undefined}
            role={onAxisSelect ? "button" : undefined}
            tabIndex={onAxisSelect ? 0 : undefined}
            aria-label={onAxisSelect ? `${STAT_LABELS[k][lang]}: ${stats[k]}${signed ? `, ${signed}` : ""}` : undefined}
            aria-pressed={onAxisSelect ? selectedAxis === k : undefined}
            onClick={onAxisSelect ? () => onAxisSelect(k) : undefined}
            onKeyDown={onAxisSelect ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onAxisSelect(k);
              }
            } : undefined}
            className={onAxisSelect ? "hero-radar-axis cursor-pointer" : undefined}
          >
            <line
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#4fd6e0"
              strokeOpacity={0.2}
              strokeDasharray="3 4"
            />
            {onAxisSelect && <rect className="hero-radar-axis-focus" x={lx - 25} y={ly - 24} width={50} height={50} rx={4} fill="transparent" />}
            <text
              x={lx}
              y={onAxisSelect ? ly - size * 0.05 : ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={size * 0.045}
              fill="#9a9aab"
              fontWeight="700"
            >
              {AXIS_GLYPH[k][lang]}
            </text>
            <text
              x={lx}
              y={onAxisSelect ? ly + size * 0.015 : ly + size * 0.055}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={size * 0.05}
              fill="#ececf5"
              fontWeight="700"
            >
              {stats[k]}
            </text>
            {onAxisSelect && signed && <text
              x={lx}
              y={ly + size * 0.075}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={size * 0.045}
              className={modifier!.total < 0 ? "fill-current text-destructive" : "fill-current text-gold"}
              fontWeight="700"
            >
              {signed}
            </text>}
          </g>
        );
      })}

      {/* сама «звезда» характеристик */}
      <polygon points={polygon} fill={`url(#${fillId})`} stroke="#4fd6e0" strokeWidth={2} />
      {AXES.map((k, i) => {
        const [x, y] = pointAt(i, Math.min(1, stats[k] / top));
        return <circle key={k} cx={x} cy={y} r={2.5} fill="#4fd6e0" />;
      })}
    </svg>
  );
}

/** Компактный список статов — под диаграмму или в карточку. */
export function HeroStatList({ stats }: { stats: HeroStats }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {HERO_STAT_KEYS.map((k) => (
        <div
          key={k}
          className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5 text-center"
        >
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {STAT_LABELS[k].ru}
          </div>
          <div className="font-display text-sm font-bold text-foreground">{stats[k]}</div>
        </div>
      ))}
    </div>
  );
}
