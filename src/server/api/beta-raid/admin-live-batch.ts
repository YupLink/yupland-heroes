// Выгрузка накопленных правок карты одним махом.
//
// Ставить объекты по одному — это по запросу на клетку и ожидание после
// каждого тапа. В режиме бога админ сначала «накидывает» кистью, а потом жмёт
// «Выгрузить»: сюда приезжает весь набор и уходит в базу единственным запросом.
import { createServerFn } from "@tanstack/react-start";
import { dropOrphanGroupsSql, ensureGroupColumns } from "./map-groups-schema";
import { patchSchema } from "./admin-cell-patch";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { godMapId } from "./god-map";
import { assertUsdtPatches } from "../usdt-cells";
import { publishRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { dropVoidCache, withoutVoid } from "./voidCells";
import { dropFleeCache } from "./flee-cells";
import { roadColumn } from "./map-roads";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";
import { ensureTownSchema, handleBuildingChange, readOldBuildings } from "./town-resolve";
import { cellStatements } from "./admin-cell-sql";

/**
 * Сколько клеток берём за одну выгрузку. Клиент режет очередь на пачки по
 * этому же числу (импортирует константу отсюда) — иначе стороны разъезжаются
 * и длинный черновик уходит в отказ схемы вместо базы.
 */
export const ADMIN_PATCH_MAX_CELLS = 500;

export type { AdminCellPatch } from "./admin-cell-patch";

export const adminPatchCells = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        cells: z.array(patchSchema).min(1).max(ADMIN_PATCH_MAX_CELLS),
        /**
         * Карта, на которой черновик набирался. Необязательное: старый клиент
         * его не шлёт и падать из-за этого не должен. Прислали — сверяем.
         */
        mapId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    // USDT на объектах — живые деньги: сверх «свободно − запас» не пишем (§8.49а).
    await assertUsdtPatches(mapId, data.cells, "кисть с USDT");
    // Блоки (group_id/icon_scale): колонки дорастают перед первой выгрузкой.
    if (data.cells.some((c) => c.groupId !== undefined || c.iconScale !== undefined)) {
      await ensureGroupColumns();
    }
    // Постройки трогаются — ниже реестр ратуш (handleBuildingChange).
    if (data.cells.some((c) => c.buildingId !== undefined)) await ensureTownSchema();
    // Старые building_id пачкой (для handleBuildingChange ниже).
    const oldBuildings = await readOldBuildings(
      mapId,
      data.cells.filter((c) => c.buildingId !== undefined),
    );
    // Черновик мог накопиться на ДРУГОЙ карте: админ ушёл порталом на другой
    // этаж, пока красил, или черновик пролежал в localStorage с прошлого раза.
    // Без сверки правки легли бы по тем же координатам чужой карты.
    if (data.mapId && data.mapId !== mapId) {
      throw new Error(
        `Карта сменилась — правки не применены: они собраны для «${data.mapId}», ` +
          `а ты сейчас на карте «${mapId}». Черновик остался в очереди.`,
      );
    }

    // Клетка без местности в игре не рисуется: объект на ней стал бы
    // невидимой преградой, а купол — накрыл бы пустоту. Такие пропускаем и
    // называем поимённо — клиент по этому списку оставляет их в очереди, а не
    // выкидывает как применённые.
    const needGround = data.cells.filter(
      (c) =>
        c.terrainId === undefined &&
        (!!c.objectId ||
          !!c.buildingId ||
          !!c.decorationId ||
          !!roadColumn(c) ||
          !!c.groupId ||
          c.voidFog === true),
    );
    let skipped: string[] = [];
    if (needGround.length > 0) {
      const pairs = needGround.map((c) => `(${c.q}, ${c.r})`).join(",");
      const rows = (await mcpExec(
        `SELECT q, r FROM yuplink.raid_map_cells
          WHERE map_id = ${sqlStr(mapId)} AND (q, r) IN (${pairs}) AND terrain_id IS NOT NULL;`,
        { wrapJson: true },
      )) as Array<{ q: number; r: number }>;
      const withGround = new Set((rows ?? []).map((x) => `${Number(x.q)},${Number(x.r)}`));
      skipped = needGround.map((c) => `${c.q},${c.r}`).filter((key) => !withGround.has(key));
    }

    const skip = new Set(skipped);
    const applied = data.cells.filter((c) => !skip.has(`${c.q},${c.r}`));
    const statements = applied.flatMap((c) => cellStatements(mapId, c));
    if (statements.length === 0) {
      return { ok: true as const, applied: 0, skipped };
    }

    // Обеспечение наград: снимок ДО правки — после неё уже не спросить, кто
    // опустошил объект, игрок или админ. Спрашиваем только клетки с объектом.
    const daraiCells = applied.filter(
      (c) => c.objectId !== undefined || c.objectConfig !== undefined || c.alive !== undefined,
    );
    const hold = await readDaraiHold(mapId, daraiCells);

    await mcpExec(statements.join("\n"), { wrapJson: false });
    // Пачка трогала блоки — снимаем группу с одиночек (отменённый член и т.п.).
    if (applied.some((c) => c.groupId !== undefined)) {
      await mcpExec(dropOrphanGroupsSql(sqlStr(mapId)), { wrapJson: false }).catch(() => undefined);
    }
    // Новые объекты закладывают номинал, снятые невскрытыми — возвращают.
    await settleDaraiHold(hold);
    // Ратуши: сравнить старое/новое building_id и обновить реестр.
    for (const c of applied) {
      // Ратуша может измениться и БЕЗ смены building_id — если админ поменял
      // building_config.effect (override клетки). Триггерим handleBuildingChange
      // также по правке конфига: внутри он читает isCellTownHall и решит сам.
      if (c.buildingId !== undefined || c.buildingConfig !== undefined) {
        const old = oldBuildings.get(`${c.q},${c.r}`) ?? null;
        const now = c.buildingId !== undefined ? c.buildingId : old;
        await handleBuildingChange(mapId, c.q, c.r, old, now);
      }
    }

    // Пачка могла и накрыть зону туманом, и снять его — снимок сбрасываем.
    dropVoidCache(mapId);
    dropFleeCache(mapId);
    // Пачка могла накрыть объектом клетку с судном — тогда на него не ступить.
    // Вытаскиваем такие суда на свободную воду (см. ship-rescue).
    const { rescueStuckShips } = await import("./ship-rescue");
    const rescued = await rescueStuckShips(mapId).catch(() => null);
    if (rescued?.moved) publishRaid({ mapId, type: "ships" });
    // Жёстко выбрасываем снапшот: тот же администратор сейчас перечитает
    // карту, и на stale-ответе его оптимистический патч (buildingId=null,
    // например) откатывался бы обратно — «удалил постройку, всё вернулось
    // до F5» (жалоба владельца).
    purgeMapBase(mapId);
    // Журнал карты: пачка уходит игрокам дельтой (со словарями новых ассетов);
    // «alive» в патче — не слой, слой объектов клетки перечитывается из базы.
    // Постройки меняют окна и список ратуш — тогда «перестроена».
    {
      const { noteAdminPatches, noteMapRebuilt, noteCellsChanged } =
        await import("./map-change-hooks");
      const touchesTown = applied.some((c) => c.buildingId !== undefined);
      if (touchesTown || applied.length > 500) await noteMapRebuilt(mapId);
      else {
        const layers = applied.filter(
          (c) =>
            c.terrainId !== undefined ||
            c.roadId !== undefined ||
            c.decorationId !== undefined ||
            c.objectId !== undefined ||
            c.buildingSkinId !== undefined ||
            c.tier !== undefined ||
            c.voidFog !== undefined ||
            c.groupId !== undefined ||
            c.iconScale !== undefined,
        );
        if (layers.length > 0)
          await noteAdminPatches(
            mapId,
            layers.map((c) => ({
              q: c.q,
              r: c.r,
              ...(c.terrainId !== undefined ? { terrainId: c.terrainId ?? null } : {}),
              ...(c.roadId !== undefined ? { roadId: c.roadId ?? null } : {}),
              ...(c.decorationId !== undefined ? { decorationId: c.decorationId ?? null } : {}),
              // Живость — из черновика: кисть может положить объект сразу
              // «добытым» (alive: false), и дельта не должна оживлять его.
              ...(c.objectId !== undefined
                ? { objectId: c.objectId ?? null, alive: c.alive !== false, runner: false }
                : {}),
              ...(c.buildingSkinId !== undefined
                ? { buildingSkinId: c.buildingSkinId ?? null }
                : {}),
              ...(c.tier !== undefined ? { tier: c.tier } : {}),
              ...(c.voidFog !== undefined ? { voidFog: c.voidFog } : {}),
              // Блоки: без этого объединение не доехало бы до игроков и второй
              // вкладки админа до F5 — и не подняло бы editSeq редактора карт.
              ...(c.groupId !== undefined ? { groupId: c.groupId ?? null } : {}),
              ...(c.iconScale !== undefined ? { iconScale: c.iconScale ?? null } : {}),
            })),
          );
        const alive = applied.filter((c) => c.alive !== undefined && c.objectId === undefined);
        if (alive.length > 0)
          await noteCellsChanged(
            mapId,
            alive.map((c) => `${c.q},${c.r}`),
          );
      }
    }
    publishRaid({ mapId, type: "restored" });
    // Опыт карты для генератора зон (какой декор на какой местности) считается
    // по этим же клеткам — после выгрузки пусть пересчитается, а не ждёт 5 мин.
    if (applied.some((c) => c.terrainId !== undefined || c.decorationId !== undefined)) {
      const { dropAffinityCache } = await import("./zonegen/affinity");
      dropAffinityCache(mapId);
    }
    // Панель постройки у игроков живёт своим запросом (["beta-raid-building"]),
    // и «restored» её не трогает: без этого события сменённый тир, новая
    // постройка или переписанная табличка доезжали до игрока только
    // перезаходом. Событие о постройках шлём тем же способом, что и
    // building-action, — списком клеток.
    const built = applied
      .filter(
        (c) => c.tier !== undefined || c.buildingId !== undefined || c.buildingConfig !== undefined,
      )
      .map((c) => `${c.q},${c.r}`);
    // Клетки зоны из рассылки вычёркиваем: см. admin-live-edit.
    const visible = await withoutVoid(mapId, built);
    if (visible.length > 0) publishRaid({ mapId, type: "built", cells: visible });
    return {
      ok: true as const,
      applied: applied.length,
      skipped,
    };
  });
