// Админ: цены смены героя в таверне. Живут в yuplink.settings, по одной на
// облик трактира — обычный и улучшенный.
//
// Отдельным файлом от tavern.ts: там игровая механика, здесь настройка мира,
// и общий файл выходил за 250 строк.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../../db/pg";
import { requireAdmin } from "../../auth";
import {
  HERO_SWAP_PRICE_KEY,
  HERO_SWAP_PRICE_UP_KEY,
  HERO_SWAP_PRICE_DEFAULT,
  HERO_SWAP_PRICE_UP_DEFAULT,
  priceSetting,
} from "./tavern";

/** Админ: цены смены героя — обычная таверна и улучшенная. */
export const adminGetHeroSwapPrice = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return {
    priceLikes: await priceSetting(HERO_SWAP_PRICE_KEY, HERO_SWAP_PRICE_DEFAULT),
    priceLikesUpgraded: await priceSetting(HERO_SWAP_PRICE_UP_KEY, HERO_SWAP_PRICE_UP_DEFAULT),
  };
});

/** Админ: задать обе цены разом. */
export const adminSetHeroSwapPrice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        priceLikes: z.number().int().min(0).max(1_000_000),
        priceLikesUpgraded: z.number().int().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.settings.upsert(
      { key: HERO_SWAP_PRICE_KEY, value: String(data.priceLikes) },
      { onConflict: "key" },
    );
    await pg.settings.upsert(
      { key: HERO_SWAP_PRICE_UP_KEY, value: String(data.priceLikesUpgraded) },
      { onConflict: "key" },
    );
    return { ok: true as const, ...data };
  });
