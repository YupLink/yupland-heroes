import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet, requireAdmin } from "../auth";

const MARKETPLACE_ALERTS_KEY = "marketplace_alerts_enabled";
const MARKETPLACE_LAST_RUN_KEY = "marketplace_alerts_last_run";
const MARKETPLACE_FILTERS_KEY = "marketplace_filters";

export const getMarketplaceAlerts = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const en = await pg.settings.findOne({ key: MARKETPLACE_ALERTS_KEY });
    const lastRun = await pg.settings.findOne({
      key: MARKETPLACE_LAST_RUN_KEY,
    });
    return {
      enabled: en?.value === "true",
      lastRunAt: lastRun?.value ?? null,
    };
  }
);

export const setMarketplaceAlertsEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ enabled: z.boolean() }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const value = data.enabled ? "true" : "false";
    await pg.settings.upsert(
      { key: MARKETPLACE_ALERTS_KEY, value },
      { onConflict: "key" }
    );
    return { ok: true };
  });

export const runMarketplaceCheck = createServerFn({ method: "POST" }).handler(
  async () => {
    requireAdmin();
    const { checkMarketplaceListings } = await import("../marketplace");
    const res = await checkMarketplaceListings();
    const now = new Date().toISOString();
    await pg.settings.upsert(
      { key: MARKETPLACE_LAST_RUN_KEY, value: now },
      { onConflict: "key" }
    );
    return res;
  }
);

export const getMarketplaceFilters = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const row = await pg.settings.findOne({ key: MARKETPLACE_FILTERS_KEY });
    if (!row) return {} as Record<string, unknown>;
    try {
      return JSON.parse(row.value);
    } catch {
      return {} as Record<string, unknown>;
    }
  }
);

export const setMarketplaceFilters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        maxPriceByToken: z.record(z.string(), z.number().nonnegative()).optional(),
        excludeTokens: z.array(z.string()).optional(),
        onlyCampaigns: z.array(z.string()).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const value = JSON.stringify(data);
    await pg.settings.upsert(
      { key: MARKETPLACE_FILTERS_KEY, value },
      { onConflict: "key" }
    );
    return { ok: true };
  });

export const getMarketplaceStatsAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const { getMarketplaceStats } = await import("../marketplace");
    const w = getCurrentWallet();
    let sisters: string[] = [];
    if (w) {
      const me = await pg.users.findOne({ wallet: w });
      if (me?.telegram_id) {
        sisters = (
          await pg.users.findMany({ telegram_id: me.telegram_id })
        ).map((r) => r.wallet);
      } else {
        sisters = [w];
      }
    }
    return getMarketplaceStats({ sisters });
  }
);
