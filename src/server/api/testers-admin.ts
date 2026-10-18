// Управление группой тестеров — раздел ТОЛЬКО для владельца.
// Гейт тот же, что у «Выплат»: requirePayoutsAdmin (PAYOUTS_ADMIN_WALLETS).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";
import { TESTER_FEATURES, invalidateTesters, testerFeatureFlags } from "./testers";

const SETTINGS_KEY = "tester_features";

export const adminListTesters = createServerFn({ method: "GET" }).handler(async () => {
  requirePayoutsAdmin();
  const { data } = await pg.testers.raw().select("*").order("added_at", { ascending: true });
  const rows = (data ?? []) as Array<{
    wallet: string;
    note: string | null;
    added_by: string | null;
    added_at: string;
  }>;
  return {
    testers: rows,
    features: await testerFeatureFlags(),
    // Подписи переключателей отдаём с сервера — один источник правды.
    catalog: Object.entries(TESTER_FEATURES).map(([key, label]) => ({ key, label })),
  };
});

export const adminAddTester = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().min(2).max(120),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const owner = requirePayoutsAdmin();
    const wallet = data.wallet.trim().toLowerCase();
    if (!wallet) throw new Error("Пустой кошелёк");
    await pg.testers.upsert(
      {
        wallet,
        note: data.note?.trim() || null,
        added_by: owner,
        added_at: new Date().toISOString(),
      },
      { onConflict: "wallet" },
    );
    invalidateTesters();
    return { ok: true as const, wallet };
  });

export const adminRemoveTester = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ wallet: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    await pg.testers.delete({ wallet: data.wallet.trim().toLowerCase() });
    invalidateTesters();
    return { ok: true as const };
  });

export const adminSetTesterFeature = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ feature: z.string().min(1).max(64), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    if (!(data.feature in TESTER_FEATURES)) throw new Error("Неизвестная возможность");
    const flags = { ...(await testerFeatureFlags()), [data.feature]: data.enabled };
    await pg.settings.upsert(
      { key: SETTINGS_KEY, value: JSON.stringify(flags) },
      { onConflict: "key" },
    );
    invalidateTesters();
    return { ok: true as const, features: flags };
  });
