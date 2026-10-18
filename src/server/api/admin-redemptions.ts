import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";

export const listRedemptions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "paid", "pending", "processing", "cancelled"]).default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();

    // Журнал: только последние LIST_LIMIT записей. Таблица redemptions ~14k+ строк;
    // без limit findMany авто-пагинирует по 1000 → ~15 round-trip'ов к MCP → ~14с →
    // dev/SSR-fetch рвёт сокет, страница виснет на «Загрузка». С limit — один range-запрос.
    const LIST_LIMIT = 500;
    const rows =
      data.status === "all"
        ? await pg.redemptions.findMany(undefined, {
            orderBy: { column: "redeemed_at", ascending: false },
            limit: LIST_LIMIT,
          })
        : await pg.redemptions.findMany(
            { status: data.status },
            {
              orderBy: { column: "redeemed_at", ascending: false },
              limit: LIST_LIMIT,
            },
          );

    const camps = await pg.campaigns.findMany();
    const campaignNameMap = new Map(camps.map((c) => [c.id, c.name]));
    const campaignTokenMap = new Map(camps.map((c) => [c.id, c.reward_token]));

    return rows.map((r) => ({
      id: r.id,
      nftId: `${r.contract_id} ${r.token_id}`,
      collection: r.contract_id,
      wallet: r.wallet,
      amount: r.amount,
      // У вывода со счёта кампании нет, а токен записан прямо в строке —
      // иначе владелец видит прочерк вместо «100000 Darai» и принимает
      // собственную заявку за мусор.
      token: r.campaign_id
        ? (campaignTokenMap.get(r.campaign_id) ?? r.reward_token ?? "—")
        : (r.reward_token ?? "—"),
      timestamp: r.redeemed_at,
      txHash: r.tx_hash ?? "—",
      status: r.status,
      campaign: r.campaign_id ? (campaignNameMap.get(r.campaign_id) ?? "") : "",
    }));
  });

/** Разделить идентификаторы на заявки вывода со счёта и всё остальное. */
async function splitAccountRows(ids: string[]): Promise<{ acct: string[]; rest: string[] }> {
  const { data } = await pg.redemptions.raw().select("id,contract_id").in("id", ids);
  const rows = (data ?? []) as Array<{ id: string; contract_id: string }>;
  const acct = rows.filter((r) => r.contract_id === "acct").map((r) => r.id);
  const acctSet = new Set(acct);
  return { acct, rest: ids.filter((id) => !acctSet.has(id)) };
}

export const markRedemptionsPaid = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string()).min(1),
        txHash: z.string().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    if (!data.txHash) {
      const { acct } = await splitAccountRows(data.ids);
      if (acct.length > 0) {
        throw new Error("Это вывод со счёта: пометить выплаченным можно только с хэшем перевода");
      }
    }
    const patch: { status: string; tx_hash?: string } = { status: "paid" };
    if (data.txHash) patch.tx_hash = data.txHash;
    const { error } = await pg.redemptions.raw().update(patch).in("id", data.ids);
    if (error) throw new Error(`markRedemptionsPaid: ${error.message}`);
    return { ok: true, count: data.ids.length };
  });

/**
 * Вернуть processing → pending (если оператор уверен, что on-chain
 * транзакция НЕ прошла).
 */
export const unstickProcessingRedemption = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const { error } = await pg.redemptions
      .raw()
      .update({ status: "pending" })
      .in("id", data.ids)
      .eq("status", "processing")
      // Вывод со счёта сюда не пускаем: вернуть его в pending без проверки
      // цепи значит разрешить второй перевод по тем же деньгам.
      .neq("contract_id", "acct");
    if (error) throw new Error(`unstickProcessingRedemption: ${error.message}`);
    return { ok: true, count: data.ids.length };
  });

/**
 * Отменить processing/pending запись (отметить как cancelled с amount=0).
 */
export const cancelRedemption = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const { acct, rest } = await splitAccountRows(data.ids);

    // Заявка на вывод со счёта — не мусор: деньги уже списаны с acc_ledger.
    // Обычный update поставил бы amount=0, триггер леджера при нулевой сумме
    // выходит первой строкой, и возврата не случилось бы вовсе.
    for (const id of acct) {
      const { error } = await sb.rpc("acc_withdraw_cancel", { p_id: id });
      if (error) {
        const msg = String(error.message ?? "");
        if (/already_sent/.test(msg)) {
          throw new Error("Перевод по этой заявке уже ушёл в сеть — отменять нечего");
        }
        throw new Error(msg || "Не удалось отменить вывод со счёта");
      }
    }

    if (rest.length > 0) {
      const { error } = await pg.redemptions
        .raw()
        .update({ status: "cancelled", amount: 0 })
        .in("id", rest);
      if (error) throw new Error(`cancelRedemption: ${error.message}`);
    }
    return { ok: true, count: data.ids.length };
  });

export const exportRedemptionsCsv = createServerFn({ method: "GET" }).handler(async () => {
  requirePayoutsAdmin();
  const rows = await pg.redemptions.findMany();
  const camps = await pg.campaigns.findMany();
  const campaignMap = new Map(camps.map((c) => [c.id, c.name]));

  const header = [
    "id",
    "contract_id",
    "token_id",
    "campaign",
    "wallet",
    "amount",
    "status",
    "tx_hash",
    "redeemed_at",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.contract_id,
        r.token_id,
        r.campaign_id ? (campaignMap.get(r.campaign_id) ?? "") : "",
        r.wallet,
        r.amount,
        r.status,
        r.tx_hash ?? "",
        r.redeemed_at,
      ]
        .map(escape)
        .join(","),
    );
  }
  return { csv: lines.join("\n"), filename: `redemptions-${Date.now()}.csv` };
});
