// Сборка карты целиком для одного из двух вариантов: игрок / админ.
//
// Вынесено из map.ts: раньше эта цепочка (снимок клеток → беглецы и убитые →
// зачистка купола → упаковка → словари → постройки → двери) выполнялась на
// КАЖДЫЙ запрос каждого игрока — 5–6 проходов по 82 тысячам клеток и seroval
// сверху. Теперь её зовёт снимок (map-snapshot): один раз на версию карты,
// результат кодируется в двоичный буфер и отдаётся всем как есть.
//
// Вариант зависит только от права видеть глухой туман (canIgnoreVoid): всё,
// что своё у игрока (туман войны, позиция, флажки), сюда не входит.
import { mapBaseAt } from "./map-base";
import { loadDefeated } from "./map-objects";
import { loadRunners } from "./runners";
import { dictObjectIds, overlayRunners } from "./map-runners";
import { cellRoadId } from "./map-roads";
import { buildAssetDicts } from "./map-assets";
import { sanitizeVoidCells, keepById, dropHiddenKeys } from "./voidSanitize";
import { dropDeadDecor } from "./dead-decor";
import { loadTownHallIds } from "./town-resolve";
import { loadMineCells } from "./mine-cells";
import { loadVeinCells, veinLookup } from "./vein-cells";
import { packCells, type PackedCells } from "./packCells";
import { skinDisplayName } from "@/lib/skinName";
import type { BuildingEffect } from "@/lib/buildingEffect";

export type MapVariant = "player" | "admin";

export type AssembledMap = {
  map: { id: string; name: string; size: number };
  terrains: Record<string, unknown>;
  objects: Record<string, unknown>;
  decorations: Record<string, unknown>;
  roads: Record<string, unknown>;
  packed: PackedCells;
  buildings: Record<
    string,
    { id: string; name: string; tiers: unknown[]; effect?: BuildingEffect }
  >;
  buildingTiers: Record<string, number>;
  doors: string[];
};

export async function assembleMap(
  map: { id: string; name: string; size: number },
  variant: MapVariant,
  /** Версия снимка: клетки должны быть не старее её (mapBaseAt). */
  minRev = 0,
): Promise<AssembledMap> {
  const seesVoid = variant === "admin";
  const baseSnap = await mapBaseAt(map.id, minRev);
  const [dead, runners] = await Promise.all([loadDefeated(map.id), loadRunners(map.id)]);
  const objectRows = baseSnap.objects;

  // Ссылка в никуда объектом не считается; убитый/собранный >5с — снят.
  const knownObjects = new Set((objectRows ?? []).map((o) => o.id));
  const liveCells = baseSnap.cells.map((c) => {
    if (!c.object_id) return c;
    if (!knownObjects.has(c.object_id) || dead.expired.has(`${c.q},${c.r}`))
      return { ...c, object_id: null };
    return c;
  });

  // Декор с удалённым шаблоном (dead-decor.ts) игроку не уезжает: без id нет
  // ни зелёной точки, ни стены для маршрута. Админу — уезжает как есть: ему
  // нужно ВИДЕТЬ мёртвую точку и снять её панелью клетки («Убрать»), а ластик
  // кисти стирает слой сверху вниз по клетке из кэша — спрятанный декор
  // подставил бы под него постройку или дорогу.
  const knownDecor = new Set(baseSnap.decorations.map((d) => d.id));
  const cellsForVariant = variant === "player" ? dropDeadDecor(liveCells, knownDecor) : liveCells;

  const overlay = overlayRunners({
    rows: cellsForVariant,
    runners,
    known: knownObjects,
    deadCells: dead.cells,
    deadRunners: dead.runners,
  });
  const { cells, hiddenKeys } = sanitizeVoidCells(overlay.cells, seesVoid);
  const [hallKeys, mineKeys, veinCells] = await Promise.all([
    loadTownHallIds(map.id).catch(() => new Set<string>()),
    loadMineCells(map.id),
    loadVeinCells(map.id),
  ]);
  const packed = packCells(
    cells,
    cellRoadId,
    (key) => overlay.defeatedKeys.has(key),
    (key) => overlay.runnerKeys.has(key),
    (key) => hallKeys.has(key),
    (key) => mineKeys.has(key),
    // Жила под куполом игроку не уезжает, как и всё содержимое клетки.
    veinLookup(veinCells, hiddenKeys),
  );

  const { skinKey, skinIdOf, skinsByIds } = await import("./building-skins");
  const { loadBuildingTemplates } = await import("./buildings");
  const buildingList = await loadBuildingTemplates(map.id);
  const buildings: AssembledMap["buildings"] = {};
  for (const b of keepById(buildingList, packed.buildingIds)) buildings[b.id] = b;
  const skinIds = packed.buildingIds.map(skinIdOf).filter((v): v is string => !!v);
  if (skinIds.length > 0) {
    const cellTemplate = new Map<string, string>();
    for (const c of cells) {
      if (c.building_skin_id && c.building_id) {
        cellTemplate.set(String(c.building_skin_id), String(c.building_id));
      }
    }
    const byId = new Map(buildingList.map((b) => [b.id, b]));
    for (const skin of await skinsByIds(skinIds)) {
      const base = byId.get(cellTemplate.get(skin.id) ?? "");
      // У базы может не быть ни одного тира (шаблон ратуши, заведённый
      // автоматически, — без картинок): тогда облик — один тир со своей
      // картинкой. Прежде пустой список базы давал облику ноль тиров, и карта
      // рисовала на месте ратуши серый квадрат (07.10, две ратуши).
      const baseTiers = base?.tiers?.length
        ? base.tiers
        : [{ name: skin.name, imageUrl: skin.image }];
      const tiers = baseTiers.map((t) => ({
        ...(t as Record<string, unknown>),
        imageUrl: skin.image,
      }));
      // Эффект — базовой постройки: облик меняет вид, а не механику (шахта
      // в облике — та же шахта, клиент по нему правит отметку из дельты).
      buildings[skinKey(skin.id)] = {
        id: skinKey(skin.id),
        name: skinDisplayName(skin.name, base?.name),
        tiers,
        effect: base?.effect ?? null,
      };
    }
  }
  const buildingTiers = dropHiddenKeys(baseSnap.buildingTiers, hiddenKeys);

  const { loadDoorCells } = await import("./gate-cells");
  const doors = (await loadDoorCells(map.id)).filter((k) => !hiddenKeys.has(k));

  const { terrains, objects, decorations, roads } = buildAssetDicts({
    terrainRows: keepById(baseSnap.terrains, packed.terrainIds),
    // + шаблоны беглецов под живым верхним: открывшись, они рисуются из словаря.
    objectRows: keepById(objectRows, dictObjectIds(packed.objectIds, runners, hiddenKeys)),
    decorRows: keepById(baseSnap.decorations, packed.decorationIds),
    roadRows: keepById(baseSnap.roads, packed.roadIds),
  });

  return { map, terrains, objects, decorations, roads, packed, buildings, buildingTiers, doors };
}
