// Использовать товар-БУСТ (зелье) из сумки: штуки уходят, герой крепче на
// заданное время. Можно выпить несколько за раз — результат тот же, что у
// стольких же нажатий подряд.
//
// Порядок тот же, что у алтаря: занять ключ нажатия → забрать товар → повесить
// бафф. Сорвалось начисление — товар возвращаем: платить съеденным зельем за
// бонус, которого нет, игрок не подписывался. Выпитое — в журнал сделок
// (econ/drink-note: турнир «Зелья скорости» считает по нему).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { resolveBackpack, returnToBackpackStack, takeFromBackpackStack } from "./market-backpack";
import { canonRef } from "./item-alias";
import { boostOpAmount, claimBoostOp, releaseBoostOp } from "./hero-boost";
import { applyBoostRoll } from "./hero-buff";
import { noteDrink } from "@/server/api/beta-raid/econ/drink-note";
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
    const fresh = await claimBoostOp({
      op: data.op,
      heroId: bp.heroId,
      stat: rolls[0]?.stat ?? "spd",
      amount: total,
      source: `item:${canon}`,
    });
    if (!fresh) {
      return {
        ok: true as const,
        repeat: true as const,
        rolls: [] as Roll[],
        total: await boostOpAmount(data.op),
        qty: data.qty,
        heroName: bp.heroName,
      };
    }

    const key = `${kind}:${canon}`;
    // Списание может и бросить (изношенный инструмент, §8.19) — ключ отпускаем.
    const taken = await takeFromBackpackStack(bp.heroId, key, data.qty).catch(async (e) => {
      await releaseBoostOp(data.op);
      throw e;
    });
    if (!taken) {
      await releaseBoostOp(data.op);
      throw new Error("Столько штук в сумке нет");
    }

    try {
      for (const r of rolls) await applyBoostRoll(wallet, r);
    } catch (e) {
      await returnToBackpackStack(bp.heroId, key, data.qty, taken).catch(() => {});
      await releaseBoostOp(data.op);
      throw e;
    }

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
