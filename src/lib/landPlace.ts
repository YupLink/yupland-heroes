// Мир строителей (владелец, 26.10.2026): «портал в мир, изначально портал и
// 8 клеточек; люди покупают земли и застраивают; мир общий и бесконечный».
// Общие правила сервера и клиента.
//
//  · Земля — товар лавки вида `land`: ref — шаблон местности (любой, включая
//    будущие), «Сколько» — клеток в пачке, цену задаёт админ. В рюкзаке стопка
//    `land:<местность>`, count = сколько клеток осталось положить.
//  · Положить — только в мире строителей, в радиусе LAND_RADIUS от героя: в пустоту
//    (клетки нет) — даром; на клетку другой местности — перестройка за
//    LAND_REBUILD_ENERGY энергии (владелец 26.10). Клетку с постройкой, объектом
//    или декором и клетку под героем не перестраиваем: портал и лавка остаются
//    на своей земле, а герой не оказывается в воде. Земля общая: ходит и кладёт
//    рядом любой.
//  · Размер мира — до ±LAND_COORD_LIMIT по q и r: столько выдерживает формат
//    карты (16-битные координаты). Пустота места не занимает: хранится только
//    положенная земля.

/** Вид товара лавки и строки рюкзака. */
export const LAND_KIND = "land" as const;

/** Дальность: своя клетка и четыре круга вокруг героя — 61 клетка (31.10.2026: «площадь
 * в 2 раза больше», было 3 круга — 37; 4 круга — ближайшее к ×2). */
export const LAND_RADIUS = 4;

/** Перестройка клетки другой местности — энергия за клетку. */
export const LAND_REBUILD_ENERGY = 5;

/** Предел координат мира (формат карты — Int16, с запасом). */
export const LAND_COORD_LIMIT = 32000;

const TERRAIN_ID = /^terrain_[A-Za-z0-9_-]{1,64}$/;

/** Ключ стопки рюкзака: land:<шаблон местности>. */
export const landStackKey = (terrainId: string): string => `${LAND_KIND}:${terrainId}`;

/** Местность из ключа стопки; не земля (или мусор) — null. */
export function landOfStack(stackKey: string | null | undefined): string | null {
  const key = typeof stackKey === "string" ? stackKey : "";
  if (!key.startsWith(`${LAND_KIND}:`)) return null;
  const id = key.slice(LAND_KIND.length + 1);
  return TERRAIN_ID.test(id) ? id : null;
}

/** Стопка рюкзака — земля для мира строителей. */
export const isLandStackKey = (stackKey: string | null | undefined): boolean =>
  landOfStack(stackKey) !== null;

/** Клетка внутри мира (координаты в пределах формата карты). */
export const inLandLimit = (q: number, r: number): boolean =>
  Math.abs(q) <= LAND_COORD_LIMIT && Math.abs(r) <= LAND_COORD_LIMIT;

/** Шестиугольное расстояние в осевых координатах. */
export function landDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Клетка сетки окна «Положить землю»: смещение от героя и можно ли туда. */
export type LandCell = {
  dq: number;
  dr: number;
  ok: boolean;
  /** Почему нельзя — ключ словаря (land.*); null — можно. */
  reason: string | null;
  /** Чтобы сетка окна была той же, что у динамита (DynamiteHexGrid). */
  hit: null;
  /** Энергия за клетку: 0 — в пустоту, LAND_REBUILD_ENERGY — перестройка. */
  cost: number;
};

/** Что на клетке сейчас; null — пустота. */
export type LandSpot = {
  terrainId: string | null;
  /** Объект или декор на клетке. Постройка не мешает (владелец 05.11.2026: «под уже
   *  поставленным зданием невозможно разместить или заменить тип местности»). */
  built: boolean;
  /** Постройка на клетке: земля под СВОЕЙ меняется (не на воду), под чужой — нет. */
  building?: boolean;
  /** Постройку поставил этот игрок (lib/buildingSale). */
  ownBuilding?: boolean;
} | null;

/** Почему на эту клетку класть нельзя; null — можно. */
export function landCellReason(o: {
  dq: number;
  dr: number;
  /** Абсолютные координаты клетки. */
  q: number;
  r: number;
  spot: LandSpot;
  /** На клетке стоит герой (любой). */
  hero: boolean;
  /** Местность из рюкзака. */
  terrainId: string;
  /** Местность из рюкзака — вода. */
  water?: boolean;
}): string | null {
  if (landDist({ q: 0, r: 0 }, { q: o.dq, r: o.dr }) > LAND_RADIUS) return "land.far";
  if (!inLandLimit(o.q, o.r)) return "land.edge";
  if (!o.spot) return null;
  if (o.spot.built) return "land.built";
  if (o.spot.building && !o.spot.ownBuilding) return "land.building_other";
  if (o.spot.building && o.water) return "land.water_building";
  if (o.spot.terrainId === o.terrainId) return "land.same";
  if (o.hero) return "land.hero";
  return null;
}

/** Энергия за клетку: пустота — даром, своя земля поверх чужой — перестройка. */
export const landCellCost = (spot: LandSpot): number => (spot ? LAND_REBUILD_ENERGY : 0);
