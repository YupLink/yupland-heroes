// «Положить» из рюкзака в мешочек (владелец, 29.09.2026; ПРАВИЛА §8.21):
// мешочек открывается как склад — перекладывают в обе стороны. Класть можно
// только в живой, не закопанный мешочек, рядом с которым стоишь; новый мешочек
// так не создаётся — он появляется, только когда добыча не влезла.
//
// Положенное — новая порция со своим сроком: 24 часа с этого момента. Метки
// происхождения едут со штуками (купленное остаётся купленным). Изношенная
// штука инструмента остаётся в рюкзаке, как у склада (movableStackCount и
// CHECK базы). Зелья кладутся так же: место у мешочка не кончается, а обратно
// их примет только сумка зелий (bag-take — общие функции места).
//
// Переезд — одна транзакция (putSql), повтор нажатия ловит ключ `bagput:…`.
// Ответ не пришёл — «забор» ключа (putFenceSql): переехало — ответ тот же,
// нет — уже и не переедет (опоздавшая попытка увидит ключ).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import type { LootBagPut } from "@/lib/lootBag";
import { moveQty } from "@/lib/warehouseCells";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { movableStackCount } from "@/server/api/beta-raid/tool-wear";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor, bagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { putFenceSql, putSql, type PutRow } from "@/server/api/beta-raid/loot-bag/bag-put-sql";
import { noteBagPut } from "@/server/api/beta-raid/loot-bag/bag-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { bagTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

const input = z.object({
  bagId: z.string().regex(/^lb_[0-9a-f]{32}$/),
  stackKey: z.string().min(1).max(200),
  qty: z.number().positive().max(100_000),
  /** Ключ нажатия: повтор того же нажатия не кладёт второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const putToLootBag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<LootBagPut> => {
    const a = await bagActor("bag-put");
    const bag = await bagNear(a, data.bagId);
    if (bag.buried) throw new Error("bag.buried");
    // Класть — только внутри оплаченного входа (§8.23).
    await requirePass(a.account, bagTarget(bag.id));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const { movable, worn } = await movableStackCount(bp.heroId, data.stackKey);
    if (movable <= 0) throw new Error(worn ? "braid.tool_worn_stays" : "braid.wh_not_enough");
    const qty = moveQty(movable, data.qty);
    if (qty <= 0) throw new Error("braid.wh_too_small");

    const op = `bagput:${a.account}:${data.op}`;
    const at = {
      bagId: bag.id,
      heroId: bp.heroId,
      stackKey: data.stackKey,
      op,
      account: a.account,
    };
    let row: PutRow | undefined;
    try {
      row = sqlRow<PutRow>((await mcpExec(putSql({ ...at, qty }))) as unknown[]);
    } catch (e) {
      // Изношенная штука ушла бы из рюкзака — база не дала (гонка с ударом).
      if (/raid_hero_backpack_worn_stays/.test(String(e))) throw new Error("braid.tool_worn_stays");
      // Ответ потерялся: «забор» ключа — переехало ли, и чтобы уже не переехало.
      row = sqlRow<PutRow>((await mcpExec(putFenceSql(at))) as unknown[]);
      if (!(num(row?.qty) > 0)) throw e;
    }
    const put = num(row?.qty);
    if (!row || !(put > 0)) {
      // Не переехало: мешочек успели опустошить или закопать, в стопке меньше.
      const now = await bagNear(a, data.bagId);
      throw new Error(now.buried ? "bag.buried" : "braid.wh_not_enough");
    }
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${bag.q},${bag.r}`] });
    const stack = { ...row, stackKey: data.stackKey };
    void noteBagPut({ actor: a, bag, stack, qty: put, ref: op });
    return { qty: put };
  });
