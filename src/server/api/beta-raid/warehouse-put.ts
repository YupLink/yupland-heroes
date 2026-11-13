// «Положить» на полку склада — ядро, общее для склада на карте и склада замка.
//
// Вынесено из warehouse.ts без изменений поведения: склад на карте зовёт его со
// своей клеткой и 2 + 8 ячейками, склад замка — с местом «замок» и личными
// ячейками по уровню (владелец, 08.10.2026). Проверку «стою рядом» делает
// вызывающий.
import { nanoid } from "nanoid";
import { exactQty, moveQty, splitDeposit, type DepositScope } from "@/lib/warehouseCells";
import { loadSlots, upsertSlot } from "./warehouse-store";
import { resolveBackpack, returnToBackpackStack, takeFromBackpackStack } from "./market-backpack";
import { backpackStackCount } from "./market-backpack-take";
import { mcpExec } from "../../db/mcpClient";
import { addWearSql, shelfWhere } from "./tool-wear-move";
import { noteShelf } from "./econ/trade-hooks";
import { NO_ORIGIN, originParts, originPlus, takenOf } from "@/server/api/beta-raid/stack-origin";
import { isDaraiMineKey } from "@/lib/daraiMine";

/** Где полка и сколько на ней ячеек. */
export type ShelfAt = {
  mapId: string;
  q: number;
  r: number;
  ownCells: number;
  sharedCells: number;
};

/**
 * Отказ «места нет» — по выбору игрока: с «Себе» при свободной общей полке
 * общее «Склад заполнен» вводило в заблуждение (личные полки на карте полны
 * у сотен игроков). «Сам» остаётся общим текстом — там пробовали обе.
 */
export const fullError = (scope: "auto" | "own" | "shared") =>
  new Error(
    scope === "own"
      ? "braid.wh_own_full"
      : scope === "shared"
        ? "braid.wh_shared_full"
        : "braid.wh_full",
  );

/** Положить из рюкзака: сначала в свои ячейки, остаток — на общую полку (если есть). */
export async function putToShelf(o: {
  wallet: string;
  account: string;
  at: ShelfAt;
  stackKey: string;
  asked: number;
  scope: DepositScope;
}): Promise<{ ok: true; own: number; shared: number; rejected: number }> {
  const { wallet, account, at, stackKey, asked, scope } = o;
  // DARAI-шахта живёт в рюкзаке час и выпадает мешочком (lib/daraiMine).
  if (isDaraiMineKey(stackKey)) throw new Error("dmine.stays");
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.backpack_no_hero");

  // Сколько класть, решает стек в рюкзаке (moveQty): «всё» уходит точным
  // количеством, и пыль (< 0,001) ячейкой в рюкзаке не остаётся. Ноль — не
  // «склад полон», а «нечего класть». Изношенный инструмент уходит вместе со
  // всей стопкой и уносит износ с собой (tool-wear-move, 14.10.2026).
  const have = await backpackStackCount(bp.heroId, stackKey);
  if (have <= 0) throw new Error("braid.wh_not_enough");
  const qty = moveQty(have, asked);
  if (qty <= 0) throw new Error("braid.wh_too_small");

  const slots = await loadSlots(at.mapId, at.q, at.r, account);
  const same = (s: "own" | "shared") =>
    slots.find((x) => x.scope === s && x.stack_key === stackKey)?.count ?? 0;
  const counts = (s: "own" | "shared") =>
    slots.filter((x) => x.scope === s).map((x) => Number(x.count) || 0);
  const plan = splitDeposit({
    qty,
    scope,
    exact: true,
    ownCells: at.ownCells,
    sharedCells: at.sharedCells,
    ownSame: Number(same("own")) || 0,
    ownCounts: counts("own"),
    sharedSame: Number(same("shared")) || 0,
    sharedCounts: counts("shared"),
  });
  if (plan.own + plan.shared <= 0) throw fullError(scope);

  // Сначала снимаем с рюкзака — ровно столько, сколько поместится.
  const moved = exactQty(plan.own + plan.shared);
  const exact = { exact: true };
  const snap = await takeFromBackpackStack(bp.heroId, stackKey, moved, {
    ...exact,
    withWear: true,
  });
  if (!snap) throw new Error("braid.wh_not_enough");
  // Износ ушедшей стопки ложится на первую легшую часть; не легло ничего — едет назад.
  let wear = snap.wear ?? 0;
  const wearTo = async (scope: "own" | "shared") => {
    if (wear <= 0) return;
    const where = shelfWhere({ ...at, scope, account: scope === "own" ? account : null, stackKey });
    await mcpExec(addWearSql("raid_warehouse_slot", where, wear)).catch((e: unknown) =>
      console.warn(`[wh-put] износ ${stackKey}: ${String(e)}`),
    );
    wear = 0;
  };
  // Метки ушедшего (stack-origin) едут с товаром на ЛИЧНУЮ полку — помеченное
  // первым. Общая полка не «моя» (владелец, 29.09.2026): легшее на неё метки
  // теряет, поэтому своё помеченное туда уходит последним. Не легшее
  // возвращается в рюкзак со своими метками.
  const [ownOrigin, sharedOrigin] = originParts(snap, moved, plan.own, exactQty);

  // upsertSlot под локом отвечает false, если место ушло между «посчитал» и
  // «записал» (сосед открыл склад, урожай осел). Раньше ответ не читали, и
  // товар, уже снятый с рюкзака, пропадал молча. Возвращаем ровно то, что
  // НЕ легло: при «auto» личная часть может не влезть, а общая — лечь.
  let own = 0;
  let shared = 0;
  // Назад — с метками именно не легшей части: у легшей они уже на полке.
  const giveBack = async () => {
    const back = exactQty(moved - own - shared);
    if (back <= 0) return;
    const lost = originPlus(own ? NO_ORIGIN : ownOrigin, shared ? NO_ORIGIN : sharedOrigin);
    const bs = { ...snap, ...takenOf(lost), wear };
    await returnToBackpackStack(bp.heroId, stackKey, back, bs, account, exact).catch(() => {});
  };
  try {
    if (plan.own > 0) {
      const ok = await upsertSlot(
        at.mapId,
        { q: at.q, r: at.r },
        "own",
        account,
        stackKey,
        snap,
        plan.own,
        undefined,
        at.ownCells,
        ownOrigin,
      );
      own = ok ? plan.own : 0;
      if (own > 0) await wearTo("own");
    }
    if (plan.shared > 0) {
      const ok = await upsertSlot(
        at.mapId,
        { q: at.q, r: at.r },
        "shared",
        null,
        stackKey,
        snap,
        plan.shared,
        undefined,
        at.sharedCells,
      );
      shared = ok ? plan.shared : 0;
      if (shared > 0) await wearTo("shared");
    }
  } catch (e) {
    // Не легло на полку — возвращаем в рюкзак, товар не должен пропасть.
    await giveBack();
    throw e;
  }
  await giveBack();
  if (own + shared <= 0) throw fullError(scope);
  // Журнал: легло на ОБЩУЮ полку (личные ячейки — не сделка); best-effort.
  if (shared > 0) {
    const ref = `wh-put:${at.mapId}:${at.q},${at.r}:${stackKey}:${nanoid(10)}`;
    const where = { mapId: at.mapId, q: at.q, r: at.r, stackKey, snap, qty: shared, ref };
    void noteShelf({ source: "wh_put", account, ...where });
  }
  const back = exactQty(moved - own - shared);
  return { ok: true as const, own, shared, rejected: exactQty(plan.rejected + back) };
}
