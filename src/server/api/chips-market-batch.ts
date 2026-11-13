// Выставить НЕСКОЛЬКО фишек одной ценой — в золоте (с 21.10.2026, chips-market-gold.ts).
//
// Просьба игроков: у кого сотни одинаковых фишек, выставлять их по одной —
// мучение. Каждая фишка всё равно становится отдельным лотом (цена одна на
// всех), поэтому покупатель может взять сколько нужно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { requireWallet } from "../auth";

import { isChipResting } from "../chipRest";
import { CHIP_STUNNED_MIN_KEY, loadStunUntil, stunMinutesLeft } from "./chips-market-stun";
import { accountOf } from "./user-shared";
import { goldPriceSchema, insertGoldListing, requireGoldPrice } from "./chips-market-gold";

/** Разом больше сотни лотов не заводим: это и так много для одной пачки. */
const MAX_BATCH = 100;

export const createMarketListingsBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        chipIds: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
        priceGold: goldPriceSchema,
      })
      .parse(requireGoldPrice(d)),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const batchAccount = await accountOf(wallet);
    const ids = Array.from(new Set(data.chipIds));

    const { data: rows } = await pg.userChipInventory
      .raw()
      .select("id,account_id,wallet,status,rest_until")
      .in("id", ids);
    const byId = new Map(
      (
        (rows ?? []) as Array<{
          id: string;
          account_id: string;
          wallet: string;
          status: string;
          rest_until: string | null;
        }>
      ).map((r) => [r.id, r]),
    );

    // Оглушение висит в chip_effects, а не в инвентаре — тянем одним запросом
    // на всю пачку: сотня фишек не должна превратиться в сотню SELECT'ов.
    const stunUntil = await loadStunUntil(ids);

    const listed: string[] = [];
    // reason — либо готовая фраза, либо ключ словаря (тогда есть minutes и
    // интерфейс подставит срок). t() отдаёт неизвестный ключ как есть, поэтому
    // обе формы безопасно показывать одним и тем же кодом.
    const failed: Array<{ chipId: string; reason: string; minutes?: number }> = [];

    for (const chipId of ids) {
      const chip = byId.get(chipId);
      if (!chip) {
        failed.push({ chipId, reason: "фишка не найдена" });
        continue;
      }
      if (chip.account_id !== batchAccount) {
        failed.push({ chipId, reason: "не твоя фишка" });
        continue;
      }
      if (chip.status !== "owned") {
        failed.push({ chipId, reason: "фишка занята" });
        continue;
      }
      if (isChipResting(chip.rest_until)) {
        failed.push({ chipId, reason: "отдыхает после передачи" });
        continue;
      }
      // Фишка без сознания после босса — продавать нельзя, пока не очнётся.
      const stun = stunUntil.get(chipId);
      if (stun) {
        failed.push({
          chipId,
          reason: CHIP_STUNNED_MIN_KEY,
          minutes: stunMinutesLeft(stun),
        });
        continue;
      }

      const now = new Date().toISOString();
      // Тот же CAS-лок, что и у одиночного выставления: фишку нельзя
      // одновременно продать и увести в PvP.
      const { data: cas, error } = await sb
        .from("user_chip_inventory")
        .update({ status: "listed", updated_at: now })
        .eq("id", chipId)
        .eq("status", "owned")
        .select("id");
      if (error || !cas || cas.length === 0) {
        failed.push({ chipId, reason: "занята другой операцией" });
        continue;
      }

      const id = `mkl_${nanoid(10)}`;
      try {
        await insertGoldListing({ id, account: batchAccount, wallet, chipId, priceGold: data.priceGold, now });
        listed.push(id);
      } catch {
        // Лот не создался — возвращаем фишку владельцу, а не оставляем в лимбо.
        await pg.userChipInventory.update(
          { id: chipId },
          { status: "owned", updated_at: new Date().toISOString() },
        );
        failed.push({ chipId, reason: "лот не создался" });
      }
    }

    return { ok: true as const, listed: listed.length, listingIds: listed, failed };
  });
