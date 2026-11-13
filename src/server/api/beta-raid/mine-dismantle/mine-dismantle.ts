// Разобрать сломанную шахту (владелец, 22.10.2026; ПРАВИЛА §8.70): «за 100
// энергии разобрать шахту, которая не работает (без хп) но именно шахту - грибы
// к ней не относятся … возвращается 30% от текущей стоимости шахты - появляется
// на месте шахты в виде мешочка - можно собрать».
//
//  • Кто: любой игрок с героем вплотную к шахте, не под куполом (как починка).
//  • Что: только шахта v2 (дерево, камень, золото, алмазы), сломанная или
//    ничья. Работающая — отказ; гриб, лесопилка maxHours, DARAI/энергия — не
//    шахты v2; остров (карта или флаг клетки) — отказ: там шахты ничьи от
//    рождения, разборка чеканила бы ресурсы с каждого нового острова.
//  • Цена — MINE_DISMANTLE_ENERGY (100) той же транзакцией, что разборка.
//  • Возврат — 30 % цены заготовки вида у Архитектора сейчас (сервер считает
//    сам, lib/mineDismantle): ресурсы — сразу на счёт разобравшего той же
//    транзакцией (minev2-61, просьба игрока 25.10: «мешок, смысла в котором 0»),
//    товары — мешочком на клетке шахты (в рюкзак при заборе, как было).
//
// Всё пишет одна функция базы raid_mine_dismantle (minev2-60, minecap-01,
// minev2-61) под локами: поломка, если срок вышел, а обход не прошёл
// (накопленное — прежнему хозяину строкой «Отбитых шахт» к «Забрать», вид
// «разобрали»; credited — 0), энергия, пустая клетка, мешочек товаров, ресурсы
// на счёт (res_move вида 'mine_dismantle' — турниры и ачивки его не считают,
// как прежний 'bag_take'), ключ нажатия. Отказ — исключение, назад уходит всё. Повтор того же нажатия отвечает прошлым итогом без второй платы;
// ответ потерялся после коммита — судит ключ. Рассылка — mine-dismantle-announce.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { actionGate } from "@/server/rateGate";
import { playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { loadMineCell } from "@/server/api/beta-raid/mine-v2-read";
import { who } from "@/server/api/beta-raid/mine-v2";
import { loadArchitectConfig } from "@/server/api/castle-architect/architect-config";
import { bumpAchievement } from "@/server/api/achievements/bump";
import { isBuilt } from "@/lib/buildingEffect";
import { mineIslandOf, mineV2Of, type MineV2Resource } from "@/lib/mineV2";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { dismantleRefund, MINE_DISMANTLE_ENERGY, type DismantleRefund } from "@/lib/mineDismantle";
import {
  dismantledOf,
  dismantleErrorKey,
  dismantleOpSql,
  dismantlePortions,
  dismantleSql,
  type DismantleGot,
  type DismantleOpRow,
  type Dismantled,
} from "@/server/api/beta-raid/mine-dismantle/mine-dismantle-sql";
import { announceDismantle } from "@/server/api/beta-raid/mine-dismantle/mine-dismantle-announce";

const cellInput = z.object({ q: z.number().int(), r: z.number().int() });

/** Шахта, которую можно разобрать: вид v2 и имя; иначе — понятный отказ. */
async function dismantleTarget(
  mapId: string,
  q: number,
  r: number,
): Promise<{ kind: MineV2Resource; name: string }> {
  if (isIslandMapId(mapId)) throw new Error("braid.mine_no_dismantle");
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) throw new Error("braid.mine_gone");
  if (b.effect !== "mine" || !isBuilt(b.tier, b.tiers.length)) {
    throw new Error("braid.mine_no_dismantle");
  }
  const kind = mineV2Of(b.config);
  if (!kind || mineIslandOf(b.config)) throw new Error("braid.mine_no_dismantle");
  return { kind, name: String(b.name ?? "") };
}

/** Возврат за разборку вида — по ценам Архитектора сейчас. */
async function refundOf(kind: MineV2Resource): Promise<DismantleRefund> {
  return dismantleRefund((await loadArchitectConfig()).blueprints[kind]);
}

/** Ключ нажатия или null — нажатия не было. Ошибку чтения не глотаем. */
async function loadOp(op: string): Promise<DismantleOpRow | null> {
  const rows = (await mcpExec(dismantleOpSql(op), { wrapJson: true })) as DismantleOpRow[] | null;
  return rows?.[0] ?? null;
}

/** bag — мешочек товаров (нет товаров — null); got — что легло на счёт. */
export type MineDismantled = { ok: true; bag: string | null; got: DismantleGot };

/** Окно подтверждения: цена и что вернётся (считает сервер). */
export const getMineDismantleQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cellInput.parse(d))
  .handler(async ({ data }): Promise<DismantleRefund & { energy: number }> => {
    const { mapId } = await who();
    const { kind } = await dismantleTarget(mapId, data.q, data.r);
    return { energy: MINE_DISMANTLE_ENERGY, ...(await refundOf(kind)) };
  });

export const dismantleMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cellInput.extend({ opId: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }): Promise<MineDismantled> => {
    const { wallet, account, mapId } = await who();
    await actionGate("mine-dismantle", wallet);
    // Ключ повтора — в пределах аккаунта: чужой одинаковый opId не мешает.
    const op = `mdis:${account}:${data.opId}`;
    // Повтор уже сделанного нажатия: шахты нет, плата взята — тот же ответ.
    const prev = await loadOp(op);
    if (prev) {
      if (!prev.sent) await announceDismantle(prev);
      const was = dismantledOf(prev.detail);
      return { ok: true, bag: was?.bag ?? null, got: was?.got ?? {} };
    }

    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);
    const { kind, name } = await dismantleTarget(mapId, data.q, data.r);
    // Работающая — отказ до денег (база всё равно проверит под локом).
    if ((await loadMineCell(mapId, data.q, data.r)).owner) throw new Error("braid.mine_working");
    const sql = dismantleSql({
      op,
      mapId,
      q: data.q,
      r: data.r,
      account,
      energy: MINE_DISMANTLE_ENERGY,
      portions: dismantlePortions(await refundOf(kind)),
      name,
    });

    let res: Dismantled | null = null;
    try {
      const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ res?: unknown }> | null;
      res = dismantledOf(rows?.[0]?.res);
    } catch (e) {
      // Ответ потерялся после коммита — судит ключ: он лёг только вместе с делом.
      const done = await loadOp(op).catch(() => null);
      if (!done)
        throw new Error(
          dismantleErrorKey(e instanceof Error ? e.message : String(e), MINE_DISMANTLE_ENERGY),
        );
      res = dismantledOf(done.detail);
    }
    if (!res) throw new Error("chest.busy");
    // Ключа до этого запроса не было — это первое нажатие, даже если база
    // ответила «повтор» (мост повторил наш же запрос вслепую).
    if (res.paid > 0) {
      const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
      void noteEnergySpend(account, res.paid, "build");
    }
    bumpAchievement(res.creditedTo, "minelord", res.credited);
    // Поломка внутри разборки — прежнему хозяину тост и письмо (mine-lost-notify).
    void import("@/server/api/beta-raid/mine-lost/mine-lost-notify")
      .then((m) => m.kickMineLostNotify())
      .catch(() => {});
    const row = await loadOp(op).catch(() => null);
    if (row && !row.sent) await announceDismantle(row);
    return { ok: true, bag: res.bag, got: res.got };
  });
