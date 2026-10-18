// Сгенерировать зону по рецепту — server fn для кисти режима бога.
//
// В базу здесь НИЧЕГО не пишется: сервер отдаёт патчи, клиент кладёт их в
// очередь кисти, админ смотрит на превью и сам жмёт «Выгрузить» (тем же
// adminPatchCells, что и ручная кисть). Так генерация не обходит ни одну
// проверку выгрузки, а «не понравилось» стоит одной кнопки «Перегенерировать».
//
// Сервер нужен ради двух вещей, которых у клиента нет: опыта карты (какой
// декор на какой местности ставил админ) и списка занятых клеток на этот
// момент — игроки ходят, беглецы бегают, и клиентский снимок карты этого не
// знает.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ZONE_MAX_CELLS,
  zoneRecipeSchema,
  type ZoneGenerateOutput,
} from "@/lib/raid/zonegen/recipe";
import { requireAdmin } from "@/server/auth";
import { godMapId } from "@/server/api/beta-raid/god-map";
import { loadAffinity } from "./affinity";
import { loadDecorTerrains } from "../asset-tags";
import { addBusy, loadOccupied, loadRoads } from "./occupied";
import { loadTerrainCatalog, namesById } from "./catalog";
import { planZoneSettlements } from "./generate-settlement";

const cellSchema = z.object({ q: z.number().int(), r: z.number().int() });

export const zoneGenerateInputSchema = z.object({
  cells: z.array(cellSchema).min(1).max(ZONE_MAX_CELLS),
  recipe: zoneRecipeSchema,
  /**
   * Карта, на которой зону выделяли. Необязательно (кэш карты у клиента мог
   * ещё не приехать), но если прислали — сверяем: черновик с чужой карты по
   * тем же координатам ложится на живую (та же ловушка, что у adminPatchCells).
   */
  mapId: z.string().optional(),
  /**
   * Клетки, занятые НЕВЫГРУЖЕННЫМИ правками очереди кисти. База их не видит:
   * постройки прошлого прогона лежат у клиента, и без этого списка второй
   * прогон ставил дома поверх домов первого (владелец, 24.09).
   */
  busy: z.array(cellSchema).max(ZONE_MAX_CELLS).optional(),
});

/** Рецепт ссылается только на существующие местности — иначе патчи с «дырой». */
export function assertKnownTerrains(
  recipe: { layers: Array<{ terrainId: string }> },
  terrainNames: Record<string, string>,
): void {
  const missing = recipe.layers.map((l) => l.terrainId).filter((id) => !(id in terrainNames));
  if (missing.length > 0) {
    throw new Error(`В рецепте нет такой местности: ${[...new Set(missing)].join(", ")}`);
  }
}

export const adminZoneGenerate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => zoneGenerateInputSchema.parse(d))
  .handler(async ({ data }): Promise<ZoneGenerateOutput> => {
    requireAdmin();
    const mapId = await godMapId();
    if (data.mapId && data.mapId !== mapId) {
      throw new Error(
        `Карта сменилась — зона не сгенерирована: она выделена на «${data.mapId}», ` +
          `а сейчас активна «${mapId}»`,
      );
    }
    const terrainNames = namesById(await loadTerrainCatalog());
    assertKnownTerrains(data.recipe, terrainNames);
    const [affinity, dbOccupied, roads] = await Promise.all([
      // Опыт карты + метки декора (к какой местности он относится).
      Promise.all([loadAffinity(mapId), loadDecorTerrains()]).then(([a, decorTerrains]) => ({
        ...a,
        decorTerrains,
      })),
      loadOccupied(mapId, data.cells),
      loadRoads(mapId, data.cells),
    ]);
    // Очередь кисти — тоже занятость, и учесть её надо ДО обоих проходов:
    // генератор по этим клеткам не красит, планировщик по ним не строит.
    const occupied = addBusy(dbOccupied, data.busy);
    // Сам генератор — чистая функция без базы (src/lib/raid/zonegen), общая с
    // клиентским превью; здесь только собираем ему входы.
    const { generateZone } = await import("@/lib/raid/zonegen/generate");
    const { patches, report } = generateZone({
      cells: data.cells,
      occupied,
      recipe: data.recipe,
      affinity,
      terrainNames,
      roads,
    });
    // Поселения ставятся ПОВЕРХ посчитанной местности и только по её клеткам:
    // дом на клетке, которой генератор не коснулся, остался бы без своей земли.
    const settlement = await planZoneSettlements({
      recipe: data.recipe,
      patches,
      occupied,
      roads,
      terrainNames,
      mapId,
      cells: data.cells,
    });
    if (!settlement) return { mapId, patches, report };
    return {
      mapId,
      patches,
      structures: settlement.structures,
      report: { ...report, settlement: settlement.report },
    };
  });
