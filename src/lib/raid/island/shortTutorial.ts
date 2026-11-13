// Короткая история Кай (02.11.2026). Только новые острова тестовой проходки.
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import { ISLAND_SELL, ISLAND_CHEST_GIFT } from "./loot";
import { SHIP_PRICE_LIKES } from "@/lib/buildingEffect";

export const SHORT_STEP_IDS = [
  "hello", "hero_pick", "hero", "chest", "chest_backpack", "sell",
  "axe", "chop", "slime", "slime_loot", "boat", "sail", "spell",
] as const;
export type ShortStepId = (typeof SHORT_STEP_IDS)[number];
export type ShortLesson = { version: 1; water: Cell[]; shore: Cell; pillar?: Cell; islet?: Cell[] };
// Продажа слитка оплачивает топор целиком, материалы лодки продавать не надо.
export const SHORT_AXE_GOLD = ISLAND_SELL.find((s) => s.item === "goldIngot")!.amount;
export const SHORT_SHIP_LIKES = SHIP_PRICE_LIKES + ISLAND_CHEST_GIFT.likes;

const disk = (at: Cell, radius: number): Cell[] => {
  const out: Cell[] = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = -radius; r <= radius; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius)
        out.push({ q: at.q + q, r: at.r + r });
  return out;
};

/** Озеро в свободной суше. Города, дороги и шаблон Кай не перерисовываем. */
export function shortLake(cells: readonly WorldCell[], waterId: string, water: ReadonlySet<string>, town: Cell, protectedCells: ReadonlySet<string> = new Set(), withPillar = false) {
  const at = new Map(cells.map((c) => [keyOf(c), c]));
  const free = (p: Cell) => {
    const c = at.get(keyOf(p));
    return !!c && !protectedCells.has(keyOf(c)) && !water.has(keyOf(c)) && !c.buildingId && !c.roadId && !c.groupId && !c.objectId;
  };
  const radius = withPillar ? 4 : 3;
  const center = cells.filter((c) => hexDist(c, town) >= radius + 4 && disk(c, radius).every(free))
    .sort((a, b) => hexDist(a, town) - hexDist(b, town) || a.q - b.q || a.r - b.r)[0];
  if (!center) throw new Error("Не удалось разместить озеро обучения. Попробуй создать остров ещё раз.");
  // Seven land cells surrounded by TWO complete rings of water: no foot path,
  // and the central pillar cannot be activated while still aboard the boat.
  const islet = withPillar ? disk(center, 1) : [];
  const lake = withPillar ? disk(center, 3).filter((c) => hexDist(c, center) > 1) : disk(center, 2);
  const reserved = new Set(disk(center, radius).map(keyOf));
  const wet = new Set(lake.map(keyOf));
  const yard = { q: center.q - radius, r: center.r };
  const shore = { q: center.q + (withPillar ? -1 : 3), r: center.r };
  return {
    cells: cells.map((c): WorldCell => !reserved.has(keyOf(c)) ? c : ({
      ...c, terrainId: wet.has(keyOf(c)) ? waterId : c.terrainId,
      decorationId: null, objectId: null, objectConfig: null, buildingId: null,
      buildingSkinId: null, buildingConfig: null, tier: null, roadId: null, mode: "built",
    })),
    reserved, yard, lesson: { version: 1, water: lake, shore,
      ...(withPillar ? { pillar: { q: center.q, r: center.r }, islet } : {}),
    } satisfies ShortLesson,
  };
}
