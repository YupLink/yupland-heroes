// Виды грибов (владелец, 22.10.2026): DARAI, золотой, алмазный — общие числа и
// узнавание для клиента и сервера. Правила у всех видов одни (lib/daraiMine):
// добыча только хозяину и только посаженному, поднять/посадить по 5 энергии,
// час в рюкзаке, охраны нет, ускорения нет.
//
//   вид       добыча в час          жизнь   лимит на все миры
//   DARAI     10 000 DARAI (пул)    7 сут   100
//   золотой   1 золото              7 сут   200
//   алмазный  1 алмаз               3 сут   10
//
// Узнаём по настройке клетки: building_config.mushroom; прежние грибы DARAI без
// метки — по токену Darai (та же лестница в SQL: yuplink.raid_mushroom_kind).
// Метка `mushroom` выводит гриб из шахт v2 (raid_mine_v2_std, mineV2Of):
// золотой гриб — не золотая шахта, ни режимов, ни запаса службы.

export const MUSHROOM_KINDS = ["darai", "gold", "diamonds"] as const;
export type MushroomKind = (typeof MUSHROOM_KINDS)[number];

export type MushroomSpec = {
  /** Ресурс шахты (building_config.resource) и токен, если это монета. */
  resource: "token" | "gold" | "diamonds";
  token: string | null;
  /** Добыча в час. */
  yield: number;
  /** Жизнь от появления, ч. */
  lifeHours: number;
  /** Сколько живых этого вида может быть на всех картах и в рюкзаках. */
  limit: number;
  /** Чем меньше, тем реже: на одной клетке за час встаёт более редкий. */
  rarity: number;
  /** Облик на карте (группа bgrp_dmineDarai). */
  skin: string;
};

export const MUSHROOMS: Record<MushroomKind, MushroomSpec> = {
  darai: {
    resource: "token",
    token: "Darai",
    yield: 10_000,
    lifeHours: 168,
    limit: 100,
    rarity: 2,
    skin: "bskin_dm_mushroom",
  },
  gold: {
    resource: "gold",
    token: null,
    yield: 1,
    lifeHours: 168,
    limit: 200,
    rarity: 3,
    skin: "bskin_dm_gold",
  },
  diamonds: {
    resource: "diamonds",
    token: null,
    yield: 1,
    lifeHours: 72,
    limit: 10,
    rarity: 1,
    skin: "bskin_dm_diamonds",
  },
};

/**
 * Шансы появления по умолчанию (settings.mushroom_spawn их перекрывает): за час
 * на клетке жилы; на соседней — × near. Золотая жила — золотой или DARAI,
 * алмазная — только алмазный.
 */
export const MUSHROOM_SPAWN_DEFAULT = { gold: 0.01, darai: 0.001, diamonds: 0.002, near: 0.1 };

/**
 * «Съесть» гриб из рюкзака (владелец, 25.10.2026, §8.85): за MUSHROOM_EAT_ENERGY
 * энергии (цена — перед съедением, с подтверждением) награда сразу; через
 * MUSHROOM_RESPAWN_HOURS с шансом MUSHROOM_RESPAWN_CHANCE гриб того же вида встаёт
 * на одной из свободных жил. Те же числа — в SQL raid_mushroom_eat и
 * raid_mushroom_respawn_due (mushroom-13): меняются только вместе.
 */
export const MUSHROOM_EAT_REWARD: Record<MushroomKind, number> = {
  diamonds: 5,
  gold: 5,
  darai: 25_000,
};

/** Энергия за «Съесть». */
export const MUSHROOM_EAT_ENERGY = 50;

/** Через сколько часов после съедения — бросок на возврат. */
export const MUSHROOM_RESPAWN_HOURS = 12;

/** Шанс, что съеденный гриб встанет снова. */
export const MUSHROOM_RESPAWN_CHANCE = 0.5;

export const isMushroomKind = (v: unknown): v is MushroomKind =>
  typeof v === "string" && (MUSHROOM_KINDS as readonly string[]).includes(v);

/** Вид гриба по настройке клетки; не гриб — null. */
export function mushroomKindOf(cfg: unknown): MushroomKind | null {
  if (!cfg || typeof cfg !== "object") return null;
  const o = cfg as { mushroom?: unknown; resource?: unknown; token?: unknown };
  if (isMushroomKind(o.mushroom)) return o.mushroom;
  const darai =
    o.resource === "token" && typeof o.token === "string" && o.token.toLowerCase() === "darai";
  return darai ? "darai" : null;
}

/** Настройка клетки — гриб любого вида. */
export const isMushroomConfig = (cfg: unknown): boolean => mushroomKindOf(cfg) !== null;

/** Стопка рюкзака вида: dmine:darai / dmine:gold / dmine:diamonds. */
export const mushroomStackKey = (kind: MushroomKind): string => `dmine:${kind}`;

/** Вид по стопке рюкзака; прежние стопки dmine:<id> — DARAI; не гриб — null. */
export function mushroomKindOfStack(stackKey: string | null | undefined): MushroomKind | null {
  if (typeof stackKey !== "string" || !stackKey.startsWith("dmine:")) return null;
  const tail = stackKey.slice("dmine:".length);
  if (!tail) return null;
  return isMushroomKind(tail) ? tail : "darai";
}

/** Ключ облика гриба в словаре построек карты (skin:<id>) — рисуется втрое меньше. */
export const isMushroomSkinKey = (buildingKey: string | null | undefined): boolean =>
  typeof buildingKey === "string" && buildingKey.startsWith("skin:bskin_dm_");

/** Во сколько раз гриб на карте меньше обычной постройки (владелец: «в 3 раза меньше»). */
export const MUSHROOM_DRAW_SCALE = 1 / 3;
