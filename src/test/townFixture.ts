// Обвязка тестов органического роста: справочник с обликами и вход placeTown.
//
// Отдельно, потому что подборка (compose.test.ts), зонирование и расстановка
// (place.test.ts) живут в разных файлах (потолок 250 строк), а справочник им
// нужен один: срез живого — службы, без-эффектные шаблоны, рынки, казарма и
// оружейная под рыночным эффектом, «ненастроенные» шахта, поле и портал.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { disk } from "@/lib/raid/zonegen/town/hex";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import type { RoleOption, TownInput } from "@/lib/raid/zonegen/town/types";

type Skin = { id: string; name: string };

export const opt = (
  id: string,
  name: string,
  effect: string | null,
  tiers = 0,
  skins: Skin[] = [],
  needsConfig = false,
): BuildingOption => ({ id, name, effect, tiers, needsConfig, skins });

/** Облики рас: «Юпик» — почти везде, «Кабан» — в двух ролях, «Морж» — зимний. */
const races = (id: string, which: string[]): Skin[] =>
  which.map((w) => ({ id: `${id}_${w}`, name: `${w} ${id}` }));
const ALL = ["Юпик", "Кабан", "Морж"];
const YUP = ["Юпик"];

export const CATALOG: BuildingOption[] = [
  opt("hall", "Ратуша", "town_hall", 3, races("hall", YUP)),
  opt("hall_fake", "Ратуша", null),
  opt("tavern", "Таверна", "tavern", 3, races("tav", ALL)),
  opt("bar", "Бар", "tavern"),
  opt("wh", "Склад", "warehouse", 2, races("wh", YUP)),
  opt("uni", "Университет", "university", 3),
  opt("museum", "Музей", "museum", 4, races("mus", YUP)),
  opt("chambers", "Покои", "chambers", 2, races("home", ALL)),
  opt("watch", "Обзорная вышка", "watchtower", 2),
  opt("ship", "Верфь", "shipyard", 3),
  opt("temple", "Храм", "boost", 2, races("tmp", ["Юпик", "Кабан"])),
  opt("forge", "Кузница", null),
  opt("smelt", "Плавильня", null, 0, races("sm", YUP)),
  opt("pawn", "Ломбард", null),
  opt("arena", "Арена", null),
  opt("shop", "Лавка", null, 0, races("shop", YUP)),
  opt("barracks", "Казарма - Найм войнов", "market", 0, races("bar", YUP)),
  opt("armory", "Оружейный - Рынок", "market"),
  ...["Алхимия", "Пекарня", "Пилорама", "Продуктовый", "Путешественника", "Строительный"].map(
    (n, i) => opt(`m${i}`, `${n} - Рынок`, "market", i % 2),
  ),
  opt("mine", "Золотая шахта", "mine", 2, [], true),
  opt("field", "Поле", "field", 0, [], true),
  opt("portal", "Грибной портал", "portal", 0, [], true),
];

export const OPTIONS: RoleOption[] = toRoleOptions(CATALOG);

/** Круглая зона радиуса r вокруг (0,0) — чистая суша без дорог. */
export const zone = (r = 10): ZoneCell[] => disk({ q: 0, r: 0 }, r);

/** Вход placeTown с разумными умолчаниями; поля перекрываются аргументом. */
export function townInput(over: Partial<TownInput> = {}): TownInput {
  return {
    cells: zone(),
    occupied: new Set(),
    water: new Set(),
    decorBlocked: new Set(),
    mapRoads: new Set(),
    seed: 1,
    buildings: 30,
    theme: "",
    options: OPTIONS,
    manual: null,
    roadId: "road",
    built: true,
    ...over,
  };
}
