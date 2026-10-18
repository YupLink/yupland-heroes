// БУСТ: ВРЕМЕННЫЕ прибавки к характеристикам героя.
//
// Работает как дебаф монстра, только в плюс: висит на игроке заданное число
// минут и отпускает сам (yuplink.beta_raid_player_effects, виды buff_*).
// Даёт их постройка-алтарь или товар из рюкзака.
//
// Эффектов у одного источника МНОГО: зелье может дать и скорость, и удачу —
// поэтому настройка это СПИСОК, а не одна строка.
//
// Числа задаются ОДНИМ полем в общем формате проекта: «2» — точное значение,
// «1-10» — диапазон от 1 до 10 (тот же parseRange, что у урона босса и
// длительности его способностей). Двух полей «от» и «до» здесь нет намеренно.
//
// Кроме шести боевых характеристик эффект умеет:
//  - Торговлю и Алхимию (небоевые: ёмкость рюкзака и сумки зелий, в бой не идут);
//  - ИММУНИТЕТ к виду дебаффа (stat "immune" + ability, см. boostImmune.ts);
//  - ЗАБВЕНИЕ: уровень (value, «0» — без счёта) и минуты, см. oblivionRule.ts.
// Старые записи {stat, value, minutes} читаются как раньше: поле ability
// необязательное и нужно только иммунитету.
import { HERO_STAT_KEYS, STAT_LABELS, type HeroStatKey, type HeroStats } from "../heroStats";
import type { ExtraStatKey } from "./heroStatSources";
import { parseRange } from "@/server/api/beta-raid/abilities";
import { IMMUNE_KINDS, immuneText, isImmuneTarget, type ImmuneTarget } from "./boostImmune";
import { oblivionText, parseOblivionEffect, rollOblivion } from "./boostOblivion";
import { boostList, oblivionRollMode } from "./oblivionRule";

/** Что даёт эффект: боевой стат, небоевой (Торговля/Алхимия), иммунитет, забвение, сытость. */
export type BoostStat = HeroStatKey | ExtraStatKey | "immune" | "oblivion" | "satiety";

/** Статы, которые прибавляются числом (всё, кроме иммунитета и забвения). */
export type BoostNumStat = HeroStatKey | ExtraStatKey;

export const EXTRA_BOOST_KEYS: ExtraStatKey[] = ["trade", "alchemy"];
export const BOOST_NUM_KEYS: BoostNumStat[] = [...HERO_STAT_KEYS, ...EXTRA_BOOST_KEYS];
/** Порядок в выпадающем списке редактора. */
export const BOOST_STAT_KEYS: BoostStat[] = [...BOOST_NUM_KEYS, "immune", "oblivion", "satiety"];

export const BOOST_STAT_LABELS: Record<BoostStat, { ru: string; en: string }> = {
  ...STAT_LABELS,
  trade: { ru: "Торговля", en: "Trade" },
  alchemy: { ru: "Алхимия", en: "Alchemy" },
  immune: { ru: "Иммунитет", en: "Immunity" },
  oblivion: { ru: "Забвение", en: "Oblivion" },
  satiety: { ru: "Сытость", en: "Satiety" },
};

export type BoostEffect = {
  stat: BoostStat;
  /** Сколько пунктов: «2» или «1-10». У иммунитета — «1», у забвения — уровень. */
  value: string;
  /** Сколько минут держится: «30» или «10-20». У забвения пусто — заряды без срока. */
  minutes: string;
  /** Только у иммунитета: к какому дебаффу (или "all"). */
  ability?: ImmuneTarget;
};

export type HeroBoosts = Partial<Record<BoostNumStat, number>>;

/** Сколько минут держится буст, если админ ничего не выбрал. */
export const DEFAULT_BOOST_MINUTES = 30;

/** Пустая строка настройки — с неё начинается новый эффект в редакторе. */
export const emptyBoostEffect = (): BoostEffect => ({
  stat: "spd",
  value: "1",
  minutes: String(DEFAULT_BOOST_MINUTES),
});

const isStat = (v: unknown): v is BoostStat =>
  typeof v === "string" && (BOOST_STAT_KEYS as string[]).includes(v);

/** Иммунитет по умолчанию, когда админ переключил строку на него. */
export const defaultImmuneAbility = (): ImmuneTarget => IMMUNE_KINDS[0] ?? "all";

/** Строка диапазона из чего угодно: числа, строки, пары «от/до». */
const rangeStr = (v: unknown): string => {
  if (typeof v === "number") return String(Math.max(0, Math.round(v)));
  const s = String(v ?? "").trim();
  return s;
};

/**
 * Разобрать настройку: и новый список, и старую одиночную запись
 * `{stat, min, max, minutes}` — она лежит у уже настроенных алтарей.
 * Пустой список — бустов нет, и говорить о них нечего.
 */
export function parseBoostEffects(raw: unknown): BoostEffect[] {
  const out: BoostEffect[] = [];
  for (const item of boostList(raw)) {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    // Неизвестный стат (запись из будущей версии, мусор) пропускаем, а не падаем.
    if (!o || !isStat(o.stat)) continue;
    // Забвению 30 минут не подставляем: без минут это заряды без срока. Неверная
    // пара («0» или пусто без минут, «0-3») не выдаётся — oblivionRule.ts.
    if (o.stat === "oblivion") {
      const e = parseOblivionEffect(o);
      if (e) out.push(e);
      continue;
    }
    // Сытость (еда) — прибавка к шкале героя, без минут.
    if (o.stat === "satiety") {
      const value = rangeStr(o.value);
      if (parseRange(value)[1] > 0) out.push({ stat: "satiety", value, minutes: "" });
      continue;
    }
    const minutesRaw = rangeStr(o.minutes) || String(DEFAULT_BOOST_MINUTES);
    const minutesOk = parseRange(minutesRaw)[1] > 0 ? minutesRaw : String(DEFAULT_BOOST_MINUTES);
    if (o.stat === "immune") {
      // Дебафф, которого больше нет в каталоге, — эффект молча выпадает.
      if (!isImmuneTarget(o.ability)) continue;
      out.push({ stat: "immune", value: "1", minutes: minutesOk, ability: o.ability });
      continue;
    }
    // Старый формат: две границы отдельными полями — склеиваем в одну строку.
    const value =
      o.value != null
        ? rangeStr(o.value)
        : joinRange(rangeStr(o.min ?? o.amount), rangeStr(o.max ?? o.amount));
    const [, hi] = parseRange(value);
    if (hi <= 0) continue;
    out.push({ stat: o.stat, value, minutes: minutesOk });
  }
  return out;
}

const joinRange = (lo: string, hi: string): string =>
  !lo ? hi : !hi || lo === hi ? lo : `${lo}-${hi}`;

/** Что реально выпало игроку: пункты и минуты внутри заданных диапазонов. */
export type BoostRoll = {
  stat: BoostStat;
  amount: number;
  minutes: number;
  ability?: ImmuneTarget;
};

export function rollBoostEffect(e: BoostEffect): BoostRoll {
  const [lo, hi] = parseRange(e.value);
  const [loM, hiM] = parseRange(e.minutes);
  const roll = (a: number, b: number) => (b <= a ? a : a + Math.floor(Math.random() * (b - a + 1)));
  // Забвение: уровень 0 — без счёта; минут не задано — 0, заряды без срока.
  if (e.stat === "oblivion") return rollOblivion(e, roll);
  const minutes = Math.max(1, roll(loM, hiM) || DEFAULT_BOOST_MINUTES);
  // Иммунитет либо есть, либо нет: «силы» у него нет, пишем единицу.
  if (e.stat === "immune") return { stat: "immune", amount: 1, minutes, ability: e.ability };
  return { stat: e.stat, amount: roll(lo, hi), minutes };
}

/**
 * Броски на qty штук: каждая штука бросается отдельно, как при отдельном
 * нажатии. Одинаковые по стату и сроку сводим в одну прибавку — бафы одного
 * стата складываются на чтении, и одна строка с суммой действует так же.
 *
 * Иммунитет сводим иначе: по ВИДУ, складывая МИНУТЫ. Три зелья «иммунитет к
 * яду на 30 мин» — это 90 минут, а не одна строка «силы 3» на 30 (запись
 * иммунитета продлевает срок, как повтор дебаффа).
 */
export function rollBoostQty(
  effects: BoostEffect[],
  qty: number,
  roll: (e: BoostEffect) => BoostRoll = rollBoostEffect,
): BoostRoll[] {
  const merged = new Map<string, BoostRoll>();
  for (let i = 0; i < qty; i++) {
    for (const e of effects) {
      const r = roll(e);
      const amount = Math.round(r.amount);
      const minutes = Math.round(r.minutes);
      // Забвение сводим по виду (заряды, заряды со сроком, безлимит): заряды
      // складываются, минуты — тоже (повтор продлевает срок).
      if (r.stat === "oblivion") {
        const key = `oblivion:${oblivionRollMode(amount, minutes)}`;
        const m = merged.get(key);
        if (m) {
          m.amount += amount;
          m.minutes += minutes;
        } else merged.set(key, { ...r, amount, minutes });
        continue;
      }
      if (r.stat === "immune") {
        const key = `immune:${r.ability ?? ""}`;
        const m = merged.get(key);
        if (m) m.minutes += minutes;
        else merged.set(key, { ...r, amount: 1, minutes });
        continue;
      }
      const key = `${r.stat}:${minutes}`;
      const m = merged.get(key);
      if (m) m.amount += amount;
      else merged.set(key, { ...r, amount, minutes });
    }
  }
  return [...merged.values()];
}

/**
 * Название стата с запасным вариантом: ответ сервера может принести стат,
 * которого эта сборка ещё не знает (выкатили новый эффект, вкладка старая).
 * Без запаса подпись падала на undefined[lang] и роняла весь экран.
 */
export function boostStatLabel(stat: string, lang: "ru" | "en"): string {
  const l = (BOOST_STAT_LABELS as Partial<Record<string, { ru: string; en: string }>>)[stat];
  return l?.[lang] ?? stat;
}

/** Подпись одного эффекта: «+1-10 к «Скорости» на 30 мин», «Иммунитет к «Яд» на 30 мин». */
export function boostEffectText(e: BoostEffect, lang: "ru" | "en"): string {
  if (e.stat === "oblivion") return oblivionText(e.value, e.minutes, lang);
  if (e.stat === "satiety") return lang === "ru" ? `+${e.value} сытости` : `+${e.value} satiety`;
  const label = boostStatLabel(e.stat, lang);
  const gift =
    e.stat === "immune"
      ? immuneGift(e.ability, lang)
      : lang === "ru"
        ? `+${e.value} к «${label}»`
        : `+${e.value} ${label}`;
  return lang === "ru" ? `${gift} на ${e.minutes} мин` : `${gift} for ${e.minutes} min`;
}

/** Иммунитет без вида (или к виду, которого сборка не знает) — просто «Иммунитет». */
const immuneGift = (ability: ImmuneTarget | undefined, lang: "ru" | "en"): string =>
  ability && isImmuneTarget(ability) ? immuneText(ability, lang) : BOOST_STAT_LABELS.immune[lang];

/** Подпись уже выпавшего броска — для тоста «что прилетело герою». */
export const boostRollText = (r: BoostRoll, lang: "ru" | "en"): string =>
  boostEffectText(
    { stat: r.stat, value: String(r.amount), minutes: String(r.minutes), ability: r.ability },
    lang,
  );

/** Все эффекты одной строкой — для плитки товара и карточки «i». */
export function boostListText(list: BoostEffect[], lang: "ru" | "en"): string {
  return list.map((e) => boostEffectText(e, lang)).join(" · ");
}

/** Прибавить бусты к посчитанным характеристикам. */
export function withBoosts(stats: HeroStats, boosts: HeroBoosts | null | undefined): HeroStats {
  if (!boosts) return stats;
  const out = { ...stats };
  for (const k of HERO_STAT_KEYS) out[k] = Math.max(0, out[k] + (Number(boosts[k]) || 0));
  return out;
}

// ── Совместимость: рефактор буста переехал на СПИСОК эффектов (parseBoostEffects
// / BoostEffect[]), но рюкзак (market-backpack*) ещё импортирует старые имена и
// без них падала СБОРКА у всех. Мост отдаёт ту же новую модель под прежними
// именами — параллельная ветка дорефакторит рюкзак и уберёт эти псевдонимы.
export type BoostConfig = BoostEffect[];
export const parseBoost = parseBoostEffects;
