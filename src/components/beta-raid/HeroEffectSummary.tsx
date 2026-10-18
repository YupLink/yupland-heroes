// Во что превращаются характеристики героя — человеческим языком.
//
// Зачем отдельный компонент: владелец ставил артефакты и не понимал, что
// изменилось, — радар показывает «атака 25», а в бою важно «атака отряда
// +250%». Раньше эти же числа собирала плашка в шапке замка своими строками,
// и вне замка их не было вовсе. Текст теперь один на оба окна: два разных
// объяснения одного и того же расходятся первой же правкой баланса.
//
// Считать здесь нечего: combat/field приходят с сервера из heroPowerCurve —
// ровно те коэффициенты, с которыми герой идёт в бой и шагает по карте.
import { STAT_LABELS, type HeroStatKey } from "@/lib/heroStats";
import { useLang, useT } from "@/lib/i18n";
import type { HeroCombat, HeroField } from "@/lib/hero/heroPowerCurve";

/** Боевая часть по проводам: softImmune сюда не едет и здесь не нужен. */
type CombatLike = Pick<
  HeroCombat,
  "atkMult" | "hpMult" | "missPct" | "luckPct" | "luckMin" | "luckMax"
>;

const pct = (v: number): number => Math.round(Number(v) || 0);

/**
 * Множитель дополнительного урона: «2–10». При удаче 201+ границы сходятся,
 * и «10–10» выглядело бы поломкой — там остаётся просто «10».
 */
const multLabel = (min: number, max: number): string =>
  min >= max ? String(Math.round(max)) : `${Math.round(min)}–${Math.round(max)}`;

export function HeroEffectSummary({
  combat,
  field,
  className,
  compact = false,
}: {
  combat: CombatLike;
  field: HeroField;
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const sourceStat: Record<string, HeroStatKey> = { atk: "atk", hp: "hp", miss: "arm", luck: "luck", step: "spd", energy: "int", regen: "int" };

  const atk = pct((combat.atkMult - 1) * 100);
  const hp = pct((combat.hpMult - 1) * 100);
  const miss = pct(combat.missPct);
  const luck = pct(combat.luckPct);
  const step = pct(field.stepDiscountPct);
  const energy = Math.round(Number(field.energyMaxBonus) || 0);
  const regen = pct(field.energyRegenBonusPct);

  // Ноль не печатаем: строка «шаг дешевле на 0%» ничего не объясняет, а
  // семь нулей подряд прячут единственный эффект, который у героя есть.
  const rows: { key: string; label: string; value: string }[] = [];
  if (atk > 0) rows.push({ key: "atk", label: t("braid.hero_fx_atk"), value: `+${atk}%` });
  if (hp > 0) rows.push({ key: "hp", label: t("braid.hero_fx_hp"), value: `+${hp}%` });
  if (miss > 0) rows.push({ key: "miss", label: t("braid.hero_fx_miss"), value: `${miss}%` });
  if (luck > 0)
    rows.push({
      key: "luck",
      label: t("braid.hero_fx_extra"),
      value: t("braid.hero_fx_extra_val", {
        n: luck,
        mult: multLabel(combat.luckMin, combat.luckMax),
      }),
    });
  if (step > 0) rows.push({ key: "step", label: t("braid.hero_fx_step"), value: `−${step}%` });
  if (energy > 0)
    rows.push({ key: "energy", label: t("braid.hero_fx_energy_max"), value: `+${energy}` });
  if (regen > 0)
    rows.push({ key: "regen", label: t("braid.hero_fx_energy_regen"), value: `+${regen}%` });

  if (compact) {
    const groups = new Map<HeroStatKey, typeof rows>();
    for (const row of rows) {
      const stat = sourceStat[row.key];
      groups.set(stat, [...(groups.get(stat) ?? []), row]);
    }
    return <div data-hero-effect-list className={className}>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">{t("braid.hero_fx_none")}</p> :
        Array.from(groups, ([stat, effects]) => <div data-effect-stat key={stat}>
          <div data-effect-name>{STAT_LABELS[stat][lang]}</div>
          {effects.map(effect => <div data-effect-line key={effect.key}>
            <span>{effect.label}</span><span data-effect-value>{effect.value}</span>
          </div>)}
        </div>)}
    </div>;
  }

  return (
    <div className={`${compact ? "border-t border-border pt-2" : "rounded-xl border border-gold/30 bg-gold/5 px-3 py-2"} ${className ?? ""}`}>
      {!compact && <div className="mb-1 text-[10px] font-bold text-gold">{t("braid.hero_fx_title")}</div>}
      {rows.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{t("braid.hero_fx_none")}</p>
      ) : (
        /* Две колонки даже на 375px: семь строк в столбик выталкивали слоты
           за экран, а пары «подпись — число» коротки и читаются парами. */
        <div className={compact ? "grid gap-y-1" : "grid grid-cols-2 gap-x-3 gap-y-0.5"}>
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-1.5">
              <span className={compact ? "text-xs text-muted-foreground" : "truncate text-[10px] text-muted-foreground"}>{r.label}</span>
              <span className="shrink-0 text-[10px] font-bold tabular-nums text-gold">
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
