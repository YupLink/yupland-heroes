// Взаимодействие игрока с декором (владелец, 25.09): у шаблона декора стоит
// галочка «Взаимодействие» — игрок платит энергию, декор уничтожается с
// клетки полностью, а свой товар (например «Дерево») уходит ему.
//
// Порядок как у подбора монетки (encounter-pickup): сначала забираем декор
// атомарно (сосед мог успеть раньше — тогда платить не за что), потом
// списываем энергию, потом выдаём товар. Сорвался любой шаг — откатываем
// предыдущие: декор возвращается на клетку, энергия — игроку.
//
// Инструмент (27.09): если у шаблона задан инструмент, после захвата декора
// с инструмента в рюкзаке героя снимается прочность — «Износ за удар, %» его
// товара, пусто — вся штука (decor-tool, 28.09), затем энергия. Любой сбой
// дальше возвращает и прочность, и энергию, и декор. С 05.10 инструментов у
// шаблона список — бьёт тот, что выбрал decor-tool (в руках или первый по
// списку), и его же имя уходит турниру и клиенту.
//
// Список декора и его кэш — decor-interact-load.ts.
//
// Товар — сразу в рюкзак выбранного героя, что не влезло (или героя нет) —
// мешочком на клетке декора (владелец, 29.09.2026; ПРАВИЛА §8.21).
//
// Респавн (28.09): у шаблона задано «Респавн, мин» — рубка ставит декор в
// очередь возврата на ту же клетку (decor-respawn.ts). Дерево, посаженное
// игроком, не отрастает никогда (владелец, 22.10; метка — tree/tree-chop-sql).
//
// Руками (17.10, §8.56): hand — декор, который берёт деревянный или каменный
// топор, рубится без инструмента за 10 энергии (вместо цены декора) и 30
// сытости героя (decor-hand.ts). Сытость списывается на месте инструмента, до
// энергии; сорвалось дальше — возвращается вместе с энергией и декором.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { raidOwner } from "./owner";
import { actionGate } from "../../rateGate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { amountRange, rollAmount } from "@/lib/raid/decorInteract";
import { handChopEnergy, HAND_CHOP_NOT_ALLOWED } from "@/lib/raid/handChop";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { isAxeTool, isPickTool } from "@/lib/tournament/metricSources";
import { bumpAchievement } from "../achievements/bump";
import type { DecorTool, ToolCharge } from "./decor-tool";
import { chopRestoreSql, chopTakeSql, plantedRespawnDropSql } from "./tree/tree-chop-sql";
import {
  dropInteractiveDecorCache,
  loadInteractiveDecor,
  type DecorInteractView,
} from "./decor-interact-load";

export { dropInteractiveDecorCache, loadInteractiveDecor, type DecorInteractView };

/** Список для клиента: по нему тап по декору знает, можно ли с ним что-то сделать. */
export const getInteractiveDecor = createServerFn({ method: "GET" }).handler(async () => {
  await requireBetaRaid();
  return loadInteractiveDecor();
});

/** Под декором клетки мешочек или бугорок (закопанный сундук) — дополнение №5. */
function coveredSql(mapId: string, q: number, r: number): string {
  const at = (a: string) => `${a}.map_id = ${sqlStr(mapId)} AND ${a}.q = ${q} AND ${a}.r = ${r}`;
  return `(EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${at("b")})
        OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc WHERE ${at("pc")} AND pc.buried_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE ${at("mc")} AND mc.buried_at IS NOT NULL))`;
}

/** Вернуть декор (и метку посадки) на клетку (откат): только если клетка всё ещё пуста. */
async function restoreDecor(
  mapId: string,
  q: number,
  r: number,
  decorId: string,
  planted: boolean,
): Promise<void> {
  await mcpExec(chopRestoreSql(mapId, q, r, decorId, planted)).catch((e) =>
    console.error("[decor-interact] откат декора не прошёл:", e),
  );
}

export const interactDecor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        decorId: z.string().min(1).max(80),
        /** Рубить руками (§8.56) — без инструмента, за энергию и сытость. */
        hand: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    await actionGate("raid-decor", wallet);
    const { q, r, decorId } = data;
    const hand = data.hand === true;
    const mapId = await myMapId(wallet);
    const conf = (await loadInteractiveDecor())[decorId];
    if (!conf) throw new Error("braid.decor_no_interact");
    const range = amountRange(conf.amount);
    if (!range) throw new Error("braid.decor_no_interact");
    if (hand && !conf.hand) throw new Error(HAND_CHOP_NOT_ALLOWED);
    // Руками — вдвое дороже топора (§8.56, 25.10). И так и так: на острове
    // энергии в 10 раз меньше (island/energy).
    const cost = scaleEnergy(hand ? handChopEnergy(conf.cost) : conf.cost, energyMultOf(mapId));
    const pos = await playerCell(wallet);
    requireAdjacent(pos, q, r);
    await requireNotVoid(wallet, mapId, q, r);

    // 1) Забрать декор: только если на клетке именно он. Два игрока разом —
    //    строку получит один, второй увидит «уже уничтожен» и не заплатит.
    //    covered — под декором лежал мешочек или бугорок (дополнение №5);
    //    planted — дерево посадил игрок: метка уходит с декором, отрастания нет.
    const gone = (await mcpExec(chopTakeSql(mapId, q, r, decorId, coveredSql(mapId, q, r)), {
      wrapJsonCte: true,
    })) as Array<{ q: number; covered?: boolean; planted?: boolean }>;
    if (!gone?.length) throw new Error("braid.decor_gone");
    const planted = gone[0]?.planted === true;

    // 2) Инструмент: прочность с инструмента в рюкзаке героя (без износа —
    //    вся штука). Руками — вместо него сытость героя (§8.56): меньше 30 —
    //    отказ до энергии. Нечем рубить или сыт не по силам — декор на клетку.
    let tool: ToolCharge | null = null;
    let usedTool: DecorTool | null = null;
    let satietyCost = 0;
    if (hand || conf.tools?.length) {
      try {
        if (hand) {
          const { payHandSatiety } = await import("./decor-hand");
          const fed = await payHandSatiety(wallet, mapId);
          [tool, satietyCost] = [fed, fed.satiety];
        } else {
          const { payDecorTool } = await import("./decor-tool");
          const ref = `decor:${mapId}:${q}:${r}:${Date.now()}`;
          const charge = await payDecorTool(wallet, conf.tools ?? [], ref);
          [tool, usedTool] = [charge, charge.used];
        }
      } catch (e) {
        await restoreDecor(mapId, q, r, decorId, planted);
        throw e;
      }
    }

    // 3) Энергия. Не хватило — прочность инструменту (сытость герою), декор на клетку.
    const { payForHit } = await import("./encounter-pay");
    let refund: (() => Promise<void>) | null = null;
    if (cost > 0) {
      try {
        refund = (await payForHit(wallet, cost, "decor")).refund;
      } catch (e) {
        await Promise.all([tool?.back(), restoreDecor(mapId, q, r, decorId, planted)]);
        throw e;
      }
    }

    // 4) Товар — в рюкзак, что не влезло — мешочком на клетке декора (§8.21).
    //    Не выдалось ничего (сбой базы) — возвращаем энергию, инструмент (или
    //    сытость) и декор.
    const amount = rollAmount(range);
    let got: { dropped: number; queued: number };
    try {
      const { giveDecorItem } = await import("./decor-give");
      const item = { itemId: conf.itemId, name: conf.name, amount };
      got = await giveDecorItem({ wallet, mapId, q, r, decorId, ...item });
    } catch (e) {
      await Promise.all([refund?.(), tool?.back(), restoreDecor(mapId, q, r, decorId, planted)]);
      throw e;
    }

    // 5) Клетка опустела у всех сразу: дельта карты уходит каждому клиенту.
    const { recordMapChange } = await import("./map-journal");
    await recordMapChange(mapId, { patches: [{ q, r, decorationId: null }] }).catch((e) =>
      console.warn("[decor-interact] дельта карты не ушла:", e),
    );
    // Под деревом лежал мешочек или бугорок — он снова виден у тех, кто рядом.
    if (gone[0]?.covered === true) {
      const { publishRaid } = await import("../../raidLive");
      publishRaid({ mapId, type: "bags", cells: [`${q},${r}`] });
    }

    // 6) Только ПОСЛЕ дельты рубки — очередь возврата («Респавн, мин»): иначе
    //    при медленном мосте «декор встал» ушёл бы раньше «декор срублен». Её
    //    сбой рубку не отменяет. Затем уборка у инструмента.
    //    Посаженное игроком не отрастает: очереди нет, строка его рассылки — долой.
    if (planted) {
      await mcpExec(plantedRespawnDropSql(mapId, q, r, decorId)).catch((e) =>
        console.warn("[decor-interact] строка отрастания посаженного не снята:", e),
      );
    } else if (conf.respawnMin) {
      const { scheduleDecorRespawn } = await import("./decor-respawn");
      await scheduleDecorRespawn({ mapId, q, r, decorId, minutes: conf.respawnMin });
    }
    await tool?.done();
    // Рубка прошла — дальше только учёт.
    // Турнир «срубил деревьев»: рубка топором — очко (без await, сбой не мешает).
    // Топор или кирка — по имени инструмента, которым рубили на самом деле;
    // руками рубят только то, что берёт топор, — очко как за топор (tour-hooks).
    const chop = `chop:${mapId}:${q}:${r}:${Date.now()}`;
    const used = usedTool?.name ?? null;
    if (used !== null || hand) {
      void import("../tournament/tour-hooks")
        .then((m) => m.noteChop(wallet, used, chop, amount, conf.itemName, hand))
        .catch(() => {});
    }
    // Ачивки (§8.57): топор или руки — «Дровосек», кирка — «Рудокоп».
    if (hand || isAxeTool(used) || isPickTool(used)) {
      void raidOwner(wallet)
        .then((acc) => bumpAchievement(acc, isPickTool(used) && !hand ? "miner" : "lumber"))
        .catch(() => {});
    }
    return {
      ok: true as const,
      amount,
      /** Не влезло в рюкзак и выпало мешочком (dropped) / ждёт в «Добыче» (queued). */
      ...got,
      itemName: conf.itemName,
      /** Под декором лежал мешочек или бугорок — слой мешочков перечитать. */
      covered: gone[0]?.covered === true,
      /** Реально списанная энергия: руками — 10, иначе цена декора. */
      cost,
      toolName: used,
      hand,
      /** Сытость за рубку руками (героя нет — шкалы нет, 0). */
      satietyCost,
    };
  });
