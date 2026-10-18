// ЕДИНЫЙ энкаунтер бета-рейда: босс, сундук и шахта проходят один путь.
// Меняются только надписи и награда — логика, окно и формула боя общие.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { getAccountId } from "../../accountBalances";
import { getHallwayConfig } from "../hallwayConfig";
import { loadEncounterTarget } from "./encounter-target";
import { applyCellOverride, loadCellObject, requireCellObject } from "./cell-override";
import { targetFromSnapshot } from "./boss-snapshot";
import { ensureObjectHp, applyObjectDamage, logObjectRun } from "./encounter-hp";
import { isPickup, pickupEncounter } from "./encounter-pickup";
import { grantEncounterRewards } from "./encounter-rewards";
import { claimObjectPayout, payoutByTop } from "./encounter-payout";
import { publishRaid } from "../../raidLive";
import { noteCellsChanged } from "./map-change-hooks";
import { simulateEncounter, type SimChip } from "./encounter-sim";
import { instantLoot, opensWithoutFight } from "./encounter-loot";
import { computeChipMults } from "./encounter-mults";
import { resolveLineup } from "./encounter-lineup";
import { heroBossBonusEnabled } from "./hero-power";
import { loadHeroSide } from "./encounter-hero-squad";
import { immunityOnly } from "./encounter-hero-apply";
import { applySideEffects } from "./encounter-side-apply";
import { abilityTotals } from "./encounter-ability-totals";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { RUNNER_LAYER } from "./runners";
import { revealRunnerAt, type RunnerReveal } from "./runner-reveal";
import { requireNotVoid } from "./voidGate";
import { actionGate } from "../../rateGate";
import { raidOwner } from "./owner";
import { trimFightLog } from "./encounter-log-trim";
import { loadFightWeaken } from "./fight-weaken";

const lineupSchema = z
  .array(
    z.object({
      templateId: z.string().min(1),
      // Уровни дробные (1.5/2.5/…) — .int() тут ломал бы отряд.
      level: z.number(),
      training: z.boolean().optional(),
      // chipId сознательно НЕ принимаем: экземпляр подбирает сервер. Иначе
      // «тренировочной» фишкой с чужим id можно было повесить оглушение на
      // фишку другого игрока — они видны в маркете.
      //
      // trainingId — другое дело: это id из hallway_training_chips, отдельной
      // коллекции прихожей, и без него триал-фишку нечем проверить. Раньше
      // флаг training верили на слово, и в бой выходили десять пятизвёзд у
      // кошелька с пустым инвентарём.
      trainingId: z.string().min(1).max(64).optional(),
      serialNo: z.number().nullable().optional(),
    }),
  )
  .max(10);

/**
 * Удар по объекту рядом. Один вызов — один результат (модель raidAutoFight).
 * Возврат совпадает по смыслу с эталоном: сколько нанесли, добили ли, остаток HP.
 */
export const betaRaidAttack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        objectId: z.string().min(1),
        q: z.number().int(),
        r: z.number().int(),
        lineup: lineupSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    await actionGate("raid-attack", wallet);

    const mapId = await myMapId(wallet);
    // Каждая клетка — самостоятельный экземпляр: параметры и награды можно
    // задать ей отдельно, не трогая другие копии того же босса.
    //
    // И объект клетки обязан совпасть с присланным. Без этой сверки цель боя
    // задавал клиент: на любой пустой траве объявлялся любой сундук из
    // справочника, и его награда забиралась за одну энергию.
    const cell = await loadCellObject(mapId, data.q, data.r);
    requireCellObject(cell.objectId, data.objectId);
    // Шаблон, а нет его — снимок клетки: удаление заготовки не должно
    // превращать живого босса в непроходимую пустоту (boss-snapshot).
    const tpl =
      (await loadEncounterTarget(data.objectId)) ??
      targetFromSnapshot(data.objectId, cell.snapshot);
    if (!tpl) throw new Error("Объект не найден");
    const target = applyCellOverride(tpl, cell.override, cell.terrainBg);
    const pos = await playerCell(wallet);
    requireAdjacent(pos, data.q, data.r);
    // Цель плавает — значит и герой должен: с берега до неё не дотянуться.
    // Водность клетки пришла вместе с объектом, лишнего запроса нет.
    const { requireWaterReach } = await import("./water-reach");
    await requireWaterReach(mapId, cell.water, pos);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    // Слой берётся из самой клетки: верхний объект или спрятавшийся под ним
    // беглец — тот же выбор, который карта нарисовала игроку (cell-override).
    const hpRow = await ensureObjectHp({
      mapId,
      q: data.q,
      r: data.r,
      layer: cell.layer,
      target,
    });
    if (hpRow.current_hp <= 0) {
      throw new Error(`${target.badgeLabel} уже опустошён`);
    }

    // Монетка и прочее с HP = 1 забирается одним нажатием: без отряда и боя.
    if (isPickup(target, Number(hpRow.current_hp))) {
      const got = await pickupEncounter({ wallet, target, hpRow, mapId, q: data.q, r: data.r });
      // Подобрать золото — как шаг: −1 сытости (lib/hero/satiety).
      const { moveSatiety } = await import("./hero-satiety");
      const { SATIETY_COST } = await import("@/lib/hero/satiety");
      await moveSatiety(wallet, -SATIETY_COST.pickup).catch(() => null);
      return got;
    }

    // Артефакт и сундук забираются платой за подход, без отряда и без боя.
    // Отправляем pickupEncounter ДО разрешения lineup, чтобы не требовать
    // отряд для объектов, которые его не используют.
    if (opensWithoutFight(target.kind)) {
      return pickupEncounter({ wallet, target, hpRow, mapId, q: data.q, r: data.r });
    }

    // Герой выходит СВОИМ отрядом: состав закреплён в замке, выбора фишек в
    // окне боя больше нет. Флаг выключен — героя нет, идёт прежняя ветка.
    const { hero, squad: heroSquad } = await loadHeroSide(wallet);
    // Отряд собираем ДО списания энергии — иначе при отказе энергия сгорала.
    const lineup = heroSquad
      ? heroSquad.lineup
      : await resolveLineup(wallet, (data.lineup ?? []) as SimChip[]);
    // Оглушённых resolveLineup уже не вернул — здесь только читаем яд,
    // который висит на уцелевших фишках.
    const { loadChipEffects, poisonByChip } = await import("./chip-effects");
    const effects = await loadChipEffects(
      lineup.map((c) => c.chipId).filter((x): x is string => !!x),
    );
    if (lineup.length === 0) {
      throw new Error("Нет фишек для боя — открой пак или дождись отдыха фишек");
    }

    const cfg = await getHallwayConfig();
    // Бонусы за тираж коллекции и премиум — как в обычном рейде.
    const mults = await computeChipMults(lineup);
    // По БОССАМ бонусы героя — под отдельным флагом: фонд босса делится по
    // вкладу урона, и усиленный тестер отбирал бы DARAI у остальных.
    const combat =
      hero && (target.kind !== "boss" || (await heroBossBonusEnabled(wallet))) ? hero.combat : null;
    // Ослабление, наложенное в этом бою, действует сразу (fight-weaken).
    const reweaken = combat ? await loadFightWeaken(wallet, target.abilities) : undefined;

    // Энергию списываем ПОСЛЕДНИМ действием перед боем: всё, что читается из
    // базы, уже прочитано, и обрыв связи на этих шагах больше не съедает её
    // впустую. Возврат — на случай, если урон так и не запишется.
    const { payForHit } = await import("./encounter-pay");
    const payment = await payForHit(wallet, target.interactionCost);

    // Сундук и монетка боем не берутся: заплатил за подход — забрал (см.
    // encounter-loot). Симуляцию для них не гоняем вовсе.
    const sim = opensWithoutFight(target.kind)
      ? instantLoot(Number(hpRow.current_hp))
      : simulateEncounter({
          lineup,
          targetHp: Number(hpRow.current_hp),
          trialStatScale: cfg.boss?.trialStatScale ?? 1,
          mults,
          abilities: target.abilities,
          damage: target.damage ?? undefined,
          poison: poisonByChip(effects),
          // Бонусы по боссам выключены — иммунитет артефактов всё равно едет.
          hero: combat ?? (hero ? immunityOnly(hero.combat) : undefined),
          reweaken,
        });

    // Урон записываем ПЕРВЫМ делом после боя: раньше перед ним успевали
    // отработать яд, оглушение и замедление — три обращения к базе, и обрыв
    // на любом означал «энергию сняло, удар не засчитан».
    let commit: Awaited<ReturnType<typeof applyObjectDamage>>;
    try {
      commit = await applyObjectDamage({ hpId: hpRow.id, damage: sim.dealt, wallet });
    } catch (e) {
      await payment.refund();
      console.error("[beta-attack] урон не записался, энергия возвращена:", e);
      throw new Error("Удар не засчитан — связь с базой оборвалась. Энергия возвращена, повтори");
    }

    // Побочки боя (энергия, замедление, ослабление, эффекты фишек) — общим
    // модулем: их сбой не отменяет засчитанный удар.
    const { burned } = await applySideEffects(wallet, sim.side, "[beta-attack]", target.name);
    const accountId = await raidOwner(wallet);
    const generation = Number(hpRow.generation ?? 0) || 0;
    // Добили верхний объект — под ним мог прятаться беглец. Показываем его
    // сразу: он остаётся жив и бьётся отдельно, вторым заходом.
    let reveal: RunnerReveal | null = null;
    if (commit.killed) {
      const wasRunner = cell.layer === RUNNER_LAYER;
      reveal = wasRunner ? null : await revealRunnerAt(mapId, data.q, data.r).catch(() => null);
      publishRaid({
        mapId,
        type: "defeated",
        cells: [`${data.q},${data.r}`],
        runner: wasRunner,
        ...(reveal ? { reveal } : {}),
      });
      // Журнал карты: клетка перечитывается из базы и уходит дельтой всем
      // (map-change-hooks) — снимок и кэш игроков видят одно и то же.
      void noteCellsChanged(mapId, [`${data.q},${data.r}`]);
    }
    await logObjectRun({
      hpId: hpRow.id,
      objectId: target.templateId,
      wallet,
      accountId,
      damage: commit.dealt,
      rounds: sim.rounds,
      killed: commit.killed,
      generation,
    });

    // Награда делится ПО ТОПУ вклада (как в обычном рейде), а не достаётся
    // добившему: иначе снёсший боссу 90% HP уходил ни с чем. Подбираемые
    // объекты (сундук/шахта/артефакт) — по-прежнему тому, кто забрал.
    let rewards: Awaited<ReturnType<typeof grantEncounterRewards>> = [];
    // Цикл раздачи у карты нулевой; предмет сверх рюкзака — мешочком на клетке цели.
    const at = { mapId, cycleNo: 0, q: data.q, r: data.r };
    if (commit.killed) {
      rewards =
        target.kind === "boss"
          ? await payoutByTop({
              ...at,
              generation,
              target,
              hpId: hpRow.id,
              viewer: wallet,
            })
          : // Тот же одноразовый захват, что и у подбора: выдача по объекту
            // одна на его жизнь, кто бы сколько раз ни ударил.
            (await claimObjectPayout(hpRow.id, generation))
            ? await grantEncounterRewards(wallet, target, at)
            : [];
    }

    return {
      kind: target.kind,
      badgeLabel: target.badgeLabel,
      name: target.name,
      imageUrl: target.imageUrl,
      backgroundUrl: target.backgroundUrl,
      dealt: commit.dealt,
      killed: commit.killed,
      hpAfter: commit.hpAfter,
      maxHp: Number(hpRow.max_hp),
      rounds: sim.rounds,
      wiped: sim.wiped,
      spentEnergy: target.interactionCost + burned,
      burnedEnergy: burned,
      slowed: sim.side.slow,
      // Что босс навесил на фишки — чтобы игрок понимал, почему часть отряда
      // выпала из следующего боя.
      chipEffects: sim.side.chipEffects.map((e) => ({
        kind: e.kind,
        minutes: e.minutes,
        chip: e.chip ?? null,
      })),
      // Значки итога считает сервер: лог ниже обрезан, а сколько энергии
      // сожжено на самом деле, знает только он.
      abilityTotals: abilityTotals(sim.abilities, burned, sim.side),
      // Бой на тысячи раундов иначе уезжает игроку мегабайтами.
      abilityLog: trimFightLog(sim.abilities),
      log: trimFightLog(sim.log),
      rewards,
      /** Кто открылся под добитым объектом (runner-reveal) — или ничего. */
      reveal,
      pickup: false,
      // Отряд героя: сколько записей не вышло в бой и почему — окно боя
      // объясняет «9 из 10», не пересобирая состав.
      heroSquad: heroSquad
        ? { total: heroSquad.total, busy: heroSquad.busy, gone: heroSquad.gone }
        : undefined,
      // Множители перечисляем поимённо: в combat лежит ещё и Set иммунитетов,
      // который в JSON превратился бы в пустой объект.
      heroBonus: combat
        ? {
            atkMult: combat.atkMult,
            hpMult: combat.hpMult,
            missPct: combat.missPct,
            luckPct: combat.luckPct,
            luckMin: combat.luckMin,
            luckMax: combat.luckMax,
          }
        : undefined,
    };
  });
