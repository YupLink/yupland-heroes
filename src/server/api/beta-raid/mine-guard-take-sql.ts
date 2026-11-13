// «Забрать охрану» со своей шахты — одним оператором «всё или ничего»
// (владелец, 22.10.2026; lib/mineGuardTake): цена по запасу службы шахты,
// энергия, снятие живого охранника и босс в рюкзак тем же предметом, что из
// лавки (стопка boss:<шаблон>, вид boss), плюс ключ нажатия в raid_backpack_op.
//
// Энергия списывается до выдачи: строка охраны удаляется только вместе с
// удачным touch_energy_atomic (CTE paid), нехватка бросает not_enough_energy,
// и назад уходит всё. Повтор того же нажатия (ключ лежит) ничего не делает.
// Цена считается здесь же по запасу службы шахты сейчас (lifeNowSql; не v2 —
// 100) — та же лестница, что guardTakeEnergy; выросла против показанной
// игроку (expect) — отказ без движений. Охранник — мой (owner_account), шахта — моя; сломанная
// v2 (запас службы кончился) охрану не отдаёт — она сбежит при уборке.
//
// Локи — рюкзака героя и шахты, отдельными операторами до WITH. Без обёртки
// wrapJson: изменяющие CTE — верхний уровень.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  GUARD_PRICE_CHANGED,
  GUARD_TAKE_HIGH,
  GUARD_TAKE_LOW,
  GUARD_TAKE_MID,
} from "@/lib/mineGuardTake";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellAt } from "@/server/api/beta-raid/chest/chest-cell";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";

/** Ответ: повтор, снято ли и почему нет. */
export type GuardTakeRow = {
  was: boolean;
  taken: boolean;
  /** Живой охранник на клетке есть. */
  guard: boolean;
  /** Шахта моя (строка владения на мне). */
  owner: boolean;
  /** Запас службы v2 кончился — шахта сломана. */
  broken: boolean | null;
  /** Цена сейчас (энергия). */
  need: number | string | null;
  /** Босс влезает в рюкзак. */
  fits: boolean | null;
  /** Свободных ячеек рюкзака (для отказа). */
  free: number | string | null;
  paid: number | string | null;
};

export type GuardTakeAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
  capacity: number;
  /** Цена, которую видел игрок в окне подтверждения. */
  expect: number;
  op: string;
};

/** Доля запаса службы сейчас (алиас s — raid_mine_state); не v2 — NULL. */
export const lifeNowSql = (s: string): string =>
  `CASE WHEN ${s}.accrue_from IS NULL THEN NULL
        ELSE GREATEST(0, LEAST(1, ${s}.life_left)
             - GREATEST(0, extract(epoch FROM (now() - ${s}.life_at)) / 3600.0
                           / yuplink.raid_mine_mode_hours(${s}.mode))) END`;

/** Цена по запасу службы шахты (выражение life; NULL — запаса нет) — лестница guardTakeEnergy. */
export const guardTakeEnergySql = (life: string): string =>
  `CASE WHEN ${life} IS NULL OR ${life} > ${GUARD_TAKE_HIGH.above} THEN ${GUARD_TAKE_HIGH.energy}
        WHEN ${life} >= ${GUARD_TAKE_MID.from} THEN ${GUARD_TAKE_MID.energy}
        ELSE ${GUARD_TAKE_LOW.energy} END`;

export function takeGuardSql(o: GuardTakeAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const at = cellAt(o.mapId, q, r);
  const key = sqlStr(o.op);
  const hero = sqlStr(o.heroId);
  const cap = Math.max(0, Math.floor(Number(o.capacity) || 0));
  const expect = Math.max(0, Math.floor(Number(o.expect) || 0));
  const acc = sqlStr(o.account);
  /* Живой охранник ЭТОГО хозяина на клетке. */
  const mineGuard = `${at("g")} AND g.owner_account = ${acc} AND g.killed_at IS NULL AND g.current_hp > 0`;
  return `${locksSql(`bp:${o.heroId}`, mineLockKey(o.mapId, q, r))}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${key}) AS was
     ),
     st AS (
       SELECT s.owner_account, ${lifeNowSql("s")} AS life
         FROM yuplink.raid_mine_state s WHERE ${at("s")}
     ),
     g AS (
       SELECT g.boss_template_id, g.name, g.image
         FROM yuplink.raid_mine_guard g
        WHERE ${mineGuard}
          FOR UPDATE
     ),
     /* Цена — по запасу службы шахты сейчас; строки владения нет — как без запаса. */
     price AS (SELECT ${guardTakeEnergySql("x.life")} AS need FROM g LEFT JOIN st x ON true),
     room AS (
       SELECT COALESCE((SELECT b.count FROM yuplink.raid_hero_backpack b
                         WHERE b.hero_id = ${hero}
                           AND b.stack_key = 'boss:' || g.boss_template_id), 0) AS cur,
              COALESCE((SELECT SUM(CEIL(b.count::numeric / ${CELL_SIZE}))
                          FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                         WHERE b.hero_id = ${hero} AND NOT ${IS_POTION_SQL}), 0) AS items
         FROM g
     ),
     fits AS (
       SELECT items,
              items + CEIL((cur + 1)::numeric / ${CELL_SIZE}) - CEIL(cur::numeric / ${CELL_SIZE})
                <= GREATEST(${cap}, items) AS ok
         FROM room
     ),
     go AS (
       SELECT price.need FROM prior, st, price, g, fits
        WHERE NOT prior.was AND st.owner_account = ${acc}
          AND (st.life IS NULL OR st.life > 0)
          AND price.need <= ${expect} AND fits.ok
     ),
     /* Энергия — до выдачи: нехватка роняет весь оператор. */
     paid AS (
       SELECT go.need FROM go
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet)}, go.need::numeric) e
        WHERE go.need > 0
     ),
     del AS (
       DELETE FROM yuplink.raid_mine_guard g USING paid
        WHERE ${mineGuard}
       RETURNING g.boss_template_id, g.name, g.image
     ),
     ins AS (
       INSERT INTO yuplink.raid_hero_backpack
          (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
       SELECT 'bp_' || md5(${key}), ${hero}, ${acc}, 'boss', d.boss_template_id,
              'boss:' || d.boss_template_id, 'boss:' || d.boss_template_id, d.name, d.image, 1
         FROM del d
       ON CONFLICT (hero_id, stack_key) DO UPDATE
          SET count = yuplink.raid_hero_backpack.count + 1, updated_at = now()
       RETURNING 1
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${key} FROM del
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was,
              EXISTS (SELECT 1 FROM ins) AS taken,
              EXISTS (SELECT 1 FROM g) AS guard,
              COALESCE((SELECT st.owner_account = ${acc} FROM st), false) AS owner,
              (SELECT st.life IS NOT NULL AND st.life <= 0 FROM st) AS broken,
              (SELECT need FROM price) AS need,
              (SELECT ok FROM fits) AS fits,
              (SELECT GREATEST(0, ${cap} - items) FROM fits) AS free,
              (SELECT need FROM paid) AS paid
     ) _t;`;
}

/** Ответ → "ok" или текст отказа (ключ словаря или «ключ|{json}»). */
export function guardTakeVerdict(row: Partial<GuardTakeRow> | null | undefined): string {
  if (row?.was || row?.taken) return "ok";
  if (!row) return "chest.busy";
  if (!row.owner) return "mineguard.not_owner";
  if (row.broken) return "braid.mine_broken";
  if (!row.guard) return "mineguard.none";
  if (row.fits === false) return `market.backpack_need:1:${Math.max(0, Number(row.free) || 0)}`;
  return `${GUARD_PRICE_CHANGED}|${JSON.stringify({ need: Number(row.need) || 0 })}`;
}
