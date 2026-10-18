// Массовая переразкладка объектов: снять убитых, поставить новых.
//
// Две половины одной кнопки. Снятие ходит только по ПОВЕРЖЕННЫМ: живой босс и
// недобитый (в него уже вложились игроки) остаются на месте при любых условиях
// — на боевой карте таких четыреста два, и стереть их значит отнять чужой бой.
// Условие «повержен» стоит в самом SQL, а не в подборе клеток: подбор — это
// снимок секундной давности, а решает всегда запись.
//
// Три правила, которые здесь легко нарушить и дорого чинить:
//  1. Смена объекта на клетке обязана снести его строку HP (cycle_no = 0),
//     иначе новый объект встанет сразу поверженным — на чужой отметке смерти.
//  2. Обеспечение Darai: снимок ДО правки, сведение ПОСЛЕ. Иначе пул карты
//     соврёт — снятый невскрытым сундук не вернёт номинал, а новый не заложит.
//     Колонки darai_ref/darai_hold здесь НЕ трогаем руками: их пишет
//     settleDaraiHold, и только он знает, дошли ли деньги обратно в пул.
//  3. Мост ретраит пишущие запросы ВСЛЕПУЮ. Поэтому «сколько встало» считается
//     отдельным чтением ПОСЛЕ записи, а не из RETURNING: повтор уже применённой
//     записи вернул бы ноль строк, и отчёт объявил бы провалом сделанную работу.
//     По той же причине ни один оператор здесь не завязан на RETURNING как на
//     признак «получилось»: повторить его безопасно, число берётся чтением.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { dropMapBase } from "./map-base";
import { dropVoidCache } from "./voidCells";
import { dropFleeCache } from "./flee-cells";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";
import { FREE_CELL, type CellRef } from "./scatter-cells";
import { cellInGroup } from "./pile-kind";
import type { ScatterGroup } from "@/lib/raid/scatterPlan";

export type Placement = { q: number; r: number; objectId: string; objectConfig: unknown | null };

/**
 * Сколько клеток берём одним оператором. Не про базу, а про длину SQL: мост
 * давится длинными запросами, а семьсот убитых сундуков в один список не
 * влезают. Пачками же провал одной не отменяет остальные.
 */
const BATCH = 200;

const chunks = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const pairs = (cells: CellRef[]): string => cells.map((c) => `(${c.q}, ${c.r})`).join(",");

const jsonOrNull = (v: unknown): string =>
  v === null || v === undefined ? "NULL::jsonb" : `${sqlStr(JSON.stringify(v))}::jsonb`;

/**
 * Кто есть кто на карте — ОБЩИМ правилом (pile-kind), тем же, которым
 * предпросмотр считает «снимем N». Своей копии здесь нет намеренно: разъехавшись
 * однажды, эта пара уже обещала снять одно, а снимала это и сирот в придачу.
 */
const groupWhere = (group: ScatterGroup): string => cellInGroup(group, "c");

/** Повержен: отметка смерти стоит. Недобитый (killed_at IS NULL) сюда не попадает. */
const KILLED = `EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                         WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r
                           AND h.cycle_no = 0 AND h.killed_at IS NOT NULL)`;

/** Клетки группы, где объект уже повержен. Чтение — список кандидатов на снос. */
async function killedCells(mapId: string, group: ScatterGroup): Promise<CellRef[]> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.object_id IS NOT NULL
        AND ${groupWhere(group)} AND ${KILLED};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;
  return (rows ?? []).map((row) => ({ q: Number(row.q), r: Number(row.r) }));
}

/** Сколько из этих клеток сейчас пусты — тем и меряем снос. */
async function countEmpty(mapId: string, cells: CellRef[]): Promise<number> {
  if (cells.length === 0) return 0;
  const rows = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${pairs(cells)})
        AND c.object_id IS NULL;`,
    { wrapJson: true },
  )) as Array<{ n: number }>;
  return Number(rows?.[0]?.n ?? 0);
}

/**
 * Снять с карты УБИТЫХ объектов группы.
 *
 * Условие смерти повторяется в самом UPDATE, а не только в подборе: между
 * чтением списка и записью админ мог этот объект восстановить кнопкой
 * «Восстановить», и снести воскресшего мы не имеем права.
 *
 * Слой беглецов (runners.ts) не трогаем вовсе: убежавший гриб стоит не в
 * клетке, а в своей таблице, и раскладка про него ничего не знает.
 */
export async function removeKilled(mapId: string, group: ScatterGroup): Promise<number> {
  const dead = await killedCells(mapId, group);
  if (dead.length === 0) return 0;
  const m = sqlStr(mapId);
  let removed = 0;
  for (const part of chunks(dead, BATCH)) {
    // Снимок обеспечения ДО правки: после неё уже не видно, кто опустошил
    // объект — игрок (деньги ушли по адресу) или админ (расписка вернётся).
    const hold = await readDaraiHold(mapId, part);
    await mcpExec(
      `WITH cleared AS (
         UPDATE yuplink.raid_map_cells c
            SET object_id = NULL, object_config = NULL, saved_at = now()
          WHERE c.map_id = ${m} AND (c.q, c.r) IN (${pairs(part)})
            AND c.object_id IS NOT NULL AND ${groupWhere(group)} AND ${KILLED}
         RETURNING c.q, c.r
       )
       DELETE FROM yuplink.beta_raid_object_hp h USING cleared x
        WHERE h.map_id = ${m} AND h.q = x.q AND h.r = x.r AND h.cycle_no = 0;`,
      { wrapJson: false },
    );
    await settleDaraiHold(hold);
    removed += await countEmpty(mapId, part);
  }
  return removed;
}

/**
 * Апсерт пачки объектов. Клетка на карте уже есть всегда, поэтому работает
 * ветка ON CONFLICT — и вот она-то и решает: её условие проверяет САМУЮ свежую
 * версию строки, а не снимок начала запроса. Занял кто-то клетку, пока мы
 * складывали пачку, — строка молча пропускается, и объект не затирает чужое.
 *
 * Беглец и игрок проверяются в источнике (EXISTS по FREE_CELL): их не выразить
 * условием над одной строкой клетки. Окно между снимком и записью там
 * миллисекундное, а цена ошибки мелкая — объект встанет поверх гриба.
 */
function placeSql(mapId: string, part: Placement[]): string {
  const m = sqlStr(mapId);
  const values = part
    .map(
      (p) =>
        `(${Math.floor(p.q)}::int, ${Math.floor(p.r)}::int, ${sqlStr(p.objectId)}::text, ${jsonOrNull(p.objectConfig)})`,
    )
    .join(",");
  return `WITH put AS (
       INSERT INTO yuplink.raid_map_cells AS tgt (map_id, q, r, object_id, object_config, saved_at)
       SELECT ${m}, v.q, v.r, v.object_id, v.object_config, now()
         FROM (VALUES ${values}) AS v(q, r, object_id, object_config)
        WHERE EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                       WHERE c.map_id = ${m} AND c.q = v.q AND c.r = v.r AND ${FREE_CELL})
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET object_id = EXCLUDED.object_id, object_config = EXCLUDED.object_config,
              saved_at = now()
        WHERE tgt.object_id IS NULL AND tgt.terrain_id IS NOT NULL
          AND tgt.decoration_id IS NULL AND tgt.building_id IS NULL
          AND tgt.group_id IS NULL
          AND tgt.void_fog IS NOT TRUE
       RETURNING tgt.q, tgt.r
     )
     -- Осиротевшая отметка смерти на пустой клетке встречается редко, но новый
     -- объект на ней родился бы уже поверженным. Сносим ровно по тем клеткам,
     -- куда только что встали.
     DELETE FROM yuplink.beta_raid_object_hp h USING put p
      WHERE h.map_id = ${m} AND h.q = p.q AND h.r = p.r AND h.cycle_no = 0;`;
}

/**
 * КАКИЕ из пачки реально стоят на карте — чтением, а не по RETURNING.
 *
 * Именно список, а не число: по нему отчёт считает, сколько денег ушло на
 * карту. Числом «встало 40 из 50» пришлось бы брать первые сорок заготовок из
 * пятидесяти, а перехватили-то не последние — и в отчёт попали бы номиналы
 * объектов, которых на карте нет.
 */
async function standingCells(mapId: string, part: Placement[]): Promise<CellRef[]> {
  const triples = part
    .map((p) => `(${Math.floor(p.q)}::int, ${Math.floor(p.r)}::int, ${sqlStr(p.objectId)}::text)`)
    .join(",");
  const rows = (await mcpExec(
    `SELECT c.q, c.r FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r, c.object_id) IN (${triples});`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;
  return (rows ?? []).map((row) => ({ q: Number(row.q), r: Number(row.r) }));
}

/**
 * Записать новые объекты пачкой. Возвращает КЛЕТКИ, на которых они реально
 * встали: чего в списке нет — то не встало, и ни в число созданных, ни в
 * «на карту поступило» оно попасть не должно.
 *
 * Одна клетка в пачке встречается один раз: два объекта в одну клетку — это
 * второй поверх первого, то есть тихая потеря. Подбор такого не даёт, но пачка
 * приезжает извне, и полагаться на чужую дисциплину незачем.
 */
export async function placeObjects(mapId: string, placements: Placement[]): Promise<CellRef[]> {
  const seen = new Set<string>();
  const list = placements.filter((p) => {
    const key = `${Math.floor(p.q)},${Math.floor(p.r)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) return [];

  const placed: CellRef[] = [];
  for (const part of chunks(list, BATCH)) {
    const hold = await readDaraiHold(
      mapId,
      part.map((p) => ({ q: Math.floor(p.q), r: Math.floor(p.r) })),
    );
    await mcpExec(placeSql(mapId, part), { wrapJson: false });
    // Новые объекты закладывают номинал из пула карты; заодно возвращается
    // расписка, если на клетке оставалась чужая непогашенная.
    await settleDaraiHold(hold);
    placed.push(...(await standingCells(mapId, part)));
  }
  return placed;
}

/**
 * Побочки после записи. Версия карты растёт намеренно: гекс-редактор по ней
 * отличает свой черновик от чужих правок, и без этого черновик, набранный до
 * раскладки, лёг бы поверх сотни новых объектов и стёр их. Суда спасаем потому,
 * что объект мог накрыть клетку с кораблём, и на него стало не ступить.
 */
export async function afterScatter(mapId: string): Promise<void> {
  // Версию сдвигает noteMapRebuilt ниже — через журнал, без дыр.
  const { rescueStuckShips } = await import("./ship-rescue");
  const rescued = await rescueStuckShips(mapId).catch(() => null);
  if (rescued?.moved) publishRaid({ mapId, type: "ships" });
  dropVoidCache(mapId);
  dropFleeCache(mapId);
  dropMapBase(); // снимок карты устарел — раскладка должна быть видна сразу
  // Тысячи клеток разом — «карта перестроена»: игроки берут новый снимок.
  const { noteMapRebuilt } = await import("./map-change-hooks");
  await noteMapRebuilt(mapId);
  publishRaid({ mapId, type: "restored" });
}
