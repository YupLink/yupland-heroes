import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg, type PgCampaign } from "../db/pg";
import { getCurrentWallet } from "../auth";

// ─── Hidden campaigns (hide/unhide/list) ─────────────────────────────

// Хардкод: системный кошелёк, с которого админ размещает дропы.
// На нём всегда лежит куча NFT под активные дропы — чтобы не засорять UI,
// для НЕГО мы прячем дропы автоматически через 1 час после создания.
export const SYSTEM_OWNER_HIDE_AFTER_MS = 60 * 60 * 1000; // 1 час
export const SYSTEM_OWNER_WALLETS = new Set(["darai_collection.near"]);

/**
 * Ключ хранения «скрытых» для текущей сессии.
 * - если TG привязан → tg:<id> (общий для всех sister-wallets)
 * - иначе → w:<wallet>
 */
export async function getHiddenScopeKey(): Promise<string | null> {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const me = await pg.users.findOne({ wallet });
  if (me?.telegram_id) return `tg:${me.telegram_id}`;
  return `w:${wallet}`;
}

// ──────── User-managed hide-list ────────

export const hideCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const scopeKey = await getHiddenScopeKey();
    if (!scopeKey) throw new Error("Кошелёк не подключён");
    await pg.hiddenCampaigns.upsert(
      {
        id: `hc_${nanoid(10)}`,
        scope_key: scopeKey,
        campaign_id: data.campaignId,
      },
      { onConflict: "scope_key,campaign_id" }
    );
    return { ok: true };
  });

export const unhideCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const scopeKey = await getHiddenScopeKey();
    if (!scopeKey) throw new Error("Кошелёк не подключён");
    await pg.hiddenCampaigns.delete({
      scope_key: scopeKey,
      campaign_id: data.campaignId,
    });
    return { ok: true };
  });

/**
 * Список скрытых юзером кампаний. Возвращает {id, name, mode, rewardSpec}
 * для отображения в коллапс-блоке «Скрытые» в /my-nfts.
 */
export const listHiddenCampaigns = createServerFn({ method: "GET" }).handler(
  async () => {
    const scopeKey = await getHiddenScopeKey();
    if (!scopeKey) return [];
    const rows = await pg.hiddenCampaigns.findMany({ scope_key: scopeKey });
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.campaign_id);
    const { data: camps, error } = await pg.campaigns
      .raw()
      .select("*")
      .in("id", ids);
    if (error) throw new Error(`pg.campaigns.in: ${error.message}`);
    const map = new Map(
      ((camps as PgCampaign[]) ?? []).map((c) => [c.id, c])
    );
    return rows
      .map((r) => {
        const c = map.get(r.campaign_id);
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          mode: (c.mode ?? "simple") as "simple" | "combo",
          rewardSpec:
            c.reward_min === c.reward_max
              ? `${c.reward_min} ${c.reward_token}`
              : `${c.reward_min}–${c.reward_max} ${c.reward_token}`,
          status: c.status,
          hiddenAt: r.hidden_at,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }
);
