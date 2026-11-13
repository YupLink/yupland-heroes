// Словари ассетов карты: местность, объекты, декор, дороги.
// Вынесено из map.ts — там остаётся сам запрос карты (правило ≤250 строк).

export type TerrainDict = Record<
  string,
  {
    id: string;
    name: string;
    imageUrl: string | null;
    cost: number;
  }
>;
export type ObjectDict = Record<
  string,
  {
    id: string;
    name: string;
    imageUrl: string | null;
    mapImageUrl: string | null;
    meta: unknown;
    kind: string | null;
    /** Редкость артефакта: карта красит по ней ободок и свечение. */
    rarity: string | null;
    /** Уровень босса — то же самое, но по силе, а не по редкости. */
    level: number | null;
  }
>;
export type DecorDict = Record<string, { id: string; name: string; imageUrl: string | null; bridge?: unknown }>;

export function buildAssetDicts(rows: {
  terrainRows: Array<{
    id: string;
    name: string;
    image_url: string | null;
    stat_amount: number | null;
  }> | null;
  objectRows: Array<{
    id: string;
    name: string;
    image_url: string | null;
    map_image_url: string | null;
    meta: unknown;
    kind: string | null;
    rarity: string | null;
    level: number | null;
  }> | null;
  decorRows: Array<{ id: string; name: string; image_url: string | null; meta?: unknown }> | null;
  roadRows: Array<{
    id: string;
    name: string;
    image_url: string | null;
    stat_amount: number | null;
  }> | null;
}): { terrains: TerrainDict; objects: ObjectDict; decorations: DecorDict; roads: TerrainDict } {
  const terrains: TerrainDict = {};
  for (const t of rows.terrainRows ?? []) {
    terrains[t.id] = {
      id: t.id,
      name: t.name,
      imageUrl: t.image_url,
      cost: Number(t.stat_amount) || 1,
    };
  }

  // imageUrl — боевая картинка (окно боя), mapImageUrl — только для карты.
  const objects: ObjectDict = {};
  for (const o of rows.objectRows ?? []) {
    objects[o.id] = {
      id: o.id,
      name: o.name,
      imageUrl: o.image_url,
      mapImageUrl: o.map_image_url || o.image_url,
      meta: o.meta ?? null,
      kind: o.kind ?? null,
      // Редкость артефакта и уровень босса — карта рисует ими ободок.
      rarity: o.rarity ?? null,
      level: o.level ?? null,
    };
  }

  const decorations: DecorDict = {};
  for (const d of rows.decorRows ?? []) {
    const meta = d.meta && typeof d.meta === "object" ? d.meta as Record<string, unknown> : null;
    decorations[d.id] = { id: d.id, name: d.name, imageUrl: d.image_url, bridge: meta?.bridge ?? null };
  }

  const roads: TerrainDict = {};
  for (const rd of rows.roadRows ?? []) {
    // У дорог тумана не бывает: непроходимость — свойство самой земли.
    roads[rd.id] = {
      id: rd.id,
      name: rd.name,
      imageUrl: rd.image_url,
      cost: Number(rd.stat_amount) || 1,
    };
  }

  return { terrains, objects, decorations, roads };
}
