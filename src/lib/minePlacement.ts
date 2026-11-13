// Постановка шахты из заготовки (ПРАВИЛА §8.59.7–8) — общие правила клиента и
// сервера.
//
//  · Ставить можно все четыре вида: лесопилку, каменную, золотую и алмазную.
//    Делает Архитектор пока только дерево и камень (castleArchitect), золотую
//    и алмазную ставят из рюкзака — например, выданные админом.
//  · Чертёж (raid_mine_plan) кладут в радиусе MINE_BUILD_RADIUS от героя; саму
//    шахту ставят, подойдя: клетка чертежа — своя или одна из шести соседних,
//    и это стоит энергии (minePlaceEnergy).
//  · Лесопилке — не меньше 3 деревьев вокруг (шесть соседних клеток), каменной —
//    не меньше 3 гор. Дерево и гора — явные метки декора (raid_asset_tags.nature),
//    гора ещё и местность «Горы» / «Высокогорье»; считает их функция базы
//    raid_nature_around (migrations/minev2-20).
//  · Золотой и алмазной природа вокруг не нужна: сама клетка должна лежать на
//    жиле того же вида (yuplink.raid_map_vein, владелец 21.10.2026). Остальные
//    правила клетки — те же, что у дерева и камня.
//
// Постройка — те же шаблоны, что у нынешних шахт: «Лесопилка», «Каменная
// Шахта», «Золотая шахта», «Алмазная шахта». Настройка клетки — плоско, как у
// всех шахт (lib/mineConfig): вид и цена захвата. yield — стандарт вида
// (§8.59.1): v2 его не читает, а старым читателям шахта без выхода показалась
// бы «не настроенной».
import { mineBlueprintOf, type BlueprintResource } from "@/lib/mineBlueprint";
import type { AssetNature } from "@/lib/raid/assetTags";

/** Шахты, которым нужна природа вокруг. */
export const NATURE_BLUEPRINTS = ["wood", "stone"] as const;
export type NatureBlueprint = (typeof NATURE_BLUEPRINTS)[number];

/** Шахты, которые ставят только на жилу своего вида. */
export const VEIN_BLUEPRINTS = ["gold", "diamonds"] as const;
export type VeinBlueprint = (typeof VEIN_BLUEPRINTS)[number];

/** Виды шахт, которые игрок может поставить сейчас. */
export const PLACEABLE_BLUEPRINTS = [...NATURE_BLUEPRINTS, ...VEIN_BLUEPRINTS] as const;
export type PlaceableBlueprint = (typeof PLACEABLE_BLUEPRINTS)[number];

/** Природа вокруг шахты: дерево — для лесопилки, гора — для каменной. */
export type MineNature = AssetNature;

/** Шаблон постройки шахты на клетке. */
export const MINE_PLACE_BUILDING: Record<PlaceableBlueprint, string> = {
  wood: "building_yYIdx793rM",
  stone: "building_IbP4EseH2O",
  gold: "building_UbJz0SbcXB",
  diamonds: "building_JTzVEXzUQH",
};

/** Что должно стоять вокруг. */
export const MINE_PLACE_NATURE: Record<NatureBlueprint, MineNature> = {
  wood: "tree",
  stone: "mountain",
};

/** Вид жилы на клетке (raid_map_vein.kind). */
export type VeinKind = "gold" | "diamonds";

/** Какая жила нужна под клеткой. */
export const MINE_PLACE_VEIN: Record<VeinBlueprint, VeinKind> = {
  gold: "gold",
  diamonds: "diamonds",
};

/** Шахта ставится на жилу (а не по природе вокруг). */
export const isVeinBlueprint = (kind: PlaceableBlueprint): kind is VeinBlueprint =>
  (VEIN_BLUEPRINTS as readonly string[]).includes(kind);

/** Сколько деревьев или гор нужно среди шести соседних клеток. */
export const MINE_PLACE_NEED = 3;

/**
 * Цена захвата поставленной шахты в энергии — как у большинства нынешних шахт
 * этого вида на карте (прод 21.10.2026): дерево, камень, золото 10, алмаз 20.
 * Столько же энергии стоит и сама постановка чертежа (§8.59 п. 8).
 */
export const MINE_PLACE_CAPTURE_COST: Record<PlaceableBlueprint, number> = {
  wood: 10,
  stone: 10,
  gold: 10,
  diamonds: 20,
};

/** Энергия на постановку шахты по чертежу — та же, что на её захват. */
export const minePlaceEnergy = (kind: PlaceableBlueprint): number => MINE_PLACE_CAPTURE_COST[kind];

/** Режим стройки: чертёж ставят в этом гекс-радиусе вокруг героя (19 клеток). */
export const MINE_BUILD_RADIUS = 2;

/** Стандарт добычи в час (§8.59.1) — только для старых читателей building_config. */
export const MINE_PLACE_STD_YIELD: Record<PlaceableBlueprint, number> = {
  wood: 10,
  stone: 1,
  gold: 1,
  diamonds: 1,
};

export const isPlaceableBlueprint = (
  kind: BlueprintResource | null | undefined,
): kind is PlaceableBlueprint => (PLACEABLE_BLUEPRINTS as readonly string[]).includes(kind ?? "");

/** Заготовка по ключу стопки, если её можно поставить сейчас; иначе null. */
export function placeableBlueprintOf(ref: string | null | undefined): PlaceableBlueprint | null {
  const kind = mineBlueprintOf(ref);
  return isPlaceableBlueprint(kind) ? kind : null;
}

/** Настройка клетки новой шахты (building_config). */
export function minePlaceConfig(kind: PlaceableBlueprint): {
  resource: PlaceableBlueprint;
  captureCost: number;
  yield: number;
} {
  return {
    resource: kind,
    captureCost: MINE_PLACE_CAPTURE_COST[kind],
    yield: MINE_PLACE_STD_YIELD[kind],
  };
}

/** Соседи вокруг клетки: сколько деревьев и сколько гор. */
export type NatureAround = { trees: number; mountains: number };

/** Хватает ли природы вокруг для этого вида шахты. */
export function natureEnough(kind: NatureBlueprint, around: NatureAround): boolean {
  return natureCount(kind, around) >= MINE_PLACE_NEED;
}

/** Сколько нужного вида природы вокруг: деревьев для лесопилки, гор для камня. */
export function natureCount(kind: NatureBlueprint, around: NatureAround): number {
  const n = MINE_PLACE_NATURE[kind] === "tree" ? around.trees : around.mountains;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
