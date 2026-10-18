// Склад: общий сундук на карте. Две ячейки твои, восемь — общие.
//
// Правила те же, что у рюкзака героя: двадцать единиц одного вида на ячейку,
// стек по виду товара. Кладёшь — сначала заполняются личные ячейки, остаток
// уходит на общую полку, откуда его может забрать кто угодно. Своё не тронет
// никто, общее — забирает первый успевший, в этом и смысл склада.
//
// Единицы бывают дробными (награды боссов): полка — numeric (acc-47), место
// считается по ячейкам. «Забрать» живёт в warehouse-take.ts (лимит 250 строк).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { OWN_CELLS, SHARED_CELLS, occupiedCells } from "@/lib/warehouseCells";
import { loadSlots, toStack, warehouseAt } from "./warehouse-store";
import { resolveBackpack } from "./market-backpack";
import { settleFieldsForWarehouse } from "./field-settle";
import { putToShelf } from "./warehouse-put";
import { loadBackpackPanel } from "./warehouse-backpack";

export { takeFromWarehouse } from "./warehouse-take";

const cell = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Окно склада: полки и рюкзак героя рядом — чтобы перекладывать в одном месте. */
export const getWarehouse = createServerFn({ method: "GET" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const b = await warehouseAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    // Поля-товары в радиусе сначала «доливают» урожай сюда — открыл склад,
    // видишь свежие полки, без крона и без кнопки сбора. Заодно берём «зреет» —
    // дробный остаток игрока, чтобы показать, что урожай идёт (сбор — целыми).
    const pending = await settleFieldsForWarehouse(mapId, data.q, data.r, account).catch(() => []);

    const [slots, bp] = await Promise.all([
      loadSlots(mapId, data.q, data.r, account),
      resolveBackpack(wallet).catch(() => null),
    ]);
    const own = slots.filter((s) => s.scope === "own").map(toStack);
    const shared = slots.filter((s) => s.scope === "shared").map(toStack);

    // Рюкзак показываем тут же: склад без него — окно, из которого нечего
    // достать и некуда положить.
    const backpack = bp ? await loadBackpackPanel(bp) : null;

    return {
      name: b.name,
      ownCells: OWN_CELLS,
      sharedCells: SHARED_CELLS,
      ownUsed: occupiedCells(own.map((s) => s.count)),
      sharedUsed: occupiedCells(shared.map((s) => s.count)),
      own,
      shared,
      backpack,
      /** «Зреет»: дробный урожай игрока по полям этого склада (сбор — целыми). */
      pending,
    };
  });

/** Положить товар из рюкзака: сначала в свои ячейки, остаток — на общую полку. */
export const storeToWarehouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        stackKey: z.string().min(1),
        qty: z.number().positive().max(999),
        /** Куда класть: сам решит, только в свои или только в общие. */
        scope: z.enum(["auto", "own", "shared"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    await warehouseAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
    return putToShelf({
      wallet,
      account,
      at: { mapId, q: data.q, r: data.r, ownCells: OWN_CELLS, sharedCells: SHARED_CELLS },
      stackKey: data.stackKey,
      asked: data.qty,
      scope: data.scope ?? "auto",
    });
  });
