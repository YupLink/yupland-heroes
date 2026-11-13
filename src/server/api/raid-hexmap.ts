import { createServerFn } from "@tanstack/react-start";
import { dropVoidCache } from "./beta-raid/voidCells";
import { dropFleeCache } from "./beta-raid/flee-cells";
import { z } from "zod";
import { assertUsdtCellMap } from "./usdt-cells";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { dropOrphanGroupsSql } from "./beta-raid/map-groups-schema";
import { hexCellsInput } from "./raid-hexmap-cell";
import { requireAdmin } from "../auth";
import type { PgRaidMap, PgRaidMapCell } from "../db/pg";
import { cellRoadId, roadColumn } from "./beta-raid/map-roads";
import { activeBetaMapId } from "./beta-raid/encounter-where";
import { readDaraiHold, settleDaraiHold } from "./beta-raid/map-darai-hold";
import { ensureTownSchema, handleBuildingChange, readOldBuildings } from "./beta-raid/town-resolve";

export const adminListHexMaps = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const { data } = await pg.raidMaps.raw().select("*").order("updated_at", { ascending: false });
  return { maps: (data ?? []) as PgRaidMap[] };
});

/**
 * id карты, которую сейчас правит игра (settings.beta_raid_map). Редактор и
 * режим бога пишут в ОДНУ таблицу raid_map_cells, поэтому при открытии редактор
 * подтягивает именно эту карту — иначе админ видел бы свой старый локальный
 * черновик, а не постройки, которые он ставил прямо в игре. null — активная
 * карта не назначена.
 */
export const adminActiveHexMapId = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  try {
    return { mapId: (await activeBetaMapId()) as string | null };
  } catch {
    return { mapId: null as string | null };
  }
});

/** Загрузить hex-карту с ячейками. */
export const adminLoadHexMap = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const maps = (await pg.raidMaps.raw().select("*").eq("id", data.mapId)).data as
      | PgRaidMap[]
      | null;
    const map = maps?.[0];
    if (!map) throw new Error("Карта не найдена");
    const cells = (await pg.raidMapCells.raw().select("*").eq("map_id", data.mapId)).data as
      | PgRaidMapCell[]
      | null;
    // Преобразуем в Record<string, Cell> для клиента.
    const cellsRecord: Record<
      string,
      {
        terrainId: string | null;
        /** Дорога клетки: одна, разбор общий с игрой (map-roads). */
        roadId?: string | null;
        objectId?: string | null;
        objectConfig?: unknown;
        decorationId?: string | null;
        buildingId?: string | null;
        buildingConfig?: unknown;
        voidFog?: boolean;
      }
    > = {};
    for (const c of cells ?? []) {
      cellsRecord[`${c.q},${c.r}`] = {
        terrainId: c.terrain_id,
        // Склейку разбираем ЗДЕСЬ, а не в редакторе: игра и админка обязаны
        // видеть одну и ту же дорогу — последнюю из склейки.
        roadId: cellRoadId(c.road_id),
        objectId: c.object_id,
        objectConfig: c.object_config,
        decorationId: c.decoration_id,
        buildingId: (c as unknown as { building_id?: string | null }).building_id ?? null,
        buildingConfig: (c as unknown as { building_config?: unknown }).building_config ?? null,
        voidFog: c.void_fog === true,
      };
    }
    const { editSeq } = await import("./beta-raid/map-change-hooks-seq");
    return {
      map,
      cells: cellsRecord,
      /**
       * Счётчик ПРАВОК на момент загрузки — с ним же и сохраняем (см. ниже).
       * Не версия карты: та растёт от каждого боя и побега, и живую карту
       * нельзя было бы сохранить никогда.
       */
      revision: await editSeq(map.id),
    };
  });

/** Сохранить hex-карту (создать или обновить). */
export const adminSaveHexMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // id карты идёт в SQL как есть — только буквы, цифры, «_» и «-» (аудит 11.11.2026).
        mapId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/)
          .optional(),
        name: z.string().min(1).max(100).optional(),
        /**
         * Версия карты, с которой начинали править. Пока редактор держал
         * черновик, админ мог ставить лодки и объекты прямо в игре — их
         * сохранение целиком снесло бы молча. Не совпало — отказ.
         */
        revision: z.number().int().nonnegative().optional(),
        size: z
          .number()
          .int()
          .refine((v) => [128, 256, 512].includes(v)),
        locationId: z.string().nullable().optional(),
        cells: hexCellsInput,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const now = new Date().toISOString();
    let mapId = data.mapId;

    // Если mapId не передан — ищем по имени (обновляем существующую).
    if (!mapId && data.name) {
      const existing = (await pg.raidMaps.raw().select("id").eq("name", data.name).limit(1))
        .data as Array<{ id: string }> | null;
      if (existing && existing.length > 0) {
        mapId = existing[0].id;
      }
    }
    // Мир строителей растёт руками игроков (lib/landPlace): сохранение редактора
    // целиком снесло бы положенную землю. Его правят только в игре (режим бога).
    if (mapId) {
      const { isBuilderWorld } = await import("./beta-raid/land/builder-world");
      if (await isBuilderWorld(mapId)) {
        throw new Error("Мир строителей правится только в игре (режим бога)");
      }
    }

    // USDT на объектах — живые деньги: сверх «свободно − запас» карту не пишем (§8.49а).
    await assertUsdtCellMap(mapId ?? "", data.cells, "сохранение карты с USDT");
    if (mapId && data.revision !== undefined) {
      const { editSeq } = await import("./beta-raid/map-change-hooks-seq");
      const now = await editSeq(mapId);
      if (now !== data.revision) {
        throw new Error(
          `Карту успели поправить в игре (правок: ${now - data.revision}). Перезагрузи её в редакторе, иначе эти правки исчезнут.`,
        );
      }
    }

    if (mapId) {
      // Обновляем существующую карту. Имя меняем ТОЛЬКО если его прислали:
      // правка боевой карты не должна переименовывать её в «Черновик».
      await pg.raidMaps.update(
        { id: mapId },
        {
          ...(data.name ? { name: data.name } : {}),
          size: data.size,
          location_id: data.locationId ?? null,
          updated_at: now,
        },
      );
      // Старые ячейки НЕ удаляем заранее: на боевой карте это оставляло её
      // пустой на всё время записи. Вместо этого штампуем сохранение и в
      // конце сносим клетки, которых в новом наборе не оказалось.
    } else {
      if (!data.name) throw new Error("Для новой карты нужно название");
      // Создаём новую карту.
      mapId = `rmap_${nanoid(8)}`;
      await pg.raidMaps.insert({
        id: mapId,
        name: data.name,
        size: data.size,
        location_id: data.locationId ?? null,
        created_at: now,
        updated_at: now,
      });
    }

    // Обеспечение наград считаем ТОЛЬКО на открытой карте (этаже): черновик в
    // редакторе игрокам ничего не обещает, и списывать под него пул было бы
    // враньём.
    const { isLiveMap } = await import("./beta-raid/floors");
    const live = mapId ? await isLiveMap(mapId).catch(() => false) : false;
    const hold = live ? await readDaraiHold(mapId, null) : null;

    // Вставляем ячейки батчами через raw SQL (быстрее чем по одному).
    const entries = Object.entries(data.cells).filter(([, v]) => v.terrainId !== null);
    // Ратуши: полное сохранение может завести новые/убрать старые ратуши
    // разом. Схема готовится сразу, чтобы дальше можно было сравнивать старые
    // building_id с новыми.
    const hallCells = entries
      .filter(([, v]) => v.buildingId !== undefined)
      .map(([k]) => {
        const [q, r] = k.split(",").map(Number);
        return { q, r };
      });
    const buildingsTouched = hallCells.length > 0;
    if (buildingsTouched && mapId) await ensureTownSchema();
    const oldBuildings = mapId ? await readOldBuildings(mapId, hallCells) : new Map();
    /** Метка одного сохранения: по ней в конце вычищаем стёртые клетки. */
    const stamp = now;
    if (entries.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const values = batch
          .map(([k, v]) => {
            const [q, r] = k.split(",").map(Number);
            const terrain = v.terrainId ? `'${v.terrainId.replace(/'/g, "''")}'` : "NULL";
            // Колонку собирает общий разбор: склейку старого клиента он
            // схлопнет в одну дорогу — ту же, что редактор рисовал сверху.
            const roadCol = roadColumn(v);
            const road = roadCol ? `'${roadCol.replace(/'/g, "''")}'` : "NULL";
            const obj = v.objectId ? `'${v.objectId.replace(/'/g, "''")}'` : "NULL";
            const cfg = v.objectConfig
              ? `'${JSON.stringify(v.objectConfig).replace(/'/g, "''")}'::jsonb`
              : "NULL";
            const decor = v.decorationId ? `'${v.decorationId.replace(/'/g, "''")}'` : "NULL";
            const bld = v.buildingId ? `'${v.buildingId.replace(/'/g, "''")}'` : "NULL";
            const bcfg = v.buildingConfig
              ? `'${JSON.stringify(v.buildingConfig).replace(/'/g, "''")}'::jsonb`
              : "NULL";
            return `('${mapId}', ${q}, ${r}, ${terrain}, ${road}, ${obj}, ${cfg}, ${decor}, ${bld}, ${bcfg}, ${v.voidFog ? "true" : "false"}, '${stamp}')`;
          })
          .join(",");
        // natureN — окружение шахты (§8.80, обход базы): той же постройке — из базы.
        await mcpExec(
          `INSERT INTO yuplink.raid_map_cells AS c (map_id, q, r, terrain_id, road_id, object_id, object_config, decoration_id, building_id, building_config, void_fog, saved_at) VALUES ${values} ON CONFLICT (map_id, q, r) DO UPDATE SET terrain_id = EXCLUDED.terrain_id, road_id = EXCLUDED.road_id, object_id = EXCLUDED.object_id, object_config = EXCLUDED.object_config, decoration_id = EXCLUDED.decoration_id, building_id = EXCLUDED.building_id, building_config = CASE WHEN EXCLUDED.building_id IS NULL THEN NULL WHEN EXCLUDED.building_id IS NOT DISTINCT FROM c.building_id AND c.building_config ? 'natureN' THEN COALESCE(EXCLUDED.building_config, '{}'::jsonb) || jsonb_build_object('natureN', c.building_config->'natureN') ELSE EXCLUDED.building_config END, building_skin_id = CASE WHEN EXCLUDED.building_id IS NULL OR EXCLUDED.building_id IS DISTINCT FROM c.building_id THEN NULL ELSE c.building_skin_id END, void_fog = EXCLUDED.void_fog, saved_at = EXCLUDED.saved_at;`,
        );
      }
      // Клетки, которых в этом сохранении не было — стёртые: убираем их.
      await mcpExec(
        `DELETE FROM yuplink.raid_map_cells
          WHERE map_id = '${mapId}' AND (saved_at IS NULL OR saved_at <> '${stamp}');`,
      );
      // Декор, чей шаблон удалили, пока черновик лежал в браузере, на карту
      // не возвращается — иначе мёртвая ссылка, зелёная точка-стена (dead-decor).
      const { dropDeadDecorSql } = await import("./beta-raid/dead-decor");
      await mcpExec(dropDeadDecorSql(mapId, stamp));
      // Блоки режима бога (group_id) редактор не знает, апсерт их не трогает.
      // Но стёртая клетка уносит с собой члена блока: блок из одной клетки —
      // не блок, снимаем группу с оставшихся (и масштаб вместе с ней).
      await mcpExec(dropOrphanGroupsSql(sqlStr(mapId)), { wrapJson: false }).catch(() => undefined);
    } else if (data.mapId) {
      // Карту очистили целиком — только тогда сносим все её клетки.
      await pg.raidMapCells.raw().delete().eq("map_id", mapId);
    }

    // Что появилось — заложило номинал в пул карты, что стёрли невскрытым —
    // вернуло его туда же.
    if (hold) await settleDaraiHold(hold);

    // Ратуши: пройти по клеткам с изменённой постройкой — завести новые в
    // реестр городов, снятые убрать.
    if (mapId && buildingsTouched) {
      for (const [k, v] of entries) {
        if (v.buildingId !== undefined) {
          const [q, r] = k.split(",").map(Number);
          const old = oldBuildings.get(`${q},${r}`) ?? null;
          await handleBuildingChange(mapId, q, r, old, v.buildingId ?? null);
        }
      }
    }

    // Сохранение переставляет и купола (void_fog едет вместе с клеткой), а
    // снимок зоны живёт минуту. Без сброса метки игроков, «опустошено» и
    // причалы ещё минуту светились бы внутри только что накрытой зоны —
    // причал на воде и есть та самая разведка, ради которой фильтр писался.
    dropVoidCache(mapId);
    // Сохранение переставляет и объекты — снимок убегающих собираем заново.
    dropFleeCache(mapId);

    // Сохранение — тоже изменение мира: версия сдвигается через журнал
    // (noteMapRebuilt): соседний редактор с устаревшим черновиком получает
    // отказ, а игроки — снимок, собранный из СВЕЖЕЙ базы, а не из кэша.
    // Голый UPDATE revision этого не давал: версия росла, а основа карты
    // жила в кэше ещё 15 с, и снимок собирался без сохранённого.
    const { noteMapRebuilt } = await import("./beta-raid/map-change-hooks");
    await noteMapRebuilt(mapId);

    return { mapId, cellCount: entries.length };
  });

/** Удалить hex-карту. */
export const adminDeleteHexMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.raidMaps.delete({ id: data.mapId });
    return { ok: true };
  });
