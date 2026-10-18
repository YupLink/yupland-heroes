// «Энергия за лайки»: чтение и сохранение настройки из админки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requireAdmin } from "./energy-packs-shared";
import { loadEnergyLikeOffer } from "./energy-like-offer";
import {
  ENERGY_LIKE_OFFER_KEY,
  LIKE_OFFER_MAX_AMOUNT,
  LIKE_OFFER_MAX_STEPS,
  LIKE_OFFER_MAX_TIMES,
} from "@/lib/energyLikeOffer";

const offerInput = z.object({
  enabled: z.boolean(),
  amount: z.number().int().min(1).max(LIKE_OFFER_MAX_AMOUNT),
  steps: z
    .array(
      z.object({
        amount: z.number().positive().max(1_000_000),
        times: z.number().int().min(1).max(LIKE_OFFER_MAX_TIMES),
      }),
    )
    .min(1)
    .max(LIKE_OFFER_MAX_STEPS),
});

export const adminGetEnergyLikeOffer = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return loadEnergyLikeOffer();
});

export const adminSetEnergyLikeOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => offerInput.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.settings.upsert(
      { key: ENERGY_LIKE_OFFER_KEY, value: JSON.stringify(data) },
      { onConflict: "key" },
    );
    return data;
  });
