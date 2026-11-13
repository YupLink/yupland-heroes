import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import { assertCampaignNoUsdt } from "./admin-campaigns-schemas";
import { assertPackMoneyRight } from "./mystic-money";

export const adminListChipCollectionsForDrops = createServerFn({
  method: "GET",
}).handler(async () => {
  requireAdmin();
  const cols = await pg.chipCollections.findMany();
  const { data: tplRows } = await pg.chipTemplates
    .raw()
    .select("id,collection_id,template_no,name,image_url")
    .order("template_no", { ascending: true });
  type T = {
    templateNo: number;
    name: string;
    imageUrl: string;
  };
  const byCol = new Map<string, T[]>();
  for (const t of ((tplRows ?? []) as Array<{
    collection_id: string;
    template_no: number;
    name: string;
    image_url: string;
  }>)) {
    const arr = byCol.get(t.collection_id) ?? [];
    arr.push({
      templateNo: t.template_no,
      name: t.name,
      imageUrl: t.image_url,
    });
    byCol.set(t.collection_id, arr);
  }
  return cols.map((c) => ({
    id: c.id,
    name: c.name,
    coverImageUrl: c.cover_image_url ?? null,
    templates: byCol.get(c.id) ?? [],
  }));
});

export const adminCreateChipDrop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        chipCollectionId: z.string().min(1),
        chipMinLevel: z.union([
          z.literal(3),
          z.literal(3.5),
          z.literal(4),
          z.literal(4.5),
          z.literal(5),
        ]),
        rewardToken: z.string().min(1),
        rewardMin: z.number().min(0),
        rewardMax: z.number().min(0),
        rewardTiers: z
          .array(
            z.object({
              weight: z.number(),
              kind: z.enum(["ft", "nft", "pack"]),
              rewardMin: z.number(),
              rewardMax: z.number(),
              rewardToken: z.string(),
              nftTitle: z.string().optional(),
              nftContract: z.string().optional(),
              packId: z.string().optional(),
            })
          )
          .optional(),
        ticketCost: z.number().min(0).max(10).default(0),
        freeClaim: z.boolean().default(true),
        maxTotalPool: z.number().int().nullable().optional(),
        maxUsers: z.number().int().nullable().optional(),
      })
      .refine((d) => d.rewardMax >= d.rewardMin, {
        message: "rewardMax должен быть не меньше rewardMin",
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    assertCampaignNoUsdt(data.rewardToken, data.rewardTiers);
    for (const t of data.rewardTiers ?? []) {
      if (t.kind === "pack") await assertPackMoneyRight(t.packId);
    }
    const col = await pg.chipCollections.findOne({
      id: data.chipCollectionId,
    });
    if (!col) throw new Error("Коллекция не найдена");
    const { data: tplRows } = await pg.chipTemplates
      .raw()
      .select("id")
      .eq("collection_id", data.chipCollectionId)
      .limit(1);
    if (((tplRows ?? []) as unknown[]).length === 0) {
      throw new Error(
        "В коллекции нет templates — добавь хотя бы один шаблон фишки"
      );
    }
    const id = `c_${nanoid(8)}`;
    await pg.campaigns.insert({
      id,
      name: data.name,
      contract_id: "yuplandshop.mintbase1.near",
      scope: `Chip: ${col.name} от ${data.chipMinLevel}⭐`,
      scope_token_ids: null,
      reward_min: data.rewardMin,
      reward_max: data.rewardMax,
      reward_token: data.rewardToken,
      reward_tiers:
        data.rewardTiers && data.rewardTiers.length > 0
          ? JSON.stringify(data.rewardTiers)
          : null,
      max_total_pool: data.maxTotalPool ?? null,
      max_users: data.maxUsers ?? null,
      free_claim: data.freeClaim,
      ticket_cost: data.ticketCost,
      payout_mode: "manual",
      referral_bonus: true,
      status: "active",
      reward_kind: "ft",
      nft_contract: null,
      nft_pool: null,
      mode: "simple",
      requirements: null,
      chip_collection_id: data.chipCollectionId,
      chip_min_level: data.chipMinLevel,
    });
    return { ok: true, id };
  });
