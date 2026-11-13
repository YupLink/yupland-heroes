// Сколько друг потратил в игре, $ — для зачёта друзей (ПРАВИЛА §8.101): в
// «Много друзей» идут потратившие от $10, в бонус-боксы — больше $15
// (владелец, 02.11.2026: «покупка подписок/паков/золота из офф магазина»).
//
// Считается по кошелькам (связи друзей — по кошелькам, referrals):
//  • подписка — её цена в $ (выданная админом — нет);
//  • золото из лавки — цена пакета в $;
//  • пак за DARAI или со счёта (DARAI/звёзды) — цена пака в DARAI по нынешнему
//    курсу (settings.darai_usd_rate), нет её — в звёздах по $0,013. Цена паков в
//    $ при покупке не хранилась — для порога в $10–15 курс сегодня годится.
// Пак за золото — нет: само золото уже засчитано, когда его купили.
import { mcpExec } from "./db/mcpClient";
import { sqlStr } from "./api/raid-shared";

/** Кошелёк → потрачено, $. Пустой список — пустой ответ (без запроса). */
export async function usdSpentByWallet(wallets: readonly string[]): Promise<Map<string, number>> {
  const list = Array.from(new Set(wallets.filter((w) => typeof w === "string" && w.length > 0)));
  if (list.length === 0) return new Map();
  const rows = (await mcpExec(
    `WITH w AS (SELECT unnest(ARRAY[${list.map(sqlStr).join(", ")}]::text[]) AS wallet),
          rate AS (SELECT NULLIF((SELECT value::jsonb ->> 'daraiPerUsd' FROM yuplink.settings
                                   WHERE key = 'darai_usd_rate'), '')::numeric AS r)
     SELECT w.wallet,
            (COALESCE((SELECT sum(s.price_usd) FROM yuplink.energy_sub s
                        WHERE s.wallet = w.wallet AND s.granted_by IS NULL), 0)
           + COALESCE((SELECT sum(g.price_usd) FROM yuplink.gold_shop_purchase g
                        WHERE g.wallet = w.wallet), 0)
           + COALESCE((SELECT sum(CASE WHEN COALESCE(cp.price_darai, 0) > 0 AND rate.r > 0
                                       THEN cp.price_darai / rate.r
                                       ELSE COALESCE(cp.price_stars, 0) * 0.013 END)
                         FROM yuplink.chip_pack_grants g
                         JOIN yuplink.chip_packs cp ON cp.id = g.chip_pack_id
                        WHERE g.wallet = w.wallet AND g.source IN ('purchase_darai', 'purchase_account')), 0)
            )::text AS usd
       FROM w, rate`,
    { wrapJson: true },
  )) as Array<{ wallet: string; usd: string }> | null;
  return new Map((rows ?? []).map((r) => [String(r.wallet), Number(r.usd) || 0]));
}
