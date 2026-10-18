// Настройка «фишка → герой» на КОЛЛЕКЦИЮ (админ): какая раса, веса
// специализаций (выпадает одна), пул hero-шаблонов. Хранится в
// chip_collection_hero (PK collection_id). Конвертация фишки в героя (списание
// лайков/билетов + ролл) — отдельная стадия; здесь только конфиг.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import type { PgChipCollectionHero } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Нет доступа");
  return w;
}

const specWeightSchema = z
  .array(z.object({ spec: z.string().min(1).max(60), weight: z.number().min(0).max(100) }))
  .max(20);

export type SpecWeight = z.infer<typeof specWeightSchema>[number];

export const adminGetCollectionHeroConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ collectionId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const row = await pg.chipCollectionHero
      .raw()
      .select("*")
      .eq("collection_id", data.collectionId)
      .maybeSingle();
    const r = row.data as PgChipCollectionHero | null;
    if (!r) return null;
    return {
      active: r.active,
      race: r.race,
      specWeights: (r.spec_weights as SpecWeight[] | null) ?? [],
      heroTemplateIds: (r.hero_template_ids as string[] | null) ?? [],
    };
  });

export const adminSetCollectionHeroConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        collectionId: z.string().min(1),
        active: z.boolean(),
        race: z.string().max(60).nullable().optional(),
        specWeights: specWeightSchema,
        heroTemplateIds: z.array(z.string().max(60)).max(50),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    await pg.chipCollectionHero.upsert(
      {
        collection_id: data.collectionId,
        active: data.active,
        race: data.race ?? null,
        spec_weights: data.specWeights,
        hero_template_ids: data.heroTemplateIds,
        updated_at: new Date().toISOString(),
        created_by_wallet: wallet,
      },
      { onConflict: "collection_id" }
    );
    return { ok: true };
  });
