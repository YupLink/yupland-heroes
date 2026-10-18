// Положить из рюкзака в сеть магического сундука — владелец или чужой.
//
// Правило владельца (29.09.2026): класть можно всё собранное — мобы, объекты
// карты, декор, грядки, шахты, награды, грабёж, возврат из сундука, — кроме
// купленного. Сколько штук стека собрано, помнят метки рюкзака (stack-origin);
// проверка, место в сети и само перекладывание — одним оператором
// (chest-net-sql.ts), иначе между «проверил» и «переложил» успел бы
// вклиниться второй игрок или второе устройство.
//
// Чужой (владелец, 30.09.2026): когда живой охраны нет, открыл за энергию и
// кладёт в сеть ХОЗЯИНА по тем же правилам (собранное, без изношенного) —
// положенное становится содержимым сети хозяина. Тем же оператором под локом
// сети хозяина сверено, что сундук стоит, не закопан и (у чужого) живой охраны
// нет (storeSql via). Всё — только внутри оплаченного входа (§8.23).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { exactQty } from "@/lib/warehouseCells";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { noteChestMove } from "@/server/api/beta-raid/econ/chest-note";
import {
  chestActor,
  chestNearAny,
  num,
  sqlRow,
  type ChestActor,
} from "@/server/api/beta-raid/chest/chest-row";
import { storeSql, type StoreRow } from "@/server/api/beta-raid/chest/chest-net-sql";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { magicTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  stackKey: z.string().min(1).max(200),
  qty: z.number().positive().max(1000),
});

/** Сундук под рукой перестал пускать (закопали, забрали, встала охрана) — почему, свежей проверкой. */
async function whyNotHere(a: ChestActor, q: number, r: number): Promise<string> {
  try {
    await chestNearAny(a, q, r);
  } catch (e) {
    return e instanceof Error ? e.message : "chest.gone";
  }
  return "chest.busy";
}

export const storeToChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; qty: number }> => {
    const a = await chestActor("chest-store");
    // Свой — всегда; чужой — без живой охраны (chest.guarded), не закопанный.
    const { chest, mine } = await chestNearAny(a, data.q, data.r);
    const owner = chest.owner_account;
    // Сеть — только внутри оплаченного входа (§8.23), и у владельца тоже.
    await requirePass(a.account, magicTarget(a.mapId, data.q, data.r));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    // Хвост double (0,30000000000000004) в базу не пускаем — девять знаков, как
    // у склада: собранное бывает дробным (12,3456), и тысячные вверх просили
    // бы больше собранного — отказ вместо вклада.
    const qty = exactQty(data.qty);
    if (qty <= 0) throw new Error("chest.not_mob");
    const op = `chestput:${nanoid(12)}`;
    const via = { mapId: a.mapId, q: data.q, r: data.r, own: mine };
    const rows = (await mcpExec(
      storeSql({ account: owner, heroId: bp.heroId, stackKey: data.stackKey, qty, op, via }),
    )) as unknown[];
    const res = sqlRow<StoreRow>(rows);
    // Повтор моста после коммита: наш же ключ уже лежит — вклад состоялся.
    if (res?.was) return { ok: true as const, qty };
    if (!res?.moved) {
      if (res?.here === false) throw new Error(await whyNotHere(a, data.q, data.r));
      if (res?.mv == null) throw new Error("market.not_found");
      // Собранного нет (купленная крошка < 0,001 даёт mv = 0) — тоже «не собрано».
      if (num(res.got) <= 0 || num(res.got) < num(res.mv)) throw new Error("chest.not_mob");
      if (res.fits === false) throw new Error("chest.net_full");
      if (res.worn) throw new Error("braid.tool_worn_stays");
      // Стек потратили параллельно (оплата, второе устройство) — вклада не было.
      throw new Error("market.not_found");
    }

    const moved = num(res.mv);
    const snap = { kind: res.kind ?? "custom", refId: res.ref_id, name: res.name ?? data.stackKey };
    void noteChestMove({
      side: "put",
      account: a.account,
      // Чужой положил в сеть хозяина — контрагент хозяин.
      counterparty: mine ? null : owner,
      mapId: a.mapId,
      q: data.q,
      r: data.r,
      stackKey: data.stackKey,
      snap,
      qty: moved,
      ref: op,
    });
    return { ok: true as const, qty: moved };
  });
