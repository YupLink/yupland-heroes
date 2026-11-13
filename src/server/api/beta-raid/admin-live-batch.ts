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
import { sqlStr } from "../raid-shared";
import {
  designerBuildings,
  designerPatch,
  liveMapPatch,
  requireGodMap,
} from "./island/island-editor-auth";
import { stripCellsMoney } from "./god-money";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { keepTerrain } from "./admin-cell-patch";
import { assertUsdtPatches } from "../usdt-cells";
import { publishRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { dropVoidCache, withoutVoid } from "./voidCells";
import { dropFleeCache } from "./flee-cells";
import { roadColumn } from "./map-roads";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";
import { ensureTownSchema, handleBuildingChange, readOldBuildings } from "./town-resolve";
import { cellStatements } from "./admin-cell-sql";
import { journalBatch } from "@/server/api/beta-raid/admin-batch-journal";
import {
  blockMineProbe,
  blockMinesMoved,
  readBlockMines,
} from "@/server/api/beta-raid/mine-block-sync";

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
    // Админ — карта, где стоит; дизайнер замка — только свой остров новичка, и
    // правки его вычищены до местности, дорог, декора и построек (island-editor-auth).
    const god = await requireGodMap();
    const mapId = god.mapId;
    const town = god.admin ? null : await designerBuildings();
    if (town) data.cells = data.cells.map((c) => designerPatch(c, town));
    // Право island_god (свой остров, без денег): из настроек — токены вон.
    if (god.money === false) data.cells = await stripCellsMoney(data.cells);
    // Стереть местность (ластик «Местность») — только в мире креатора: на живой
    // карте клетка без земли пропала бы у игроков (map-base её не отдаёт).
    if (!isCreatorMapId(mapId)) data.cells = data.cells.map(keepTerrain);
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
    // Не админ и не свой остров (право god_map): объекты и постройки игроков — мимо.
    if (town && !god.ownIsland) {
      data.cells = data.cells.map((c) => liveMapPatch(c, oldBuildings, town));
    }
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
    // Блоки-шахты: кто из членов блока шахта только по блоку — ДО правки и
    // после (mine-block-sync). Сбой чтения — полный снимок: он надёжнее.
    const probe = blockMineProbe(applied);
    const minesBefore = await readBlockMines(mapId, probe.cells, probe.groups).catch(() => null);

    await mcpExec(statements.join("\n"), { wrapJson: false });
    // Пачка трогала блоки — снимаем группу с одиночек (отменённый член и т.п.).
    if (applied.some((c) => c.groupId !== undefined)) {
      await mcpExec(dropOrphanGroupsSql(sqlStr(mapId)), { wrapJson: false }).catch(() => undefined);
    }
    const minesMoved =
      probe.cells.length > 0 &&
      (!minesBefore ||
        (await readBlockMines(mapId, probe.cells, minesBefore.groups).then(
          (now) => blockMinesMoved(minesBefore, now, probe.lifted),
          () => true,
        )));
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
    // Журнал карты: пачка уходит игрокам дельтой (со словарями новых ассетов)
    // или «перестроена» — правила в admin-batch-journal.
    await journalBatch(mapId, applied, minesMoved);
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
