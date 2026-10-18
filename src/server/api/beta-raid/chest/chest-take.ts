// Забрать из сети магического сундука в рюкзак героя — владелец или чужой.
//
// «Сколько влезет, столько и берём» — как у склада (warehouse-take.ts): игрок
// с тремя свободными ячейками получает 60 штук, а не отказ «нужно 8». В сеть
// эти штуки попали только собранными, поэтому в рюкзак ложатся с меткой
// «собрано прочее» (loot, stack-origin) — их можно положить обратно. Сеть
// меток не хранит: мобы, грядки и шахты возвращаются одной меткой.
//
// Чужой (четвёртая редакция, 29.09.2026 — «подворовывать»): когда живой охраны
// нет, открыл за энергию и берёт из сети хозяина; сундук стоит на месте и
// остаётся в сети. Снятие — под локом сети хозяина, тем же оператором сверено,
// что сундук стоит, не закопан и живой охраны нет (takeSql via). Всё — только
// внутри оплаченного входа (§8.23), и у владельца тоже.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { MarketKind } from "@/lib/marketItem";
import { exactQty, moveQty } from "@/lib/warehouseCells";
import { depositToBackpack, resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { potionKeysOf } from "@/server/api/beta-raid/potion-bag";
import { noteChestLoot, noteChestMove, noteChestSeize } from "@/server/api/beta-raid/econ/chest-note";
import { chestActor, chestNearAny, num, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { loadBag } from "@/server/api/beta-raid/chest/chest-net-read";
import { returnSql, takeSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { bagRoom, floor3 } from "@/server/api/beta-raid/chest/chest-loot-plan";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { magicTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  stackKey: z.string().min(1).max(200),
  qty: z.number().positive().max(1000),
});

type NetSnap = {
  kind: string;
  ref_id: string | null;
  item_id: string | null;
  name: string;
  image: string | null;
  count: number | string;
};

export const takeFromChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; qty: number }> => {
    const a = await chestActor("chest-take");
    const { chest, mine } = await chestNearAny(a, data.q, data.r);
    const owner = chest.owner_account;
    await requirePass(a.account, magicTarget(a.mapId, data.q, data.r));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    // Девять знаков, как у склада (warehouse-take): собранная крошка (0,000454)
    // ложится в сеть точным числом, и тысячные сделали бы её незабираемой.
    const want = exactQty(data.qty);
    if (want <= 0) throw new Error("braid.wh_gone");

    const snaps = (await mcpExec(
      `SELECT kind, ref_id, item_id, name, image, count FROM yuplink.raid_chest_slot
        WHERE account_id = ${sqlStr(owner)} AND stack_key = ${sqlStr(data.stackKey)}
          AND count > 0 LIMIT 1;`,
      { wrapJson: true },
    )) as NetSnap[];
    const snap = snaps?.[0];
    if (!snap) throw new Error("braid.wh_gone");
    const have = num(snap.count);

    // Место: долив в свою неполную ячейку + новые сверху; зелье — только в
    // сумку. Та же арифметика, что у забора со склада.
    const bag = await loadBag(bp.heroId);
    const mineStack = bag.find((b) => b.stackKey === data.stackKey);
    const potion = mineStack?.potion ?? (await potionKeysOf([data.stackKey])).has(data.stackKey);
    const room = bagRoom(bag, data.stackKey, potion, bp);
    // Остаток меньше пыли — весь стек (moveQty); не влезает — тысячные вниз.
    const ask = moveQty(have, want);
    const fits = ask <= room ? ask : floor3(room);
    if (fits <= 0) throw new Error(potion ? "market.potion_bag_full" : "market.backpack_full");

    const op = `chesttake:${nanoid(12)}`;
    const via = { mapId: a.mapId, q: data.q, r: data.r, own: mine };
    const res = sqlRow<{ was: boolean; took: boolean; mv: number | string | null }>(
      (await mcpExec(
        takeSql({ account: owner, stackKey: data.stackKey, qty: fits, op, via }),
      )) as unknown[],
    );
    if (!res?.was && !res?.took) throw new Error(mine ? "braid.wh_gone" : "pchest.taken");
    // Повтор моста: снятое равно fits (takeSql снимает только полное
    // количество, пыль сверх — не больше тысячной).
    const qty = res.was ? fits : num(res.mv);

    try {
      await depositToBackpack({
        heroId: bp.heroId,
        account: a.account,
        item: {
          id: refFromStackKey(data.stackKey),
          kind: snap.kind as MarketKind,
          refId: snap.ref_id,
          name: snap.name,
          image: snap.image,
        },
        qty,
        nonce: op,
        capacity: bp.capacity,
        potionCapacity: bp.potionCapacity,
        origin: "loot",
      });
    } catch (e) {
      // Рюкзак не принял — штуки назад в сеть ХОЗЯИНА, со своим ключом повтора.
      await mcpExec(
        returnSql({
          account: owner,
          stackKey: data.stackKey,
          snap: {
            kind: snap.kind,
            refId: snap.ref_id,
            itemId: snap.item_id,
            name: snap.name,
            image: snap.image,
          },
          qty,
          op: `chestback:${op}`,
        }),
      ).catch((err) => console.error("[chest-take] возврат в сеть не удался:", err));
      throw e;
    }

    const place = { mapId: a.mapId, q: data.q, r: data.r };
    const item = { stackKey: data.stackKey, kind: snap.kind, refId: snap.ref_id, name: snap.name };
    if (mine) {
      const stackKey = data.stackKey;
      void noteChestMove({ side: "take", account: a.account, ...place, stackKey, snap: item, qty, ref: op });
    } else {
      // Чужой взял из сети хозяина: у хозяина «потерял», у взявшего «унёс».
      const plunder = { ...place, plunderId: op, owner, raider: a.account };
      void noteChestSeize({ ...plunder, items: [{ ...item, count: qty }] });
      void noteChestLoot({ ...plunder, items: [item], taken: [{ stackKey: data.stackKey, qty }] });
    }
    return { ok: true as const, qty };
  });
