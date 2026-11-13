// Выдать подписку из админки (владелец, 03.10.2026): тариф на выбор, своё
// число дней, игрок — по кошельку, Telegram ID или @username.
//
// Подписка привязывается к АККАУНТУ, а не к адресу: с какого бы кошелька
// игрок ни зашёл, дни придут в его «Подарки». Денег нет — сумма 0, валюта
// 'GRANT', корзины и пул карты не трогаются. Условия — снимок тарифа на
// момент выдачи, как у купленной. День 1 — сразу, письмо в Telegram.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin, requirePayoutsAdmin } from "../../auth";
import { loadTier } from "./tiers";
import { firstRow } from "./grant";

export type SubTarget = {
  accountId: string;
  wallet: string | null;
  wallets: string | null;
  telegramId: string | null;
  username: string | null;
};

/** Условие поиска: кошелёк, Telegram ID (цифры) или @username. */
export function targetWhere(raw: string): string {
  const q = raw.trim();
  if (/^\d{4,15}$/.test(q)) return `(u.telegram_id = ${q} OR a.telegram_id = ${q})`;
  const implicit = /^[0-9a-f]{64}$/i.test(q);
  if (q.startsWith("@") || (!q.includes(".") && !implicit)) {
    return `lower(u.telegram_username) = lower(${sqlStr(q.replace(/^@/, ""))})`;
  }
  return `lower(u.wallet) = lower(${sqlStr(q)})`;
}

export async function findSubTargets(raw: string): Promise<SubTarget[]> {
  const rows = (await mcpExec(
    `SELECT DISTINCT a.id AS "accountId", a.active_wallet AS wallet,
            (SELECT string_agg(x.wallet, ', ' ORDER BY x.created_at) FROM yuplink.users x
              WHERE x.account_id = a.id AND NOT COALESCE(x.detached, false)) AS wallets,
            COALESCE(a.telegram_id::text, (SELECT max(x.telegram_id)::text FROM yuplink.users x
              WHERE x.account_id = a.id)) AS "telegramId",
            (SELECT max(x.telegram_username) FROM yuplink.users x WHERE x.account_id = a.id) AS username
       FROM yuplink.accounts a
       LEFT JOIN yuplink.users u ON u.account_id = a.id
      WHERE ${targetWhere(raw)}
      LIMIT 5;`,
    { wrapJson: true },
  )) as SubTarget[] | null;
  return rows ?? [];
}

export const adminFindSubTarget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    return findSubTargets(data.q);
  });

export function grantSubSql(o: {
  subId: string;
  accountId: string;
  wallet: string;
  tier: NonNullable<Awaited<ReturnType<typeof loadTier>>>;
  days: number;
  payRef: string;
  by: string;
}): string {
  const t = o.tier;
  return `
WITH ins AS (
INSERT INTO yuplink.energy_sub
  (id, account_id, wallet, tier_id, tier_name, token, amount, price_usd, darai_per_usd,
   energy_per_day, box_pack_id, boxes_per_day, days, starts_at, ends_at, pay_ref, granted_by, no_decay, license_tier)
SELECT ${sqlStr(o.subId)}, a.id, ${sqlStr(o.wallet)}, ${sqlStr(t.id)}, ${sqlStr(t.name)}, 'GRANT', 0, 0, NULL,
       ${t.energyPerDay}, ${t.boxPackId ? sqlStr(t.boxPackId) : "NULL"}, ${t.boxesPerDay}, ${o.days},
       now(), now() + ${o.days} * interval '1 day', ${sqlStr(o.payRef)}, ${sqlStr(o.by)}, ${t.noDecay === true},
       ${t.licenseTier ? sqlStr(t.licenseTier) : "NULL"}
  FROM yuplink.accounts a WHERE a.id = ${sqlStr(o.accountId)}
ON CONFLICT (pay_ref) DO NOTHING
RETURNING id
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT id FROM ins) AS id) _t;`;
}

export const adminGrantSubscription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tierId: z.string().min(1).max(40),
        days: z.number().int().min(1).max(366),
        accountId: z.string().min(3).max(60),
        /** Один на нажатие: повтор того же нажатия не выдаст вторую подписку. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const by = requireAdmin();
    const tier = await loadTier(data.tierId);
    if (!tier) throw new Error("Такого тарифа нет");
    // Боксы тарифа с DARAI/Stars — деньги: дарит только админ выплат (mystic-money.ts).
    const { packPaysMoney } = await import("../mystic-money");
    if (tier.boxPackId && (await packPaysMoney(tier.boxPackId))) requirePayoutsAdmin();
    const acc = (await mcpExec(
      `SELECT a.id, COALESCE(a.active_wallet, (SELECT min(x.wallet) FROM yuplink.users x WHERE x.account_id = a.id)) AS wallet
         FROM yuplink.accounts a WHERE a.id = ${sqlStr(data.accountId)};`,
      { wrapJson: true },
    )) as Array<{ id: string; wallet: string | null }> | null;
    if (!acc?.length) throw new Error("Аккаунт не найден");

    const { settleEnergyBeforeShield, subIdOf } = await import("./buy-sql");
    if (tier.noDecay) await settleEnergyBeforeShield(data.accountId);
    const payRef = `grant:${data.opId}`;
    const subId = subIdOf(payRef);
    const rows = await mcpExec(
      grantSubSql({
        subId,
        accountId: data.accountId,
        wallet: acc[0].wallet ?? "",
        tier,
        days: data.days,
        payRef,
        by,
      }),
    );
    const created = !!firstRow<{ id: string }>(rows)?.id;

    const { grantDueForAccount } = await import("./grant");
    const day1 = await grantDueForAccount(data.accountId, { force: true });
    if (created) {
      const { notifyGifts } = await import("../gifts-notify");
      const esubTier = { ru: tier.name, en: tier.nameEn || tier.name };
      void notifyGifts([{ accountId: data.accountId, esubTier }]).catch(() => {});
    }
    return { ok: true as const, subId, created, gifts: day1.gifts };
  });
