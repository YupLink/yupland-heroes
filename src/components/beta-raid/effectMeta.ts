// Один словарь эффектов на весь рейд: значок, цвет, короткий текст.
//
// Значки берём из карточек артефактов (immunityMeta) — там уже канон, и игрок
// видит ОДИН и тот же символ у иммунитета фишки, у способности босса, в HUD
// карты и в сводке боя.
//
// Названия способностей приходят с сервера по-русски (ABILITY_META.label) —
// иконку по ним и ищем, а игроку показываем перевод по kind. Серверная подпись
// остаётся запасным вариантом: для вида, которого ещё нет в словаре.
//
// `t` везде необязателен: без него модуль ведёт себя как раньше, по-русски.
import { Binoculars, BookMinus, Sword, Wind } from "lucide-react";
import type { Lang } from "@/lib/store";
import { immunityMeta, statMeta } from "@/components/itemStat";
import { ABILITY_META, parseRange, type AbilityKind } from "@/server/api/beta-raid/abilities";
import { immuneTargetOf } from "@/lib/hero/boostImmune";
import { OBLIVION_LV_KIND, OBLIVION_LVT_KIND, OBLIVION_TIME_KIND } from "@/lib/hero/boostOblivion";
import { BINOCULAR_RADIUS, SIGHT_KIND } from "@/lib/raid/sight";

/** Короткий стат→полный ключ statMeta: чтобы иконки бустов совпадали с
 *  теми, что рисуются на арте характеристики. */
const BUFF_STAT_ALIAS: Record<string, string> = {
  atk: "attack",
  arm: "armor",
  int: "intellect",
  spd: "speed",
  hp: "health",
  luck: "luck",
};

/** Функция перевода из useT() — прокидывается сюда из компонента. */
export type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Виды из лога боя, которых нет у способностей целей: их пишет герой. */
export type HeroEffectKind = "hero_crit" | "hero_miss";

/**
 * Значок и цвет героических записей. Своя таблица нужна потому, что
 * immunityMeta знает только способности врага, и крит с уворотом падали в
 * общий «Эффект» — единственное, что игрок вообще видит от героя в бою,
 * выглядело мусором.
 */
type EffectLook = { Icon: ReturnType<typeof immunityMeta>["Icon"]; color: string; ru: string };
const HERO_META: Record<HeroEffectKind, EffectLook> = {
  // Один меч — наш усиленный удар: у «удара по всем» босса два меча (Swords).
  hero_crit: { Icon: Sword, color: "#facc15", ru: "Доп. урон" },
  // Ветер и холодный цвет — по нам не попали, урона в этой строке нет.
  // Это броня героя: она не режет урон, а даёт шанс, что удар не пройдёт.
  hero_miss: { Icon: Wind, color: "#67e8f9", ru: "Промах врага" },
};

const heroMeta = (raw: string): EffectLook | undefined => HERO_META[raw as HeroEffectKind];

/** Лог боя шлёт и «poison_applied» — сводим к виду эффекта. */
export function effectKind(raw: string): AbilityKind | HeroEffectKind | null {
  if (heroMeta(raw)) return raw as HeroEffectKind;
  const k = raw.replace(/_applied$/, "") as AbilityKind;
  return ABILITY_META[k] ? k : null;
}

/** Перевод по ключу; нет такого ключа (t вернул сам ключ) — запасной текст. */
function tr(t: TFn | undefined, key: string, fallback: string): string {
  if (!t) return fallback;
  const s = t(key);
  return s === key ? fallback : s;
}

export function effectMeta(
  raw: string,
  t?: TFn,
): {
  kind: AbilityKind | HeroEffectKind | null;
  label: string;
  Icon: ReturnType<typeof immunityMeta>["Icon"];
  color: string;
} {
  // Бусты не способность врага и в ABILITY_META их нет: значок и цвет БЕРЁМ
  // ТЕ ЖЕ, что рисует statMeta на карточках артефактов — иначе +1 к атаке и
  // +5 к скорости выглядели как одна и та же гантель. Подпись по
  // характеристике — «Скорость», «Атака».
  if (raw.startsWith("buff_")) {
    const stat = raw.slice(5);
    const alias = BUFF_STAT_ALIAS[stat] ?? stat;
    const { Icon, color } = statMeta(alias);
    return {
      kind: null,
      label: tr(t, `braid.buff_${stat}`, "Буст"),
      Icon,
      color,
    };
  }
  // Забвение (заряды, заряды со сроком, время): тот же значок, что у «Забыть» в книге.
  if (raw === OBLIVION_LV_KIND || raw === OBLIVION_LVT_KIND || raw === OBLIVION_TIME_KIND) {
    return {
      kind: null,
      label: tr(t, "braid.oblivion", "Забвение"),
      Icon: BookMinus,
      color: "#c4b5fd",
    };
  }
  // Бинокль (lib/raid/sight): обзор 40 клеток, только таймер.
  if (raw === SIGHT_KIND) {
    const label = t
      ? t("braid.sight", { n: BINOCULAR_RADIUS })
      : `Бинокль: обзор ${BINOCULAR_RADIUS}`;
    return { kind: null, label, Icon: Binoculars, color: "#7dd3fc" };
  }
  // Временный иммунитет: значок самого дебаффа, подпись «Иммунитет: Яд».
  const immune = immuneTargetOf(raw);
  if (immune) {
    const ru = immune === "all" ? null : ABILITY_META[immune].label;
    const name =
      immune === "all"
        ? tr(t, "braid.immune_all", "все дебаффы")
        : tr(t, `braid.ab_${immune}`, ru ?? "");
    const label = t ? t("braid.immune_to", { name }) : `Иммунитет: ${name}`;
    // «Все» — нейтральный щит: у него нет одного дебаффа, чей значок взять.
    const { Icon, color } = immunityMeta(ru);
    return { kind: null, label, Icon, color };
  }
  const kind = effectKind(raw);
  const hero = kind ? heroMeta(kind) : undefined;
  if (hero && kind) {
    return { kind, label: tr(t, `braid.ab_${kind}`, hero.ru), Icon: hero.Icon, color: hero.color };
  }
  // Иконку и цвет ищем по РУССКОЙ подписи — immunityMeta знает только её.
  const ruLabel = kind ? ABILITY_META[kind as AbilityKind].label : null;
  const label = ruLabel ? tr(t, `braid.ab_${kind}`, ruLabel) : tr(t, "braid.effect", "Эффект");
  const { Icon, color } = immunityMeta(ruLabel);
  return { kind, label, Icon, color };
}

const range = (v: string | number | undefined): string => {
  const [lo, hi] = parseRange(v);
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
};

/** Сила способности одной строкой: «−3-6% HP фишки за раунд · 10-20 мин». */
export function effectDetail(
  a: {
    kind: string;
    value?: string | number;
    duration?: string | number;
  },
  t: TFn,
): string {
  const [, hiD] = parseRange(a.duration);
  const dur = hiD > 0 ? t("braid.dur_min", { n: range(a.duration) }) : "";
  switch (effectKind(a.kind)) {
    case "poison":
      return t("braid.eff_poison", { n: range(a.value) }) + dur;
    case "stun":
      return t("braid.eff_stun") + dur;
    case "cleave":
      return t("braid.eff_cleave", { n: range(a.value) });
    case "slow":
      return t("braid.eff_slow", { n: range(a.value) }) + dur;
    case "burn_energy":
      return t("braid.eff_burn", { n: range(a.value) });
    case "weak_atk":
    case "weak_arm":
    case "weak_luck":
    case "weak_int":
      return t(`braid.eff_${effectKind(a.kind)}`, { n: range(a.value) }) + dur;
    case "strip_immune":
      return t("braid.eff_strip_immune") + dur;
    default:
      return "";
  }
}

/** Остаток до снятия: «45с» / «12м» / «1ч 20м». */
export function untilLabel(expiresAt: string, now: number, t?: TFn): string {
  const s = Math.ceil(Math.max(0, new Date(expiresAt).getTime() - now) / 1000);
  if (s < 60) return t ? t("braid.until_s", { n: s }) : `${s}с`;
  const m = Math.ceil(s / 60);
  if (m < 60) return t ? t("braid.until_m", { n: m }) : `${m}м`;
  const h = Math.floor(m / 60);
  return t ? t("braid.until_hm", { h, m: m % 60 }) : `${h}ч ${m % 60}м`;
}

/**
 * «2 шага» / «2 steps». Формы лежат в словаре через «|»:
 * ru — 1 / 2-4 / 5+, en — единственное / множественное.
 * Общий на папку, чтобы не плодить по копии склонений в каждом окне.
 */
export function plural(t: TFn, lang: Lang, key: string, n: number): string {
  const forms = t(key).split("|");
  const one = forms[0];
  const few = forms[1] ?? one;
  if (lang !== "ru") return `${n} ${n === 1 ? one : few}`;
  const many = forms[2] ?? few;
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return `${n} ${one}`;
  if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
