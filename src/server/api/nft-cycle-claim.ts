// Зачесть перевод NFT: решение и запись — одним запросом под замком по номеру.
//
// Круг, найденный по снимку, мог закрыть параллельный вызов: UPDATE перепроверит
// строку и не тронет её, тогда решаем заново со свежим снимком. Замок сокращает
// гонки, но корректность держат перепроверка UPDATE и уникальные индексы: снимок
// запроса в READ COMMITTED берётся до замка внутри CTE. Правило — src/lib/nftCycle.ts.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { iso, parseCur, stableId } from "./nft-cycle-row";
import type { CycleBinding } from "@/lib/nftCycle";

const T = "yuplink.nft_token_cycle";

export type CreditClaim =
  | {
      kind: "claimed";
      cycleId: string;
      implicit: boolean;
      binding: CycleBinding | null;
      /**
       * Круг уже был закрыт этим переводом, а выдачи нет — прерванная выдача
       * (обрыв связи после записи, перезапуск). Доделываем теми же id.
       */
      resumed: boolean;
    }
  | { kind: "already"; cycleId: string }
  | { kind: "stale"; cycleId: string };

type ClaimRow = {
  decision: "close" | "implicit" | "already" | "stale";
  closed_id: string | null;
  inserted_id: string | null;
  mine: unknown;
  cur: unknown;
};

export async function claimCredit(o: {
  contract: string;
  tokenId: string;
  txHash: string;
  atMs: number;
  wallet: string;
  source: string;
}): Promise<CreditClaim> {
  const at = `${sqlStr(iso(o.atMs))}::timestamptz`;
  const c = sqlStr(o.contract);
  const t = sqlStr(o.tokenId);
  const tx = sqlStr(o.txHash);
  // Id неявного круга выводится из перевода: повтор попадает в ту же строку.
  const implicitId = await stableId("ncy_i", o.contract, o.tokenId, o.txHash);
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = (await mcpExec(
      `WITH _lock AS (SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`nftcycle:${o.contract}:${o.tokenId}`)})) AS l),
       cy AS (SELECT x.* FROM ${T} x, _lock WHERE x.contract = ${c} AND x.token_id = ${t}),
       mine AS (SELECT * FROM cy WHERE close_tx = ${tx} LIMIT 1),
       cur AS (SELECT * FROM cy WHERE opened_at <= ${at} ORDER BY opened_at DESC, id COLLATE "C" DESC LIMIT 1),
       d AS (SELECT CASE
               WHEN EXISTS (SELECT 1 FROM mine) THEN 'already'
               WHEN NOT EXISTS (SELECT 1 FROM cur) THEN 'implicit'
               WHEN (SELECT closed_at FROM cur) IS NULL THEN 'close'
               WHEN (SELECT closed_at FROM cur) < ${at} THEN 'implicit'
               ELSE 'stale' END AS v),
       upd AS (UPDATE ${T} x
                  SET closed_at = ${at}, closed_by = ${sqlStr(o.wallet)}, close_tx = ${tx},
                      close_source = ${sqlStr(o.source)}, updated_at = now()
                WHERE x.id = (SELECT id FROM cur) AND x.closed_at IS NULL
                  AND (SELECT v FROM d) = 'close'
               RETURNING x.id),
       ins AS (INSERT INTO ${T} (id, contract, token_id, opened_at, open_source,
                                 closed_at, closed_by, close_tx, close_source)
               SELECT ${sqlStr(implicitId)}, ${c}, ${t}, ${at} - interval '1 millisecond',
                      'implicit', ${at}, ${sqlStr(o.wallet)}, ${tx}, ${sqlStr(o.source)}
                WHERE (SELECT v FROM d) = 'implicit'
               ON CONFLICT DO NOTHING
               RETURNING id)
       SELECT (SELECT v FROM d) AS decision, (SELECT id FROM upd) AS closed_id,
              (SELECT id FROM ins) AS inserted_id, (SELECT row_to_json(mine.*) FROM mine) AS mine,
              (SELECT row_to_json(cur.*) FROM cur) AS cur;`,
      { wrapJson: false },
    )) as ClaimRow[];
    const r = rows?.[0];
    if (!r) throw new Error("Учёт кругов NFT не ответил");
    const cur = parseCur(r.cur);
    const mine = parseCur(r.mine);
    if (r.decision === "already" && mine) {
      // Закрыт этим же переводом, но выдачи нет — доделать, а не считать сделанным.
      if (!mine.granted) {
        return {
          kind: "claimed",
          cycleId: mine.id,
          implicit: mine.openSource === "implicit",
          binding: mine.binding,
          resumed: true,
        };
      }
      return { kind: "already", cycleId: mine.id };
    }
    if (r.decision === "stale" && cur) return { kind: "stale", cycleId: cur.id };
    if (r.decision === "close" && r.closed_id) {
      return {
        kind: "claimed",
        cycleId: r.closed_id,
        implicit: false,
        binding: cur?.binding ?? null,
        resumed: false,
      };
    }
    if (r.decision === "implicit" && r.inserted_id) {
      return { kind: "claimed", cycleId: r.inserted_id, implicit: true, binding: null, resumed: false };
    }
    // Проиграли гонку — следующий проход увидит уже записанное.
  }
  throw new Error("Не удалось зачесть NFT: учёт кругов занят, попробуй ещё раз");
}
