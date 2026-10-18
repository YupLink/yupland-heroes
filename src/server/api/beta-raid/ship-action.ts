// Что можно делать с кораблями: спустить с верфи, занять, сойти на берег.
// Корабль — общий транспорт: свободный занимает любой, кто подошёл. Занятость
// не хранится флагом, а вытекает из позиции: занят тот корабль, на клетке
// которого стоит игрок. Иначе судно осталось бы «занятым» навсегда, стоило
// хозяину уйти с борта пешком.
//
// Здесь — только обёртки и спуск с верфи. Сама посадка и сход живут в
// ship-ride.ts: их логику надо звать и мимо HTTP (замер, будущие сценарии), а
// createServerFn такого входа не даёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, ownCell, requireAdjacent, type Cell } from "./encounter-where";
import { canIgnoreVoid, requireNotVoid } from "./voidGate";
import { raidOwner } from "./owner";
import { loadCellBuilding } from "./building-action";
import { buildingEffect, isBuilt, shipPriceFor } from "@/lib/buildingEffect";
import {
  SHIPYARD_TIER_SMALL,
  SHIPYARD_TIER_BIG,
  BIG_SHIP_WOOD,
  BIG_SHIP_ITEM_NAME,
} from "@/lib/shipRules";
import { freeWaterAround, visibleShipCells } from "./ships";
import { shipBroken, shipMaxHp } from "@/lib/shipHealth";
import { loadAshore } from "./ship-ashore";
import { boardShipCore, leaveShipCore } from "./ship-ride";
import { myShip } from "./ship-crew";
import { selectedHero } from "./hero-current";
import { publishRaid } from "../../raidLive";

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Спуск: клетка верфи + вид судна (обычный по умолчанию). */
const createShipInput = (d: unknown) =>
  z
    .object({
      q: z.number().int(),
      r: z.number().int(),
      kind: z.enum(["small", "big"]).default("small"),
    })
    .parse(d);

/** Ключ товара-цены большого корабля («Молоток») — ищем по названию в БД. */
async function bigShipItemKey(): Promise<string> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_custom_item WHERE name ILIKE ${sqlStr(BIG_SHIP_ITEM_NAME)}
      ORDER BY created_at LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  const id = rows?.[0]?.id;
  if (!id) throw new Error(`Товар «${BIG_SHIP_ITEM_NAME}» не настроен в маркете`);
  return `custom:${id}`;
}

/**
 * Кто мы и где играем. Оба ответа обычно из памяти процесса: аккаунт и активная
 * карта кэшируются, поэтому шапка каждой кнопки корабля стоит ноль сетевых
 * рейсов, а не три подряд.
 */
async function rideContext(): Promise<{ wallet: string; account: string; mapId: string }> {
  const wallet = await requireBetaRaid();
  const [account, mapId] = await Promise.all([raidOwner(wallet), myMapId(wallet)]);
  return { wallet, account, mapId };
}

/** Клетка СВОЕГО кошелька — читать и писать позицию обязан один и тот же. */
async function myCell(wallet: string): Promise<Cell> {
  const pos = await ownCell(wallet);
  if (!pos) throw new Error("Ты ещё не на карте");
  return pos;
}

/** Причалы: сколько судов на клетке, сколько занято экипажем и есть ли своё. */
export const getBetaRaidShips = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const mapId = await myMapId(wallet);
  // Разбитые >2 суток корабли снимаем с карты (ленивая уборка, раз в минуту).
  const { sweepBrokenShips } = await import("./ship-sweep");
  await sweepBrokenShips(mapId).catch(() => {});
  // Своё судно и его ВИД — по записи экипажа (одно на аккаунт). Нужен отдельно
  // от cell-`big`: на клетке рядом со своим малым может стоять чужой большой, и
  // «я на большом» нельзя выводить из bool_or по клетке — иначе клиент покажет
  // океан-маршрут и цену 2, а сервер (по моему судну) откажет/спишет 3.
  // Читается живьём и РАНЬШЕ причалов: по нему кэш причалов узнаёт, что его
  // снимок снят до моего гребка (ship-berths-fresh.ts). Упало чтение — падает
  // весь запрос, а не «сверять нечего»: снимок, снятый до моего хода, нельзя
  // отдавать как правду, а react-query на ошибке оставит игроку прежние
  // (оптимистично верные) причалы и повторит запрос.
  const [account, my] = await Promise.all([raidOwner(wallet), myShip(wallet, mapId)]);
  // Причалы в глухом тумане игроку не показываем: корабль бывает только на
  // воде, и один этот значок раскрывал бы местность за стеной.
  const cells = await visibleShipCells(mapId, canIgnoreVoid(wallet), account, my);
  const ships = cells.map((c) => {
    const busy = Math.min(c.busy, c.ships);
    // Разрушено то, у чего кончился запас хода и на борту никого: пока капитан
    // не сошёл, судно ещё на ходу («дай доехать до берега»).
    const broken = c.fleet.filter((f) => shipBroken(f.hp, !!f.crew)).length;
    const mineShip = c.fleet.find((f) => f.crew === account) ?? null;
    const freeShips = c.fleet.filter((f) => !f.crew && f.hp > 0);
    // Полоску рисуем по тому борту, чей арт виден: свой → свободный (самый
    // целый) → занятый → разрушенный.
    const shown =
      mineShip ??
      (c.water ? (freeShips.sort((a, b) => b.hp - a.hp)[0] ?? null) : null) ??
      c.fleet.find((f) => f.crew) ??
      c.fleet[0] ??
      null;
    return {
      q: c.q,
      r: c.r,
      total: c.ships,
      busy,
      // На суше свободных нет: сесть туда сервер не пустит, и обещать посадку
      // клиенту нельзя — он посчитал бы цену посадки, а списалась бы другая.
      // Разрушенные тоже не в счёт: на них не сядешь, пока не починят.
      free: c.water ? freeShips.length : 0,
      broken,
      // Своё судно — то, где записан аккаунт игрока.
      mine: c.crew.includes(account),
      // Большой корабль на клетке — карта рисует его отдельным артом.
      big: c.big,
      // Свободный ЦЕЛЫЙ большой — в него сядет посадка (seatOnShip берёт большой
      // первым). Только он открывает маршруту океан: занятый или разбитый
      // большой рядом с малым вёл игрока в океан на малом (жалоба 03.10).
      freeBig: c.water && freeShips.some((f) => f.kind === "big"),
      // МОЁ судно большое (для океана и цены гребка), а не «на клетке есть большой».
      mineBig: !!my && my.q === c.q && my.r === c.r && my.kind === "big",
      // Запас хода видимого борта — для полоски под кораблём.
      hp: shown?.hp ?? 0,
      hpMax: shipMaxHp(shown?.kind ?? "small"),
    };
  });
  return { ships };
});

/**
 * Куда сойдём с борта и почём. Считает тот же запрос, что и сам сход
 * (ship-ashore.loadAshore), поэтому кнопка в окне корабля показывает ровно то,
 * что спишет сервер.
 *
 * Отдельный запрос, а НЕ поле в причалах: причалы перезапрашиваются на каждый
 * шаг по воде (и на каждое чужое судно в живом потоке), а цена схода нужна
 * ровно одному окну корабля. В общем ответе она стоила бы похода в базу на
 * каждый гребок — тринадцать морских клеток набирали под сотню запросов.
 */
export const getShipAshore = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, mapId } = await rideContext();
  const ashore = await loadAshore(mapId, wallet, canIgnoreVoid(wallet));
  return ashore.cell && ashore.ship ? ashore.land : null;
});

/**
 * Спустить корабль с верфи. Обычный (small) — со 2-го тира верфи, платит
 * лайками. Большой (big) — с 3-го тира, платит деревом и товаром «Молоток»,
 * ходит по океану; расу/специализацию не смотрит. Обычный на 3-м тире тоже
 * остаётся доступен.
 */
export const createShip = createServerFn({ method: "POST" })
  .inputValidator(createShipInput)
  .handler(async ({ data }) => {
    const big = data.kind === "big";
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const pos = await myCell(wallet);
    requireAdjacent(pos, data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (buildingEffect(b.meta, b.name) !== "shipyard") throw new Error("Это не верфь");
    // Пороги тира, а не «достроена»: обычный со 2-го тира, большой с 3-го. Но
    // если верфь достроена по-старому (последний тир — напр. одно-тирная), обычный
    // корабль обязан остаться доступным, чтобы апгрейд-порог не был регрессией.
    if (big) {
      if (b.tier < SHIPYARD_TIER_BIG) throw new Error("Большой корабль строит только верфь 3 тира");
    } else if (!isBuilt(b.tier, b.tiers.length) && b.tier < SHIPYARD_TIER_SMALL) {
      throw new Error("Верфь ещё не достроена");
    }

    // Большому нужна ЛЮБАЯ свободная вода (в т.ч. океан), обычному — не океан.
    const water = await freeWaterAround(mapId, data.q, data.r, canIgnoreVoid(wallet), data.kind);
    if (!water) throw new Error("Рядом с верфью нет воды");

    const hero = await selectedHero(wallet);
    // Цена лайками — только у обычного; большой платит ресурсами (ниже).
    const amount = big ? 0 : shipPriceFor(hero?.spec ?? null);
    const owner = await raidOwner(wallet);
    const id = `ship_${nanoid(10)}`;

    // Сначала место, потом деньги: если вставка не удалась, ничего не спишем.
    // Уникальности по клетке больше нет — у причала может стоять целый флот.
    const rows = (await mcpExec(
      // Новое судно спускается с полным запасом хода — у большого он вдвое.
      `INSERT INTO yuplink.beta_raid_ship (id, map_id, q, r, owner, kind, hp)
       VALUES (${sqlStr(id)}, ${sqlStr(mapId)}, ${water.q}, ${water.r}, ${sqlStr(owner)},
               ${sqlStr(data.kind)}, ${shipMaxHp(data.kind === "big" ? "big" : "small")})
       RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!rows?.[0]?.id) throw new Error("Корабль не удалось спустить");

    try {
      if (big) {
        // Дерево со счёта + товар «Молоток» из рюкзака героя, с откатом при сбое.
        const { payResources } = await import("./resource-pay");
        const itemKey = await bigShipItemKey();
        await payResources(
          wallet,
          [
            { resource: "wood", amount: BIG_SHIP_WOOD },
            { resource: "item", amount: 1, itemKey, itemName: BIG_SHIP_ITEM_NAME },
          ],
          `ship:${id}`,
        );
      } else {
        const { payBuildPrice } = await import("./building-pay");
        await payBuildPrice(wallet, { kind: "likes", amount }, `ship:${id}`);
      }
    } catch (e) {
      // Оплата не прошла — корабль убираем, иначе он достался бы даром.
      await mcpExec(`DELETE FROM yuplink.beta_raid_ship WHERE id = ${sqlStr(id)};`, {
        wrapJson: false,
      });
      throw e;
    }

    publishRaid({ mapId, type: "ships" });
    return { ok: true as const, q: water.q, r: water.r, paid: amount, kind: data.kind };
  });

/** Занять свободный корабль: герой перебирается на борт. */
export const boardShip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), shipId: z.string().nullish() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account, mapId } = await rideContext();
    return boardShipCore(wallet, account, mapId, data.q, data.r, data.shipId ?? null);
  });

/** Сойти на берег: корабль снова свободен, герой — на ближайшей суше. */
export const leaveShip = createServerFn({ method: "POST" }).handler(async () => {
  const { wallet, account, mapId } = await rideContext();
  return leaveShipCore(wallet, account, mapId);
});
