// «Счета» → «Подписки»: сколько внесли подписками и куда это ушло. Только чтение.
// Наборы и покупка золота (§8.66) платят так же, как подписка, и делят те же корзины
// (kits/kit-grant-sql.ts, gold_shop_buy), поэтому «внесли» и доля карты считают и их —
// иначе сверка не сойдётся.
//
// По каждой доле (карта / дупло / разработчики × DARAI / USDT):
//  · ушло — сделанные шаги пачек (обмен, перевод) и зачёт в пул карты при покупке;
//  · ждёт — лежит в корзине до порога;
//  · встало — в незакрытой пачке и ещё не ушло (сбой сети, ждёт сверки).
// Сверено с таблицами 03.10: 9 DARAI-подписок на 491,7 млн и 4 USDT на 142.
// С 22.10 у USDT-подписки друга 10 % — пригласившему (ref_reward), корзинам 90 %:
// строка «рефералам» — забрано (ушло) и ждёт клейма, иначе сверка не сойдётся.
import { mcpExec } from "../db/mcpClient";
import { SPLIT, USD_BUCKET_DEV_SHARE, usdBatchPlan, type Bucket } from "@/lib/energySub";
import { REF_SUB_SHARE } from "@/lib/referralRewards";
import { stepOf, type Step } from "./energy-sub/batch-steps";

export type SubFlow = {
  to: "map" | "duplo" | "dev" | "ref";
  token: "DARAI" | "USDT";
  /** Доля оплаты, % */
  share: number;
  sent: number;
  waiting: number;
  stuck: number;
  /** USDT, ушедшие обменом, превратились в столько DARAI. */
  gotDarai: number;
};
export type SubStuck = { id: string; what: string; left: number; token: string; error: string | null; since: string };
export type MoneySubs = {
  paid: Array<{ token: string; count: number; amount: number }>;
  stars: number;
  flows: SubFlow[];
  stuck: SubStuck[];
};

type BatchRow = {
  id: string;
  bucket: string;
  status: string;
  amount: string;
  steps: Step[] | null;
  error: string | null;
  updated_at: string;
  stale: boolean;
};

const WHAT: Record<string, string> = {
  sub_usd_map: "$ → пул карты",
  sub_usd: "$ → дупло и разработчикам",
  sub_burn: "DARAI → дупло",
  sub_dev: "DARAI → разработчикам",
};

const SQL = `SELECT row_to_json(_t.*) AS _row FROM (SELECT
  (SELECT COALESCE(json_agg(p), '[]') FROM (
     SELECT token, count(*)::int AS count, sum(amount)::text AS amount
       FROM (SELECT token, amount FROM yuplink.energy_sub
             UNION ALL
             SELECT token, amount FROM yuplink.kit_order WHERE status = 'granted'
             UNION ALL
             -- комиссия аукционного дома (DARAI/USDT) делится как подписка
             SELECT currency, seller_fee FROM yuplink.auction
              WHERE source = 'player' AND seller_paid AND fee_booked
                AND currency IN ('Darai', 'USDT') AND seller_fee > 0
             UNION ALL
             -- покупка золота (§8.66) — те же корзины
             SELECT token, amount FROM yuplink.gold_shop_purchase) x
      GROUP BY token ORDER BY token) p) AS paid,
  (SELECT COALESCE(sum(amount), 0) FROM yuplink.darai_pool_move
    WHERE pool = 'map' AND kind = 'player_spend'
      AND (ref LIKE 'esub:%' OR ref LIKE 'kit:%' OR ref LIKE 'gauc:%' OR ref LIKE 'gshop:%'))::text AS map_darai,
  (SELECT json_build_object(
     'claimed', COALESCE(sum(amount) FILTER (WHERE status = 'claimed'), 0)::text,
     'pending', COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::text)
     FROM yuplink.ref_reward WHERE kind = 'usdt') AS ref_usdt,
  (SELECT COALESCE(json_agg(b ORDER BY b.updated_at), '[]') FROM (
     SELECT id, bucket, status, amount::text, steps, error, updated_at::text,
            (status = 'running' AND updated_at < now() - interval '15 minutes') AS stale
       FROM yuplink.money_batch
      WHERE bucket IN ('sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev')) b) AS batches
) _t;`;

const done = (steps: Step[], name: Step["name"]) => {
  const s = stepOf(steps, name);
  return s?.state === "done" ? s : undefined;
};

/** Итог по деньгам подписки. bal — балансы корзин (уже прочитаны сводкой). */
export async function moneySubs(bal: Record<Bucket, number>): Promise<MoneySubs> {
  const rows = (await mcpExec(SQL)) as Array<{ _row: Record<string, unknown> }> | null;
  const r = rows?.[0]?._row ?? {};
  const paid = ((r.paid as Array<{ token: string; count: number; amount: string }>) ?? []).map((p) => ({
    token: p.token,
    count: Number(p.count) || 0,
    amount: Number(p.amount) || 0,
  }));
  const flow = (to: SubFlow["to"], token: SubFlow["token"]): SubFlow => ({
    to,
    token,
    share: Math.round(
      (to === "ref" ? REF_SUB_SHARE : (token === "DARAI" ? SPLIT.Darai : SPLIT.USDT)[to === "duplo" ? "burn" : to]) * 100,
    ),
    sent: 0,
    waiting: 0,
    stuck: 0,
    gotDarai: 0,
  });
  const f = {
    mapD: flow("map", "DARAI"),
    mapU: flow("map", "USDT"),
    duploD: flow("duplo", "DARAI"),
    duploU: flow("duplo", "USDT"),
    devD: flow("dev", "DARAI"),
    devU: flow("dev", "USDT"),
    refU: flow("ref", "USDT"),
  };
  const refUsdt = (r.ref_usdt as { claimed?: string; pending?: string } | null) ?? {};
  f.refU.sent = Number(refUsdt.claimed) || 0;
  f.refU.waiting = Number(refUsdt.pending) || 0;
  f.mapD.sent = Number(r.map_darai) || 0;
  f.mapU.waiting = bal.sub_usd_map;
  f.duploU.waiting = bal.sub_usd * (1 - USD_BUCKET_DEV_SHARE);
  f.devU.waiting = bal.sub_usd * USD_BUCKET_DEV_SHARE;
  f.duploD.waiting = bal.sub_burn;
  f.devD.waiting = bal.sub_dev;

  const stuck: SubStuck[] = [];
  for (const b of (r.batches as BatchRow[]) ?? []) {
    const steps = b.steps ?? [];
    const amount = Number(b.amount) || 0;
    const open = b.status === "failed" || b.status === "running";
    const swap = done(steps, "swap");
    const map = done(steps, "map");
    const burn = done(steps, "burn");
    const dev = done(steps, "dev");
    let left = 0;
    // «Ушло» — когда дошло до адресата: DARAI легли в пул / в дупло, а не
    // только обменялись. Обменяли, но не доставили — это «встало».
    if (b.bucket === "sub_usd_map") {
      if (map) {
        f.mapU.sent += Number(swap?.amount ?? amount);
        f.mapU.gotDarai += Number(map.amount ?? 0);
      } else if (open) left = amount;
      f.mapU.stuck += left;
    } else if (b.bucket === "sub_usd") {
      const plan = usdBatchPlan(amount, USD_BUCKET_DEV_SHARE);
      if (burn) {
        f.duploU.sent += Number(swap?.amount ?? plan.swap);
        f.duploU.gotDarai += Number(burn.amount ?? 0);
      } else if (open) f.duploU.stuck += plan.swap;
      f.devU.sent += Number(dev?.amount ?? 0);
      if (open && !dev) f.devU.stuck += plan.dev;
      left = open ? (burn ? 0 : plan.swap) + (dev ? 0 : plan.dev) : 0;
    } else {
      const target = b.bucket === "sub_burn" ? f.duploD : f.devD;
      const s = b.bucket === "sub_burn" ? burn : dev;
      target.sent += Number(s?.amount ?? 0);
      if (open && !s) left = amount;
      target.stuck += left;
    }
    // «running» — идёт прямо сейчас; встала — failed или «идёт» дольше 15 минут.
    if (left > 0 && (b.status === "failed" || b.stale)) {
      stuck.push({
        id: b.id,
        what: WHAT[b.bucket] ?? b.bucket,
        left,
        token: b.bucket.startsWith("sub_usd") ? "USDT" : "DARAI",
        error: b.error,
        since: b.updated_at,
      });
    }
  }
  return {
    paid,
    stars: bal.sub_stars,
    flows: [f.mapD, f.mapU, f.duploD, f.duploU, f.devD, f.devU, f.refU],
    stuck,
  };
}
