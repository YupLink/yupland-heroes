// Забрать со склада в рюкзак или на счёт. Своё — всегда, общее — кто успел.
//
// Вынесено из warehouse.ts (правило ≤250 строк): там остались окно склада и
// «положить», здесь — «забрать» со всеми откатами.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { exactQty, moveQty, roundQty } from "@/lib/warehouseCells";
import { warehouseAt } from "./warehouse-store";
import { depositToBackpack, resolveBackpack } from "./market-backpack";
import type { MarketItem } from "@/lib/marketItem";
import { refFromStackKey } from "./item-alias";
import { noteShelf } from "./econ/trade-hooks";
import { backpackRoomFor, stackCells } from "@/lib/hero/backpackCells";
import { roomFor } from "@/lib/hero/potionBag";
import { IS_POTION_SQL, POTION_JOIN, potionKeysOf } from "./potion-bag";
import {
  backToSlotSql,
  takeSlotSql,
  type SlotTakeRow,
} from "@/server/api/beta-raid/warehouse-slot-sql";
import { NO_ORIGIN, originOfTaken, originWithin } from "@/server/api/beta-raid/stack-origin";
import { addWearSql, backpackWhere, wearOf } from "@/server/api/beta-raid/tool-wear-move";

/** Забрать со склада в рюкзак. Своё — всегда, общее — кто успел. */
export const takeFromWarehouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        stackKey: z.string().min(1),
        scope: z.enum(["own", "shared"]),
        qty: z.number().positive().max(999),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    await warehouseAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    return takeFromShelf({
      wallet,
      account,
      mapId,
      q: data.q,
      r: data.r,
      scope: data.scope,
      stackKey: data.stackKey,
      qty: data.qty,
    });
  });

/**
 * «Забрать» с полки — ядро, общее для склада на карте и склада замка
 * (владелец, 08.10.2026). Проверку «стою рядом» делает вызывающий.
 */
export async function takeFromShelf(o: {
  wallet: string;
  account: string;
  mapId: string;
  q: number;
  r: number;
  scope: "own" | "shared";
  stackKey: string;
  qty: number;
}): Promise<{ ok: true; qty: number }> {
  const { wallet, account, mapId, q, r, scope, stackKey, qty } = o;
  // Сколько забрать, решает полка (moveQty): «всё» уходит точным
  // количеством, и ни пыль (< 0,001), ни float-хвост вроде 9e-16 не остаются
  // на ней призрачной строкой count > 0 на целую ячейку — к тому же такую
  // крошку, округлённую до тысячных в ноль, было бы уже не забрать.
  const where = `map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r}
        AND scope = ${sqlStr(scope)} AND stack_key = ${sqlStr(stackKey)}`;
  const mine = scope === "shared" ? "true" : `owner_account = ${sqlStr(account)}`;
  const shelf = (await mcpExec(
    `SELECT count FROM yuplink.raid_warehouse_slot WHERE ${where} AND ${mine} AND count > 0;`,
    { wrapJson: true },
  )) as Array<{ count: number | string }>;
  const want = moveQty(Number(shelf?.[0]?.count) || 0, qty);
  if (want <= 0) throw new Error("braid.wh_gone");

  // Ресурс уходит НЕ в рюкзак, а на СЧЁТ игрока (res_move для gold/…,
  // accMove для токена). Ветка проверяется по ключу стека — так же, как
  // клиент выбирает иконку. Рюкзак/герой у ресурса не нужен.
  const isRes = stackKey.startsWith("resource:");
  const bp = isRes ? null : await resolveBackpack(wallet);
  if (!isRes && !bp) throw new Error("market.backpack_no_hero");

  // «Сколько влезет, столько и берём»: игроки жаловались, что при 3 ячейках
  // в рюкзаке нельзя было взять 60 бананов из общей полки — сервер отвечал
  // «нужно 8 ячеек, свободно 3». Теперь считаем сколько единиц реально
  // помещается (backpackRoomFor: долив в открытую ячейку + новые сверху)
  // и берём min(qty, fits). Остаток тихо остаётся на полке.
  // Ресурс уходит на счёт, а там — прежние тысячные: девять знаков нужны
  // только товару, у которого бывает пыль наград.
  let fits = isRes ? roundQty(want) : want;
  if (fits <= 0) throw new Error("braid.wh_gone");
  if (!isRes && bp) {
    // Зелье — только в сумку (строго), прочее — только в рюкзак: roomFor.
    const potion = (await potionKeysOf([stackKey])).has(stackKey);
    const rows = (await mcpExec(
      `SELECT b.stack_key AS "stackKey", b.count, ${IS_POTION_SQL} AS potion
         FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
        WHERE b.hero_id = ${sqlStr(bp.heroId)} AND b.count > 0;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ stackKey: string; count: number | string; potion: boolean }>;
    let cur = 0;
    const cells = { itemCells: 0, potionCells: 0 };
    for (const row of rows ?? []) {
      // Без floor: дробный стек (0,79 Огурцов) — это занятая ячейка, а не
      // ноль; SQL рюкзака считает CEIL, и floor здесь обещал место, которого
      // нет, — «нужно 1, свободно 0» вместо частичного забора.
      const c = Math.max(0, Number(row.count) || 0);
      if (row.potion === true) cells.potionCells += stackCells(c);
      else cells.itemCells += stackCells(c);
      if (row.stackKey === stackKey) cur = c;
    }
    const room = backpackRoomFor({
      ...roomFor({ ...cells, potion, capacity: bp.capacity, potionCapacity: bp.potionCapacity }),
      cur,
    });
    // Не влезает всё — тысячные ВНИЗ: округление вверх перешагивало край
    // ячейки (12,262 в дыру 12,2619), и рюкзак отвечал «нужно 1, свободно 0».
    fits = want <= room ? want : Math.floor(exactQty(room) * 1000 + 1e-6) / 1000;
    if (fits <= 0) throw new Error(potion ? "market.potion_bag_full" : "market.backpack_full");
  }

  // Списываем атомарно: два игрока за одной и той же полкой не заберут
  // больше, чем на ней лежит. Берём именно fits, а не qty; остаток —
  // девять знаков, как у рюкзака, с допуском на шум double↔numeric. Метки
  // (stack-origin) уходят по правилу траты: сначала безымянное. Их хранит
  // только личная полка: общая — не «моя», с неё приходит безымянное.
  const keep = scope === "own";
  const rows = (await mcpExec(takeSlotSql(where, mine, fits, keep), {
    wrapJsonCte: true,
  })) as SlotTakeRow[];
  const snap = rows?.[0];
  if (!snap) throw new Error("braid.wh_gone");
  // Метки снятого — не больше снятого; едут в рюкзак, при сбое — назад на полку.
  const took = keep ? originWithin(fits, originOfTaken(snap), exactQty) : NO_ORIGIN;
  // Снята вся стопка — с ней ушёл износ инструмента (tool-wear-move).
  const wear = wearOf(snap.wearTaken);
  const putBack = async () => {
    await mcpExec(backToSlotSql(where, mine, fits, took, keep)).catch(() => {});
    if (wear > 0) {
      await mcpExec(addWearSql("raid_warehouse_slot", `${where} AND ${mine}`, wear)).catch(
        () => {},
      );
    }
  };

  // Журнал: взято с ОБЩЕЙ полки (своё — не сделка). После успешной выдачи,
  // best-effort; ключ повтора — тот же nonce, что у выдачи.
  const journal = (ref: string) => {
    if (scope !== "shared") return;
    const at = { mapId, q: q, r: r, stackKey: stackKey, snap, qty: fits, ref };
    void noteShelf({ source: "wh_take", account, ...at });
  };

  // Ресурс: на счёт (res_move для gold/stone/wood/diamonds, accMove для
  // token). Возврат на полку при сбое кредита — точно так же, как у
  // предмета: не потеряется. У ресурса ячейки в рюкзаке нет, значит
  // fits — это want до тысячных (см. блок расчёта fits выше).
  if (isRes) {
    try {
      const parts = stackKey.split(":");
      const kind = parts[1]; // gold/stone/wood/diamonds/token
      const ref = `wh-take:${mapId}:${q},${r}:${stackKey}:${nanoid(10)}`;
      if (kind === "token") {
        const symbol = parts[2] ?? snap.refId ?? "";
        if (!symbol) throw new Error("wh_res_no_token");
        const { accMove } = await import("../currency/move");
        await accMove({ wallet, token: symbol, delta: fits, kind: "acc_reward", ref });
      } else {
        const { sb } = await import("../../db/pg");
        const { error } = await sb.rpc("res_move", {
          p_account: account,
          p_resource: kind,
          p_delta: fits,
          p_kind: "wh_take",
          p_ref: ref,
        });
        if (error) throw new Error(String(error.message));
      }
      journal(ref);
      return { ok: true as const, qty: fits };
    } catch (e) {
      await putBack();
      throw e;
    }
  }

  const nonce = `wh:${mapId}:${q},${r}:${stackKey}:${nanoid(10)}`;
  try {
    await depositToBackpack({
      heroId: bp!.heroId,
      account,
      // Вид — из ключа полки, а не только из ref_id: у позиции витрины без
      // шаблона ref_id пуст, и полка 'custom:mkt_…' возвращалась в рюкзак
      // ключом 'custom:' (так же плодились «Доски» без шаблона).
      item: {
        id: refFromStackKey(stackKey),
        kind: snap.kind,
        refId: snap.refId,
        name: snap.name,
        image: snap.image,
      } as unknown as MarketItem,
      qty: fits,
      nonce,
      capacity: bp!.capacity,
      potionCapacity: bp!.potionCapacity,
      // Метки личной полки едут в рюкзак: собранное снова годится в сундук.
      origin: took,
    });
  } catch (e) {
    // Возврат — только на СВОЮ строку: без хозяина в условии «своё» прибавлялось
    // всем, у кого этот вид лежит в личных ячейках этого склада (до 54 строк).
    await putBack();
    throw e;
  }
  if (wear > 0) {
    // Штуки уже в рюкзаке — износ следом. Сбой тут не должен ронять перенос.
    await mcpExec(
      addWearSql("raid_hero_backpack", backpackWhere(bp!.heroId, stackKey), wear),
    ).catch((e: unknown) =>
      console.warn(`[wh-take] износ ${stackKey} у ${bp!.heroId}: ${String(e)}`),
    );
  }
  journal(nonce);
  return { ok: true as const, qty: fits };
}
