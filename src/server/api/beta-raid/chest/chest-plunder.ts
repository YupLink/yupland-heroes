// Добыча победителя охраны сундука: посмотреть, список невыбранных, забрать.
//
// Правило владельца (27.09.2026, вторая редакция): победа над охраной сразу
// снимает сундук с карты и опустошает сеть владельца (chest-seize.ts) — всё
// лежит в журнале грабежа до выбора победителя. Окно выбора открывается по id
// добычи: сундука на карте уже нет. Сундук подбирается победителю обычным
// стеком (поставит — встанет в ЕГО сеть); товары сети ложатся «собрано
// прочее» (loot) — в сеть они попали только собранными. Не выбранное и не влезшее пропадает;
// сундуку нет места — забор не начинается, добыча ждёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import type { MarketKind } from "@/lib/marketItem";
import {
  clampPicks,
  type ChestLootView,
  type ChestSlot,
  type LootPick,
  type PendingLoot,
  type PlunderResult,
} from "@/lib/magicChest";
import { depositToBackpack, resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { potionKeysOf } from "@/server/api/beta-raid/potion-bag";
import { noteChestLoot } from "@/server/api/beta-raid/econ/chest-note";
import { chestActor, num, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagOccupied, loadBag } from "@/server/api/beta-raid/chest/chest-net-read";
import {
  chestFirst,
  chestFits,
  lostOf,
  planLoot,
} from "@/server/api/beta-raid/chest/chest-loot-plan";
import { ownerName, ownerNames } from "@/server/api/beta-raid/chest/chest-owner";
import {
  claimSql,
  pendingListSql,
  pendingSql,
  plunderItems,
  plunderTakenSql,
  type PlunderItem,
  type PlunderRow,
} from "@/server/api/beta-raid/chest/chest-plunder-sql";

const idInput = z.object({ plunderId: z.string().min(1).max(64) });

/** Позиции добычи с числовым количеством; пустые хвосты не показываем. */
const itemsOf = (row: PlunderRow): Array<PlunderItem & { count: number }> =>
  plunderItems(row.items)
    .map((it) => ({ ...it, count: num(it.count) }))
    .filter((it) => it.count > 0);

const slotOf = ({ stackKey, kind, name, image, count }: PlunderItem & { count: number }) =>
  ({ stackKey, kind, name, image: image ?? null, count }) satisfies ChestSlot;

export const getChestLoot = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<ChestLootView> => {
    const a = await chestActor("chest-loot");
    const rows = (await mcpExec(pendingSql(data.plunderId, a.account), {
      wrapJson: true,
    })) as PlunderRow[];
    const row = rows?.[0];
    if (!row) throw new Error("chest.loot_gone");
    const [name, bp] = await Promise.all([ownerName(row.owner_account), resolveBackpack(a.wallet)]);
    const bag = bp ? await loadBag(bp.heroId) : [];
    const have: Record<string, number> = {};
    for (const b of bag) have[b.stackKey] = b.count;
    return {
      plunderId: row.id,
      ownerName: name,
      slots: itemsOf(row).map(slotOf),
      backpack: {
        capacity: bp?.capacity ?? 0,
        occupied: bp ? bagOccupied(bag, bp.potionCapacity) : 0,
        have,
      },
    };
  });

/** Мои невыбранные добычи — вход в окно выбора после его закрытия. */
export const listChestLoot = createServerFn({ method: "GET" }).handler(
  async (): Promise<PendingLoot[]> => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return [];
    const rows = (await mcpExec(pendingListSql(account), { wrapJson: true })) as Array<{
      id: string;
      owner_account: string;
      at: string;
      kinds: number | string;
    }>;
    const names = await ownerNames((rows ?? []).map((x) => x.owner_account));
    return (rows ?? []).map((x) => ({
      plunderId: x.id,
      ownerName: names.get(x.owner_account) ?? null,
      at: String(x.at),
      kinds: num(x.kinds),
    }));
  },
);

const plunderInput = idInput.extend({
  picks: z
    .array(
      z.object({ stackKey: z.string().min(1).max(200), qty: z.number().nonnegative().max(1000) }),
    )
    .max(50),
});

export const plunderChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => plunderInput.parse(d))
  .handler(async ({ data }): Promise<PlunderResult> => {
    const a = await chestActor("chest-plunder");
    // Без героя некуда класть — отказ ДО забора, иначе добыча просто сгорела бы.
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    // Всё считаем ДО забора: сбой чтения или сундук, которому нет места, —
    // отказ, а добыча ждёт в журнале. Сундук «подбирается в инвентарь
    // победителя» (правило владельца): он первый и целиком, что бы ни прислал
    // клиент; не влез — забирать нельзя, иначе он сгорел бы вместе с сетью.
    const pre = (
      (await mcpExec(pendingSql(data.plunderId, a.account), {
        wrapJson: true,
      })) as PlunderRow[]
    )?.[0];
    if (!pre) throw new Error("chest.loot_gone");
    const preItems = itemsOf(pre);
    const box = preItems.find((it) => it.chest === true);
    const chest = box ? { stackKey: box.stackKey, qty: box.count } : null;
    const picks = clampPicks(chestFirst(data.picks, chest), preItems.map(slotOf));
    const [bag, potions] = await Promise.all([
      loadBag(bp.heroId),
      potionKeysOf(picks.map((p) => p.stackKey)),
    ]);
    const plan = planLoot(picks, bag, bp, potions);
    if (!chestFits(plan, chest)) throw new Error("market.backpack_full");

    // Одноразово: строку помечает только этот вызов (ключ — на вызов).
    // Добыча в журнале после записи не меняется — план по снимку верен.
    const row = sqlRow<PlunderRow>(
      (await mcpExec(
        claimSql({ id: data.plunderId, raider: a.account, op: nanoid(12) }),
      )) as unknown[],
    );
    if (!row?.id) throw new Error("chest.loot_gone");
    const id = row.id;
    const items = itemsOf(row);
    const slots = items.map(slotOf);

    // Каждая позиция — своим ключом повтора; сорвалась выдача — позиция
    // пропала вместе с не влезшим (вернуть владельцу нельзя: сеть опустошена).
    const byKey = new Map(items.map((it) => [it.stackKey, it]));
    const taken: LootPick[] = [];
    for (const [i, p] of plan.entries()) {
      const it = byKey.get(p.stackKey);
      if (!it) continue;
      try {
        await depositToBackpack({
          heroId: bp.heroId,
          account: a.account,
          item: {
            id: refFromStackKey(p.stackKey),
            kind: it.kind as MarketKind,
            refId: it.refId,
            name: it.name,
            image: it.image,
          },
          qty: p.qty,
          nonce: `${id}:${i}`,
          capacity: bp.capacity,
          potionCapacity: bp.potionCapacity,
          // Сам сундук — обычный предмет; товары сети — добыча грабежа (loot).
          origin: it.chest === true ? null : "loot",
        });
        taken.push(p);
      } catch (e) {
        console.warn("[chest-plunder] не легло:", p.stackKey, e instanceof Error ? e.message : e);
      }
    }

    void mcpExec(plunderTakenSql(id, taken)).catch(() => {});
    void noteChestLoot({
      plunderId: id,
      owner: row.owner_account,
      raider: a.account,
      mapId: row.map_id,
      q: num(row.q),
      r: num(row.r),
      items,
      taken,
    });
    return { taken, lost: lostOf(slots, taken) };
  });
