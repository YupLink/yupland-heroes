// Один шаг героя по гекс-карте. Правила прежние — рейсов в базу вчетверо меньше.
//
// Раньше обработчик был цепочкой: каждый следующий вопрос ждал ответа на
// предыдущий, и на боевой базе один шаг набирал пятнадцать сетевых рейсов
// подряд по 100–150 мс каждый. Ни одного Promise.all при том, что половина
// вопросов друг о друге ничего не знает.
//
// Теперь шаг идёт волнами:
//   1. кто мы (сёстры) и какая карта — оба ответа из памяти процесса;
//   2. позиция вместе со СВОИМ судном | замедление | ЦЕЛЬ ЦЕЛИКОМ | герой;
//   3. посадка и дверь — до денег;
//   4. шаг вместе с платой ОДНИМ оператором | что за объект.
//
// Что осталось нетронутым: порядок отказов (соседство → проходимость →
// занятые корабли → «нужен корабль»), правило «сначала деньги, потом товар»
// и все три формулы цены — их считает тот же stepEnergyCost по тем же числам.
//
// На борту игрок по ЗАПИСИ об экипаже (ship-crew.ts); посадка занимает судно до
// списания энергии — иначе двое читали «свободно» и садились на один борт.
//
// Один переход — одно очко и одно списание (аудит турниров 06.10): позиция
// пишется по CAS клетки «откуда», энергия списывается тем же оператором и
// только за применённый шаг (move-step-sql), а частоту держит тормоз по
// аккаунту (move-step-guard). Раньше пачка одинаковых запросов давала пачку
// очков «Шагов» за один шаг.
import { nanoid } from "nanoid";
import { stepEnergyCost } from "@/lib/shipRules";
import { stepMultOf } from "./move-weather";
import { mapSizeOf } from "./castle";
import { playerMapId } from "./encounter-where";
import { slowExtraCost } from "./encounter-effects";
import { gatedMount, jumpCost, jumpRefusal, stepJump } from "./move-step-mount";
import { fleeAroundStep } from "./flee-move";
import { loadHeroPower } from "./hero-power";
import { stepSatietyCost } from "@/lib/hero/satiety";
import { satietyMultOf, scaleSatiety } from "@/lib/raid/island/satiety";
import { loadRide } from "./ship-move";
import { applyStep, releaseShip, seatOnShip, seatRefusal } from "./ship-crew";
import { loadStepFacts, stepBlockedReason } from "./step-facts";
import { chargeGateOnStep, type TollPaid } from "@/server/api/beta-raid/gate-toll";
import { afterStep } from "@/server/api/beta-raid/move-step-after";
import { missedStep, stepError, undoStep } from "@/server/api/beta-raid/move-step-guard";
import { sailRefusal } from "@/server/api/beta-raid/ship-blasted";
import { noteEnergySpend } from "./econ/energy-note";
import { stopwatch } from "../../perf/trace";
import { objectInfoOf } from "./step-object";
import { raidOwner } from "./owner";
import { canWalkBridgeEdge, edgeAxis } from "@/lib/raid/bridgeTransit";
import { bridgePassage } from "./bridge-step";
import { SHIP_STEP_HP_OCEAN, SHIP_STEP_HP_WATER } from "@/lib/shipHealth";
import type { StepResult, StepTo } from "./move-step-types";
import { checkLadder, ladderLandRefusal } from "./move-step-ladder";
import { energyNow, stepSatiety } from "./move-step-tail";

export type { StepResult, StepTo } from "./move-step-types";

export async function performStep(wallet: string, to: StepTo): Promise<StepResult> {
  // Секундомер по волнам: в отчёте видно не «шаг медленный», а КАКАЯ волна
  // просела — чтение фактов, списание энергии, запись или побег.
  const sw = stopwatch("рейд: шаг");
  try {
    return await runStep(wallet, to.q, to.r, sw, to.big === true, to.ladder ?? null);
  } finally {
    sw.done();
  }
}

async function runStep(
  wallet: string,
  q: number,
  r: number,
  sw: ReturnType<typeof stopwatch>,
  /** Посадка только в большой: дальше маршрут идёт океаном (StepTo.big). */
  bigOnly: boolean,
  /** Лестница из рюкзака героя (§8.121, move-step-ladder). */
  ladder: StepTo["ladder"] | null,
): Promise<StepResult> {
  // Волна 1. Оба ответа обычно из памяти: сёстры живут минуту, активная
  // карта — сорок пять секунд (и сбрасывается, когда админ её меняет).
  const account = await raidOwner(wallet);
  // Ходим по карте ИГРОКА (мультикарта). Пока все на активной — она же.
  const mapId = await playerMapId(account);
  sw.lap("кто и карта");

  // Волна 2. Независимые вопросы разом. Цель спрашиваем ОДНИМ запросом
  // (step-facts): проходимость, вода, цена и причал — про одну и ту же клетку.
  // Тормоз частоты — по коню героя (§8.84, hero-mount, кэш 2 с): шаг он не
  // задерживает, а отказ — до денег.
  const [ride, slowExtra, facts, heroPower, mount] = await Promise.all([
    loadRide(wallet, mapId),
    slowExtraCost(account),
    loadStepFacts(mapId, q, r),
    loadHeroPower(wallet).catch(() => null),
    gatedMount(account),
    // Нужен только на первый выход игрока на карту, но из кэша и бесплатен —
    // зато сохраняет прежний отказ «Карта не найдена» на битой настройке.
    mapSizeOf(mapId),
  ]);

  sw.lap("факты клетки");
  // Первый выход на карту — у замка (в главном мире — у ратуши Юпленда).
  const currentPos = ride.cell ?? (await (await import("./castle-door")).startCell(mapId));
  // Экипаж и позиция разъехались — такого быть не должно (шаг применяется
  // одним оператором), но если случилось, освобождаем судно: иначе оно
  // осталось бы занятым навсегда, а игрок «на борту» посреди суши.
  const desynced = !!ride.ship && (ride.ship.q !== currentPos.q || ride.ship.r !== currentPos.r);
  if (desynced) {
    // Пишем в лог: это и есть та поломка, после которой игрок остаётся на воде
    // «пешком». Без записи причину приходится угадывать по жалобам.
    console.warn(
      `[raid] экипаж разъехался: ${wallet} в ${currentPos.q},${currentPos.r}, судно в ${ride.ship!.q},${ride.ship!.r}`,
    );
    await releaseShip(wallet);
  }
  const ship = desynced ? null : ride.ship;

  // Соседняя клетка — шаг; через одну по прямой — прыжок пегаса (§8.84) или лестница (§8.121).
  if (ladder) await checkLadder(mapId, currentPos, { q, r }, !!ship);
  const passage = !ladder && ship && edgeAxis(currentPos, { q, r }) === null && facts
    ? await bridgePassage(mapId, currentPos, { q, r }, facts, ship.kind === "big")
    : null;
  const jump = passage || ladder ? false : stepJump(currentPos, { q, r }, mount, !!ship);
  // Второе условие для типов: без клетки stepBlockedReason уже отказал бы.
  const blocked = stepBlockedReason(facts, wallet) ?? (jump && facts ? jumpRefusal(facts) : null) ??
    (ladder && facts ? ladderLandRefusal(facts) : null);
  if (blocked || !facts) throw new Error(blocked ?? "Здесь нет местности — пройти нельзя");
  const target = facts;
  if (ship && target.bridge) throw new Error("braid.bridge_ship_stop");
  if (!ship && (ride.bridge || target.bridge) &&
      !canWalkBridgeEdge(currentPos, { q, r }, ride.bridge, target.bridge)) {
    throw new Error("braid.bridge_deck_only");
  }
  if (!ship && ride.bridge && target.water && !target.bridge) {
    throw new Error("braid.bridge_deck_only");
  }

  // Игрок на корабле управляет судном: по воде плывём за фиксированную цену
  // и тащим корабль за собой, на сушу — сходим по цене самой клетки, и судно
  // остаётся на последней водной клетке.
  const big = !!ship && ship.kind === "big";
  const sailing = !!ship && target.water;
  // Океан — глубокая вода: обычному кораблю туда хода нет, идёт только большой; на
  // клетку подбитого корабля (dynamite-08) — никому. Ключи словаря (ship-blasted).
  const noSail = sailing ? sailRefusal(target, big) : null;
  if (noSail) throw new Error(noSail);

  // Шаг на свободное судно и есть посадка — но ТОЛЬКО на воде. Раньше воду не
  // спрашивали, и клетка суши с обмелевшим кораблём работала причалом: шаг на
  // неё стоил как посадка, игрок оказывался «на борту» на суше и следующим
  // шагом сводил судно с суши на воду.
  const berth = target.berth;
  const free = berth ? berth.ships - berth.busy : 0;
  let boarding = false;
  if (target.water && !ship && !target.bridge) {
    // Вплавь не ходят: на воду только на своём судне или на свободное чужое.
    if (!berth) throw new Error("Нужен корабль");
    if (free <= 0) throw new Error("Все корабли здесь заняты");
    boarding = true;
  }

  // Цену считает общая с картой формула: посадка и гребок — база плюс
  // замедление плоско; шаг по суше — (клетка + замедление) × (1 − скидка),
  // правило владельца 27.09. Кнопки в окне корабля (ship-action.stepTo) зовут
  // её же. Скидка героя — только собственным ногам: посадку и гребок она не
  // трогает, а без героя цена остаётся прежней.
  // Остров — в 10 раз дешевле; погода — из кэша процесса. Прыжок пегаса (§8.84) — 10
  // энергии ровно плюс эта же цена клетки приземления (на воду и с корабля не прыгают).
  const mult = await stepMultOf(mapId);
  const stepCost = stepEnergyCost({
    boarding,
    sailing,
    // Большой корабль гребёт дешевле; на посадку и сушу вид судна не влияет.
    bigShip: big,
    cellCost: boarding || sailing ? undefined : target.cost,
    slowExtra,
    heroStepDiscountPct: heroPower?.field.stepDiscountPct,
    mult,
  });
  const moveCost = passage
    ? Math.round(stepCost * (passage.crossed.length + 1) * 100) / 100
    : jump ? jumpCost(stepCost) : stepCost;

  // Волна 3. Посадка занимает борт ДО денег — как место у верфи (createShip):
  // читать «свободно» и записываться секундой позже значит пустить на одно
  // судно двоих. Не хватило энергии — бронь снимаем, и шага не было вовсе.
  // На океане — и когда маршрут дальше идёт океаном (bigOnly) — сесть можно
  // только в БОЛЬШОЕ судно (seatOnShip выберет именно его). Нет свободного
  // большого — «слишком мал» / «нет подходящего», а не «заняты», и до денег.
  if (boarding) {
    const seated = await seatOnShip(wallet, mapId, q, r, target.ocean || bigOnly);
    if (!seated) throw new Error(seatRefusal(target.ocean, bigOnly));
  }

  // Шлагбаум. Дверь стоит поперёк дороги: плата берётся за сам вход на клетку,
  // до энергии и до записи позиции. Не пропустила — шага не было вовсе.
  let toll: TollPaid | null = null;
  if (target.gate) {
    try {
      toll = await chargeGateOnStep({ wallet, mapId, q, r, gate: target.gate });
    } catch (e) {
      await undoStep(wallet, boarding, null);
      throw e;
    }
    sw.lap("дверь");
  }

  // Волна 4. Сам шаг — ОДНИМ оператором: позиция, судно и энергия меняются
  // вместе или не меняются вовсе. Позиция — по CAS клетки «откуда» (той, что
  // прочитана во второй волне): второй запрос того же шага промахивается и не
  // платит. Нехватка энергии роняет весь оператор — позиция прежняя.
  const mode = sailing ? "sail" : ship ? "ashore" : "walk";
  // Сытость героя (lib/hero/satiety): −1 шаг, −2 вода, −4 океан — тем же
  // оператором, что энергия. Героя нет — шкалы нет.
  const satiety = heroPower
    ? {
        heroId: heroPower.heroId,
        max: heroPower.satiety.max,
        // На острове — в 10 раз меньше (lib/raid/island/satiety).
        cost: scaleSatiety(
          (passage?.crossed.reduce((sum, cell) =>
            sum + stepSatietyCost({ water: cell.water, ocean: cell.ocean }), 0) ?? 0) +
          stepSatietyCost({ water: target.water && !target.bridge, ocean: target.ocean && !target.bridge }),
          satietyMultOf(mapId),
        ),
      }
    : undefined;
  const sailHpCost = passage
    ? (passage.crossed.length + 1 - passage.oceanCount) * SHIP_STEP_HP_WATER +
      passage.oceanCount * SHIP_STEP_HP_OCEAN
    : undefined;
  const guard = {
    from: currentPos, wallet, cost: moveCost, op: nanoid(16), satiety, sailHpCost,
    ...(ladder ? { ladder } : {}),
  };
  const [applied, objectInfo] = await Promise.all([
    applyStep(wallet, mapId, q, r, mode, guard).catch(async (e: unknown) => {
      // Дверь пропустила, а шаг не записался — плату возвращаем: игрок остался
      // с этой стороны. Борт, занятый этим шагом, — свободен.
      await undoStep(wallet, boarding, toll);
      throw stepError(e, moveCost);
    }),
    objectInfoOf(target.objectId),
  ]);
  sw.lap("запись шага");
  // Судно не поехало или позиция уже не та (повтор того же шага, вторая
  // вкладка) — ничего не записано и не списано: ни очка, ни энергии, отказ.
  // Слепой повтор моста после коммита узнаёт свой шаг по метке ключа и идёт
  // дальше как применённый (move-step-guard.missedStep).
  if (applied.moved < 1) await missedStep({ wallet, op: guard.op, boarding, toll, sail: sailing });
  // Причина траты — в суточный агрегат, без await: шаг её не ждёт.
  void noteEnergySpend(account, moveCost, "step");

  // Бухгалтерия «сколько прошёл», плата двери в журнал, очки турниров и вести
  // соседям (суда и метка игрока) — move-step-after, ничего не ждёт.
  afterStep({
    wallet,
    mapId,
    account,
    moveCost,
    toll,
    from: currentPos,
    to: { q, r },
    sailing,
    onShip: !!ship,
    ocean: target.ocean,
    boarding,
    big,
  });

  // Кто-то подошёл — «убегающие» объекты вокруг уходят на две клетки прочь.
  // Пока таких соседей нет (обычный случай), это чтение Map в памяти и шаг
  // ничего не ждёт; а когда есть — ответ обязан знать про побег, иначе подход
  // к цели и её переезд идут наперегонки (см. flee-move).
  const fled = await fleeAroundStep(mapId, { q, r });
  sw.lap("побег");

  return {
    success: true,
    fled,
    // Плату за дверь называем вслух: списание, о котором игрок не знает, он
    // читает как пропажу ресурсов.
    toll: target.gate && toll ? target.gate.config.prices : [],
    position: { q, r },
    moveCost,
    remainingEnergy: applied.energy ?? (await energyNow(wallet)),
    satiety: stepSatiety(wallet, heroPower, applied.satiety),
    object: objectInfo,
  };
}
