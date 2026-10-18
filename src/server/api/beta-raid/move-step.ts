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
// Что изменилось: на борту игрок по ЗАПИСИ об экипаже, а не потому, что под
// ногами что-то плавает (ship-crew.ts). Отсюда же и посадка: она занимает
// конкретное судно, и занимает его до списания энергии — иначе двое читали
// «свободно» и садились на один борт.
//
// Один переход — одно очко и одно списание (аудит турниров 06.10): позиция
// пишется по CAS клетки «откуда», энергия списывается тем же оператором и
// только за применённый шаг (move-step-sql), а частоту держит тормоз по
// аккаунту (move-step-guard). Раньше пачка одинаковых запросов давала пачку
// очков «Шагов» за один шаг.
import { nanoid } from "nanoid";
import { sb } from "../../db/pg";
import { stepEnergyCost } from "@/lib/shipRules";
import { mapSizeOf } from "./castle";
import { playerMapId } from "./encounter-where";
import { slowExtraCost } from "./encounter-effects";
import { areNeighbors } from "./helpers";
import { fleeAroundStep } from "./flee-move";
import { invalidateHeroPower, loadHeroPower } from "./hero-power";
import { satietyNow, stepSatietyCost, type Satiety } from "@/lib/hero/satiety";
import { loadRide } from "./ship-move";
import { applyStep, releaseShip, seatOnShip, seatRefusal } from "./ship-crew";
import { loadStepFacts, stepBlockedReason } from "./step-facts";
import { chargeGateOnStep, type TollPaid } from "@/server/api/beta-raid/gate-toll";
import { afterStep } from "@/server/api/beta-raid/move-step-after";
import {
  missedStep,
  stepError,
  stepRateGate,
  undoStep,
} from "@/server/api/beta-raid/move-step-guard";
import { noteEnergySpend } from "./econ/energy-note";
import { stopwatch } from "../../perf/trace";
import { objectInfoOf } from "./step-object";
import { raidOwner } from "./owner";
import type { StepResult, StepTo } from "./move-step-types";

export type { StepResult, StepTo } from "./move-step-types";

export async function performStep(wallet: string, to: StepTo): Promise<StepResult> {
  // Секундомер по волнам: в отчёте видно не «шаг медленный», а КАКАЯ волна
  // просела — чтение фактов, списание энергии, запись или побег.
  const sw = stopwatch("рейд: шаг");
  try {
    return await runStep(wallet, to.q, to.r, sw, to.big === true);
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
): Promise<StepResult> {
  // Волна 1. Оба ответа обычно из памяти: сёстры живут минуту, активная
  // карта — сорок пять секунд (и сбрасывается, когда админ её меняет).
  const account = await raidOwner(wallet);
  // Ходим по карте ИГРОКА (мультикарта). Пока все на активной — она же.
  const mapId = await playerMapId(account);
  sw.lap("кто и карта");

  // Волна 2. Независимые вопросы разом. Цель спрашиваем ОДНИМ запросом
  // (step-facts): проходимость, вода, цена и причал — про одну и ту же клетку,
  // и ходить за ними по очереди было дороже всего остального шага. Тормоз
  // частоты едет в той же волне: шаг он не задерживает, а отказ — до денег.
  const [ride, slowExtra, facts, heroPower] = await Promise.all([
    loadRide(wallet, mapId),
    slowExtraCost(account),
    loadStepFacts(mapId, q, r),
    loadHeroPower(wallet).catch(() => null),
    // Нужен только на первый выход игрока на карту, но из кэша и бесплатен —
    // зато сохраняет прежний отказ «Карта не найдена» на битой настройке.
    mapSizeOf(mapId),
    stepRateGate(account),
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

  if (!areNeighbors(currentPos.q, currentPos.r, q, r)) {
    throw new Error("Можно ходить только на соседние клетки");
  }
  // Второе условие для типов: без клетки stepBlockedReason уже отказал бы.
  const blocked = stepBlockedReason(facts, wallet);
  if (blocked || !facts) throw new Error(blocked ?? "Здесь нет местности — пройти нельзя");
  const target = facts;

  // Игрок на корабле управляет судном: по воде плывём за фиксированную цену
  // и тащим корабль за собой, на сушу — сходим по цене самой клетки, и судно
  // остаётся на последней водной клетке.
  const big = !!ship && ship.kind === "big";
  const sailing = !!ship && target.water;
  // Океан — глубокая вода: обычному кораблю туда хода нет, идёт только большой.
  // Ключ словаря, а не русская строка: игрок прочтёт на своём языке.
  if (sailing && target.ocean && !big) throw new Error("braid.ship_too_small");

  // Шаг на свободное судно и есть посадка — но ТОЛЬКО на воде. Раньше воду не
  // спрашивали, и клетка суши с обмелевшим кораблём работала причалом: шаг на
  // неё стоил как посадка, игрок оказывался «на борту» на суше и следующим
  // шагом сводил судно с суши на воду.
  const berth = target.berth;
  const free = berth ? berth.ships - berth.busy : 0;
  let boarding = false;
  if (target.water && !ship) {
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
  const moveCost = stepEnergyCost({
    boarding,
    sailing,
    // Большой корабль гребёт дешевле; на посадку и сушу вид судна не влияет.
    bigShip: big,
    cellCost: boarding || sailing ? undefined : target.cost,
    slowExtra,
    heroStepDiscountPct: heroPower?.field.stepDiscountPct,
  });

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
        cost: stepSatietyCost({ water: target.water, ocean: target.ocean }),
      }
    : undefined;
  const guard = { from: currentPos, wallet, cost: moveCost, op: nanoid(16), satiety };
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

/** Остаток энергии, если оператор шага его не вернул (запасной путь). */
async function energyNow(wallet: string): Promise<number> {
  const { data } = await sb.rpc("compute_energy", { p_wallet: wallet });
  return Number((data as Array<{ energy_now: number }> | null)?.[0]?.energy_now ?? 0);
}

/**
 * Шкала сытости после шага — для ответа клиенту. Перешли через ноль — голод
 * начался или кончился: кэш силы героя сбрасываем, иначе — правим шкалу в нём.
 */
function stepSatiety(
  wallet: string,
  hero: Awaited<ReturnType<typeof loadHeroPower>>,
  raw: number | null,
): Satiety | null {
  if (!hero || raw == null) return null;
  const now = satietyNow(raw, hero.satiety.max);
  const next = { now, max: hero.satiety.max, hungry: now <= 0 };
  if (next.hungry !== hero.satiety.hungry) invalidateHeroPower(wallet);
  else hero.satiety = next;
  return next;
}
