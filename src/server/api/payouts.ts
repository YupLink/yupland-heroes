// YUPLINK · Распределение DARAI с системного коша darai_gdrop.near.
//
// Правило раздачи (по требованию):
//   50%   → darai_duplo.near (дупло)
//   25%   → поровну между держателями NFT "Yup'ik YupLink (legendary)"
//   12.5% → admin2.example.tg
//   12.5% → owner.example.tg
//
// ВАЖНО: считаем НЕ от всего баланса коша. На darai_gdrop.near лежат
// вперемешку две разные кучи: доход с продаж (его и делим) и игровой пул,
// который завёл darai_collection.near под награды на карте. Пул — не наш
// доход, раздавать его холдерам нельзя. Поэтому база раздачи —
// payoutAvailable из darai-pools (баланс минус всё, что уже чьё-то: пул карты,
// объекты на карте, счета игроков, очередь наград, выводы, подарки, подписки).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requirePayoutsAdmin, getCurrentWallet } from "../auth";
import { createAdminBatchPayoutRequest } from "../adminPayouts";
import { getDaraiPools } from "./darai-pools";

// Диагностика NFT-выплат и читалка баланса живут отдельными модулями, но
// исторически импортируются из payouts — держим реэкспорты, чтобы не ломать
// вызовы (в т.ч. darai-pools, который берёт баланс коша отсюда).
export { adminGetPayoutErrors, adminClearPayoutErrorFn } from "./payouts-errors";
export { fetchDaraiBalance } from "./payouts-balance";

export const adminGetDaraiDistributionPreview = createServerFn({
  method: "GET",
})
  .inputValidator((d: unknown) =>
    z
      .object({
        // Если передали — считаем от этой суммы, а не от доступной к раздаче.
        // human значение, перемножим на 10^18.
        amountHuman: z.number().positive().optional(),
      })
      .default({})
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requireAdmin();

    const { distributionPreview } = await import("./payouts-plan");
    return distributionPreview(await getDaraiPools(), data.amountHuman);
  });

/**
 * Запустить распределение БАТЧЕМ: одна pending-заявка на ВСЕХ
 * получателей, один TG-confirm, на approve — chunked-batch ft_transfer
 * (одна tx подписи на 15 получателей, остальные — следующими tx).
 */
export const adminDistributeDarai = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        amountHuman: z.number().positive().optional(),
      })
      .default({})
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const requestedBy = getCurrentWallet() ?? "admin";
    const startedAt = new Date(Date.now() - 5_000).toISOString();

    // Реюз превью.
    const preview = await adminGetDaraiDistributionPreview({
      data: data.amountHuman ? { amountHuman: data.amountHuman } : {},
    });

    const { distributionItems, DARAI_FT_CONTRACT, DARAI_DECIMALS } = await import("./payouts-plan");
    const items = distributionItems(preview);

    // Авторассылка (autodist/free-darai.ts) идёт или стартовала, пока считалось
    // превью, — счёт устарел, и заявка разослала бы те же деньги второй раз.
    const { mcpExec } = await import("../db/mcpClient");
    const busy = (await mcpExec(
      `SELECT 1 AS busy FROM yuplink.money_batch
        WHERE bucket = 'darai_free' AND (status = 'running' OR created_at >= '${startedAt}'::timestamptz)
        LIMIT 1;`,
      { wrapJson: true },
    )) as unknown[] | null;
    if (busy?.length) throw new Error("Идёт авторассылка DARAI — дождись её итога в боте и пересчитай");

    const r = await createAdminBatchPayoutRequest({
      ftContract: DARAI_FT_CONTRACT,
      symbol: "DARAI",
      decimals: DARAI_DECIMALS,
      items,
      reason: `DARAI distribution от ${preview.totalHuman.toFixed(2)} (${preview.sourceWallet})`,
      requestedBy,
    });

    return {
      ok: true,
      batchId: r.id,
      sentToAdmins: r.sentToAdmins,
      total: items.length,
      message: `Создан 1 батч-запрос на ${items.length} получателей. Подтверди в Telegram — отправится одной транзакцией.`,
    };
  });
