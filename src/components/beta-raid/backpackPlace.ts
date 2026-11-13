// «Поставить» из рюкзака: что ставится на карту (окно выбора клетки — в
// BackpackPlacePicker).
//
//  · Магический сундук — на клетку под героем, с охраной-боссом или без.
//  · Обычный сундук (§8.22) — под себя или на соседнюю клетку.
//  · Заготовка шахты (§8.59.8) — все четыре вида, под себя или рядом; золотая
//    и алмазная — на жилу своего вида (отказ — от сервера).
//  · Забранная DARAI-шахта (lib/daraiMine) — под себя или рядом, за час.
//  · Купленное дерево (lib/treePlant) — «Посадить» под себя или рядом.
//  · Динамит (lib/dynamite) — «Бросить» на клетку в радиусе 3.
//  · Земля мира строителей (lib/landPlace) — «Положить» в пустоту в радиусе 3.
//  · Жила золота или алмазов (lib/veinPlace) — «Положить» накладкой в радиусе 3.
//  · Постройка из лавки построек (lib/buildingSale) — «Поставить» в радиусе 3.
//
// Одно правило на оба рюкзака (BackpackGrid и окно героя в замке), чтобы «у кого
// есть кнопка» не разъехалось между ними.
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { isChestStack } from "@/components/beta-raid/chest/useChestActions";
import { placeableBlueprintOf } from "@/lib/minePlacement";
import { isDaraiMineKey } from "@/lib/daraiMine";
import { isTreeStackKey } from "@/lib/treePlant";
import { isDynamiteKey } from "@/lib/dynamite";
import { isLandStackKey } from "@/lib/landPlace";
import { isVeinStackKey } from "@/lib/veinPlace";
import { isBuildingStackKey } from "@/lib/buildingSale";

export type PlaceKind =
  | "chest"
  | "plain"
  | "mine"
  | "darai"
  | "tree"
  | "dynamite"
  | "land"
  | "vein"
  | "building";

/** Чем ставится стопка; null — не ставится вовсе (кнопки «Поставить» нет). */
export function placeKindOf(s: BackpackStack): PlaceKind | null {
  if (isDaraiMineKey(s.stackKey)) return "darai";
  if (isTreeStackKey(s.stackKey)) return "tree";
  if (isDynamiteKey(s.stackKey)) return "dynamite";
  if (isLandStackKey(s.stackKey)) return "land";
  if (isVeinStackKey(s.stackKey)) return "vein";
  if (isBuildingStackKey(s.stackKey)) return "building";
  if (s.plainChest === true) return "plain";
  if (isChestStack(s)) return "chest";
  if (placeableBlueprintOf(s.stackKey)) return "mine";
  return null;
}

/** Ключи стопок, у которых есть «Поставить». */
export const placeableKeys = (stacks: readonly BackpackStack[]): Set<string> =>
  new Set(stacks.filter((s) => placeKindOf(s) !== null).map((s) => s.stackKey));
