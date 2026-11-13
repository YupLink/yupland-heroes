// Час вышел, а гриб не посажен (владелец, 22.10.2026; ПРАВИЛА §8.62
// п. 5): мешочка нет — гриб сам встаёт на клетку, где стоит герой, а если та
// не годится — на ближайшую годную рядом, и работает у того, у кого лежал.
// Даром: энергию берёт только посадка руками. Жизнь кончилась раньше часа —
// гриб просто исчезает (dmine-expire), сюда он не попадает.
//
// Годность клетки — правила «Разместить» (dmine-place-sql: держит то же, что
// сундук, не дорога, не блок/объект/декор, нет живого мешочка, не стоит
// другой игрок; природа и жила не нужны). Проход не проверяем (владелец,
// 22.10.2026: «если шахта преградит путь — то и пусть»). Кандидаты — один
// запрос признаков на круг AUTO_RADIUS; ближние первыми.
//
// Ставит тот же оператор placeDmineSql (late: гриб уже просрочен, именно этот
// — dmineId), ключ — на гриб (dmauto:<id>; новый подъём — новый id): повтор
// прохода, второй процесс сервера и гонка с ручной посадкой второй гриб не
// ставят (локи карты и рюкзака, ключ, state='item'). Клетку заняли между
// выборкой и записью — следующая.
//
// Ставить некуда (вокруг всё занято) или герой на острове новичка (там грибы
// не сажают) — гриб ждёт в рюкзаке до следующего прохода (герой мог отойти)
// или до конца жизни.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  CELL_HELD,
  cellExtraColsSql,
  cellFlagsColsSql,
  sameCellAsC,
} from "@/server/api/beta-raid/chest/chest-cell";
import { mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";
import { hexDisk } from "@/lib/mineBuild";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isMushroomKind, type MushroomKind } from "@/lib/mushroomKinds";
import { placeDmineSql, type DminePlaceRow } from "@/server/api/beta-raid/dmine/dmine-place-sql";
import { announceDmine, loadDmineOp } from "@/server/api/beta-raid/dmine/dmine-announce";

/** Как далеко от героя ищем годную клетку, шагов (своя — первой). */
export const AUTO_RADIUS = 2;
/** Сколько годных клеток пробуем за проход: каждая — оператор под локами. */
const TRIES = 4;

/** Просроченный гриб в рюкзаке с клеткой его героя (dmine-sweep: dueDminesSql). */
export type DueDmine = {
  /** raid_dmine.id — какой гриб ставим. */
  id: string;
  hero_id: string;
  account_id: string;
  /** Вид гриба (raid_dmine.mushroom): стопка dmine:<вид>. */
  mushroom?: MushroomKind | string | null;
  /** Кошелёк поднявшего (raid_dmine.taken_wallet), иначе — позиции. */
  wallet: string | null;
  map_id: string | null;
  q: number | string | null;
  r: number | string | null;
};

/** Признаки клетки для автопостановки (столбцы оператора «Разместить»). */
export type AutoCellRow = {
  q: number | string;
  r: number | string;
  busy: boolean | null;
  road: boolean | null;
  taken: boolean | null;
  bag: boolean | null;
  player: boolean | null;
};

/** «Встала» / «ставить некуда, позже» / «предмета уже нет». */
export type AutoResult = "placed" | "none" | "gone";

/** Ключ автопостановки — на гриб: новый подъём — новый id, новый ключ. */
export const autoOpOf = (dmineId: string): string => `dmauto:${dmineId}`;

/** Признаки всех клеток круга вокруг героя — один запрос. */
export function autoCellsSql(
  o: { mapId: string; q: number; r: number; account: string },
  radius = AUTO_RADIUS,
): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  return `SELECT f.q, f.r, ${CELL_HELD} AS busy, f.road, f.taken, f.bag, f.player
       FROM (
         SELECT c.q, c.r, ${cellFlagsColsSql(sameCellAsC)},
                ${cellExtraColsSql(sameCellAsC)},
                ${mineCellColsSql(o.account, sameCellAsC)}
           FROM yuplink.raid_map_cells c
           LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
          WHERE c.map_id = ${sqlStr(o.mapId)}
            AND c.q BETWEEN ${q - radius} AND ${q + radius}
            AND c.r BETWEEN ${r - radius} AND ${r + radius}
            AND abs((c.q + c.r) - ${q + r}) <= ${radius}
       ) f
       CROSS JOIN LATERAL (SELECT f.decor, f.ship) ex`;
}

/** Годные клетки по порядку: своя, потом ближние. Клетки нет в ответе — её нет на карте. */
export function autoCells(
  center: { q: number; r: number },
  rows: readonly AutoCellRow[],
  radius = AUTO_RADIUS,
): Array<{ q: number; r: number }> {
  const byKey = new Map(rows.map((x) => [`${Number(x.q)},${Number(x.r)}`, x]));
  return hexDisk(center, radius).filter(({ q, r }) => {
    const x = byKey.get(`${q},${r}`);
    return !!x && !x.busy && !x.taken && !x.bag && !x.road && !x.player;
  });
}

/** Ключ лёг — гриб встал (этим проходом или прошлым): дошлём клетку, если надо. */
async function placedBy(op: string): Promise<boolean> {
  const row = await loadDmineOp(op);
  if (!row) return false;
  if (!row.sent) await announceDmine(row);
  return true;
}

/** Одна клетка: встала / предмета нет / клетка не подошла — следующая. */
async function placeAt(
  d: DueDmine,
  op: string,
  mapId: string,
  at: { q: number; r: number },
): Promise<AutoResult | "next"> {
  const sql = placeDmineSql({
    mapId,
    q: at.q,
    r: at.r,
    account: d.account_id,
    wallet: d.wallet,
    heroId: d.hero_id,
    dmineId: d.id,
    op,
    kind: isMushroomKind(d.mushroom) ? d.mushroom : "darai",
    late: true,
    cost: 0,
  });
  let row: DminePlaceRow | null = null;
  let failed: unknown = null;
  try {
    row = sqlRow<DminePlaceRow>((await mcpExec(sql)) as unknown[]) ?? null;
  } catch (e) {
    failed = e;
  }
  // Встала, повтор или обрыв после коммита — судит ключ.
  if (await placedBy(op)) return "placed";
  if (failed) throw failed;
  // Гриба нет (посадили руками, кончилась жизнь) или стопки уже нет.
  if (row && row.cell && (!row.dm || !row.box)) return "gone";
  return "next";
}

/** Поставить просроченный гриб у героя. Сбой базы — бросок (обход отложит строку). */
export async function autoPlaceDmine(d: DueDmine): Promise<AutoResult> {
  if (!d.id || !d.hero_id) return "gone";
  const op = autoOpOf(d.id);
  if (await placedBy(op)) return "placed";
  if (!d.map_id || d.q == null || d.r == null || isIslandMapId(d.map_id)) return "none";
  const [mapId, q, r] = [d.map_id, Number(d.q), Number(d.r)];
  const rows = (await mcpExec(autoCellsSql({ mapId, q, r, account: d.account_id }), {
    wrapJson: true,
  })) as AutoCellRow[] | null;
  for (const at of autoCells({ q, r }, rows ?? []).slice(0, TRIES)) {
    const res = await placeAt(d, op, mapId, at);
    if (res !== "next") return res;
  }
  return "none";
}
