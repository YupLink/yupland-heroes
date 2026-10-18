// «Забрать сундук» (магический) в SQL: запись одним оператором. Снимок и общие
// выражения — chest-pickup-snap-sql.ts.
//
// Запись — под локами сети ХОЗЯИНА и рюкзака снимающего (те же, что у вклада
// и забора; locksSql — отдельными операторами, чтобы WITH читал свежий
// снимок) и под замком строки охраны. Она сверяет отпечатки рюкзака и сети,
// «последний ли», охрану (и целая ли она: раненая не возвращается — 29.09), у
// чужого — что живой охраны нет, и только тогда снимает сундук, охрану и (у
// последнего) всю сеть, кладёт в рюкзак ровно строки плана, остаток — мешочком
// на клетке (bag-leftover-sql) и пишет журнал. Не сошлось — ничего не тронуто,
// план пересчитывается. Из «забрать сундук» / «забрать товар» / «положить» /
// второго «забрать сундук» проходит одно: лок сети общий, и содержимое сети
// уезжает один раз. Ключ нажатия — в raid_backpack_op: повтор моста после
// коммита видит его и не пишет второй раз.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень (market-backpack-
// write.ts). Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import type { LootPick } from "@/lib/magicChest";
import { originCols, originGrowSql, originSetSql } from "@/server/api/beta-raid/stack-origin";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import type { PickupRow } from "@/server/api/beta-raid/chest/chest-pickup-plan";
import {
  atCell,
  bagFpSql,
  chestSql,
  guardSql,
  guardedSql,
  lastSql,
  leftoverKeyOf,
  netFpSql,
  pickupIdSql,
  type PickupWho,
} from "@/server/api/beta-raid/chest/chest-pickup-snap-sql";
import { leftoverBagSql, type BaggedRow } from "@/server/api/beta-raid/loot-bag/bag-leftover-sql";
import { magicTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

export type { PickupWho };
export { pickupDoneSql, pickupIdSql, pickupSnapSql } from "@/server/api/beta-raid/chest/chest-pickup-snap-sql";

/** Ответ записи: повтор, сделано, и почему нет. */
export type PickupRes = {
  was: boolean;
  picked: boolean;
  here: boolean;
  /** На клетке живая охрана — чужому сначала бой. */
  guarded: boolean | null;
  fresh: boolean | null;
  last: boolean | null;
  has_net: boolean | null;
  bag_id: string | null;
};

/**
 * Записать план. expect — снимок, по которому он посчитан: отпечатки,
 * «последний», шаблон охраны и целая ли она. items/taken — журнал (сеть и что
 * из неё легло), bagged — мешочком на клетке. woundedOk — хозяин видел
 * «охрана ранена — не вернётся».
 */
export function pickupSql(
  o: PickupWho & {
    op: string;
    confirm: boolean;
    woundedOk: boolean;
    expect: {
      bagFp: string;
      netFp: string;
      last: boolean;
      tpl: string | null;
      whole: boolean | null;
    };
    rows: readonly PickupRow[];
    bagged: readonly BaggedRow[];
    items: unknown[];
    taken: readonly LootPick[];
  },
): string {
  const own = sqlStr(o.owner);
  const acc = sqlStr(o.account);
  const op = sqlStr(o.op);
  const e = o.expect;
  const foreign = o.owner !== o.account;
  const json = (v: unknown) => `${sqlStr(JSON.stringify(v))}::jsonb`;
  const old = originCols("yuplink.raid_hero_backpack.");
  const bag = leftoverBagSql({
    key: leftoverKeyOf(o.op),
    account: o.account,
    from: "del_ch",
    bagged: o.bagged,
  });
  // Строку охраны запираем ОТДЕЛЬНЫМ оператором до WITH: удар по охране не
  // берёт лок сети, и без этого урон между снимком и DELETE прошёл бы мимо
  // сверки «целая» (раненая вернулась бы целой). Запертую строку удар ждёт,
  // после нас находит 0 строк и возвращает энергию; WITH читает свежий снимок.
  return `${locksSql(`chest:${o.owner}`, `bp:${o.heroId}`)}
     SELECT 1 FROM yuplink.raid_mine_guard g WHERE ${atCell("g", o)} FOR UPDATE;
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     ch AS (${chestSql(o)}),
     st AS (
       SELECT ${lastSql(o)} AS last, ${guardedSql(o)} AS guarded,
              ${bagFpSql(o)} AS bag_fp, ${netFpSql(o)} AS net_fp,
              EXISTS (SELECT 1 FROM yuplink.raid_chest_slot s
                       WHERE s.account_id = ${own} AND s.count > 0) AS has_net,
              (SELECT tpl FROM (${guardSql(o)}) g LIMIT 1) AS tpl,
              (SELECT whole FROM (${guardSql(o)}) g LIMIT 1) AS whole
     ),
     /* План годен, только если снимок тот же: рюкзак, «последний», сеть, охрана
        и её HP (ранили под рукой — план с целой охраной вернул бы раненую). */
     fresh AS (
       SELECT (st.bag_fp = ${sqlStr(e.bagFp)} AND st.last = ${e.last}
               AND (NOT st.last OR st.net_fp = ${sqlStr(e.netFp)})
               AND st.tpl IS NOT DISTINCT FROM ${e.tpl ? sqlStr(e.tpl) : "NULL"}
               AND st.whole IS NOT DISTINCT FROM ${e.whole == null ? "NULL" : e.whole}) AS ok
         FROM st
     ),
     /* Раненая охрана пропадёт — только если хозяин это видел; чужой — только
        без живой охраны. */
     go AS (
       SELECT 1 FROM ch, prior, st, fresh
        WHERE NOT prior.was AND fresh.ok
          AND (${o.confirm} OR NOT st.last OR NOT st.has_net)
          AND (${o.woundedOk} OR st.whole IS NOT FALSE)
          AND (${!foreign} OR NOT st.guarded)
     ),
     del_ch AS (
       DELETE FROM yuplink.raid_magic_chest mc USING go
        WHERE ${atCell("mc", o)} AND mc.owner_account = ${own} AND mc.buried_at IS NULL
       RETURNING mc.map_id, mc.q, mc.r, mc.name
     ),
     del_g AS (
       DELETE FROM yuplink.raid_mine_guard g USING del_ch
        WHERE ${atCell("g", o)} AND g.owner_account = ${own}
       RETURNING 1
     ),
     del_net AS (
       DELETE FROM yuplink.raid_chest_slot s USING del_ch, st
        WHERE s.account_id = ${own} AND st.last
       RETURNING 1
     ),
     /* Вход — по клетке: сундука нет — входы в него закрыты, чтобы не открыть
        им сундук, который поставят сюда потом. Срок гаснет, строка остаётся
        (как у закрытия окна): опоздавший повтор моста «Открыть» видит свой
        ключ нажатия и второй раз не платит. */
     del_pass AS (
       UPDATE yuplink.raid_open_pass p SET until = now() FROM del_ch
        WHERE p.target = ${sqlStr(magicTarget(o.mapId, o.q, o.r))} AND p.until > now()
       RETURNING 1
     ),
     /* Метки — все четыре (stack-origin): товары сети — «собрано прочее»,
        сундук и охрана — без меток; прежние метки стека — не больше count. */
     put AS (
       INSERT INTO yuplink.raid_hero_backpack
          (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
           mob_count, mine_count, field_count, loot_count)
       SELECT 'bp_' || substr(md5(${op} || ':' || x.k), 1, 20), ${sqlStr(o.heroId)}, ${acc},
              x.kind, x.ref, x.item, x.k, x.name, x.image, x.qty, 0, 0, 0, x.loot
         FROM del_ch,
              jsonb_to_recordset(${json(o.rows)}) AS x(k text, kind text, ref text, item text,
                                                     name text, image text, qty numeric, loot numeric)
       ON CONFLICT (hero_id, stack_key) DO UPDATE
         SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
             ${originSetSql(originGrowSql(old, originCols("EXCLUDED.")))},
             updated_at = now()
       RETURNING 1
     ),
     ${bag}
     log AS (
       INSERT INTO yuplink.raid_chest_plunder
          (id, map_id, q, r, owner_account, raider_account, items, taken, claimed_at, claim_op)
       SELECT ${pickupIdSql(o.op)}, ${sqlStr(o.mapId)}, ${o.q}, ${o.r}, ${own}, ${acc},
              ${json(o.items)}, ${json(o.taken)}, now(), ${op}
         FROM del_ch
       ON CONFLICT (id) DO NOTHING
       RETURNING 1
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${op} FROM del_ch
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was,
              EXISTS (SELECT 1 FROM del_ch) AS picked,
              EXISTS (SELECT 1 FROM ch) AS here,
              (SELECT guarded FROM st) AS guarded,
              (SELECT ok FROM fresh) AS fresh,
              (SELECT last FROM st) AS last,
              (SELECT has_net FROM st) AS has_net,
              (SELECT id FROM bag) AS bag_id
     ) _t;`;
}
