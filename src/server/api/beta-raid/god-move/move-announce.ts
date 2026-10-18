// Рассылка после переноса (режим бога): карта и слои у всех — сразу, без F5.
//
// Повтор того же переноса («уже там») рассылается так же: первый ответ мог
// потеряться вместе с рассылкой. Ошибка рассылки перенос не отменяет — он уже
// прошёл; карта догонит журналом.
//  • здание и блок — карта «перестроена» (списки ратуш и дверей живут в
//    снимке), окна построек всех затронутых клеток — «built», раскладка —
//    «restored»;
//  • декор без здания — точная дельта клеток (как у кисти), и мешочки под
//    декором: он их закрывает или открывает (§8.19);
//  • объект — правда слоя объектов обеих клеток (сверху объект, под ним
//    беглец — map-change-hooks), «restored» (списки повергнутых по клеткам);
//  • сундук — «built» (слой сундуков и охраны) и мешочки (бугорки);
//  • мешочки — «bags».
// Мешочки — событием на КАЖДУЮ клетку: многоклеточное до игроков не доходит.
import { publishRaid } from "@/server/raidLive";
import { withoutVoid } from "@/server/api/beta-raid/voidCells";
import { cellPatches, type GodCell, type GodMoveParts, type GodMovedCell } from "@/lib/godMove";

const key = (c: GodCell): string => `${c.q},${c.r}`;

const bagsAt = (mapId: string, cells: GodCell[]): void => {
  for (const c of cells) publishRaid({ mapId, type: "bags", cells: [key(c)] });
};

/** Окна построек затронутых клеток — кроме клеток под глухим куполом. */
async function builtAt(mapId: string, cells: GodCell[]): Promise<void> {
  const visible = await withoutVoid(mapId, cells.map(key)).catch(() => [] as string[]);
  if (visible.length > 0) publishRaid({ mapId, type: "built", cells: visible });
}

/** Здание, блок или декор. cells — что стало (у повтора пусто), touched — все клетки. */
export async function announceUnit(
  mapId: string,
  o: {
    cells: GodMovedCell[];
    touched: GodCell[];
    parts: GodMoveParts;
  },
): Promise<void> {
  const hooks = await import("@/server/api/beta-raid/map-change-hooks");
  if (o.parts.building || o.cells.length === 0) await hooks.noteMapRebuilt(mapId);
  else await hooks.noteAdminPatches(mapId, cellPatches(o.cells, o.parts));
  if (o.parts.building) await builtAt(mapId, o.touched);
  if (o.parts.decor) {
    bagsAt(mapId, o.touched);
    const { dropAffinityCache } = await import("@/server/api/beta-raid/zonegen/affinity");
    dropAffinityCache(mapId);
  }
  publishRaid({ mapId, type: "restored" });
}

/** Объект: правда слоя объектов обеих клеток — с поднятием версии правок. */
export async function announceObject(
  mapId: string,
  from: GodCell,
  to: GodCell,
  bagsFrom: boolean,
): Promise<void> {
  try {
    const { cellTruthPatches } = await import("@/server/api/beta-raid/map-change-hooks");
    const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
    const patches = await cellTruthPatches(mapId, [key(from), key(to)]);
    if (patches.length > 0) await recordMapChange(mapId, { patches }, undefined, { edit: true });
  } catch (e) {
    console.warn("[godmove] дельта объекта не разослана:", (e as Error).message);
  }
  const { dropFleeCache } = await import("@/server/api/beta-raid/flee-cells");
  dropFleeCache(mapId);
  if (bagsFrom) bagsAt(mapId, [from]);
  publishRaid({ mapId, type: "restored" });
}

/** Сундук: слой сундуков и охраны («built»), бугорки — слоем мешочков. */
export async function announceChest(mapId: string, from: GodCell, to: GodCell): Promise<void> {
  await builtAt(mapId, [from, to]);
  bagsAt(mapId, [from, to]);
}

/** Мешочки: слой мешочков обеих клеток. */
export function announceBags(mapId: string, from: GodCell, to: GodCell): void {
  bagsAt(mapId, [from, to]);
}
