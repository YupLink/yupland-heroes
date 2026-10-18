// Использовать НАБОР зелий одной кнопкой (Ангелина, «Вещи героя → Алхимические
// карманы», 16.10.2026): разные виды и количество каждого за один вызов.
//
// Порядок тот же, что у одного зелья (boost-item.ts), но для всего набора:
//  1) весь набор проверяется до списания: у каждого товара есть эффект, виды
//     в списке склеиваются (один ключ дважды = сумма);
//  2) ключ нажатия один на набор — повтор запроса ничего не спишет второй раз;
//  3) списание — всё или ничего: не хватило одного вида — уже списанное
//     возвращается в сумку, эффекты не накладываются;
//  4) эффекты накладываются; сорвалось начисление — все зелья возвращаются в
//     сумку (наложенные до сбоя эффекты остаются — как и у одного зелья).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWallet } from "../../auth";
import { resolveBackpack, returnToBackpackStack, takeFromBackpackStack } from "./market-backpack";
import { canonRef } from "./item-alias";
import { boostOpAmount, claimBoostOp, releaseBoostOp } from "./hero-boost";
import { applyBoostRoll } from "./hero-buff";
import { itemBoost } from "./boost-item";
import { noteDrink } from "@/server/api/beta-raid/econ/drink-note";
import { rollBoostQty, type BoostRoll } from "@/lib/hero/boost";

export type BoostItemsLine = { stackKey: string; qty: number; rolls: BoostRoll[]; total: number };

const input = z.object({
  /** Набор: какой товар и сколько штук. До 20 видов, ключи могут повторяться. */
  items: z
    .array(z.object({ stackKey: z.string().min(1).max(200), qty: z.number().int().min(1).max(1000) }))
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
      if (!canon || effects.length === 0) throw new Error(`Этот товар ничего не даёт герою: ${it.stackKey}`);
      const key = `${kind}:${canon}`;
      const cur = merged.get(key);
      merged.set(key, { stackKey: key, canon, qty: (cur?.qty ?? 0) + it.qty });
    }
    const lines: Array<BoostItemsLine & { canon: string }> = [];
    for (const m of merged.values()) {
      const rolls = rollBoostQty(await itemBoost(m.canon), m.qty);
      lines.push({ stackKey: m.stackKey, canon: m.canon, qty: m.qty, rolls, total: rolls.reduce((n, r) => n + r.amount, 0) });
    }
    const total = lines.reduce((n, l) => n + l.total, 0);

    // 2) Один ключ на набор.
    const fresh = await claimBoostOp({
      op: data.op,
      heroId: bp.heroId,
      stat: lines[0]?.rolls[0]?.stat ?? "spd",
      amount: total,
      source: `items:${lines.length}`,
    });
    if (!fresh) {
      return { ok: true as const, repeat: true as const, items: [] as BoostItemsLine[], total: await boostOpAmount(data.op), heroName: bp.heroName };
    }

    // 3) Списание всё или ничего.
    const taken: Array<{ line: (typeof lines)[number]; snap: NonNullable<Awaited<ReturnType<typeof takeFromBackpackStack>>> }> = [];
    const giveBack = async () => {
      for (const t of taken) await returnToBackpackStack(bp.heroId, t.line.stackKey, t.line.qty, t.snap).catch(() => {});
    };
    for (const line of lines) {
      const snap = await takeFromBackpackStack(bp.heroId, line.stackKey, line.qty).catch(async (e) => {
        await giveBack();
        await releaseBoostOp(data.op);
        throw e;
      });
      if (!snap) {
        await giveBack();
        await releaseBoostOp(data.op);
        throw new Error(`Столько штук в сумке нет: ${line.stackKey}`);
      }
      taken.push({ line, snap });
    }

    // 4) Эффекты; сбой начисления — зелья обратно в сумку.
    try {
      for (const line of lines) for (const r of line.rolls) await applyBoostRoll(wallet, r);
    } catch (e) {
      await giveBack();
      await releaseBoostOp(data.op);
      throw e;
    }

    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);
    for (const [i, line] of lines.entries()) await noteDrink({ wallet, canon: line.canon, qty: line.qty, op: `${data.op}:${i}` });

    return {
      ok: true as const,
      repeat: false as const,
      items: lines.map(({ stackKey, qty, rolls, total: t }) => ({ stackKey, qty, rolls, total: t })),
      total,
      heroName: bp.heroName,
    };
  });
