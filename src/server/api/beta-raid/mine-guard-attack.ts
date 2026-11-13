// Бой с боссом-охранником шахты. Формула — общая simulateEncounter (как у
// боссов карты), но HP охранника живёт в своей таблице raid_mine_guard, и НАГРАД
// нет: охранник только держит шахту. Способности (яд/оглушение/…) работают.
//
// Та же охрана стоит у магического сундука. С четвёртой редакции (29.09.2026)
// победа над ней ничего не захватывает: охрана снимается, как у шахты, и
// сундук открыт чужим — «Открыть» за энергию и взять из сети хозяина или
// «Забрать сундук» (open-pass, chest-pickup).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { actionGate } from "../../rateGate";
import { accAccountId } from "../currency/move";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { getHallwayConfig } from "../hallwayConfig";
import { loadGuardRow, guardAlive, guardAbilities } from "./mine-guard";
import { loadHeroSide } from "./encounter-hero-squad";
import { resolveLineup } from "./encounter-lineup";
import { computeChipMults } from "./encounter-mults";
import { payForHit } from "./encounter-pay";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { applySideEffects } from "./encounter-side-apply";
import { abilityTotals } from "./encounter-ability-totals";
import { simulateEncounter, type SimChip } from "./encounter-sim";
import { loadFightWeaken } from "./fight-weaken";
import { publishRaid } from "../../raidLive";

/** Сколько раундов лога показываем с каждого края длинного боя (как в энкаунтере). */
const LOG_EDGE = 40;
function trimFightLog<T>(log: T[]): T[] {
  if (log.length <= LOG_EDGE * 2) return log;
  return [...log.slice(0, LOG_EDGE), ...log.slice(-LOG_EDGE)];
}

const lineupSchema = z
  .array(
    z.object({
      templateId: z.string().min(1),
      level: z.number(),
      training: z.boolean().optional(),
      trainingId: z.string().min(1).max(64).optional(),
      serialNo: z.number().nullable().optional(),
    }),
  )
  .max(10);

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Один удар отряда по охраннику шахты. Один вызов — один результат. */
export const attackMineGuard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        lineup: lineupSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    await actionGate("mine-guard-attack", wallet);
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const guard = await loadGuardRow(mapId, data.q, data.r);
    if (!guardAlive(guard) || !guard) throw new Error("Охранника здесь нет");
    // Своего охранника не бьём — он держит шахту от чужих.
    const myAcc = await accAccountId(wallet).catch(() => null);
    if (guard.owner_account === myAcc) throw new Error("Это твой охранник");
    // Шахта v2 сломалась (§8.59) — охрана сбегает при уборке; бить незачем.
    const { mineCellBroken } = await import("./mine-v2-read");
    if (await mineCellBroken(mapId, data.q, data.r)) throw new Error("braid.mine_broken");

    // Отряд собираем ДО списания энергии — иначе при отказе энергия сгорала.
    const { hero, squad: heroSquad } = await loadHeroSide(wallet);
    const lineup = heroSquad
      ? heroSquad.lineup
      : await resolveLineup(wallet, (data.lineup ?? []) as SimChip[]);
    if (lineup.length === 0) {
      throw new Error("Нет фишек для боя — открой пак или дождись отдыха фишек");
    }
    const { loadChipEffects, poisonByChip } = await import("./chip-effects");
    const effects = await loadChipEffects(
      lineup.map((c) => c.chipId).filter((x): x is string => !!x),
    );

    const cfg = await getHallwayConfig();
    const mults = await computeChipMults(lineup);
    // Охранник наград не даёт — бонус героя не отбирает у других, включаем всегда.
    const combat = hero ? hero.combat : null;
    // Ослабление от охраны действует сразу, как у боссов (fight-weaken).
    const reweaken = combat ? await loadFightWeaken(wallet, guardAbilities(guard)) : undefined;

    // На острове удар в 10 раз дешевле (island/energy); в мире — как было.
    const cost = scaleEnergy(num(guard.interaction_cost) || 10, energyMultOf(mapId));
    const payment = await payForHit(wallet, cost);

    const sim = simulateEncounter({
      lineup,
      targetHp: num(guard.current_hp),
      trialStatScale: cfg.boss?.trialStatScale ?? 1,
      mults,
      abilities: guardAbilities(guard),
      damage: guard.damage ?? undefined,
      poison: poisonByChip(effects),
      hero: combat ?? undefined,
      reweaken,
    });

    // Урон записываем ПЕРВЫМ делом. WHERE current_hp>0: если параллельный удар
    // уже добил (и удалил строку) — 0 строк, вернём энергию. Добивший удар тем
    // же UPDATE помечает, когда и кем охрана побеждена; строку ниже удаляем
    // (сорвалось удаление — мёртвая охрана никому не мешает: везде «живая» —
    // это killed_at IS NULL и current_hp > 0).
    const dealt = Math.max(0, Math.round(sim.dealt));
    const dies = `current_hp - ${dealt} <= 0`;
    const by = myAcc ? sqlStr(myAcc) : "NULL";
    let hpAfter = 0;
    let killed = false;
    try {
      const rows = (await mcpExec(
        `UPDATE yuplink.raid_mine_guard
            SET current_hp = GREATEST(0, current_hp - ${dealt}),
                killed_at = CASE WHEN ${dies} THEN now() ELSE killed_at END,
                killed_by = CASE WHEN ${dies} THEN ${by} ELSE killed_by END
          WHERE map_id=${sqlStr(mapId)} AND q=${data.q} AND r=${data.r} AND current_hp > 0
          RETURNING current_hp;`,
        { wrapJsonCte: true },
      )) as Array<{ current_hp: number | string }>;
      const row = rows?.[0];
      if (!row) {
        await payment.refund();
        throw new Error("Охранник уже повержен — энергия возвращена");
      }
      hpAfter = num(row.current_hp);
      killed = hpAfter <= 0;
    } catch (e) {
      if (e instanceof Error && e.message.includes("уже повержен")) throw e;
      await payment.refund();
      console.error("[mine-guard] урон не записался, энергия возвращена:", e);
      throw new Error("Удар не засчитан — связь с базой оборвалась. Энергия возвращена, повтори");
    }
    if (killed) {
      // ОДНОРАЗОВЫЙ: HP кончилось — охранник помер и УДАЛЁН (владелец может
      // поставить нового, шахта сразу открыта к захвату, сундук — чужим).
      // Не оставляем труп.
      await mcpExec(
        `DELETE FROM yuplink.raid_mine_guard
          WHERE map_id=${sqlStr(mapId)} AND q=${data.q} AND r=${data.r} AND current_hp <= 0;`,
      ).catch(() => {});
    }

    // Побочки боя — тем же модулем, что и у энкаунтера.
    // И износ надетого на героя (art-wear-hit) — раз за бой: бой = этот охранник
    // (клетка и время постановки), удар уже засчитан.
    const fight = `guard:${mapId}:${data.q}:${data.r}:${guard.placed_at ?? ""}`;
    const side = await applySideEffects(
      wallet,
      sim.side,
      "[mine-guard]",
      guard.name,
      hero ? { heroId: hero.heroId, fight } : null,
    );
    const { burned } = side;
    // Добили — шахта открылась к захвату (сундук — чужим), оверлей охранника
    // гаснет у всех.
    if (killed) publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });

    return {
      kind: "guard" as const,
      name: guard.name,
      imageUrl: guard.image,
      backgroundUrl: guard.background,
      dealt,
      killed,
      /** Захвата сундука больше нет (29.09) — всегда null; поле — для окон прошлой версии. */
      seized: null,
      hpAfter,
      maxHp: num(guard.max_hp),
      rounds: sim.rounds,
      wiped: sim.wiped,
      spentEnergy: cost + burned,
      burnedEnergy: burned,
      slowed: sim.side.slow,
      chipEffects: sim.side.chipEffects.map((e) => ({
        kind: e.kind,
        minutes: e.minutes,
        chip: e.chip ?? null,
      })),
      /** Удар изменил фишки (оглушение) — только тогда клиент перечитывает инвентарь. */
      chipsChanged: sim.side.chipEffects.some((e) => e.kind === "stun"),
      abilityTotals: abilityTotals(sim.abilities, burned, sim.side),
      abilityLog: trimFightLog(sim.abilities),
      log: trimFightLog(sim.log),
      /** Слетело с героя сломанным (§8.63 п.3) — плашка над героем. */
      artBroken: side.artBroken,
    };
  });
