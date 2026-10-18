// Роль постройки в городе: по ней зонирование решает, ГДЕ ей стоять.
//
// Справочник живой: шаблоны заводят и переименовывают, и восемь из них заведены
// без meta.effect (Арена, Кузница, Лавка, Ломбард, Плавильня, Ратуша ×2, Храм).
// Поэтому роль — по эффекту, а у без-эффектных — по имени. Правила соседства из
// спецификации (docs/town-generation-algorithm.json, таблица zoning) говорят
// ролями: «таверна у ворот», «кузница у края», «храм по диагонали к площади».
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import type { RoleOption, TownRole } from "@/lib/raid/zonegen/town/types";

/**
 * Эффекты, которые прямо совпадают с ролью. Остальные (market, boost, пусто)
 * разбираются ниже — у рынка под одним эффектом живут и казарма, и оружейная.
 */
const EFFECT_ROLE: Record<string, TownRole> = {
  town_hall: "town_hall",
  boost: "temple",
  tavern: "tavern",
  warehouse: "warehouse",
  shipyard: "shipyard",
  university: "university",
  museum: "museum",
  watchtower: "watchtower",
  chambers: "chambers",
};

/**
 * Роль по кусочку имени — для рыночных шаблонов и без-эффектных. Порядок
 * важен: «Казарма - Найм войнов» — рынок по эффекту, но в городе это
 * казарма (у ворот, не у ратуши), а «Оружейный - Рынок» — оружейная при ней.
 */
const NAME_ROLE: ReadonlyArray<readonly [string, TownRole]> = [
  ["ратуш", "town_hall"],
  ["храм", "temple"],
  ["казарм", "barracks"],
  ["найм", "barracks"],
  ["оружей", "armory"],
  ["кузниц", "forge"],
  ["плавиль", "forge"],
  ["арена", "arena"],
  ["покои", "chambers"],
  ["таверн", "tavern"],
  ["склад", "warehouse"],
  ["верф", "shipyard"],
  ["музей", "museum"],
  ["университет", "university"],
  ["лавк", "market"],
  ["ломбард", "market"],
];

/** macOS отдаёт имена в NFD («й» = «и» + знак) — без NFC «Музей» ≠ «Музей». */
export const normName = (s: string): string =>
  s.normalize("NFC").trim().toLowerCase().replace(/ё/g, "е");

/** Плавильня — подвид кузницы со своим правилом: всегда на внешнем кольце. */
export const isSmelter = (option: BuildingOption): boolean =>
  normName(option.name).includes("плавиль");

/**
 * Роль постройки или null — в город не идёт. needsConfig (шахта, поле,
 * портал, дерево уровней, табличка) без своего building_config в игре «не
 * настроены» (ПРАВИЛА §8.14): поставленные генератором, они не заработают.
 *
 * Рыночный шаблон без особого имени — «market» (лавка). Без эффекта и без
 * узнаваемого имени — «house»: фон, которым застраиваются лоты между службами.
 */
export function roleOf(option: BuildingOption): TownRole | null {
  if (option.needsConfig) return null;
  const effect = option.effect === null ? "" : option.effect.trim();
  const name = normName(option.name);
  if (effect === "market") {
    // У рынка имя решает: казарма и оружейная — рынки только по механике.
    for (const [part, role] of NAME_ROLE) {
      if ((role === "barracks" || role === "armory") && name.includes(part)) return role;
    }
    return "market";
  }
  const byEffect = EFFECT_ROLE[effect];
  if (byEffect !== undefined) return byEffect;
  for (const [part, role] of NAME_ROLE) if (name.includes(part)) return role;
  // Незнакомый, но настоящий эффект (столб заклинаний и что заведут потом) —
  // рабочая постройка, к ней ходят: ей место на улице лавкой, а не двором.
  return effect === "" ? "house" : "market";
}

/** Справочник → опции с ролью; то, что в город не идёт, отбрасывается. */
export function toRoleOptions(options: BuildingOption[]): RoleOption[] {
  const out: RoleOption[] = [];
  for (const o of options) {
    const role = roleOf(o);
    if (role !== null) out.push({ ...o, role });
  }
  return out;
}

/**
 * Настоящая ли это служба. «Ратуша» без meta.effect — декорация: сердцем
 * города её ставят только когда настоящей нет (иначе город держался бы на
 * картинке без механики).
 */
export const hasRealEffect = (option: Pick<BuildingOption, "effect">): boolean =>
  option.effect !== null && option.effect.trim() !== "";
