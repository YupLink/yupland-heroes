// Гард шаблона героя: раса и специализация обязательны и только из таблицы статов.
//
// Почему он есть. 15.09.2026 два common-шаблона («An — Sad Face», «Fedr -
// Stubborn Mage») создали через конструктор с расой и прочерком вместо спеца:
// форма давала пункт «—», а adminCreateItem принимал любые строки и ничего не
// сверял. Строки «без спеца» в RACE_STATS нет — 70 героев докачали до 15 ур. с
// нулями во всех графах, бой шёл «без героя». Движок теперь подставляет Воина
// (heroStats.resolveSpec), но это аварийный запас: в базу такое больше не пишем.
//
// Только kind='hero': у артефакта те же поля race/specialization — условные
// бонусы, и там пустота законна.
import { RACE_STATS } from "@/lib/heroStats";
import { normalizeRace, normalizeSpec } from "@/lib/hero/heroStatSources";
import { SPECIALIZATIONS } from "@/components/heroMeta";

type HeroPatch = { race?: string | null; specialization?: string | null };

const clean = (v: string | null | undefined): string => (v ?? "").trim();

const SPECS = new Set<string>(SPECIALIZATIONS);

export const HERO_RACE_SPEC_ERROR =
  "У героя должны быть раса и специализация из списка — без них характеристики нулевые";

/**
 * create — оба поля обязательны. update — проверяются только присланные поля
 * (переключение active или смена картинки идут той же ручкой без расы/спеца и
 * не должны ломаться, пока битые шаблоны не поправлены), но обнулить их нельзя.
 */
export function assertHeroRaceSpec(kind: string, p: HeroPatch, mode: "create" | "update"): void {
  if (kind !== "hero") return;
  const raceGiven = mode === "create" || p.race !== undefined;
  const specGiven = mode === "create" || p.specialization !== undefined;
  // Алиасы («Кабаны», «Вихотка») — те же, что понимает движок статов.
  const race = normalizeRace(clean(p.race)) ?? "";
  const spec = normalizeSpec(clean(p.specialization)) ?? "";
  if (raceGiven && !RACE_STATS[race]) throw new Error(HERO_RACE_SPEC_ERROR);
  if (specGiven && !SPECS.has(spec)) throw new Error(HERO_RACE_SPEC_ERROR);
  // Оба на руках — пара обязана существовать в таблице (сейчас она полная 6×6,
  // но именно эта проверка переживёт любую будущую дырку в RACE_STATS).
  if (raceGiven && specGiven && !RACE_STATS[race]?.[spec]) throw new Error(HERO_RACE_SPEC_ERROR);
}

/** Способность героя (meta.ability) — только из списка (lib/hero/heroAbilities). */
export { assertHeroAbility } from "@/lib/hero/heroAbilities";
