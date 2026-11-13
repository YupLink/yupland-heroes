// Использовать НАБОР зелий одной кнопкой (Ангелина, «Вещи героя → Алхимические
// карманы», 16.10.2026): разные виды и количество каждого за один вызов.
//
//  1) весь набор проверяется до записи: у каждого товара есть эффект, виды
//     в списке склеиваются (один ключ дважды = сумма);
//  2) ключ нажатия, списание всех видов и все эффекты — ОДНОЙ транзакцией
//     (potion-drink.ts, с 22.10): не хватило одного вида или сорвалась запись
//     любого эффекта — не списано и не наложено ничего. До 22.10 сбой на k-м
//     эффекте возвращал зелья, а эффекты 1…k−1 оставались даром;
//  3) повтор того же нажатия ничего не списывает и не накладывает второй раз.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWallet } from "../../auth";
import { resolveBackpack } from "./market-backpack";
import { canonRef } from "./item-alias";
import { itemBoost } from "./boost-item";
import { noteDrink } from "@/server/api/beta-raid/econ/drink-note";
import { drinkPotions } from "@/server/api/beta-raid/potion-drink";
import { rollBoostQty, type BoostRoll } from "@/lib/hero/boost";

export type BoostItemsLine = { stackKey: string; qty: number; rolls: BoostRoll[]; total: number };

const input = z.object({
  /** Набор: какой товар и сколько штук. До 20 видов, ключи могут повторяться. */
  items: z
    .array(
      z.object({ stackKey: z.string().min(1).max(200), qty: z.number().int().min(1).max(1000) }),
    )
    .min(1)
    .max(20),
  /** Ключ нажатия на весь набор: слепой повтор не съест зелья второй раз. */
  op: z.string().min(6).max(80),
});

export const applyItemBoosts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("Сначала выбери героя — товар лежит у него в рюкзаке");

    // 1) Проверка набора до любых записей: канон, эффекты, склейка одинаковых.
    const merged = new Map<string, { stackKey: string; canon: string; qty: number }>();
    for (const it of data.items) {
      const [kind, ...rest] = it.stackKey.split(":");
      const canon = await canonRef(kind, rest.join(":"));
      const effects = canon ? await itemBoost(canon) : [];
      if (!canon || effects.length === 0)
        throw new Error(`Этот товар ничего не даёт герою: ${it.stackKey}`);
      const key = `${kind}:${canon}`;
      const cur = merged.get(key);
      merged.set(key, { stackKey: key, canon, qty: (cur?.qty ?? 0) + it.qty });
    }
    const lines: Array<BoostItemsLine & { canon: string }> = [];
    for (const m of merged.values()) {
      const rolls = rollBoostQty(await itemBoost(m.canon), m.qty);
      lines.push({
        stackKey: m.stackKey,
        canon: m.canon,
        qty: m.qty,
        rolls,
        total: rolls.reduce((n, r) => n + r.amount, 0),
      });
    }
    const total = lines.reduce((n, l) => n + l.total, 0);

    // 2) Ключ, списание и эффекты — одна транзакция.
    const out = await drinkPotions({
      wallet,
      heroId: bp.heroId,
      op: data.op,
      source: `items:${lines.length}`,
      lines: lines.map(({ stackKey, qty, rolls }) => ({ stackKey, qty, rolls })),
    });
    if (out.state === "repeat") {
      return {
        ok: true as const,
        repeat: true as const,
        items: [] as BoostItemsLine[],
        total: out.amount,
        heroName: bp.heroName,
      };
    }
    if (out.state === "short") {
      throw new Error(
        out.stackKey ? `Столько штук в сумке нет: ${out.stackKey}` : "Столько штук в сумке нет",
      );
    }

    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);
    for (const [i, line] of lines.entries())
      await noteDrink({ wallet, canon: line.canon, qty: line.qty, op: `${data.op}:${i}` });

    return {
      ok: true as const,
      repeat: false as const,
      items: lines.map(({ stackKey, qty, rolls, total: t }) => ({
        stackKey,
        qty,
        rolls,
        total: t,
      })),
      total,
      heroName: bp.heroName,
    };
  });
