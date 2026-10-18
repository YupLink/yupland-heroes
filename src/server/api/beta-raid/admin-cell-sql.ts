// SQL одной правки клетки из очереди режима бога (adminPatchCells).
//
// Вынесено из admin-live-batch.ts (тот был за лимитом 250 строк). Новое здесь —
// колонки постройки (buildingSets): облик и настройки живут только поверх
// постройки, «призрака» без неё база больше не примет.
import { clampIconScale } from "@/lib/mergeScale";
import { sqlStr } from "../raid-shared";
import { defeatObjectSql } from "./admin-defeat-sql";
import { roadColumn } from "./map-roads";
import type { AdminCellPatch } from "./admin-cell-patch";

const sqlOrNull = (v: string | null | undefined) => (v ? sqlStr(v) : "NULL");
const scaleOrNull = (v: number | null | undefined) =>
  v == null ? "NULL" : String(clampIconScale(v));
const jsonOrNull = (v: unknown) => (v ? `${sqlStr(JSON.stringify(v))}::jsonb` : "NULL");

/** Правки одной клетки → операторы В ПОРЯДКЕ ПРИМЕНЕНИЯ. */
export function cellStatements(mapId: string, pIn: AdminCellPatch): string[] {
  // Облик мог просочиться в buildingId как «skin:<id>» — так клетка с обликом
  // выглядит в кэше карты, и ластик/restorePatch могли утащить это в патч. Уводим
  // его в building_skin_id, а building_id этим патчем НЕ трогаем: база уже стоит
  // на сервере, и запись «skin:<id>» в building_id её бы испортила.
  const skinInBld =
    typeof pIn.buildingId === "string" && pIn.buildingId.startsWith("skin:")
      ? pIn.buildingId.slice(5)
      : null;
  const p: AdminCellPatch = skinInBld
    ? { ...pIn, buildingId: undefined, buildingSkinId: pIn.buildingSkinId ?? skinInBld }
    : pIn;
  const map = sqlStr(mapId);
  const where = `map_id = ${map} AND q = ${p.q} AND r = ${p.r}`;
  // Хвост подзапроса «эта же клетка»: и старое содержимое сверить, и новое
  // из неё же взять — без второго похода в базу.
  const fromCell = `FROM yuplink.raid_map_cells c
             WHERE c.map_id = ${map} AND c.q = ${p.q} AND c.r = ${p.r}`;
  // `::text` обязателен: у голого NULL типа нет, и IS DISTINCT FROM не сойдётся.
  const newObject = `${sqlOrNull(p.objectId)}::text`;
  const newBuilding = `${sqlOrNull(p.buildingId)}::text`;

  // Дорога собирается общим разбором (map-roads.roadColumn): выгрузка черновика
  // — тот же путь в базу, что и точечная правка, и писать они обязаны одинаково.
  const road = roadColumn(p);
  const sets: string[] = [];
  if (p.terrainId !== undefined) sets.push(`terrain_id = ${sqlOrNull(p.terrainId)}`);
  if (road !== undefined) sets.push(`road_id = ${sqlOrNull(road)}`);
  if (p.decorationId !== undefined) sets.push(`decoration_id = ${sqlOrNull(p.decorationId)}`);
  if (p.objectId !== undefined) {
    sets.push(`object_id = ${sqlOrNull(p.objectId)}`);
    // Настройки принадлежат конкретному объекту клетки — сменился он, ушли и
    // они. А вот мазок тем же самым объектом поверх себя ничего не меняет:
    // раньше он молча стирал настроенные HP и награды.
    if (p.objectConfig === undefined)
      sets.push(
        `object_config = CASE WHEN c.object_id IS DISTINCT FROM ${newObject}
                              THEN NULL ELSE c.object_config END`,
      );
  }
  sets.push(...buildingSets(p, newBuilding));
  if (p.objectConfig !== undefined) sets.push(`object_config = ${jsonOrNull(p.objectConfig)}`);
  if (p.voidFog !== undefined) sets.push(`void_fog = ${p.voidFog}`);
  // Блок: id пишем как есть; вывод из блока (null) снимает и масштаб — без
  // блока он ничего не значит (как в редакторе замка).
  if (p.groupId !== undefined) sets.push(`group_id = ${sqlOrNull(p.groupId)}`);
  if (p.groupId === null) sets.push(`icon_scale = NULL`);
  else if (p.iconScale !== undefined) sets.push(`icon_scale = ${scaleOrNull(p.iconScale)}`);
  if (sets.length === 0 && p.tier === undefined && p.alive === undefined) return [];

  const out: string[] = [];
  // СНАЧАЛА то, что смотрит на СТАРОЕ содержимое клетки: после апсерта прежних
  // id уже не спросить.
  if (p.objectId !== undefined && p.alive !== true) {
    // Объект сменился — его боевое состояние уходит с ним, иначе новый встанет
    // сразу поверженным. Тот же объект своё HP сохраняет: повторный мазок
    // кистью не должен воскрешать недобитого босса.
    out.push(
      `DELETE FROM yuplink.beta_raid_object_hp
        WHERE ${where}
          -- только объект САМОЙ клетки: под ним может прятаться беглец,
          -- и его боевое состояние правкой клетки не трогаем (runners.ts)
          AND cycle_no = 0
          AND NOT EXISTS (SELECT 1 ${fromCell}
                            AND c.object_id IS NOT DISTINCT FROM ${newObject});`,
    );
  }
  if (p.buildingId !== undefined) {
    // Тир игроки поднимают за плату (building-action.ts). Снимаем его, только
    // когда постройка на клетке действительно другая — иначе повторная
    // покраска той же верфью обнуляла бы оплаченные ступени.
    out.push(
      `DELETE FROM yuplink.beta_raid_building_state
        WHERE ${where}
          AND NOT EXISTS (SELECT 1 ${fromCell}
                            AND c.building_id IS NOT DISTINCT FROM ${newBuilding});`,
    );
  }
  if (sets.length > 0) {
    out.push(
      `INSERT INTO yuplink.raid_map_cells AS c (map_id, q, r, terrain_id, road_id, object_id, decoration_id, building_id, building_skin_id, building_config, object_config, void_fog, group_id, icon_scale, saved_at)
     VALUES (${map}, ${p.q}, ${p.r}, ${sqlOrNull(p.terrainId)}, ${sqlOrNull(road)},
             ${sqlOrNull(p.objectId)}, ${sqlOrNull(p.decorationId)}, ${sqlOrNull(p.buildingId)},
             ${p.buildingId ? sqlOrNull(p.buildingSkinId) : "NULL"},
             ${p.buildingId ? jsonOrNull(p.buildingConfig) : "NULL"}, ${jsonOrNull(p.objectConfig)},
             ${p.voidFog === true},
             ${sqlOrNull(p.groupId)}, ${p.groupId ? scaleOrNull(p.iconScale) : "NULL"}, now())
     ON CONFLICT (map_id, q, r) DO UPDATE SET ${sets.join(", ")}, saved_at = now();`,
    );
  }
  // «Оживить» — это и есть отсутствие записи о смерти.
  if (p.alive === true) {
    out.push(`DELETE FROM yuplink.beta_raid_object_hp WHERE ${where} AND cycle_no = 0;`);
  }
  // Гасим ПОСЛЕ апсерта: объект и его запас HP читаются из самой клетки, а она
  // уже с новым содержимым. Запас берётся из шаблона (admin-defeat-sql) —
  // с нулём в max_hp кнопка «Восстановить» такой объект уже не поднимала.
  if (p.alive === false) out.push(defeatObjectSql(mapId, p.q, p.r));
  // Тир идёт последним: правка «покрутил тир и убрал постройку» иначе оставила
  // бы тир сиротой, и следующая постройка выросла бы на нём даром. Условие в
  // самом SQL — на случай тира для клетки, где постройки нет вовсе.
  if (p.tier !== undefined && p.buildingId !== null) {
    out.push(
      `INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       SELECT c.map_id, c.q, c.r, ${p.tier}, now(), 'admin'
         ${fromCell} AND c.building_id IS NOT NULL
       ON CONFLICT (map_id, q, r) DO UPDATE SET tier = ${p.tier}, updated_at = now(), updated_by = 'admin';`,
    );
  }
  return out;
}

/**
 * Колонки постройки. Облик (building_skin_id) и настройки (building_config)
 * принадлежат постройке: «убрать» уносит их вместе с ней, а на клетку без
 * постройки их не пишем. Иначе карта рисовала «призрака» — картинку постройки,
 * которой нет: игрок её не откроет, а «убрать» его не брал, потому что снимал
 * облик только при СМЕНЕ постройки (владелец, 05.10.2026: табличка «Город -
 * Вихоток», которую не прочитать и не удалить).
 */
function buildingSets(p: AdminCellPatch, newBuilding: string): string[] {
  if (p.buildingId === null) {
    return ["building_id = NULL", "building_skin_id = NULL", "building_config = NULL"];
  }
  const out: string[] = [];
  if (p.buildingId !== undefined) {
    out.push(`building_id = ${sqlOrNull(p.buildingId)}`);
    // Текст таблички принадлежал прежней постройке: верфь поверх неё не должна
    // унаследовать чужое послание. Но покраска той же верфью — не смена
    // постройки, и послание при ней остаётся на месте.
    if (p.buildingConfig === undefined)
      out.push(
        `building_config = CASE WHEN c.building_id IS DISTINCT FROM ${newBuilding}
                                THEN NULL ELSE c.building_config END`,
      );
    // Облик принадлежал ПРЕЖНЕЙ постройке: сменили её — снимаем и картинку.
    // Покраска той же постройкой облик сохраняет. Если этот же патч ЯВНО задаёт
    // облик — его выставит строка ниже (дважды одну колонку Postgres не примет).
    if (p.buildingSkinId === undefined)
      out.push(
        `building_skin_id = CASE WHEN c.building_id IS DISTINCT FROM ${newBuilding}
                                 THEN NULL ELSE c.building_skin_id END`,
      );
  }
  // Облик и настройки без постройки в этой же правке — только поверх уже
  // стоящей: на пустой клетке CASE даёт NULL.
  const onBuilding = (v: string) =>
    p.buildingId ? v : `CASE WHEN c.building_id IS NOT NULL THEN ${v} END`;
  if (p.buildingSkinId !== undefined)
    out.push(`building_skin_id = ${onBuilding(sqlOrNull(p.buildingSkinId))}`);
  if (p.buildingConfig !== undefined)
    out.push(`building_config = ${onBuilding(jsonOrNull(p.buildingConfig))}`);
  return out;
}
