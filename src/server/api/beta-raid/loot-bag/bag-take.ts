// «Забрать» из мешочка — стопку с количеством или всё (ПРАВИЛА §8.21).
//
// Любой игрок вплотную. Берётся сколько влезет: место считает общая
// арифметика рюкзака (bagRoom — roomFor + backpackRoomFor; зелья — в сумку
// зелий), остальное остаётся в мешочке; пустой мешочек исчезает у всех. Из
// порций вида первой уходит та, что сгорит раньше (bag-take-sql).
//
// Порядок как у забора из своего сундука (chest-take.ts): снять под локом
// мешочка (takeSql — двое разом берут ровно то, что было), положить в рюкзак
// (depositToBackpack, ключ выдачи = ключ снятия), рюкзак не принял — вернуть
// снятое в ту же стопку (backSql, «забор» выдачи: штуки ровно в одном месте).
// Метки происхождения едут со штуками туда и обратно (stack-origin). Снятое,
// но не дошедшее ни туда ни сюда (сбой базы), разбирает сборщик (bag-sweep).
//
// Ключ нажатия op от клиента: `bagtake:<аккаунт>:<op>:<стопка>` — повтор того
// же нажатия не снимет второй раз (prior в raid_loot_bag_op) и не положит
// второй раз (ключ выдачи в raid_backpack_op).
// Ресурс счёта (разборка шахты, §8.70, стопка resource:<вид>) — не в рюкзак, а
// на счёт (bag-take-res): героя и места ему не нужно.
//
// «Забрать всё» (без стопки) — те же шаги по каждой стопке, каждая со своим
// ключом нажатия: не влезшее остаётся в мешочке, и ответ, кроме taken, несёт
// left — что в мешочке осталось (свежим чтением, bag-take-read.leftIn).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import type { LootBagTaken } from "@/lib/lootBag";
import type { MarketKind } from "@/lib/marketItem";
import { exactQty, moveQty } from "@/lib/warehouseCells";
import {
  depositToBackpack,
  resolveBackpack,
  type BagCaps,
} from "@/server/api/beta-raid/market-backpack";
import { refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { potionKeysOf } from "@/server/api/beta-raid/potion-bag";
import { loadBag } from "@/server/api/beta-raid/chest/chest-net-read";
import { bagRoom, floor3 } from "@/server/api/beta-raid/chest/chest-loot-plan";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor, bagNear, type BagActor } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { takeSql, type TakeRow } from "@/server/api/beta-raid/loot-bag/bag-take-sql";
import { backSql, takeDoneSql } from "@/server/api/beta-raid/loot-bag/bag-back-sql";
import { noteBagTake, type BagStackRow } from "@/server/api/beta-raid/loot-bag/bag-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { bagTarget } from "@/server/api/beta-raid/open-pass/pass-sql";
import { isDaraiMineKey } from "@/lib/daraiMine";
import { isResStack, takeResStacks } from "@/server/api/beta-raid/loot-bag/bag-take-res";
import { isArtStack, takeArtStacks } from "@/server/api/beta-raid/loot-bag/bag-take-art";
import { doneBefore, leftIn, loadStacks } from "@/server/api/beta-raid/loot-bag/bag-take-read";

const input = z.object({
  bagId: z.string().regex(/^lb_[0-9a-f]{32}$/),
  /** Какую стопку; нет — «Забрать всё». */
  stackKey: z.string().min(1).max(200).optional(),
  qty: z.number().positive().max(100_000).optional(),
  /** Ключ нажатия: повтор того же нажатия не забирает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Вернуть снятое, если выдача не прошла. true — выдача всё же прошла (ответ потерялся). */
async function settle(bagId: string, heroId: string, op: string): Promise<boolean> {
  const row = sqlRow<{ blocked: boolean | null }>(
    (await mcpExec(backSql({ bagId, heroId, op, nonce: op }))) as unknown[],
  );
  return row?.blocked === false;
}

/**
 * Снять `qty` штук стопки и положить в рюкзак. Отдаёт, сколько легло (0 —
 * снимать было нечего: забрали, закопали, истёк). Рюкзак не принял — снятое
 * назад в мешочек и бросок с причиной. cap — место под стопку: остаток-пыль
 * уходит вместе со снятым, только если влезает.
 */
async function takeOne(
  a: BagActor,
  bagId: string,
  bp: BagCaps,
  s: BagStackRow,
  n: { qty: number; cap: number },
  op: string,
): Promise<number> {
  const sql = takeSql({
    bagId,
    stackKey: s.stackKey,
    ...n,
    op,
    account: a.account,
    heroId: bp.heroId,
  });
  let res: TakeRow | undefined;
  try {
    res = sqlRow<TakeRow>((await mcpExec(sql)) as unknown[]);
  } catch (e) {
    // Снялось ли — неизвестно: если снялось, откат вернёт (выдачи не было).
    await settle(bagId, bp.heroId, op).catch(() => {});
    throw e;
  }
  // Это нажатие уже откатывали (рюкзак не принял) — второй попытки у него нет.
  if (res?.prior === "undone") throw new Error("market.backpack_full");
  const took = num(res?.qty);
  if (!(took > 0) || res?.prior === "done") return took;
  try {
    await depositToBackpack({
      heroId: bp.heroId,
      account: a.account,
      item: {
        id: refFromStackKey(s.stackKey),
        kind: s.kind as MarketKind,
        refId: s.refId,
        name: s.name,
        image: s.image,
      },
      qty: took,
      nonce: op,
      capacity: bp.capacity,
      potionCapacity: bp.potionCapacity,
      origin: {
        mob: num(res?.mob),
        mine: num(res?.mine),
        field: num(res?.field),
        loot: num(res?.loot),
      },
    });
  } catch (e) {
    if (!(await settle(bagId, bp.heroId, op))) throw e;
  }
  // Выдача прошла — ключ закрыть (не вышло — закроет сборщик тем же «забором»).
  await mcpExec(takeDoneSql(op)).catch(() => {});
  return took;
}

type Took = { taken: LootBagTaken["taken"]; why: string | null };

/** Товары — в рюкзак, сколько влезет; что не легло — причина в why. */
async function takeGoods(
  a: BagActor,
  bag: { id: string; q: number; r: number },
  bp: BagCaps,
  want: readonly BagStackRow[],
  data: { stackKey?: string; qty?: number; op: string },
): Promise<Took> {
  // Место: снимок рюкзака и какие из новых видов — зелья; дальше правим сами.
  const room = await loadBag(bp.heroId);
  const fresh = want.map((s) => s.stackKey).filter((k) => !room.some((r) => r.stackKey === k));
  const potions = await potionKeysOf(fresh);
  const taken: LootBagTaken["taken"] = [];
  let why: string | null = null;
  for (const s of want) {
    const mine = room.find((r) => r.stackKey === s.stackKey);
    const potion = mine?.potion ?? potions.has(s.stackKey);
    const fits = bagRoom(room, s.stackKey, potion, bp);
    const ask = moveQty(num(s.count), data.stackKey && data.qty ? data.qty : num(s.count));
    // DARAI-шахта — только целиком: половинку не разместить (lib/daraiMine).
    const dm = isDaraiMineKey(s.stackKey);
    const want = dm ? Math.floor(num(s.count)) : ask;
    const qty = want <= fits ? want : dm ? 0 : floor3(fits);
    const op = `bagtake:${a.account}:${data.op}:${s.stackKey}`;
    if (!(qty > 0)) {
      // Места нет — но, может, это повтор уже прошедшего нажатия: отвечаем тем же.
      const before = await doneBefore(op).catch(() => 0);
      if (before > 0) taken.push({ stackKey: s.stackKey, qty: before });
      else why ??= potion ? "market.potion_bag_full" : "market.backpack_full";
      continue;
    }
    try {
      const took = await takeOne(a, bag.id, bp, s, { qty, cap: fits }, op);
      if (!(took > 0)) continue;
      taken.push({ stackKey: s.stackKey, qty: took });
      if (mine) mine.count = exactQty(mine.count + took);
      else
        room.push({
          stackKey: s.stackKey,
          kind: s.kind,
          name: s.name,
          image: s.image,
          count: took,
          movable: 0,
          potion,
        });
      void noteBagTake({ actor: a, bag, stack: s, qty: took, ref: op });
    } catch (e) {
      // Одна стопка не легла — «Забрать всё» пробует остальные.
      if (data.stackKey) throw e;
      why ??= e instanceof Error ? e.message : String(e);
    }
  }
  return { taken, why };
}

export const takeFromLootBag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<LootBagTaken> => {
    const a = await bagActor("bag-take");
    const bag = await bagNear(a, data.bagId);
    if (bag.buried) throw new Error("bag.buried");
    // Забирать — только внутри оплаченного входа (§8.23).
    await requirePass(a.account, bagTarget(bag.id));
    const stacks = await loadStacks(bag.id);
    const want = data.stackKey ? stacks.filter((s) => s.stackKey === data.stackKey) : stacks;
    if (want.length === 0) throw new Error("bag.taken");

    // Ресурсы счёта (разборка шахты, §8.70) — на счёт: ни героя, ни места.
    const res = await takeResStacks(a, bag, want.filter(isResStack), {
      press: data.op,
      qty: data.stackKey ? data.qty : undefined,
      single: !!data.stackKey,
    });
    // Артефакты (§8.73 п. 4) — в инвентарь: тоже ни героя, ни места.
    const arts = await takeArtStacks(a, bag, want.filter(isArtStack), {
      press: data.op,
      single: !!data.stackKey,
    });
    res.taken.push(...arts.taken);
    res.why ??= arts.why;
    const goods = want.filter((s) => !isResStack(s) && !isArtStack(s));
    const bp = goods.length > 0 ? await resolveBackpack(a.wallet) : null;
    if (goods.length > 0 && !bp && res.taken.length === 0) {
      throw new Error("market.backpack_no_hero");
    }
    const got: Took = bp
      ? await takeGoods(a, bag, bp, goods, data)
      : { taken: [], why: goods.length > 0 ? "market.backpack_no_hero" : null };
    const taken = [...res.taken, ...got.taken];
    const why = res.why ?? got.why;
    // Мешочек поменялся (или опустел) — все рядом перечитывают свой «второй обзор».
    if (taken.length > 0)
      publishRaid({ mapId: a.mapId, type: "bags", cells: [`${bag.q},${bag.r}`] });
    if (taken.length === 0) throw new Error(why ?? "bag.taken");
    if (data.stackKey) return { taken };
    // «Забрать всё»: что не влезло — окну для тоста; не прочиталось — без него.
    const left = await leftIn(bag.id).catch(() => []);
    return left.length > 0 ? { taken, left } : { taken };
  });
