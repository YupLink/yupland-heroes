// Ручки админки подписки и авторассылок: состояние экрана, правила, звёзды.
// Тарифы — admin-tiers.ts, пачки — admin-batches.ts.
//
// Всё, что двигает деньги или решает, куда они пойдут — выключатель, правила,
// пачки, — только владелец (requirePayoutsAdmin). Смотреть — любой админ.
// Звёзды подписок просто копятся в пуле (владелец, 29.09): ручки для них нет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin, requirePayoutsAdmin } from "../../auth";
import { ENABLED_KEY, loadTiers, offerOf, subsEnabled } from "./tiers";
import { daraiPerUsd } from "./rate";
import { BUCKETS, bucketBalances, starsStats } from "./buckets";
import { daraiIncomeOf, usdIncomeOf } from "./batch";
import { loadDist, parseDist, saveDist } from "../autodist/rules";
import type { Step } from "./batch-steps";

export type BatchView = {
  id: string;
  bucket: string;
  token: string;
  amount: number;
  status: string;
  steps: Step[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export const BATCH_VIEW_SQL = `SELECT id, bucket, token, amount::float8 AS amount, status, steps, error,
       created_at AS "createdAt", updated_at AS "updatedAt"
  FROM yuplink.money_batch`;

/** Всё для экрана: тарифы с ценами, курс, правила с текущими суммами, корзины, звёзды, пачки. */
export const adminEnergySubState = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  void import("../autodist/tick").then((m) => m.startAutoDistTicker());
  const { daraiPools } = await import("../darai-pools");
  const [tiers, rate, dist, balances, stars, enabled, pools] = await Promise.all([
    loadTiers(),
    daraiPerUsd(),
    loadDist(),
    bucketBalances(),
    starsStats(),
    subsEnabled(),
    daraiPools().catch(() => null),
  ]);
  const [batches, stats] = await Promise.all([
    mcpExec(`${BATCH_VIEW_SQL} ORDER BY created_at DESC LIMIT 20;`, { wrapJson: true }) as Promise<
      BatchView[] | null
    >,
    mcpExec(
      `SELECT token, count(*)::int AS subs, count(*) FILTER (WHERE ends_at > now())::int AS active,
              COALESCE(sum(amount), 0)::float8 AS paid
         FROM yuplink.energy_sub GROUP BY token;`,
      { wrapJson: true },
    ) as Promise<Array<{ token: string; subs: number; active: number; paid: number }> | null>,
  ]);
  return {
    enabled,
    rate: rate ? { daraiPerUsd: rate.rate, ageMs: rate.ageMs } : null,
    tiers: tiers.map((t) => offerOf(t, rate?.rate ?? null)),
    dist,
    /** Сколько сейчас набрал источник каждого правила (null — не прочиталось). */
    ruleNow: {
      sub_usd: usdIncomeOf(balances),
      sub_darai: daraiIncomeOf(balances),
      darai_free: pools ? Math.max(0, pools.payoutAvailable) : null,
      auc_darai: balances.auc_darai,
      auc_usd: balances.auc_usd,
    },
    buckets: BUCKETS.map((b) => ({ bucket: b, balance: balances[b] })),
    stars,
    batches: batches ?? [],
    stats: stats ?? [],
  };
});

export const adminSetSubsEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(ENABLED_KEY)}, ${sqlStr(String(data.enabled))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
    return { ok: true as const };
  });

/** Правила авторассылок — для строки статуса на экране «Раздача DARAI». */
export const adminAutoDistRules = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return (await loadDist()).rules;
});

/** Правила авторассылок: порог и режим у каждого источника. */
export const adminSaveSubDist = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ dist: z.unknown() }).parse(d))
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const dist = parseDist(data.dist);
    await saveDist(dist);
    return { ok: true as const, dist };
  });
