// Тяжёлая, общая для всех часть карты — с кэшем.
//
// Клеток на боевой карте под двадцать пять тысяч, и раньше их выбирал ИЗ БАЗЫ
// каждый игрок на каждое открытие карты: один и тот же скан ради одних и тех же
// строк. Здесь он делается раз в несколько секунд на всех.
//
// Кэш нарочно SWR: протухшее отдаётся сразу, обновление идёт фоном — открытие
// карты не должно ждать базу даже на границе срока. Правка админа сбрасывает
// снимок явно (dropMapBase), иначе выгруженные правки ждали бы TTL.
//
// В кэш идёт только то, что ОДИНАКОВО для всех: клетки, словари, тиры
// построек. Всё, что зависит от игрока (зона тумана, беглецы, поверженное),
// считается поверх на каждый запрос.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { ensureGroupColumns } from "./map-groups-schema";
import { swrCache } from "../../cache/swr";
import type { RawCell } from "./packCells";
import { loadMapObjects, type MapObjectRow } from "./map-objects";
import { loadBuildingTiers } from "./buildings";

export type MapBase = {
  /** Версия карты, прочитанная ДО клеток: клетки не старее её. */
  rev: number;
  cells: RawCell[];
  terrains: TerrainRow[];
  objects: ObjectRow[];
  decorations: DecorRow[];
  roads: TerrainRow[];
  buildingTiers: Record<string, number>;
};

export type TerrainRow = {
  id: string;
  name: string;
  image_url: string | null;
  stat_amount: number | null;
};
/** Форма объекта карты — ровно та, что отдаёт loadMapObjects. */
export type ObjectRow = MapObjectRow;
export type DecorRow = { id: string; name: string; image_url: string | null };

/** Пятнадцать секунд: правки админа приходят сбросом, а не ожиданием срока. */
const TTL_MS = 15_000;

async function load(mapId: string): Promise<MapBase> {
  // Колонки блоков (group_id, icon_scale) дорастают тут же: SELECT ниже их
  // называет, и без них снимок падал бы всем до накатки миграции.
  await ensureGroupColumns();
  // Версию — раньше клеток: снимок с номером N обязан нести клетки не старше N
  // (mapBaseAt). Прочитанная после клеток, она могла бы оказаться новее их.
  const revRows = (await mcpExec(
    `SELECT COALESCE(revision, 0) AS revision FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ revision: number | string }>;
  const rev = Number(revRows?.[0]?.revision ?? 0) || 0;
  // Порядок клеток — по первичному ключу (q, r): номер клетки в снимке
  // должен быть одним и тем же от сборки к сборке, иначе биты тумана,
  // сохранённые на устройстве по номерам, лягут на чужие клетки.
  const [cells, terrains, objects, decorations, roads, tiers] = await Promise.all([
    mcpExec(
      `SELECT c.q, c.r, c.terrain_id, c.road_id, c.object_id, c.decoration_id,
              c.building_id, c.building_skin_id, c.void_fog, c.group_id, c.icon_scale
         FROM yuplink.raid_map_cells c
        WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
        ORDER BY c.q, c.r;`,
      { wrapJson: true },
    ) as Promise<RawCell[]>,
    mcpExec(
      `SELECT DISTINCT t.id, t.name, t.image_url, t.stat_amount
         FROM yuplink.mystic_item_template t
        WHERE t.id IN (SELECT DISTINCT terrain_id FROM yuplink.raid_map_cells
                        WHERE map_id = ${sqlStr(mapId)} AND terrain_id IS NOT NULL);`,
      { wrapJson: true },
    ) as Promise<TerrainRow[]>,
    // Словарь объектов — обоими слоями сразу: и клетки, и беглецы.
    loadMapObjects(mapId),
    mcpExec(
      `SELECT DISTINCT t.id, t.name, t.image_url
         FROM yuplink.mystic_item_template t
        WHERE t.id IN (SELECT DISTINCT decoration_id FROM yuplink.raid_map_cells
                        WHERE map_id = ${sqlStr(mapId)} AND decoration_id IS NOT NULL);`,
      { wrapJson: true },
    ) as Promise<DecorRow[]>,
    // Дороги: склейки «id,id» остались с тех пор, как кисть дописывала дорогу
    // вместо замены — разбираем тем же разделителем, что и раньше.
    mcpExec(
      `SELECT DISTINCT t.id, t.name, t.image_url, t.stat_amount
         FROM yuplink.mystic_item_template t
        WHERE t.id IN (
          SELECT DISTINCT trim(rid)
            FROM yuplink.raid_map_cells,
                 unnest(string_to_array(road_id, ',')) AS rid
           WHERE map_id = ${sqlStr(mapId)} AND road_id IS NOT NULL);`,
      { wrapJson: true },
    ) as Promise<TerrainRow[]>,
    loadBuildingTiers(mapId),
  ]);
  const buildingTiers = tiers ?? {};

  return {
    rev,
    cells: cells ?? [],
    terrains: terrains ?? [],
    objects: objects ?? [],
    decorations: decorations ?? [],
    roads: roads ?? [],
    buildingTiers,
  };
}

const cache = swrCache<MapBase>({ ttl: TTL_MS, load });

/** Основа карты: из кэша, обновляется фоном. */
export const mapBase = (mapId: string): Promise<MapBase> => cache.get(mapId);

/**
 * Основа не старее версии minRev. Кэш мог загрузиться до чужой правки (правку
 * сделал другой процесс, или загрузка шла в момент сброса) — тогда снимок с
 * новым номером нёс бы старые клетки, и клиент навсегда видел бы прошлое:
 * дельты до этого номера ему уже не пришлют (14.10.2026: забранный сундук
 * снова на карте, «забрать нельзя»). Такой кэш перечитываем.
 */
export async function mapBaseAt(mapId: string, minRev: number): Promise<MapBase> {
  const base = await cache.get(mapId);
  if (base.rev >= minRev) return base;
  cache.drop(mapId);
  return cache.get(mapId);
}

/**
 * Сбросить снимок: админ выгрузил правки, поднял объекты или сменил карту.
 * Помечаем протухшим, а не выбрасываем: следующий читатель получит прежнюю
 * карту мгновенно, а свежая подъедет фоном — «после правки каждый ход
 * подвисает» было ровно от drop().
 */
export const dropMapBase = (mapId?: string): void => cache.stale(mapId);

/**
 * Жёсткий сброс: следующий читатель получит СВЕЖУЮ карту, не старую.
 * Стоит дороже (одна лишняя выборка на публикацию), но нужен там, где сам
 * же выгружающий администратор перечитывает карту сразу после патча:
 * его optimistic-патч затирался stale-ответом, и постройка возвращалась
 * до F5 (жалоба «удаление без F5»).
 */
export const purgeMapBase = (mapId?: string): void => cache.drop(mapId);
