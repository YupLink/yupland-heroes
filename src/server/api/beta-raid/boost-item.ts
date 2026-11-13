// Использовать товар-БУСТ (зелье) из сумки: штуки уходят, герой крепче на
// заданное время. Можно выпить несколько за раз — результат тот же, что у
// стольких же нажатий подряд.
//
// Ключ нажатия, списание и все эффекты — одной транзакцией (potion-drink.ts):
// сорвалось хоть что-то — не списано и не наложено ничего; повтор нажатия
// второй раз не списывает и не накладывает. Выпитое — в журнал сделок
// (econ/drink-note: турнир «Зелья скорости» считает по нему).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { resolveBackpack } from "./market-backpack";
import { canonRef } from "./item-alias";
import { noteDrink } from "@/server/api/beta-raid/econ/drink-note";
import { drinkPotions } from "@/server/api/beta-raid/potion-drink";
import {
  parseBoostEffects,
  rollBoostQty,
  type BoostEffect,
  type BoostRoll,
} from "@/lib/hero/boost";

/** Настройка бустов у шаблона своего товара. Пусто — товар обычный. */
export async function itemBoost(refId: string | null | undefined): Promise<BoostEffect[]> {
  const id = (refId ?? "").trim();
  if (!id.startsWith("cst_")) return [];
  const rows = (await mcpExec(
    `SELECT boost FROM yuplink.raid_custom_item WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ boost: unknown }>;
  return parseBoostEffects(rows?.[0]?.boost);
}

type Roll = BoostRoll;

export const applyItemBoost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        stackKey: z.string().min(1).max(200),
        /** Ключ нажатия: слепой повтор моста не должен съесть второй товар. */
        op: z.string().min(6).max(80),
        /** Сколько штук выпить разом. */
        qty: z.number().int().min(1).max(1000).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("Сначала выбери героя — товар лежит у него в рюкзаке");

    // Ключ приводим к канону: «Помидор» и «Помидоры» — один товар и одна
    // настройка буста.
    const [kind, ...rest] = data.stackKey.split(":");
    const canon = await canonRef(kind, rest.join(":"));
    const effects = await itemBoost(canon);
    if (effects.length === 0) throw new Error("Этот товар ничего не даёт герою");

    const rolls = rollBoostQty(effects, data.qty);
    const total = rolls.reduce((n, r) => n + r.amount, 0);
    const out = await drinkPotions({
      wallet,
      heroId: bp.heroId,
      op: data.op,
      source: `item:${canon}`,
      lines: [{ stackKey: `${kind}:${canon}`, qty: data.qty, rolls }],
    });
    if (out.state === "repeat") {
      return {
        ok: true as const,
        repeat: true as const,
        rolls: [] as Roll[],
        total: out.amount,
        qty: data.qty,
        heroName: bp.heroName,
      };
    }
    if (out.state === "short") throw new Error("Столько штук в сумке нет");

    // Статы изменились — сбрасываем кэш силы героя, иначе бой ещё 15 секунд
    // считал бы по прежним числам.
    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);
    await noteDrink({ wallet, canon, qty: data.qty, op: data.op });

    return {
      ok: true as const,
      repeat: false as const,
      rolls,
      total,
      qty: data.qty,
      heroName: bp.heroName,
    };
  });
