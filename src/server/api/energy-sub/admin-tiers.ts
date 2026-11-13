// Тарифы подписки в админке: создать, править, удалить. Цена — в $, игрок
// получает энергию и боксы, настроенные здесь. Уже купленные подписки хранят
// СНИМОК условий: правка или удаление тарифа их не меняет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { assertPackMoneyRight } from "../mystic-money";

const tierFields = z.object({
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().max(40),
  priceUsd: z.number().positive().max(100_000),
  energyPerDay: z.number().min(0).max(1_000_000),
  boxPackId: z.string().max(64).nullable(),
  boxesPerDay: z.number().int().min(0).max(1000),
  /** Энергия не тает, пока подписка действует. */
  noDecay: z.boolean().default(false),
  /** Лицензия банка на время подписки (esub-06), null — без неё. */
  licenseTier: z.enum(["small", "medium", "large"]).nullable().default(null),
  days: z.number().int().min(1).max(366),
  active: z.boolean(),
});

export const adminSaveSubTier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tierFields.extend({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    // Бокс тарифа с DARAI/Stars — деньги: только админ выплат (mystic-money.ts).
    await assertPackMoneyRight(data.boxPackId);
    await mcpExec(
      `UPDATE yuplink.energy_sub_tier
          SET name = ${sqlStr(data.name)}, name_en = ${sqlStr(data.nameEn)},
              price_usd = ${data.priceUsd.toFixed(2)}, energy_per_day = ${data.energyPerDay},
              box_pack_id = ${data.boxPackId ? sqlStr(data.boxPackId) : "NULL"},
              boxes_per_day = ${data.boxesPerDay}, days = ${data.days}, no_decay = ${data.noDecay},
              license_tier = ${data.licenseTier ? sqlStr(data.licenseTier) : "NULL"},
              active = ${data.active}, updated_at = now()
        WHERE id = ${sqlStr(data.id)};`,
    );
    return { ok: true as const };
  });

/** Новый тариф — в конец списка. Сразу не продаётся: сначала настроить. */
export const adminCreateSubTier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tierFields.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await assertPackMoneyRight(data.boxPackId);
    const id = `esub_${nanoid(8)}`;
    await mcpExec(
      `INSERT INTO yuplink.energy_sub_tier
         (id, name, name_en, price_usd, energy_per_day, box_pack_id, boxes_per_day, days, active, sort, no_decay,
          license_tier)
       SELECT ${sqlStr(id)}, ${sqlStr(data.name)}, ${sqlStr(data.nameEn)}, ${data.priceUsd.toFixed(2)},
              ${data.energyPerDay}, ${data.boxPackId ? sqlStr(data.boxPackId) : "NULL"},
              ${data.boxesPerDay}, ${data.days}, ${data.active},
              COALESCE((SELECT max(sort) FROM yuplink.energy_sub_tier), 0) + 1, ${data.noDecay},
              ${data.licenseTier ? sqlStr(data.licenseTier) : "NULL"};`,
    );
    return { ok: true as const, id };
  });

/** Удалить тариф. Купленные по нему подписки доживают свои дни — у них снимок. */
export const adminDeleteSubTier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(`DELETE FROM yuplink.energy_sub_tier WHERE id = ${sqlStr(data.id)};`);
    return { ok: true as const };
  });
