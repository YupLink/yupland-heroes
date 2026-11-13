// Правка боевой карты на ходу: по одной клетке, без «сохранить всё».
//
// Сохранение целиком (редактор) переписывает карту и вычищает клетки, которых
// в наборе не оказалось. Для живой карты это слишком крупный шаг: пока админ
// правит, игроки ходят и строят. Здесь каждая операция трогает ровно то, что
// названо, поднимает версию карты и тут же сообщает об изменении всем.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { godMapId } from "./god-map";
import { publishRaid } from "../../raidLive";
import { withoutVoid } from "./voidCells";
import { dropVoidCache } from "./voidCells";
import { dropFleeCache } from "./flee-cells";
import { CELL_LAYER } from "./runners";
import { defeatObjectSql } from "./admin-defeat-sql";
import { roadColumn } from "./map-roads";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";
import { ensureTownSchema, handleBuildingChange, readCellBuildingId } from "./town-resolve";
import { assertUsdtPatches } from "../usdt-cells";
import { liftedBlockMine } from "@/server/api/beta-raid/mine-block-sync";

const cell = { q: z.number().int(), r: z.number().int() };

// Версия карты теперь растёт в журнале (map-journal.recordMapChange) — там
// же, где правка уходит игрокам дельтой; отдельный BUMP дублировал бы её.

const sqlOrNull = (v: string | null | undefined) => (v ? sqlStr(v) : "NULL");

/** Правка клетки трогает только ЕЁ слой: под объектом может стоять беглец
 *  со своим боевым состоянием и своей наградой (runners.ts). */
const LAYER_ONLY_CELL = ` AND cycle_no = ${CELL_LAYER}`;

/**
 * Слои клетки: местность, дорога, декор, объект, постройка. Присланное
 * заменяет старое, `null` — снимает слой, пропущенное — не трогаем.
 *
 * Особняком `voidFog`: это не слой, а купол ПОВЕРХ клетки. Он пишет одну
 * свою колонку и ничего под собой не меняет — снял, и клетка ровно та же.
 */
export const adminPatchCell = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ...cell,
        terrainId: z.string().nullable().optional(),
        /** Дорога клетки; null — снять. Дорога ОДНА, кисть её ЗАМЕНЯЕТ. */
        roadId: z.string().nullable().optional(),
        decorationId: z.string().nullable().optional(),
        objectId: z.string().nullable().optional(),
        buildingId: z.string().nullable().optional(),
        /** true — накрыть куполом, false — снять, пропущено — не трогать. */
        voidFog: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    if (data.objectId !== undefined)
      await assertUsdtPatches(mapId, [{ ...data, resetConfig: true }], "объект с USDT");
    // Постройка меняется — ниже реестр ратуш (handleBuildingChange): схему
    // готовим заранее.
    if (data.buildingId !== undefined) await ensureTownSchema();
    // Что стояло ДО правки — понадобится ниже, чтобы понять, была ли ратуша.
    // Спрашиваем только когда меняется постройка: одна лишняя SQL по клетке.
    const oldBuildingId =
      data.buildingId !== undefined ? await readCellBuildingId(mapId, data.q, data.r) : null;
    const sets: string[] = [];
    // Колонку дороги собирает общий разбор (map-roads.roadColumn): кисть режима
    // бога ЗАМЕНЯЕТ дорогу и склеек больше не плодит.
    const road = roadColumn(data);
    if (data.terrainId !== undefined) sets.push(`terrain_id = ${sqlOrNull(data.terrainId)}`);
    if (road !== undefined) sets.push(`road_id = ${sqlOrNull(road)}`);
    if (data.decorationId !== undefined)
      sets.push(`decoration_id = ${sqlOrNull(data.decorationId)}`);
    if (data.objectId !== undefined) {
      sets.push(`object_id = ${sqlOrNull(data.objectId)}`);
      // Настройки уходят вместе с объектом: иначе следующий, поставленный на
      // эту клетку, унаследовал бы чужие HP и награды.
      sets.push("object_config = NULL");
    }
    if (data.buildingId !== undefined) {
      sets.push(`building_id = ${sqlOrNull(data.buildingId)}`);
      // Как и у объекта: текст таблички принадлежал прежней постройке, и
      // поставленная поверх верфь не должна унаследовать чужое послание.
      sets.push("building_config = NULL");
      // Облик тоже принадлежал прежней постройке — снимаем, иначе карта рисует
      // по building_skin_id и «убрать» оставляет визуал висеть на клетке.
      sets.push("building_skin_id = NULL");
    }
    if (data.voidFog !== undefined) sets.push(`void_fog = ${data.voidFog}`);
    if (sets.length === 0) throw new Error("Нечего менять");

    // Клетка без местности в игре не рисуется вовсе: постройка на ней стала бы
    // невидимой преградой. Пускаем только вместе с землёй под ногами.
    // Купол тоже требует земли: клетка без местности в игре не существует,
    // и накрывать было бы нечего — зато в базе завёлся бы призрак.
    const puttingThing =
      !!data.objectId ||
      !!data.buildingId ||
      !!data.decorationId ||
      !!road ||
      data.voidFog === true;
    if (puttingThing && data.terrainId === undefined) {
      const ground = (await mcpExec(
        `SELECT terrain_id FROM yuplink.raid_map_cells
          WHERE map_id = ${sqlStr(mapId)} AND q = ${data.q} AND r = ${data.r} LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ terrain_id: string | null }>;
      if (!ground?.[0]?.terrain_id) throw new Error("Сначала поставь местность");
    }

    // Всё одним походом в базу: каждый отдельный запрос к MCP стоит около
    // ста миллисекунд, и правка клетки заметно «думала» на пустом месте.
    const cellWhere = `map_id = ${sqlStr(mapId)} AND q = ${data.q} AND r = ${data.r}`;
    const extra: string[] = [];
    // Сменили или сняли объект — снимаем и его боевое состояние, иначе новый
    // объект на этой клетке появится сразу «поверженным».
    if (data.objectId !== undefined) {
      extra.push(`DELETE FROM yuplink.beta_raid_object_hp WHERE ${cellWhere}${LAYER_ONLY_CELL};`);
      // Беглец, спрятавшийся на этой клетке (свой слой beta_raid_runner), тоже
      // уходит вместе с боевым состоянием слоя (cycle 1). Иначе моб «убрал — а
      // он снова тут»: режим бога чистил только объект клетки, а беглец жил
      // отдельной строкой и оставался на карте / воскресал кнопкой «Восстановить».
      extra.push(`DELETE FROM yuplink.beta_raid_runner WHERE ${cellWhere};`);
      extra.push(`DELETE FROM yuplink.beta_raid_object_hp WHERE ${cellWhere} AND cycle_no = 1;`);
    }
    // Сняли ИЛИ заменили постройку — забываем её тир, чтобы следующая не
    // выросла готовой на оплаченном кем-то уровне.
    if (data.buildingId !== undefined) {
      extra.push(`DELETE FROM yuplink.beta_raid_building_state WHERE ${cellWhere};`);
    }

    // Обеспечение наград карты: смена объекта двигает залог из пула, поэтому
    // снимок берём ДО правки — потом уже не видно, что на клетке стояло.
    const hold =
      data.objectId !== undefined ? await readDaraiHold(mapId, [{ q: data.q, r: data.r }]) : null;
    await mcpExec(
      `INSERT INTO yuplink.raid_map_cells (map_id, q, r, terrain_id, road_id, object_id, decoration_id, building_id, void_fog, saved_at)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${sqlOrNull(data.terrainId)},
               ${sqlOrNull(road)}, ${sqlOrNull(data.objectId)},
               ${sqlOrNull(data.decorationId)}, ${sqlOrNull(data.buildingId)},
               ${data.voidFog === true}, now())
       ON CONFLICT (map_id, q, r) DO UPDATE SET ${sets.join(", ")}, saved_at = now();
       ${extra.join("\n")}`,
      { wrapJson: false },
    );
    if (hold) await settleDaraiHold(hold);
    // Ратуша появилась/исчезла на клетке — занести в реестр или убрать из него.
    if (data.buildingId !== undefined) {
      await handleBuildingChange(mapId, data.q, data.r, oldBuildingId, data.buildingId);
    }
    // Клетку могли накрыть куполом или снять его — снимок зоны для фильтра
    // тумана войны больше не годится.
    dropVoidCache(mapId);
    // Объект на клетке мог смениться — снимок «кто здесь убегает» устарел.
    dropFleeCache(mapId);
    // Босса нередко ставят прямо на воду, где уже стоит судно: шаг туда сервер
    // запрещает, и корабль превращается в недоступную декорацию. Переносим его
    // на свободную воду сразу, а не ждём жалобы «не могу сесть».
    const { rescueStuckShips } = await import("./ship-rescue");
    const rescued = await rescueStuckShips(mapId).catch(() => null);
    if (rescued?.moved) publishRaid({ mapId, type: "ships" });
    // Журнал карты: правка уходит игрокам дельтой со словарями новых ассетов.
    // Смена постройки — «карта перестроена»: окна построек и списки ратуш
    // перечитываются целиком, а не по одной клетке.
    // Купол сняли с члена блока-шахты — патч шахту не передаст (mine-block-sync).
    const { noteAdminPatches, noteMapRebuilt } = await import("./map-change-hooks");
    const blockMine = await liftedBlockMine(mapId, data);
    if (data.buildingId !== undefined || blockMine) await noteMapRebuilt(mapId);
    else {
      await noteAdminPatches(mapId, [
        {
          q: data.q,
          r: data.r,
          ...(data.terrainId !== undefined ? { terrainId: data.terrainId ?? null } : {}),
          ...(data.roadId !== undefined ? { roadId: road ?? null } : {}),
          ...(data.objectId !== undefined
            ? { objectId: data.objectId ?? null, alive: true, runner: false }
            : {}),
          ...(data.decorationId !== undefined ? { decorationId: data.decorationId ?? null } : {}),
          ...(data.voidFog !== undefined ? { voidFog: data.voidFog === true } : {}),
        },
      ]);
    }
    publishRaid({ mapId, type: "restored" });
    return { ok: true as const };
  });

/** Оживить объект или, наоборот, погасить — точечно, а не «всех сундуков разом». */
export const adminSetObjectAlive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ...cell, alive: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    if (data.alive) await assertUsdtPatches(mapId, [data], "оживление объекта с USDT");
    const where = `map_id = ${sqlStr(mapId)} AND q = ${data.q} AND r = ${data.r}`;
    // Оживили — объект снова обещан игроку и снова держит номинал из пула;
    // «погасили» невскрытым — номинал возвращается туда же.
    const hold = await readDaraiHold(mapId, [{ q: data.q, r: data.r }]);
    await mcpExec(
      data.alive
        ? // Живой объект — это отсутствие записи о его смерти.
          `DELETE FROM yuplink.beta_raid_object_hp WHERE ${where}${LAYER_ONLY_CELL}`
        : // Запас HP берётся из шаблона объекта (admin-defeat-sql): с нулём в
          // max_hp кнопка «Восстановить» такой объект уже не поднимала —
          // current_hp = max_hp возвращало его к нулю, то есть добытым.
          `${defeatObjectSql(mapId, data.q, data.r)}`,
      { wrapJson: false },
    );
    await settleDaraiHold(hold);
    const { noteCellsChanged } = await import("./map-change-hooks");
    await noteCellsChanged(mapId, [`${data.q},${data.r}`]);
    publishRaid({ mapId, type: "restored" });
    return { ok: true as const };
  });

/** Тир постройки: выдать верфь готовой или откатить к недострою. */
export const adminSetBuildingTier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ...cell, tier: z.number().int().min(0) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    await mcpExec(
      `INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${data.tier}, now(), 'admin')
       ON CONFLICT (map_id, q, r) DO UPDATE SET tier = ${data.tier}, updated_at = now(), updated_by = 'admin';`,
      { wrapJson: false },
    );
    // Админ строит и внутри глухого тумана — но координаты зоны в общий поток
    // не уходят: игроки её не видят, а событие им нужно только как повод
    // перечитать свою (уже зачищенную) карту.
    publishRaid({ mapId, type: "built", cells: await withoutVoid(mapId, [`${data.q},${data.r}`]) });
    const { recordMapChange } = await import("./map-journal");
    await recordMapChange(
      mapId,
      { patches: [{ q: data.q, r: data.r, tier: data.tier }] },
      undefined,
      {
        edit: true,
      },
    ).catch(() => 0);
    return { ok: true as const };
  });
