// Посадка на корабль и сход на берег — ядро без обёрток createServerFn.
//
// Раньше обе кнопки были цепочками: каждый следующий вопрос ждал ответа на
// предыдущий, ни одного Promise.all. Сход набирал семь-девять сетевых рейсов
// подряд (около секунды на нажатие при шаге по карте в 536 мс), посадка —
// восемь, причём три из них лишние целиком: судно искали по координатам, из
// которых его и спрашивали, а причалы тянули по ВСЕЙ карте ради одной клетки.
//
// Теперь обе идут волнами, ровно как шаг по карте (move-step.performStep):
//   1. кто мы и какая карта — из памяти процесса;
//   2. всё, что друг о друге не знает, одним Promise.all;
//   3. посадка занимает конкретное судно — до денег, чтобы двое не сели на
//      один борт; сход списывает деньги и снимает запись об экипаже;
//   4. запись новой клетки.
//
// Цены НЕ менялись: посадка стоит фиксированно, сход — по цене самой дешёвой
// соседней суши, замедление и скидка героя считаются той же stepEnergyCost, что
// и шаг по карте. Цена, показанная в окне корабля (getShipAshore), приезжает из
// того же запроса, что и списанная.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { sb } from "../../db/pg";
import { publishRaid } from "../../raidLive";
import { stepEnergyCost } from "@/lib/shipRules";
import { ownCell } from "./encounter-where";
import { areNeighbors } from "./helpers";
import { slowExtraCost } from "./encounter-effects";
import { loadHeroPower } from "./hero-power";
import { loadStepFacts, stepBlockedReason } from "./step-facts";
import { canIgnoreVoid } from "./voidGate";
import { loadAshore } from "./ship-ashore";
import { applyStep, chargeShipHp, myShip, releaseShip, seatOnShip } from "./ship-crew";
import { SHIP_BOARD_HP } from "@/lib/shipHealth";
import { isWaterCell } from "./ship-move";
import { raidOwner } from "./owner";
import { noteEnergySpend } from "./econ/energy-note";

export type RideResult = {
  ok: true;
  q: number;
  r: number;
  spent: number;
  /** Вид посаженного судна: клиент сразу правит `mineBig` в кэше причалов. */
  big?: boolean;
};

/** Деньги вперёд товара: не хватило энергии — никто никуда не поехал. */
async function spendEnergy(wallet: string, cost: number): Promise<void> {
  const { error } = await sb.rpc("touch_energy_atomic", { p_wallet: wallet, p_spend: cost });
  if (!error) return;
  if (String(error.message).includes("not_enough_energy")) {
    throw new Error(`Недостаточно энергии (нужно ${cost})`);
  }
  throw new Error(error.message);
}

/**
 * Клетка СВОЕГО кошелька: читать и писать позицию обязан один и тот же. Пишет
 * свою строку, а проверялась аккаунтная — сестрой B звалась посадка с другого
 * конца карты, строка B переезжала к A, и гейт замка потом пропускал её как
 * «стоящую у замка». Тот же принцип, что в move.ts.
 */
async function setPlayerCell(wallet: string, mapId: string, q: number, r: number): Promise<void> {
  const { raidOwner } = await import("./owner");
  // Карта — та, где стоит судно: позиция без карты читалась бы главным миром.
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_positions (account_id, q, r, updated_at, map_id)
     VALUES (${sqlStr(await raidOwner(wallet))}, ${q}, ${r}, now(), ${sqlStr(mapId)})
     ON CONFLICT (account_id) DO UPDATE
       SET q = ${q}, r = ${r}, updated_at = now(), map_id = ${sqlStr(mapId)};`,
    { wrapJson: false },
  );
}

/**
 * Занять свободный корабль: герой перебирается на борт.
 *
 * Про целевую клетку спрашиваем ОДИН раз (loadStepFacts) — там сразу и
 * проходимость, и причал. Само место занимает seatOnShip: свободность
 * проверяется в момент записи, поэтому «свободно» из ответа сюда уже не может
 * разъехаться с тем, что достанется.
 */
export async function boardShipCore(
  wallet: string,
  account: string,
  mapId: string,
  q: number,
  r: number,
  /** Какой именно борт занять: в окне игрок выбирает из нескольких. */
  shipId?: string | null,
): Promise<RideResult> {
  const [pos, facts, slowExtra, mine] = await Promise.all([
    ownCell(wallet),
    loadStepFacts(mapId, q, r),
    slowExtraCost(account),
    myShip(wallet, mapId),
  ]);

  // Порядок отказов тот же, что был: нет позиции → не сосед → клетка занята
  // преградой → корабля нет → все заняты.
  if (!pos) throw new Error("Ты ещё не на карте");
  // Своя клетка тоже годится. Игрок мог остаться НА ВОДЕ без судна: запись об
  // экипаже снимают портал, рассинхрон в шаге и сбой оплаты — и тогда сесть
  // обратно было некуда, потому что посадка требовала соседнюю клетку. Так
  // выглядела жалоба «выкинуло из корабля, назад не пускает, герой шагает по
  // воде»: игрок стоял на борту, а сесть на него не мог.
  const sameCell = pos.q === q && pos.r === r;
  if (!sameCell && !areNeighbors(pos.q, pos.r, q, r)) {
    throw new Error("Можно ходить только на соседние клетки");
  }
  const blocked = stepBlockedReason(facts, wallet);
  if (blocked) throw new Error(blocked);
  if (mine) throw new Error("braid.already_aboard");

  const berth = facts?.berth ?? null;
  // Судно стоит на воде — иначе это не причал, а обмелевшая лодка на суше:
  // раньше шаг на такую клетку тарифицировался как посадка.
  if (!berth || !facts?.water) throw new Error("Здесь нет корабля");
  // Свободных ровно столько, сколько судов без экипажа. Сестринский кошелёк
  // из счёта больше не выбрасывается: он такой же отдельный игрок, и две
  // сестры на одном борту — это как раз то, из-за чего одна оставалась на
  // воде без лодки.
  if (berth.ships - berth.busy <= 0) throw new Error("Все корабли здесь заняты");

  // Место вперёд денег — как у верфи (createShip): не хватило энергии, бронь
  // снимаем и посадки не было вовсе. На океане сесть можно только в большой —
  // тот же гейт, что и при шаге (move-step). Вид посаженного судна возвращаем
  // клиенту: без него `mineBig` в кэше остался бы от прошлой посадки, и
  // расчёт цены гребка расходился с сервером.
  const seated = await seatOnShip(wallet, mapId, q, r, facts?.ocean, shipId);
  if (!seated) {
    throw new Error(facts?.ocean ? "braid.ship_too_small" : "Все корабли здесь заняты");
  }
  // На борт забирается судно, а не ноги: скидку героя посадка не знает.
  // Возврат на борт НА СВОЕЙ клетке бесплатен: игрок никуда не переезжает, и
  // брать с него энергию за починку чужой поломки нечестно.
  const spent = sameCell ? 0 : stepEnergyCost({ boarding: true, slowExtra });
  try {
    if (spent > 0) await spendEnergy(wallet, spent);
    await setPlayerCell(wallet, mapId, q, r);
  } catch (e) {
    await releaseShip(wallet).catch(() => {});
    throw e;
  }
  void noteEnergySpend(account, spent, "ship");
  // Запас хода снимаем ПОСЛЕ оплаты: сорвалась энергия — посадки не было, и
  // судну ничего не стоило. Возврат на свою же клетку (починка рассинхрона)
  // бесплатен и по энергии, и по запасу хода.
  if (!sameCell) await chargeShipHp(seated.id, SHIP_BOARD_HP).catch(() => {});

  publishRaid({ mapId, type: "ships" });
  // С клетками: соседи двигают точку у себя, а не перечитывают всех игроков.
  publishRaid({ mapId, type: "moved", from: { q: pos.q, r: pos.r }, to: { q, r } });
  return { ok: true, q, r, spent, big: seated.big };
}

/**
 * Сойти на берег: корабль снова свободен, герой — на ближайшей дешёвой суше.
 *
 * Позиция, своё судно и сам берег с ценой приезжают одним запросом
 * (ship-ashore.loadAshore) — тем же, которым окно корабля рисует цену, так что
 * показанное и списанное совпадают по построению.
 */
export async function leaveShipCore(
  wallet: string,
  account: string,
  mapId: string,
): Promise<RideResult> {
  const [ashore, slowExtra, hero] = await Promise.all([
    loadAshore(mapId, wallet, canIgnoreVoid(wallet)),
    slowExtraCost(account),
    loadHeroPower(wallet).catch(() => null),
  ]);

  if (!ashore.cell) throw new Error("Ты ещё не на карте");
  // Судна под ногами нет, а игрок стоит на воде — это та самая ловушка:
  // «на борту» он не числится, значит и сойти по правилам не может. Выпускаем
  // на берег обычным шагом, иначе выхода из клетки нет вовсе.
  const stranded = !ashore.ship && (await isWaterCell(mapId, ashore.cell.q, ashore.cell.r));
  if (!ashore.ship && !stranded) throw new Error("Ты не на корабле");
  if (!ashore.land) throw new Error("Рядом нет берега, куда сойти");

  // Сход — шаг ногами: скидка режет клетку вместе с замедлением (27.09).
  const spent = stepEnergyCost({
    cellCost: ashore.land.cost,
    slowExtra,
    heroStepDiscountPct: hero?.field.stepDiscountPct,
  });
  await spendEnergy(wallet, spent);
  void noteEnergySpend(account, spent, "ship");
  // Запись об экипаже и новая клетка — одним оператором. Судно при этом
  // остаётся там, где стояло: на воду оно село, на воде и живёт.
  await applyStep(wallet, mapId, ashore.land.q, ashore.land.r, "ashore");

  publishRaid({ mapId, type: "ships" });
  publishRaid({
    mapId,
    type: "moved",
    from: { q: ashore.cell.q, r: ashore.cell.r },
    to: { q: ashore.land.q, r: ashore.land.r },
  });
  return { ok: true, q: ashore.land.q, r: ashore.land.r, spent };
}
