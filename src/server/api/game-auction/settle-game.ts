// Выигрыш лота АДМИНА (владелец, 14.10.2026): ставки в DARAI и USDT — целиком
// разработчикам, отдельными копилками auc_darai / auc_usd (без дупла и пула
// карты); уходят пачкой по своему порогу (autodist/rules.ts: 1 млрд DARAI /
// 100 USDT). Прочие валюты — как и шли: ставка просто списана.
// Отметка fee_booked и строка копилки — одним запросом, ключ строки — от лота:
// повтор ничего не удвоит. Лоты игроков — settle-player.ts (10 % по схеме подписки).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

const BUCKET: Record<string, { bucket: string; token: string }> = {
  Darai: { bucket: "auc_darai", token: "Darai" },
  USDT: { bucket: "auc_usd", token: "USDT" },
};

/** Условие обхода: закрытый лот админа с победителем, выигрыш ещё не записан. */
export const GAME_DUE_SQL = `(a.source = 'game' AND a.status = 'settled'
  AND a.winner_account_id IS NOT NULL AND NOT a.fee_booked)`;

/** Записать выигрыш лота админа в копилку разработчиков. Идемпотентно. */
export async function bookGameIncome(auctionId: string, currency: string): Promise<void> {
  const id = sqlStr(auctionId);
  const to = BUCKET[currency];
  if (!to) {
    await mcpExec(
      `UPDATE yuplink.auction SET fee_booked = true
        WHERE id = ${id} AND source = 'game' AND status = 'settled' AND NOT fee_booked;`,
      { wrapJson: false },
    );
    return;
  }
  await mcpExec(`
WITH f AS (
  UPDATE yuplink.auction SET fee_booked = true
   WHERE id = ${id} AND source = 'game' AND status = 'settled'
     AND winner_account_id IS NOT NULL AND NOT fee_booked
  RETURNING id
), amt AS (
  SELECT COALESCE(sum(b.amount), 0) AS v FROM yuplink.auction_bid b
   WHERE b.auction_id = ${id} AND b.active
), m AS (
  INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
  SELECT 'mbm_' || f.id || '_adm', ${sqlStr(to.bucket)}, ${sqlStr(to.token)}, amt.v, 'income',
         'gaucadm:' || f.id, 'аукцион админа'
    FROM f, amt WHERE amt.v > 0
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM m)::int AS booked) _t;`);
  // Копилка — пачкой, если набрала порог.
  void import("../energy-sub/batch")
    .then((x) => x.runDueBatches("auto"))
    .catch((e) => console.warn("[auction] пачки:", e instanceof Error ? e.message : e));
}
