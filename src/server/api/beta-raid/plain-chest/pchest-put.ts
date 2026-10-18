// Положить из рюкзака в обычный сундук (ПРАВИЛА §8.22).
//
// Любой игрок вплотную, в стоящий (не закопанный) сундук. Класть можно всё,
// и купленное тоже: сундук общий, как общая полка склада, поэтому метки
// происхождения при вкладе сбрасываются (§8.18). Изношенная штука инструмента
// остаётся в рюкзаке (§8.19). Место — 10 ячеек по 20, долив в свою неполную
// ячейку — всегда. Переезд — одна транзакция (pchest-move-sql), ключ нажатия
// `pcput:<аккаунт>:<op>`: повтор нажатия второй раз не кладёт.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { moveQty } from "@/lib/warehouseCells";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { movableStackCount } from "@/server/api/beta-raid/tool-wear";
import { num, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  loadOp,
  moveInput,
  pchestActor,
  plainNear,
  whyNotHere,
} from "@/server/api/beta-raid/plain-chest/pchest-row";
import { putSql, type MoveRow } from "@/server/api/beta-raid/plain-chest/pchest-move-sql";
import { notePlain } from "@/server/api/beta-raid/plain-chest/pchest-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { plainTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

export const putToPlainChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => moveInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; qty: number }> => {
    const a = await pchestActor("pchest-put");
    const chest = await plainNear(a, data.q, data.r);
    // «Положить» и «Забрать» — только внутри оплаченного входа (§8.23).
    await requirePass(a.account, plainTarget(chest.id));
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const op = `pcput:${a.account}:${data.op}`;
    const prev = async () => (await loadOp(op).catch(() => null))?.qty ?? 0;
    // Повтор нажатия, чей ответ потерялся: итог тот же, окно у соседей — тоже.
    const again = (qty: number) => {
      publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`], scope: "chest" });
      return { ok: true as const, qty };
    };

    const { movable, worn } = await movableStackCount(bp.heroId, data.stackKey);
    if (movable <= 0) {
      // Всё уже переложено — может, этим же нажатием (ответ потерялся).
      const was = await prev();
      if (was > 0) return again(was);
      throw new Error(worn ? "braid.tool_worn_stays" : "braid.wh_not_enough");
    }
    const qty = moveQty(movable, data.qty);
    if (qty <= 0) throw new Error("braid.wh_too_small");

    const at = { chestId: chest.id, heroId: bp.heroId, account: a.account, op };
    let res: MoveRow | undefined;
    try {
      res = sqlRow<MoveRow>(
        (await mcpExec(putSql({ ...at, stackKey: data.stackKey, qty }))) as unknown[],
      );
    } catch (e) {
      // Изношенная штука ушла бы из рюкзака — база не дала (гонка с ударом).
      if (/raid_hero_backpack_worn_stays/.test(String(e))) throw new Error("braid.tool_worn_stays");
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
      if (res.worn) throw new Error("braid.tool_worn_stays");
      if (res.have && res.fits === false) throw new Error("pchest.full");
      // Стек потратили параллельно (оплата, второе устройство).
      throw new Error("braid.wh_not_enough");
    }

    const moved = num(res.mv);
    // Сундук поменялся — окно у всех рядом перечитывается (сигнал «второго обзора»).
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`], scope: "chest" });
    const item = {
      stackKey: data.stackKey,
      kind: res.kind ?? "custom",
      refId: res.ref_id,
      name: res.name ?? data.stackKey,
    };
    void notePlain(a, data, "put", item, moved, op);
    return { ok: true as const, qty: moved };
  });
