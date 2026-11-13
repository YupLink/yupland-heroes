// Усиление чертежа шахты — чтение уровня и оператор покупки (lib/mineBoost).
// Покупка — один оператор: уровень тот, что видел игрок (двойное нажатие не
// купит два уровня), алмазы res_move ключом уровня, уровень +1. Нехватка алмазов
// роняет всё («res_move: в минус» → architect.no_resources).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { BLUEPRINT_RESOURCES, type BlueprintResource } from "@/lib/mineBlueprint";
import { mineBoostClamp, mineBoostRef } from "@/lib/mineBoost";

export type MineBoosts = Record<BlueprintResource, number>;

/** Уровни усиления аккаунта по видам (нет строки — 0). */
export async function mineBoostLevels(account: string): Promise<MineBoosts> {
  const rows = (await mcpExec(
    `SELECT kind, level FROM yuplink.account_mine_boost WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ kind: string; level: number | string }> | null;
  const out = Object.fromEntries(BLUEPRINT_RESOURCES.map((k) => [k, 0])) as MineBoosts;
  for (const r of rows ?? []) {
    if ((BLUEPRINT_RESOURCES as readonly string[]).includes(r.kind)) {
      out[r.kind as BlueprintResource] = mineBoostClamp(r.level);
    }
  }
  return out;
}

/** Уровень усиления одного вида. */
export async function mineBoostLevel(account: string, kind: BlueprintResource): Promise<number> {
  return (await mineBoostLevels(account))[kind];
}

export type BoostBuyRow = { was: number; now: number | null };

export function buyMineBoostSql(o: {
  account: string;
  kind: BlueprintResource;
  from: number;
  diamonds: number;
}): string {
  const acc = sqlStr(o.account);
  const kind = sqlStr(o.kind);
  const from = Math.floor(o.from);
  const ref = sqlStr(mineBoostRef(o.account, o.kind, from + 1));
  return `${locksSql(`mineboost:${o.account}:${o.kind}`)}
     WITH cur AS (
       SELECT COALESCE((SELECT level FROM yuplink.account_mine_boost
                         WHERE account_id = ${acc} AND kind = ${kind}), 0) AS lvl
     ),
     go AS (SELECT 1 FROM cur WHERE cur.lvl = ${from}),
     pay AS (
       SELECT m.applied FROM go
        CROSS JOIN LATERAL yuplink.res_move(${acc}, 'diamonds', ${-Math.abs(o.diamonds)},
                                            'mine_boost', ${ref}) m
     ),
     up AS (
       INSERT INTO yuplink.account_mine_boost (account_id, kind, level, updated_at)
       SELECT ${acc}, ${kind}, ${from + 1}, now() FROM pay
       ON CONFLICT (account_id, kind) DO UPDATE SET level = EXCLUDED.level, updated_at = now()
        WHERE yuplink.account_mine_boost.level = ${from}
       RETURNING level
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT lvl FROM cur) AS was, (SELECT level FROM up) AS now
     ) _t;`;
}
