// «Создать корабль» (вид create_ship): новый малый борт на воде рядом с героем.
//
// Вынесено из spell-effects.ts (правило ≤250 строк). Механика своя не
// придумана: вставка — как у верфи (ship-action.createShip), поиск воды — тот
// же freeWaterAround. Корабль в клетке спуску не мешает (владелец, 27.09).
//
// Про деньги. Каст (spell-cast.ts) списывает энергию ДО этой функции, а на
// ok:false и на исключении возвращает энергию и снимает откат. Значит, здесь
// порядок обратный верфи: деньги уже взяты, и после удачной вставки отказывать
// или бросать нельзя ни при каких сбоях — иначе игрок получил бы и корабль, и
// энергию назад. Всё, что после INSERT, обёрнуто и не роняет результат.
// Два нажатия подряд второй раз не платят и не строят: их разводят ключ
// нажатия (claimBoostOp) и CAS отката (takeCooldown) ещё до списания.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { raidOwner } from "./owner";
import { myMapId, ownCell } from "./encounter-where";
import { freeWaterAround } from "./ships";
import { canIgnoreVoid, isVoidCellLive } from "./voidGate";
import { shipMaxHp } from "@/lib/shipHealth";
import type { SpellEffectResult } from "./spell-effects";

/** Есть ли уже строка с этим id — ответ на «вставка прошла, а ответ потерялся». */
async function shipExists(id: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.beta_raid_ship WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return (rows?.length ?? 0) > 0;
}

/**
 * Вставить судно. Соседние корабли в клетке не мешают — у причала флот.
 *
 * ⚠️ «Ноль строк» НЕ значит «не вставилось». Мост повторяет запрос вслепую
 * (mcpClient, контракт ретрая): первая попытка легла, ответ потерялся, а
 * повтор упирается в ON CONFLICT по НАШЕМУ же id и честно отдаёт пусто.
 * Прочитав это как отказ, каст вернул бы энергию и откат за стоящий корабль.
 * Поэтому и на пустом ответе, и на исключении спрашиваем по id. Не можем узнать и этого — убираем возможную строку (id
 * наш, nanoid: чужую не заденет), чтобы отказ с возвратом энергии не оставил
 * его даром. Борт с экипажем не снимаем — игрока в воде без лодки не бросаем:
 * в этом редчайшем случае (база не ответила дважды) корабль остаётся даром.
 */
async function insertShip(
  id: string,
  mapId: string,
  owner: string,
  spot: { q: number; r: number },
): Promise<boolean> {
  let failure: unknown = null;
  try {
    const rows = (await mcpExec(
      `INSERT INTO yuplink.beta_raid_ship (id, map_id, q, r, owner, kind, hp)
       VALUES (${sqlStr(id)}, ${sqlStr(mapId)}, ${spot.q}, ${spot.r}, ${sqlStr(owner)},
               'small', ${shipMaxHp("small")})
       ON CONFLICT (id) DO NOTHING
       RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (rows?.[0]?.id) return true;
  } catch (e) {
    failure = e;
  }
  const landed = await shipExists(id).catch(() => null);
  if (landed === true) return true;
  if (landed === false) return false;
  const gone = (await mcpExec(
    `DELETE FROM yuplink.beta_raid_ship WHERE id = ${sqlStr(id)} AND crew_account IS NULL
     RETURNING id;`,
    { wrapJsonCte: true },
  ).catch(() => null)) as Array<{ id: string }> | null;
  console.error("[create-ship] исход вставки неизвестен, строка снята:", id, gone?.length ?? "?");
  throw failure ?? new Error("create-ship: исход вставки неизвестен");
}

/**
 * Спустить новый малый корабль рядом с героем.
 *
 * Корабль спускается СВОБОДНЫМ, как с верфи: экипаж не пишем, садится игрок
 * обычной кнопкой. Запись экипажа на стоящего на суше героя сломала бы шаг —
 * он ходит ногами, а судно считалось бы под ним (см. призыв).
 *
 * Малый — потому что океан ему заказан: и вода ищется «не океан», и запас
 * хода полный малый. Большой строится только верфью за дерево и «Молоток».
 */
export async function createShipNearHero(wallet: string): Promise<SpellEffectResult> {
  const mapId = await myMapId(wallet);
  const pos = await ownCell(wallet).catch(() => null);
  if (!pos) return { ok: false, reasonKey: "spell.not_on_map" };
  // Туман решает одно место на весь рейд (voidGate): админу стена не преграда,
  // как и у верфи. Игрок из-под купола корабль не спускает — вода вокруг него
  // и так скрыта, а новый борт раскрыл бы местность за стеной.
  const bypass = canIgnoreVoid(wallet);
  if (!bypass && (await isVoidCellLive(mapId, pos.q, pos.r))) {
    return { ok: false, reasonKey: "braid.void_blocked" };
  }

  const spot = await freeWaterAround(mapId, pos.q, pos.r, bypass, "small");
  if (!spot) return { ok: false, reasonKey: "spell.no_water_near" };

  const id = `ship_${nanoid(10)}`;
  const owner = await raidOwner(wallet);
  if (!(await insertShip(id, mapId, owner, spot))) {
    return { ok: false, reasonKey: "spell.no_water_near" };
  }

  // ⚠️ С этой строки корабль уже стоит и оплачен: ни отказ, ни исключение
  // отсюда не выпускаем — каст вернул бы энергию за спущенное судно.
  try {
    // Журнала спусков заклинанием нет, а «откуда взялся корабль» без него не
    // разобрать: пишем какой борт, где и кто создал.
    console.log(`[create-ship] ${id} → (${spot.q},${spot.r}) on ${mapId} by ${wallet}`);
    // Причалы изменились у всех — соседи должны увидеть новый корабль.
    publishRaid({ mapId, type: "ships" });
  } catch (e) {
    console.error("[create-ship] публикация сорвалась:", id, e);
  }
  return { ok: true, rolls: [], moved: null, ship: { id, q: spot.q, r: spot.r } };
}
