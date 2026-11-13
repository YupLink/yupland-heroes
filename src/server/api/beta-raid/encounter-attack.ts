// ЕДИНЫЙ энкаунтер бета-рейда: босс, сундук и шахта проходят один путь.
// Меняются только надписи и награда — логика, окно и формула боя общие.
//
// Здесь — только порядок шагов. Сами шаги разнесены по модулям рядом:
// проверки входа (encounter-attack-checks), бой и запись урона
// (encounter-attack-fight), всё, что после удара (encounter-attack-after),
// и ответ клиенту (encounter-attack-response).
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { isPickup, pickupEncounter } from "@/server/api/beta-raid/encounter-pickup";
import { opensWithoutFight } from "@/server/api/beta-raid/encounter-loot";
import { actionGate } from "@/server/rateGate";
import { attackInputSchema } from "@/server/api/beta-raid/encounter-attack-input";
import { resolveAttackTarget } from "@/server/api/beta-raid/encounter-attack-checks";
import { fightAndCommit } from "@/server/api/beta-raid/encounter-attack-fight";
import { afterHit, chargePickupSatiety } from "@/server/api/beta-raid/encounter-attack-after";
import { buildAttackResponse } from "@/server/api/beta-raid/encounter-attack-response";

/**
 * Удар по объекту рядом. Один вызов — один результат (модель raidAutoFight).
 * Возврат совпадает по смыслу с эталоном: сколько нанесли, добили ли, остаток HP.
 */
export const betaRaidAttack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => attackInputSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    await actionGate("raid-attack", wallet);

    const { mapId, cell, target, hpRow } = await resolveAttackTarget(wallet, data);

    // Монетка и прочее с HP = 1 забирается одним нажатием: без отряда и боя.
    if (isPickup(target, Number(hpRow.current_hp))) {
      const got = await pickupEncounter({ wallet, target, hpRow, mapId, q: data.q, r: data.r });
      await chargePickupSatiety(wallet, mapId);
      return got;
    }

    // Артефакт и сундук забираются платой за подход, без отряда и без боя.
    // Отправляем pickupEncounter ДО разрешения lineup, чтобы не требовать
    // отряд для объектов, которые его не используют.
    if (opensWithoutFight(target.kind)) {
      return pickupEncounter({ wallet, target, hpRow, mapId, q: data.q, r: data.r });
    }

    const { hero, heroSquad, combat, sim, commit, autoLineup } = await fightAndCommit({
      wallet,
      target,
      hpRow,
      passedLineup: data.lineup,
    });

    const { side, reveal, rewards } = await afterHit({
      wallet,
      mapId,
      q: data.q,
      r: data.r,
      cell,
      target,
      hpRow,
      sim,
      commit,
      hero,
    });

    return buildAttackResponse({
      target,
      hpRow,
      commit,
      sim,
      side,
      rewards,
      reveal,
      heroSquad,
      combat,
      autoLineup,
    });
  });
