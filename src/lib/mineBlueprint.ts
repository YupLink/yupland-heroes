// Заготовки шахт v2 (ПРАВИЛА §8.59.7): свои товары справочника, по одному на вид
// шахты. Делает их Архитектор замка (или герой-Строитель), ставит игрок из
// рюкзака. Товары и колонку raid_custom_item.mine_blueprint заводит миграция
// minev2-10-architect.sql — id здесь и там менять вместе.
//
// Виды — те же четыре, что MINE_V2_RESOURCES в lib/mineV2.ts; список свой,
// чтобы модуль не зависел от порядка слияния веток.
export const BLUEPRINT_RESOURCES = ["wood", "stone", "gold", "diamonds"] as const;
export type BlueprintResource = (typeof BLUEPRINT_RESOURCES)[number];

/** Вид шахты → id товара-заготовки. */
export const MINE_BLUEPRINT_ITEM: Record<BlueprintResource, string> = {
  wood: "cst_mine_bp_wood",
  stone: "cst_mine_bp_stone",
  gold: "cst_mine_bp_gold",
  diamonds: "cst_mine_bp_diamonds",
};

const BY_ITEM = new Map<string, BlueprintResource>(
  BLUEPRINT_RESOURCES.map((r) => [MINE_BLUEPRINT_ITEM[r], r]),
);

/**
 * Вид шахты по ключу стопки рюкзака («custom:cst_mine_bp_wood») или id товара
 * («cst_mine_bp_wood»). Не заготовка — null.
 */
export function mineBlueprintOf(ref: string | null | undefined): BlueprintResource | null {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  const id = raw.startsWith("custom:") ? raw.slice("custom:".length) : raw;
  return BY_ITEM.get(id) ?? null;
}

/** Вид шахты — подпись для игрока. */
export function blueprintLabel(kind: BlueprintResource, ru: boolean): string {
  const names: Record<BlueprintResource, [string, string]> = {
    wood: ["Лесопилка", "Sawmill"],
    stone: ["Каменная шахта", "Stone mine"],
    gold: ["Золотая шахта", "Gold mine"],
    diamonds: ["Алмазная шахта", "Diamond mine"],
  };
  return names[kind][ru ? 0 : 1];
}
