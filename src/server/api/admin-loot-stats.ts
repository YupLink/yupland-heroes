// Статистика «сколько игроки залутали» — для админки выплат.
//
// Считается ТОЛЬКО по заявкам игроков (yuplink.redemptions). Раздача держателям
// NFT («распределение», ~миллиард в месяц) идёт мимо счетов — прямыми
// переводами со склада через admin_batch_payouts_pending — и в этих числах не
// участвует: это разные потоки, и смешивать их нельзя (правило владельца
// 11.09.2026).
//
// Три числа на каждый токен отвечают на вопрос «куда ушли деньги игры»:
//   выведено   — реально ушло на кошельки игроков (redemptions paid);
//   на счетах  — залутано, но ещё лежит на едином счёте (не выведено);
//   в очереди  — заявки на вывод в работе (списано со счёта, в сеть не ушло).
// Сумма трёх = всё, что у игроков «на руках» по этому токену.
import { createServerFn } from "@tanstack/react-start";
import { requireTreasury } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Токены, которые показываем. Darai-семейство + USDT — основной лут. */
const LOOT_TOKENS = ["Darai", "GDarai", "USDT"] as const;

export type LootRow = {
  token: string;
  withdrawn: number; // выведено on-chain (paid)
  onAccounts: number; // положительные остатки на счетах
  pending: number; // заявки на вывод в работе
  total: number; // всё у игроков = сумма трёх
};

export const adminGetLootStats = createServerFn({ method: "GET" }).handler(async () => {
  requireTreasury();
  const list = LOOT_TOKENS.map((t) => sqlStr(t)).join(",");

  const rows = (await mcpExec(
    `WITH paid AS (
       SELECT reward_token AS token, COALESCE(sum(amount),0) AS v
         FROM yuplink.redemptions WHERE status='paid' AND reward_token IN (${list})
        GROUP BY reward_token),
     pend AS (
       SELECT reward_token AS token, COALESCE(sum(amount),0) AS v
         FROM yuplink.redemptions WHERE status IN ('pending','processing') AND reward_token IN (${list})
        GROUP BY reward_token),
     acc AS (
       SELECT token, COALESCE(sum(GREATEST(bal,0)),0) AS v FROM (
         SELECT account_id, token, sum(delta) AS bal
           FROM yuplink.acc_ledger WHERE token IN (${list}) GROUP BY 1,2) x
        GROUP BY token)
     SELECT t.token,
            COALESCE(p.v,0)::float8  AS withdrawn,
            COALESCE(a.v,0)::float8  AS on_accounts,
            COALESCE(q.v,0)::float8  AS pending
       FROM (SELECT unnest(ARRAY[${list}]) AS token) t
       LEFT JOIN paid p ON p.token=t.token
       LEFT JOIN acc  a ON a.token=t.token
       LEFT JOIN pend q ON q.token=t.token;`,
    { wrapJson: true },
  )) as Array<{ token: string; withdrawn: number; on_accounts: number; pending: number }>;

  const out: LootRow[] = (rows ?? []).map((r) => {
    const withdrawn = Number(r.withdrawn) || 0;
    const onAccounts = Number(r.on_accounts) || 0;
    const pending = Number(r.pending) || 0;
    return { token: r.token, withdrawn, onAccounts, pending, total: withdrawn + onAccounts + pending };
  });
  // Порядок как в LOOT_TOKENS (unnest может вернуть иначе).
  out.sort((a, b) => LOOT_TOKENS.indexOf(a.token as never) - LOOT_TOKENS.indexOf(b.token as never));
  return { rows: out };
});
