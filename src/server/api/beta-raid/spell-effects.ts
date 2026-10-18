// Что заклинание ДЕЛАЕТ: бусты героя и технические эффекты — призыв
// корабля, перенос к замку и спуск нового корабля (spell-create-ship.ts).
//
// Своей механики карты здесь нет и быть не должно: корабль занимает тот же
// CAS, что и посадка у причала (seatOnShip), а перенос идёт тем же путём, что
// и портал (movePlayerThroughPortal) — он умеет ссаживать с судна, выводить с
// воды на берег и не оставлять игрока в море без лодки.
//
// Порядок внутри каста жёсткий: сначала ТЕХНИЧЕСКАЯ часть (она умеет отказать
// — нет свободного судна, некуда встать), и только потом бусты. Наоборот было
// бы так: бонус повесили, корабль не пришёл, энергию вернули — а бонус висит.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { raidOwner } from "./owner";
import { myMapId, ownCell, type Cell } from "./encounter-where";
import { hexDistance } from "./helpers";
import { freeWaterAround } from "./ships";
import { myShip, releaseShip, seatOnShip } from "./ship-crew";
import { freeShipsNear } from "./spell-ship-spots";
import { createShipNearHero } from "./spell-create-ship";
import { teleportHome } from "./spell-teleport-home";
import { repairShipNearHero } from "./spell-repair-ship";
import { applyBoostRoll } from "./hero-buff";
import { rollBoostEffect, type BoostRoll } from "@/lib/hero/boost";
import type { SpellTpl } from "./spell-tpl";

export type SpellRoll = BoostRoll;

export type SpellEffectResult =
  | {
      ok: true;
      rolls: SpellRoll[];
      /** Куда переехал ГЕРОЙ (перенос к замку). */
      moved: Cell | null;
      /** Куда пришёл КОРАБЛЬ (призыв), где спущен новый или какой починен. */
      ship: { id: string; q: number; r: number } | null;
      /** Перенос в другой мир (телепорт домой с этажа): клиент перекачивает карту. */
      map?: string | null;
    }
  | { ok: false; reasonKey: string; reasonParams?: Record<string, string | number> };

/**
 * Призыв корабля к герою.
 *
 * Порядок нарушать нельзя: сначала ЗАНЯТЬ судно (seatOnShip — CAS с FOR UPDATE
 * SKIP LOCKED), и только потом двигать. Читать «свободен» и писать координаты
 * двумя запросами значит отдать судно тому, кто нажал на секунду позже.
 *
 * Пришедший корабль снова СВОБОДЕН: экипаж снимаем, герой садится обычной
 * кнопкой у причала. Запись экипажа на стоящего на суше героя сломала бы шаг —
 * он ходит ногами, а судно считалось бы под ним. Снятие живёт в finally:
 * между посадкой и высадкой есть незакрытые await, и брошенный на них запрос
 * оставлял судно вечно занятым.
 */
async function callShipToHero(wallet: string): Promise<SpellEffectResult> {
  const mapId = await myMapId(wallet);
  const pos = await ownCell(wallet).catch(() => null);
  if (!pos) return { ok: false, reasonKey: "spell.not_on_map" };
  // Своё судно уже есть: звать второе некуда — на одном игроке один экипаж.
  if (await myShip(wallet, mapId)) return { ok: false, reasonKey: "spell.already_on_ship" };

  const candidates = await freeShipsNear(mapId, pos, 5);
  if (candidates.length === 0) return { ok: false, reasonKey: "spell.no_ship" };

  for (const cand of candidates) {
    // Занимаем ИМЕННО кандидата, по id. У причала бывает флот, и «первый
    // свободный на клетке» мог оказаться бортом, который freeShipsNear нарочно
    // не отдал (только что починен — рядом стоит тот, кто чинил).
    const seized = await seatOnShip(wallet, mapId, cand.q, cand.r, false, cand.id);
    // Увели между запросами — берём следующего по дальности.
    if (!seized) continue;
    // ⚠️ С этой секунды судно числится за игроком, и БРОСОК ЛЮБОГО из запросов
    // ниже оставил бы борт занятым насовсем: он стоит в другом конце карты,
    // сесть в него не может никто, включая самого игрока. Поэтому высадка —
    // в finally, а не строчкой перед каждым return.
    try {
      // Свободный корабль и так рядом — везти нечего. Это именно ОТКАЗ: иначе
      // игрок платит сотню энергии и четыре часа отката за судно, до которого
      // дошёл бы ногами. На отказе каст вернёт и энергию, и откат.
      if (hexDistance(cand.q, cand.r, pos.q, pos.r) <= 1) {
        return { ok: false, reasonKey: "spell.ship_already_near" };
      }
      // Малому кораблю океан заказан — вид судна решает, какая вода подойдёт.
      const kind = seized.big ? "big" : "small";
      // Корабли в клетке не мешают (владелец, 27.09) — пустая вода первой.
      const spot = await freeWaterAround(mapId, pos.q, pos.r, false, kind);
      if (!spot) return { ok: false, reasonKey: "spell.no_water_near" };

      const acc = sqlStr(await raidOwner(wallet));
      const moved = (await mcpExec(
        `UPDATE yuplink.beta_raid_ship s
            SET q = ${spot.q}, r = ${spot.r}, updated_at = now()
          WHERE s.id = ${sqlStr(seized.id)} AND s.crew_account = ${acc}
          RETURNING s.id;`,
        { wrapJsonCte: true },
      ).catch(() => [])) as Array<{ id: string }>;
      if (!moved?.length) return { ok: false, reasonKey: "spell.no_water_near" };
      // Журнала призывов нет, а «корабль исчез» без него не разобрать: пишем,
      // какой борт, откуда и куда уехал и кто позвал.
      console.log(
        `[summon-ship] ${seized.id} (${cand.q},${cand.r}) → (${spot.q},${spot.r}) by ${wallet}`,
      );
      // Причал изменился у всех — соседи должны увидеть корабль на новом месте.
      publishRaid({ mapId, type: "ships" });
      return { ok: true, rolls: [], moved: null, ship: { id: seized.id, q: spot.q, r: spot.r } };
    } finally {
      // Пришедший корабль снова СВОБОДЕН: экипаж снимаем всегда — и на успехе,
      // и на отказе, и на исключении.
      await releaseShip(wallet).catch(() => {});
    }
  }
  return { ok: false, reasonKey: "spell.no_ship" };
}

/**
 * Применить заклинание целиком. Техническая часть решает, состоялся ли каст;
 * бусты вешаются последними — уже после того, как отказать некому.
 *
 * ⚠️ ЧАСТИЧНО ПРИЛЕТЕВШЕЕ НЕ ОТМЕНЯЕТСЯ. Бафф вешается отдельной записью, и
 * упади второй из трёх — первый уже висит. Прежде исключение улетало наверх,
 * каст считался сорванным и возвращал энергию: бонус даром. Теперь сорвавшийся
 * бафф не роняет каст — прилетело меньше обещанного, зато за деньги. Отказ
 * (с возвратом энергии и снятием отката) остаётся только там, где не легло
 * НИЧЕГО: ни корабля, ни переноса, ни одной прибавки.
 */
export async function applySpellEffects(wallet: string, tpl: SpellTpl): Promise<SpellEffectResult> {
  let head: SpellEffectResult = { ok: true, rolls: [], moved: null, ship: null };
  if (tpl.kind === "summon_ship") head = await callShipToHero(wallet);
  else if (tpl.kind === "teleport_town") {
    const t = await teleportHome(wallet);
    head = t.ok ? { ok: true, rolls: [], moved: t.moved, ship: null, map: t.map } : t;
  }
  else if (tpl.kind === "create_ship") head = await createShipNearHero(wallet);
  else if (tpl.kind === "repair_ship") head = await repairShipNearHero(wallet);
  if (!head.ok) return head;

  const rolls = tpl.effects.map(rollBoostEffect);
  const landed: SpellRoll[] = [];
  for (const roll of rolls) {
    try {
      await applyBoostRoll(wallet, roll);
      landed.push(roll);
    } catch (e) {
      console.error("[spell] бафф не лёг:", tpl.id, roll.stat, e);
    }
  }
  // Техническая часть уже случилась (корабль пришёл, героя перенесло) — каст
  // состоялся, что бы ни стало с прибавками.
  const didSomething = head.ship !== null || head.moved !== null || landed.length > 0;
  if (!didSomething && rolls.length > 0) return { ok: false, reasonKey: "spell.failed" };
  return { ...head, rolls: landed };
}
