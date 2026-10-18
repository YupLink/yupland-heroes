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
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
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
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import { backSql, takeDoneSql } from "@/server/api/beta-raid/loot-bag/bag-back-sql";
import { noteBagTake, type BagStackRow } from "@/server/api/beta-raid/loot-bag/bag-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { bagTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

const input = z.object({
  bagId: z.string().regex(/^lb_[0-9a-f]{32}$/),
  /** Какую стопку; нет — «Забрать всё». */
  stackKey: z.string().min(1).max(200).optional(),
  qty: z.number().positive().max(100_000).optional(),
  /** Ключ нажатия: повтор того же нажатия не забирает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Позиции мешочка — живые порции по видам (и чей он — для журнала сделок). */
async function loadStacks(bagId: string): Promise<BagStackRow[]> {
  return ((await mcpExec(
    `SELECT i.stack_key AS "stackKey", min(i.kind) AS kind, min(i.ref_id) AS "refId",
            min(i.name) AS name, min(i.image) AS image, sum(i.count) AS count,
            min(b.dropped_by) AS "droppedBy"
       FROM yuplink.raid_loot_bag_item i
       JOIN yuplink.raid_loot_bag b ON b.id = i.bag_id
      WHERE i.bag_id = ${sqlStr(bagId)} AND ${livePortion("i")}
      GROUP BY i.stack_key
      ORDER BY min(i.name), i.stack_key;`,
    { wrapJson: true },
  )) ?? []) as BagStackRow[];
}

/** Это нажатие по стопке уже забрало (повтор после ответа, потерянного в пути) — сколько. */
async function doneBefore(op: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string; qty: number | string }>;
  return rows?.[0]?.state === "done" ? num(rows[0].qty) : 0;
}

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

export const takeFromLootBag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<LootBagTaken> => {
    const a = await bagActor("bag-take");
    const bag = await bagNear(a, data.bagId);
    if (bag.buried) throw new Error("bag.buried");
    // Забирать — только внутри оплаченного входа (§8.23).
    await requirePass(a.account, bagTarget(bag.id));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const stacks = await loadStacks(bag.id);
    const want = data.stackKey ? stacks.filter((s) => s.stackKey === data.stackKey) : stacks;
    if (want.length === 0) throw new Error("bag.taken");

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
      const qty = ask <= fits ? ask : floor3(fits);
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
    // Мешочек поменялся (или опустел) — все рядом перечитывают свой «второй обзор».
    if (taken.length > 0)
      publishRaid({ mapId: a.mapId, type: "bags", cells: [`${bag.q},${bag.r}`] });
    if (taken.length === 0) throw new Error(why ?? "bag.taken");
    return { taken };
  });
