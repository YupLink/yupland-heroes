// Забрать из обычного сундука в рюкзак (ПРАВИЛА §8.22).
//
// Любой игрок вплотную, из стоящего сундука. «Сколько влезет» — как у склада
// и мешочка: место считает общая арифметика рюкзака (bagRoom — roomFor +
// backpackRoomFor; зелья — только в сумку зелий, строго), остальное остаётся
// в сундуке. Сундук меток не хранит: забранное — безымянное (§8.18). Снять и
// положить — один оператор (pchest-move-sql) с проверкой места атомарно с
// записью; ключ нажатия `pctake:<аккаунт>:<op>`: повтор второй раз не берёт.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { exactQty, moveQty } from "@/lib/warehouseCells";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { potionKeysOf } from "@/server/api/beta-raid/potion-bag";
import { loadBag } from "@/server/api/beta-raid/chest/chest-net-read";
import { bagRoom, floor3 } from "@/server/api/beta-raid/chest/chest-loot-plan";
import { num, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  loadOp,
  moveInput,
  pchestActor,
  plainNear,
  whyNotHere,
} from "@/server/api/beta-raid/plain-chest/pchest-row";
import { takeSql, type MoveRow } from "@/server/api/beta-raid/plain-chest/pchest-move-sql";
import { loadSlot } from "@/server/api/beta-raid/plain-chest/pchest-read";
import { notePlain } from "@/server/api/beta-raid/plain-chest/pchest-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { plainTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

export const takeFromPlainChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => moveInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; qty: number }> => {
    const a = await pchestActor("pchest-take");
    const chest = await plainNear(a, data.q, data.r);
    // «Положить» и «Забрать» — только внутри оплаченного входа (§8.23).
    await requirePass(a.account, plainTarget(chest.id));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const op = `pctake:${a.account}:${data.op}`;
    const prev = async () => (await loadOp(op).catch(() => null))?.qty ?? 0;
    // Повтор нажатия, чей ответ потерялся: итог тот же, окно у соседей — тоже.
    const again = (qty: number) => {
      publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`], scope: "chest" });
      return { ok: true as const, qty };
    };
    const key = data.stackKey;

    const slot = await loadSlot(chest.id, key);
    const want = exactQty(data.qty);
    if (!slot || want <= 0) {
      const was = await prev();
      if (was > 0) return again(was);
      throw new Error("pchest.taken");
    }

    // Место: долив в свою неполную ячейку + новые сверху; зелье — только в сумку.
    const bag = await loadBag(bp.heroId);
    const potion =
      bag.find((b) => b.stackKey === key)?.potion ?? (await potionKeysOf([key])).has(key);
    const room = bagRoom(bag, key, potion, bp);
    // Остаток меньше пыли — весь стек (moveQty); не влезает — тысячные вниз.
    const ask = moveQty(slot.count, want);
    const qty = ask <= room ? ask : floor3(room);
    const full = potion ? "market.potion_bag_full" : "market.backpack_full";
    if (qty <= 0) {
      const was = await prev();
      if (was > 0) return again(was);
      throw new Error(full);
    }

    const sql = takeSql({
      chestId: chest.id,
      heroId: bp.heroId,
      account: a.account,
      stackKey: key,
      qty,
      op,
      potion,
      capacity: bp.capacity,
      potionCapacity: bp.potionCapacity,
      cap: room,
    });
    let res: MoveRow | undefined;
    try {
      res = sqlRow<MoveRow>((await mcpExec(sql)) as unknown[]);
    } catch (e) {
      const was = await prev();
      if (was > 0) return again(was);
      throw e;
    }
    if (res?.prior) return again(num(res.prior_qty));
    if (!res?.moved) {
      if (!res) {
        const was = await prev();
        if (was > 0) return again(was);
        throw new Error("chest.busy");
      }
      if (!res.here) throw new Error(await whyNotHere(a.mapId, data.q, data.r));
      if (!res.have) throw new Error("pchest.taken");
      // Место заняли между расчётом и записью (выдача в рюкзак с другой стороны).
      throw new Error(full);
    }

    const moved = num(res.mv);
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`], scope: "chest" });
    const item = { stackKey: key, kind: slot.kind, refId: slot.refId, name: slot.name };
    void notePlain(a, data, "take", item, moved, op);
    return { ok: true as const, qty: moved };
  });
