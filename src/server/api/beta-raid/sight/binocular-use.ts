// «Применить» бинокль (владелец, 08.11.2026): N штук за раз, каждая — +3 минуты
// обзора 40 клеток; уже действующий срок продлевается, а не сбрасывается.
// Списание, ключ нажатия и эффект — одной транзакцией (item-take-sql.ts).
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireWallet } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { rowOf } from "@/server/api/beta-raid/pay-once";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { TIMED_EFFECT_UPSERT } from "@/server/api/beta-raid/timed-effect-sql";
import { BINOCULAR_MINUTES, BINOCULAR_RADIUS, SIGHT_KIND } from "@/lib/raid/sight";
import { TAKE_FIELDS, TAKE_GATE, takeCtes, takeLockSql, type TakeRow } from "./item-take-sql";

/** Больше за одно нажатие не бывает: в рюкзаке столько не помещается. */
export const BINOCULAR_MAX_QTY = 1000;

export function binocularSql(o: {
  op: string;
  mark: string;
  heroId: string;
  account: string;
  qty: number;
  effectId: string;
}): string {
  const n = Math.max(1, Math.floor(o.qty));
  const ctes = [
    ...takeCtes({ ...o, flag: "is_binocular", stat: SIGHT_KIND }),
    `eff AS (
       INSERT INTO yuplink.beta_raid_player_effects
         (id, account_id, kind, value, expires_at, created_at, source)
       SELECT ${sqlStr(o.effectId)}, ${sqlStr(o.account)}, '${SIGHT_KIND}', ${BINOCULAR_RADIUS},
              now() + interval '${n * BINOCULAR_MINUTES} minutes', now(), 'binocular'
        WHERE ${TAKE_GATE}
       ${TIMED_EFFECT_UPSERT}
       RETURNING expires_at
     )`,
  ];
  return `${takeLockSql(o.heroId)}
     WITH ${ctes.join(",\n     ")}
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ${TAKE_FIELDS}, (SELECT expires_at FROM eff) AS until
     ) _t;`;
}

type Row = TakeRow & { until: string | null };

export type BinocularResult =
  | { state: "done"; until: string | null }
  | { state: "repeat" }
  | { state: "short" };

async function priorOf(op: string): Promise<string | null | undefined> {
  const rows = (await mcpExec(
    `SELECT source FROM yuplink.hero_boost_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ source: string | null }>;
  return rows?.[0] ? (rows[0].source ?? null) : undefined;
}

/** Срок обзора аккаунта сейчас (после повтора моста — ответ без строки eff). */
async function untilOf(account: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT expires_at FROM yuplink.beta_raid_player_effects
      WHERE account_id = ${sqlStr(account)} AND kind = '${SIGHT_KIND}' AND expires_at > now()
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ expires_at: string }>;
  return rows?.[0]?.expires_at ?? null;
}

export async function applyBinocularsFor(
  wallet: string,
  qty: number,
  op: string,
): Promise<BinocularResult> {
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("braid.backpack_no_hero");
  const account = await raidOwner(wallet);
  const mark = `sight#${nanoid(10)}`;
  const rows = await mcpExec(
    binocularSql({
      op,
      mark,
      heroId: bp.heroId,
      account,
      qty,
      effectId: `eff_sight_${nanoid(10)}`,
    }),
    { wrapJson: false },
  );
  let row: Row | undefined;
  try {
    row = rowOf<Row>(rows);
  } catch {
    row = undefined;
  }
  if (row?.fresh === true) return { state: "done", until: row.until ?? (await untilOf(account)) };
  // Ответ не разобрался или ключ уже чей-то — решает строка ключа.
  const prior = await priorOf(op);
  if (prior === mark) return { state: "done", until: await untilOf(account) };
  if (prior !== undefined) return { state: "repeat" };
  return { state: "short" };
}

export const applyBinoculars = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        qty: z.number().int().min(1).max(BINOCULAR_MAX_QTY),
        op: z.string().min(6).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<BinocularResult> => {
    const wallet = requireWallet();
    return applyBinocularsFor(wallet, data.qty, data.op);
  });
