// «Посадить» гриб из рюкзака — одним оператором «всё или ничего» (владелец,
// 22.10.2026; lib/daraiMine.ts, lib/mushroomKinds.ts): энергия, клетка,
// постройка с прежними настройками и пределом часов до конца жизни, строка
// хозяина (секундомер с нуля), минус штука из стопки вида dmine:<вид>, отметка
// «встал» у гриба и ключ нажатия.
//
// Какой гриб: игрок — вида стопки, с ближайшим выпадением среди живых и не
// просроченных (владелец: «разместить ставит тот, у кого выпадение ближе
// всего»); обход сервера (dmine-autoplace) — тот, чей час вышел (dmineId, late).
// Энергия — тем же оператором и только вместе с грибом (paid от setc, как у
// шахт v2): нехватка роняет всё — ни гриба, ни траты; клетку перехватили —
// ни траты. Обход сервера ставит даром.
//
// Правила клетки — те же, что у постановки шахт v2 (mine-place-sql, §8.59
// п. 8): держит то же, что сундук (CELL_HELD), не дорога, не блок, не объект
// и не декор, нет живого мешочка, не стоит другой игрок. Проход не проверяем
// (владелец, 22.10.2026: «если шахта преградит путь — то и пусть»). Природа и
// жила грибу не нужны.
//
// maxHours клетки — целые часы от этой минуты до конца жизни: raid_mine_claim
// и raid_mine_pending сверх них не начислят (жизнь кончилась — часы хозяину).
//
// Локи — отдельными операторами до WITH, в порядке постановки шахт. Без
// обёртки wrapJson: изменяющие CTE — верхний уровень.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import {
  CELL_HELD,
  cellAt,
  cellExtraSql,
  cellFlagsSql,
  cellLockKey,
} from "@/server/api/beta-raid/chest/chest-cell";
import { mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import { DMINE_CARRY_MS } from "@/lib/daraiMine";
import { mushroomStackKey, type MushroomKind } from "@/lib/mushroomKinds";

export { dminePlaceVerdict, type DminePlaceRow } from "./dmine-place-verdict";

export type DminePlaceAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  /** Кошелёк хозяина и плательщика; нет — NULL (обход сервера, даром). */
  wallet: string | null;
  heroId: string;
  /** Какой гриб ставит обход сервера; нет — игрок, ближайшее выпадение. */
  dmineId?: string;
  op: string;
  /** Вид гриба: стопка dmine:<вид> и строки raid_dmine этого вида. */
  kind: MushroomKind;
  /** Обход сервера после часа (dmine-autoplace): гриб годен и просроченным. */
  late?: boolean;
  /** Энергия за посадку (игрок — MUSHROOM_ENERGY, обход — 0). */
  cost: number;
};

const CARRY = `interval '${Math.round(DMINE_CARRY_MS / 1000)} seconds'`;

/** Живой гриб вида в рюкзаке героя (алиас d). */
const aliveSql = (hero: string, kind: string): string =>
  `d.state = 'item' AND d.hero_id = ${hero} AND d.mushroom = ${kind}
          AND (d.dies_at IS NULL OR d.dies_at > now())`;

/**
 * Настройка клетки при посадке: конец жизни — из строки гриба (dies_at), maxHours —
 * целые часы до него.
 */
const PLACED_CFG = `CASE WHEN dm.dies_at IS NULL THEN dm.building_config - 'maxHours'
                ELSE (dm.building_config - 'maxHours') || jsonb_build_object('diesAt', dm.dies_at,
                       'maxHours', GREATEST(0, floor(extract(epoch FROM (dm.dies_at - now())) / 3600))::int)
           END`;

export function placeDmineSql(o: DminePlaceAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const acc = sqlStr(o.account);
  const hero = sqlStr(o.heroId);
  const kind = sqlStr(o.kind);
  const at = cellAt(o.mapId, q, r);
  const cost = Math.max(0, Math.floor(Number(o.cost) || 0));
  const pay = cost > 0 && !!o.wallet;
  return `${locksSql(
    `godmove:${o.mapId}`,
    `bp:${o.heroId}`,
    "decor-respawn",
    cellLockKey(o.mapId, q, r),
    `lootdrop:${o.mapId}:${q}:${r}`,
    mineLockKey(o.mapId, q, r),
  )}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_dmine_op WHERE op = ${key}
     ),
     f AS (${cellFlagsSql(o.mapId, q, r)}),
     ex AS (${cellExtraSql(o.mapId, q, r)}),
     mc AS (
       SELECT ${mineCellColsSql(o.account, at)}
         FROM yuplink.raid_map_cells c
        WHERE ${at("c")}
        LIMIT 1
     ),
     /* Какой гриб: ближайшее выпадение (час или конец жизни). */
     dm AS (
       SELECT d.id, d.building_id, d.building_config, d.building_skin_id, d.tier, d.dies_at
         FROM yuplink.raid_dmine d
        WHERE ${aliveSql(hero, kind)}${o.dmineId ? ` AND d.id = ${sqlStr(o.dmineId)}` : ""}${
          o.late ? "" : ` AND d.taken_at > now() - ${CARRY}`
        }
        ORDER BY LEAST(d.taken_at + ${CARRY}, COALESCE(d.dies_at, 'infinity'::timestamptz)), d.id
        LIMIT 1
          FOR UPDATE
     ),
     /* Просроченные (час вышел) — ставит обход: игроку «встанет сам». */
     overdue AS (
       SELECT 1 FROM yuplink.raid_dmine d
        WHERE ${aliveSql(hero, kind)} AND d.taken_at <= now() - ${CARRY}
        LIMIT 1
     ),
     item AS (
       SELECT b.id, b.count
         FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${hero} AND b.stack_key = ${sqlStr(mushroomStackKey(o.kind))} AND b.count >= 1
          FOR UPDATE
     ),
     go AS (
       SELECT 1 FROM f, ex, mc, item, dm
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ${CELL_HELD}
          AND NOT mc.road AND NOT mc.taken AND NOT mc.player AND NOT mc.bag
     ),
     setc AS (
       UPDATE yuplink.raid_map_cells c
          SET building_id = dm.building_id,
              building_config = ${PLACED_CFG},
              building_skin_id = dm.building_skin_id,
              saved_at = now()
         FROM go, dm
        WHERE ${at("c")} AND c.building_id IS NULL AND c.decoration_id IS NULL
       RETURNING c.q
     ),${
       pay
         ? `
     /* Энергия — только вместе с грибом; нехватка (not_enough_energy) роняет всё. */
     paid AS (
       SELECT 1 FROM setc
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet as string)}, ${cost}::numeric) e
     ),`
         : ""
     }
     own AS (
       INSERT INTO yuplink.raid_mine_state
         (map_id, q, r, owner_account, owner_wallet, captured_at, claimed_hours,
          mode, life_left, life_at, accrue_from)
       SELECT ${m}, ${q}, ${r}, ${acc}, ${o.wallet ? sqlStr(o.wallet) : "NULL"}, now(), 0, 'base', 1, now(), NULL
         FROM setc
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET owner_account = EXCLUDED.owner_account, owner_wallet = EXCLUDED.owner_wallet,
              captured_at = now(), claimed_hours = 0, mode = 'base', life_left = 1,
              life_at = now(), accrue_from = NULL
       RETURNING 1
     ),
     /* Стопка грибов — минус штука; последняя — строки нет. */
     dec AS (
       UPDATE yuplink.raid_hero_backpack b SET count = b.count - 1, updated_at = now()
         FROM item, setc
        WHERE b.id = item.id AND item.count > 1
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING item, setc
        WHERE b.id = item.id AND item.count <= 1
       RETURNING 1
     ),
     /* Тир постройки — прежний гриба; нулевой — строки нет. */
     tier_set AS (
       INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       SELECT ${m}, ${q}, ${r}, dm.tier, now(), ${acc} FROM setc, dm WHERE dm.tier > 0
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET tier = EXCLUDED.tier, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING 1
     ),
     tier_drop AS (
       DELETE FROM yuplink.beta_raid_building_state s USING setc, dm
        WHERE ${at("s")} AND dm.tier <= 0
       RETURNING 1
     ),
     /* Место срубленного декора: гриб временный — ожидание сразу «держит гриб» и
        проверяется раз в минуту; гриб ушёл — таймер «Респавн, мин» с той минуты
        (владелец 23.10.2026, decor-respawn-sql). */
     held AS (
       UPDATE yuplink.raid_decor_respawn d
          SET held_at = now(), due_at = now() + interval '1 minute'
         FROM setc WHERE ${at("d")} AND d.placed_at IS NULL
       RETURNING 1
     ),
     /* След прежней шахты: повергнутая охрана не наследуется. */
     ghost AS (
       DELETE FROM yuplink.raid_mine_guard g USING setc
        WHERE ${at("g")} AND (g.killed_at IS NOT NULL OR g.current_hp <= 0)
       RETURNING 1
     ),
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM setc WHERE mp.id = ${m}
       RETURNING 1
     ),
     done AS (
       UPDATE yuplink.raid_dmine d
          SET state = 'placed', placed_by = ${acc}, placed_map = ${m},
              placed_q = ${q}, placed_r = ${r}, placed_at = now()
         FROM setc, dm
        WHERE d.id = dm.id
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_dmine_op (op, kind, account_id, dmine_id, map_id, q, r, paid)
       SELECT ${key}, 'place', ${acc}, dm.id, ${m}, ${q}, ${r}, ${pay ? cost : 0} FROM setc, dm
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM setc) AS placed,
              EXISTS (SELECT 1 FROM f) AS cell,
              (SELECT ${CELL_HELD} FROM f, ex) AS busy,
              (SELECT mc.road FROM mc) AS road,
              (SELECT mc.taken FROM mc) AS taken,
              (SELECT mc.bag FROM mc) AS bag,
              (SELECT mc.player FROM mc) AS player,
              EXISTS (SELECT 1 FROM item) AS box,
              (NOT EXISTS (SELECT 1 FROM dm) AND EXISTS (SELECT 1 FROM overdue)) AS expired,
              EXISTS (SELECT 1 FROM dm) AS dm,
              false AS moved,
              ${pay ? `(SELECT count(*) FROM paid)::int * ${cost}` : "0"} AS paid
     ) _t;`;
}
