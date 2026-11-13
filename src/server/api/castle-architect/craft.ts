// Изготовить заготовку шахты (ПРАВИЛА §8.59.7): у Архитектора нужного уровня или
// выбранным героем-Строителем. Заготовка ложится в рюкзак выбранного героя по
// правилам рюкзака (как сундук из лавки). Товары цены — из того же рюкзака,
// вместе с ресурсами (architect-goods.ts). Порядок шагов — craft-core.ts, откат
// упавшей выдачи (ключ + возврат одним оператором) — craft-undo.ts; окно
// закрыли, не дождавшись, — оплату доводит добор (blueprint-sweep.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "@/server/db/pg";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  assertBackpackRoomFor,
  depositToBackpack,
  resolveBackpack,
  stackKeyFor,
} from "@/server/api/beta-raid/market-backpack";
import { BLUEPRINT_RESOURCES, MINE_BLUEPRINT_ITEM, blueprintLabel } from "@/lib/mineBlueprint";
import { loadArchitectConfig } from "./architect-config";
import { assertGoods, canonCost, heroArg } from "./architect-goods";
import { architectLevel, who } from "./architect-state";
import { craftBlueprint, type PayStatus } from "./craft-core";
import { undoDeposit } from "./craft-undo";
import { depositNonceOf, depositOpOf, payOpOf } from "./craft-keys";

/** Состояние оплаты по ключу; ключа нет — оплаты не было (бросок, без выдачи). */
async function payStatusOf(op: string): Promise<PayStatus> {
  const rows = (await mcpExec(
    `SELECT refunded_at FROM yuplink.castle_architect_op WHERE op_id = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ refunded_at: string | null }>;
  const row = rows?.[0];
  if (!row) throw new Error("Не удалось");
  return row.refunded_at ? "refunded" : "repeat";
}

export const craftMineBlueprint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(BLUEPRINT_RESOURCES), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    const itemId = MINE_BLUEPRINT_ITEM[data.kind];
    // Имя и картинку стопке даёт канон справочника (depositToBackpack); здесь — запас.
    const item = {
      kind: "custom" as const,
      refId: itemId,
      id: itemId,
      name: `Заготовка: ${blueprintLabel(data.kind, true)}`,
      image: null,
    };
    // Ключи нажатия — craft-keys.ts (их же ищет добор, blueprint-sweep.ts).
    const op = payOpOf(account, data.opId);
    return craftBlueprint(data.kind, {
      backpack: () => resolveBackpack(wallet),
      level: () => architectLevel(account),
      cost: async (kind) => canonCost((await loadArchitectConfig()).blueprints[kind]),
      // Товары цены (ключи уже канон — canonCost) снимет та же оплата до выдачи.
      assertRoom: async (bag, cost) =>
        assertBackpackRoomFor(
          bag,
          [{ stackKey: await stackKeyFor(item), qty: 1 }],
          (cost.goods ?? []).map((g) => ({ stackKey: g.key, qty: g.qty })),
        ),
      assertGoods: async (bag, cost) => {
        try {
          await assertGoods(bag.heroId, cost.goods);
        } catch (e) {
          // Повтор оплаченного нажатия: товары уже сняты этим ключом — оплата
          // ответит 'repeat' и доведёт выдачу, а не «не хватает товаров».
          const paid = await payStatusOf(op).catch(() => null);
          if (paid) return;
          throw e;
        }
      },
      pay: async (cost, bag) => {
        const { error, data: rows } = await sb.rpc("castle_architect_pay", {
          p_account: account,
          p_kind: data.kind,
          p_cost: cost,
          p_op: op,
          ...heroArg(cost, bag.heroId),
        });
        if (error) throw new Error(String(error.message ?? ""));
        const status = (rows as Array<{ status: string }> | null)?.[0]?.status;
        if (status === "paid" || status === "repeat" || status === "refunded") return status;
        // Ответ не разобрался — судим по ключу операции: он пишется только вместе с оплатой.
        return payStatusOf(op);
      },
      deposit: (bag) =>
        depositToBackpack({
          heroId: bag.heroId,
          account,
          item,
          qty: 1,
          nonce: depositNonceOf(account, data.opId),
          capacity: bag.capacity,
          potionCapacity: bag.potionCapacity,
        }),
      undo: () => undoDeposit(depositOpOf(account, data.opId), op),
      // Отдельный запрос — свежий снимок: видит возврат добора (craft-core.ts).
      refunded: async () => (await payStatusOf(op)) === "refunded",
    });
  });
