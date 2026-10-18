import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import {
  rewardTierSchema,
  validateTiers,
  assertTokenExists,
  assertCampaignNoUsdt,
} from "./admin-campaigns-schemas";

export const updateDropEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        rewardMin: z.number().int().nonnegative(),
        rewardMax: z.number().int().nonnegative(),
        rewardToken: z.string().min(1),
        rewardTiers: z.array(rewardTierSchema).optional().nullable(),
        maxTotalPool: z.number().int().positive().optional().nullable(),
        maxUsers: z.number().int().positive().optional().nullable(),
        freeClaim: z.boolean().optional().default(false),
        ticketCost: z.number().positive().optional().default(1),
        recurring: z.boolean().optional().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.rewardMax < data.rewardMin)
      throw new Error("Максимум награды должен быть не меньше минимума");
    await validateTiers(data.rewardTiers);

    const current = await pg.campaigns.findOne({ id: data.id });
    if (!current) throw new Error("Дроп не найден");
    assertCampaignNoUsdt(data.rewardToken, data.rewardTiers, current.reward_kind);

    if (data.rewardToken !== current.reward_token) {
      await assertTokenExists(data.rewardToken);
    }

    const allRed = await pg.redemptions.findMany({ campaign_id: data.id });
    const claimers = new Set(allRed.map((r) => r.wallet)).size;
    const paid = allRed.reduce((s, r) => s + (r.amount ?? 0), 0);

    if (data.maxUsers != null && data.maxUsers < claimers) {
      throw new Error(
        `Лимит участников не может быть меньше уже клеймивших (${claimers})`
      );
    }
    if (data.maxTotalPool != null && data.maxTotalPool < paid) {
      throw new Error(
        `Призовой фонд не может быть меньше уже выплаченного (${paid})`
      );
    }

    await pg.campaigns.update(
      { id: data.id },
      {
        reward_min: data.rewardMin,
        reward_max: data.rewardMax,
        reward_token: data.rewardToken,
        reward_tiers:
          data.rewardTiers && data.rewardTiers.length > 0
            ? JSON.stringify(data.rewardTiers)
            : null,
        max_total_pool: data.maxTotalPool ?? null,
        max_users: data.maxUsers ?? null,
        free_claim: data.freeClaim ?? false,
        ticket_cost: data.ticketCost ?? 1,
        recurring: data.recurring ?? false,
      }
    );

    return { ok: true };
  });

export const deleteDropEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const c = await pg.campaigns.findOne({ id: data.id });
    if (!c) throw new Error("Дроп не найден");
    // SOFT-delete: ставим status="ended".
    await pg.campaigns.update({ id: data.id }, { status: "ended" });
    return { ok: true };
  });

export const setDropStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        status: z.enum(["active", "paused"]),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const c = await pg.campaigns.findOne({ id: data.id });
    if (!c) throw new Error("Дроп не найден");
    if (c.status === "ended")
      throw new Error("Этот дроп удалён (status=ended) — нельзя восстановить");
    await pg.campaigns.update({ id: data.id }, { status: data.status });
    return { ok: true, status: data.status };
  });

export const setDropRecurring = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1), recurring: z.boolean() }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const c = await pg.campaigns.findOne({ id: data.id });
    if (!c) throw new Error("Дроп не найден");
    if (c.status === "ended")
      throw new Error("Дроп удалён (ended) — нельзя менять");
    await pg.campaigns.update({ id: data.id }, { recurring: data.recurring });
    return { ok: true, recurring: data.recurring };
  });
