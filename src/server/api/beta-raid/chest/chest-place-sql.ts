// Установка сундука и охраны к нему — каждая одним оператором «всё или ничего».
//
// Третья редакция (28.09.2026): сундук без охраны грабят сразу, а живую охрану
// «Забрать сундук» возвращает владельцу боссом. Отсюда два закона:
//  1. Сундук, который ставят с охраной, ни мгновения не стоит без неё — иначе
//     грабитель, бьющий «Разграбить» по клетке, успел бы унести сеть.
//  2. Строка охраны появляется только вместе со списанием босса — иначе
//     «Забрать сундук» между закрепом и списанием вернул бы неоплаченного
//     босса (дюп).
// Поэтому клетка, охрана и списания сундука/босса — один оператор под локами
// сети владельца и рюкзака героя (те же, что у «Забрать» и вклада:
// chest-net-sql.ts locksSql, отдельными операторами до WITH). Строки рюкзака
// заперты FOR UPDATE — списание не промахнётся мимо проверки. Ключ операции в
// raid_backpack_op — повтор моста после коммита отвечает «было» и не пишет.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { deadGuardSql, locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import {
  CELL_HELD,
  cellExtraSql,
  cellFlagsSql,
  cellLockKey,
} from "@/server/api/beta-raid/chest/chest-cell";

/** Остаток меньше тысячной — это вся штука: пыль ячейкой не висит. */
const DUST = 0.001;

type Who = { mapId: string; q: number; r: number; account: string; heroId: string };
/** Охранник: стек босса в рюкзаке и его шаблон (HP, урон, способности). */
export type GuardPick = { stackKey: string; templateId: string; tpl: EncounterTarget };

const at = (a: string, o: Who): string =>
  `${a}.map_id = ${sqlStr(o.mapId)} AND ${a}.q = ${o.q} AND ${a}.r = ${o.r}`;

/** Запереть одну штуку стека: строка есть и в ней не меньше одной. */
const lockOne = (o: Who, stackKey: string, kind?: string): string =>
  `SELECT b.id FROM yuplink.raid_hero_backpack b
    WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.stack_key = ${sqlStr(stackKey)}
      ${kind ? `AND b.kind = ${sqlStr(kind)}` : ""} AND b.count >= 1
      FOR UPDATE`;

/**
 * Списать одну штуку запертой строки src — только если есть строка after.
 * Метки — как у любого списания (stack-origin): безымянное уходит первым.
 */
const spendOne = (name: string, src: string, after: string): string =>
  `${name}_upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - 1,
              ${originSetSql(originTakeSql(originCols("b."), "b.count - 1"))},
              updated_at = now()
         FROM ${src}, ${after}
        WHERE b.id = ${src}.id AND b.count - 1 >= ${DUST}
       RETURNING 1
     ),
     ${name}_del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING ${src}, ${after}
        WHERE b.id = ${src}.id AND b.count - 1 < ${DUST}
       RETURNING 1
     )`;

/**
 * Охранник на клетку, если есть строка from. Прежнюю строку клетки (мёртвую:
 * живую и чужую победу отсекают условия вызывающего) перезаписываем.
 */
const guardInsert = (o: Who, g: GuardPick, from: string): string => {
  const t = g.tpl;
  const str = (v: string | null | undefined) => (v ? sqlStr(v) : "NULL");
  return `INSERT INTO yuplink.raid_mine_guard
          (map_id, q, r, owner_account, boss_template_id, name, image, background,
           max_hp, current_hp, damage, abilities, interaction_cost, killed_at, killed_by, placed_at)
       SELECT ${sqlStr(o.mapId)}, ${o.q}, ${o.r}, ${sqlStr(o.account)}, ${sqlStr(g.templateId)},
              ${sqlStr(t.name)}, ${str(t.imageUrl)}, ${str(t.backgroundUrl)},
              ${t.maxHp}, ${t.maxHp}, ${t.damage != null ? sqlStr(String(t.damage)) : "NULL"},
              ${sqlStr(JSON.stringify(t.abilities ?? []))}::jsonb, ${t.interactionCost},
              NULL, NULL, now()
         FROM ${from}
       ON CONFLICT (map_id, q, r) DO UPDATE SET
         owner_account = EXCLUDED.owner_account, boss_template_id = EXCLUDED.boss_template_id,
         name = EXCLUDED.name, image = EXCLUDED.image, background = EXCLUDED.background,
         max_hp = EXCLUDED.max_hp, current_hp = EXCLUDED.max_hp, damage = EXCLUDED.damage,
         abilities = EXCLUDED.abilities, interaction_cost = EXCLUDED.interaction_cost,
         killed_at = NULL, killed_by = NULL, placed_at = now()
       RETURNING 1`;
};

/** Ответ установки: повтор, поставлено, и почему нет. */
export type PlaceRes = {
  was: boolean;
  placed: boolean;
  /** Клетки нет на карте — сундук не встанет. */
  cell: boolean;
  busy: boolean | null;
  box: boolean;
  boss: boolean;
};

/**
 * Поставить сундук (и охрану) на свою или соседнюю клетку (как обычный,
 * владелец 03.10.2026) и списать их из рюкзака. Клетку держат здание (вся его
 * площадь), живой объект или беглец, вода, купол, сундук (и обычный, и
 * бугорок), живая охрана, непроходимый декор и судно (CELL_HELD). Лок клетки —
 * общий с обычным сундуком (cellLockKey): иначе оба встали бы на одну клетку.
 */
export function placeChestSql(
  o: Who & { itemId: string; name: string; image: string | null; stackKey: string },
  guard: GuardPick | null,
  op: string,
): string {
  const key = sqlStr(op);
  return `${locksSql(`chest:${o.account}`, `bp:${o.heroId}`, cellLockKey(o.mapId, o.q, o.r))}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${key}) AS was
     ),
     f AS (${cellFlagsSql(o.mapId, o.q, o.r)}),
     ex AS (${cellExtraSql(o.mapId, o.q, o.r)}),
     box AS (${lockOne(o, o.stackKey)}),
     ${guard ? `boss AS (${lockOne(o, guard.stackKey, "boss")}),` : ""}
     go AS (
       SELECT 1 FROM prior, f, ex, box${guard ? ", boss" : ""}
        WHERE NOT prior.was AND NOT ${CELL_HELD}
     ),
     ins AS (
       INSERT INTO yuplink.raid_magic_chest (map_id, q, r, owner_account, item_id, name, image)
       SELECT ${sqlStr(o.mapId)}, ${o.q}, ${o.r}, ${sqlStr(o.account)}, ${sqlStr(o.itemId)},
              ${sqlStr(o.name)}, ${o.image ? sqlStr(o.image) : "NULL"}
         FROM go
       ON CONFLICT (map_id, q, r) DO NOTHING
       RETURNING 1
     ),
     ${guard ? `grd AS (${guardInsert(o, guard, "ins")}),` : ""}
     ${spendOne("box", "box", "ins")},
     ${guard ? `${spendOne("boss", "boss", "ins")},` : ""}
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${key} FROM ins
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was,
              EXISTS (SELECT 1 FROM ins) AS placed,
              EXISTS (SELECT 1 FROM f) AS cell,
              (SELECT ${CELL_HELD} FROM f, ex) AS busy,
              EXISTS (SELECT 1 FROM box) AS box,
              ${guard ? "EXISTS (SELECT 1 FROM boss)" : "true"} AS boss
     ) _t;`;
}

/** Ответ охраны к своему сундуку. */
export type GuardRes = {
  was: boolean;
  placed: boolean;
  chest: boolean;
  /** Мой сундук на клетке закопан — охрану на бугорок не ставят. */
  buried?: boolean;
  busy: boolean;
  boss: boolean;
};

/**
 * Поставить охрану к СВОЕМУ сундуку и списать босса. Нельзя поверх живой
 * охраны и на закопанный сундук (владелец, 29.09: охрану на бугорок не
 * ставят). Поверженная — не помеха: захвата больше нет (четвёртая редакция),
 * сундук остаётся хозяину, и он ставит новую.
 */
export function chestGuardSql(o: Who, guard: GuardPick, op: string): string {
  const key = sqlStr(op);
  return `${locksSql(`chest:${o.account}`, `bp:${o.heroId}`)}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${key}) AS was
     ),
     ch AS (
       SELECT 1 FROM yuplink.raid_magic_chest mc
        WHERE ${at("mc", o)} AND mc.owner_account = ${sqlStr(o.account)}
          AND mc.buried_at IS NULL
     ),
     busy AS (
       SELECT 1 FROM yuplink.raid_mine_guard g
        WHERE ${at("g", o)} AND NOT ${deadGuardSql("g")}
     ),
     boss AS (${lockOne(o, guard.stackKey, "boss")}),
     go AS (
       SELECT 1 FROM prior, ch, boss
        WHERE NOT prior.was AND NOT EXISTS (SELECT 1 FROM busy)
     ),
     grd AS (${guardInsert(o, guard, "go")}),
     ${spendOne("boss", "boss", "grd")},
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${key} FROM grd
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was,
              EXISTS (SELECT 1 FROM grd) AS placed,
              EXISTS (SELECT 1 FROM ch) AS chest,
              EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                       WHERE ${at("mc", o)} AND mc.owner_account = ${sqlStr(o.account)}
                         AND mc.buried_at IS NOT NULL) AS buried,
              EXISTS (SELECT 1 FROM busy) AS busy,
              EXISTS (SELECT 1 FROM boss) AS boss
     ) _t;`;
}
