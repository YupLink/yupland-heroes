// YUPLINK · Cron: резолвер зависших NFT-выплат.
//
// Проблема: withdrawMyNfts ставит status=withdrawn + tx_hash В МОМЕНТ
// подписания (через onSigned колбек). Если потом broadcast упал по
// network/RPC — строка остаётся withdrawn навсегда, но NFT юзеру не
// доехала. last_error=null, видимых сигналов нет.
//
// Решение: каждые 10 минут проверяем через Sendler /history/nft-user-history
// для системного коша (NFT_PRIZE_OWNER = darai_gdrop.near), что tx_hash
// реально присутствует в исходящих nft_transfer. Если нет — откатываем
// строку обратно в pending + пишем last_error.
//
// Окно проверки: 10 мин..24 ч назад. До 10 мин — Sendler может ещё не
// проиндексить (typical lag 1-5 сек, но безопаснее подождать). После 24 ч —
// поздно дёргаться, юзер уже жалуется руками.

import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { fetchSendlerNftUserHistory } from "@/server/sendler";
import { writePayoutError } from "@/server/payoutSafety";

const NFT_PRIZE_OWNER = "darai_gdrop.near";
const MIN_AGE_MS = 10 * 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const SCAN_LIMIT = 200;

export const Route = createFileRoute("/api/cron/nft-payout-resolver")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
        }
        try {
          const result = await runNftPayoutResolver();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
      },
    },
  },
});

async function runNftPayoutResolver(): Promise<{
  scanned: number;
  confirmed: number;
  rolledBack: number;
  rollbackIds: string[];
}> {
  const now = Date.now();
  const minIso = new Date(now - MAX_AGE_MS).toISOString();
  const maxIso = new Date(now - MIN_AGE_MS).toISOString();

  // Кандидаты: withdrawn + tx_hash есть + ещё не помечены как failed
  const { data: rows } = await pg.nftRedemptions
    .raw()
    .select("id,contract_id,token_id,tx_hash,withdrawn_at,user_wallet")
    .eq("status", "withdrawn")
    .not("tx_hash", "is", null)
    .is("failed_at", null)
    .gte("withdrawn_at", minIso)
    .lte("withdrawn_at", maxIso)
    .order("withdrawn_at", { ascending: true })
    .limit(SCAN_LIMIT);

  const list = (rows ?? []) as Array<{
    id: string;
    contract_id: string;
    token_id: string;
    tx_hash: string;
    withdrawn_at: string;
    user_wallet: string;
  }>;
  if (list.length === 0) {
    return { scanned: 0, confirmed: 0, rolledBack: 0, rollbackIds: [] };
  }

  // Один запрос — все последние исходящие NFT-transfer с системного коша.
  let history: Awaited<ReturnType<typeof fetchSendlerNftUserHistory>>;
  try {
    history = await fetchSendlerNftUserHistory({
      walletId: NFT_PRIZE_OWNER,
      type: "transfer",
      direction: "out",
      limit: 200,
    });
  } catch (err) {
    // Sendler упал — не откатываем (лучше промолчать чем ложно роллбекать).
    throw new Error(
      `Sendler не отвечает: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const seenTxHashes = new Set(history.map((h) => h.tx_hash).filter(Boolean));
  // Также матчим по (contract_id, token_id) — на случай если tx_hash в БД
  // отличается по регистру / был обрезан / Sendler чуть переиграл.
  const seenContractToken = new Set(
    history.map((h) => `${h.contract_id}::${h.token_id}`)
  );

  const rolledBack: string[] = [];
  let confirmed = 0;

  for (const r of list) {
    const txOk = seenTxHashes.has(r.tx_hash);
    const ctOk = seenContractToken.has(`${r.contract_id}::${r.token_id}`);
    if (txOk || ctOk) {
      confirmed++;
      continue;
    }
    // Откатываем: NFT всё ещё на нашем коше (или Sendler так считает) —
    // юзеру не уехало. Возвращаем в pending чтобы повторно дёрнул withdraw.
    const { data: updated } = await pg.nftRedemptions
      .raw()
      .update({
        status: "pending",
        withdrawn_at: null,
        tx_hash: null,
      })
      .eq("id", r.id)
      .eq("status", "withdrawn")
      .eq("tx_hash", r.tx_hash)
      .select("id");
    if ((updated ?? []).length > 0) {
      rolledBack.push(r.id);
      await writePayoutError(
        [r.id],
        `Резолвер: tx_hash=${r.tx_hash} не найден в Sendler /history/nft-user-history через ${Math.round(
          (now - new Date(r.withdrawn_at).getTime()) / 60000
        )} мин. Откатили в pending — юзер сможет повторить вывод.`
      );
    }
  }

  return {
    scanned: list.length,
    confirmed,
    rolledBack: rolledBack.length,
    rollbackIds: rolledBack,
  };
}
