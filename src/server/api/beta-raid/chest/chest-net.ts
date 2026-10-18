// Окно магического сундука: сеть хозяина (одна на все его сундуки) и рюкзак
// смотрящего героя.
//
// Владелец — у себя; чужой (30.09.2026) — когда живой охраны нет: видит сеть
// хозяина, берёт из неё и кладёт в неё (только собранное, как хозяин). Стоять
// — у сундука. Сеть видна только внутри оплаченного входа (§8.23: «Открыть» —
// занятые ячейки сети хозяина, не меньше 1), иначе ответ «закрыт» с ценой.
// «Положить» и «забрать» живут в своих модулях (лимит 250 строк) и переизданы
// здесь — окно берёт все три ручки из одного места.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CHEST_NET_CELLS, netUsed, type ChestNetView } from "@/lib/magicChest";
import { chestOpenPrice } from "@/lib/openPass";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { guardViewIfAlive, loadGuardRow } from "@/server/api/beta-raid/mine-guard-read";
import { chestActor, chestNearAny } from "@/server/api/beta-raid/chest/chest-row";
import { bagOccupied, loadBag, loadNet } from "@/server/api/beta-raid/chest/chest-net-read";
import { passOpen } from "@/server/api/beta-raid/open-pass/pass";
import { magicTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

export { storeToChest } from "@/server/api/beta-raid/chest/chest-store";
export { takeFromChest } from "@/server/api/beta-raid/chest/chest-take";

export const getChestNet = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<ChestNetView> => {
    const a = await chestActor("chest-net");
    const { chest, mine } = await chestNearAny(a, data.q, data.r);
    const [slots, bp, guardRow, open] = await Promise.all([
      loadNet(chest.owner_account),
      resolveBackpack(a.wallet),
      loadGuardRow(a.mapId, data.q, data.r),
      passOpen(a.account, magicTarget(a.mapId, data.q, data.r)),
    ]);
    const used = netUsed(slots);
    const guard = guardViewIfAlive(guardRow);
    const foreign = !mine;
    // Без оплаченного входа сеть не показываем — только цену: то же, что спишет «Открыть».
    if (!open) {
      const backpack = { heroName: bp?.heroName ?? null, capacity: 0, occupied: 0, stacks: [] };
      const price = chestOpenPrice(used);
      const cells = CHEST_NET_CELLS;
      return { cells, used, slots: [], backpack, guard, locked: true, price, foreign };
    }
    // Без героя рюкзака нет — окно покажет сеть и пустую сторону рюкзака.
    const bag = bp ? await loadBag(bp.heroId) : [];
    return {
      cells: CHEST_NET_CELLS,
      used,
      slots,
      backpack: {
        heroName: bp?.heroName ?? null,
        capacity: bp?.capacity ?? 0,
        occupied: bp ? bagOccupied(bag, bp.potionCapacity) : 0,
        // mob — прежнее имя movable: окно, открытое до выката, читает его.
        // Чужой кладёт по тем же правилам, что хозяин: собранное, без изношенного.
        stacks: bag.map((b) => ({ ...b, mob: b.movable })),
      },
      guard,
      foreign,
    };
  });
