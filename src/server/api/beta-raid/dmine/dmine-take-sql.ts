// «Забрать» гриб: вызов функции базы raid_dmine_take (migrations/mushroom-04,
// прежние редакции — minebag-01/02, mushroom-01/03) и её отказы — ключами словаря
// для игрока. Чистые функции без базы: текст вызова и разбор ошибки гоняют тесты.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { DMINE_ITEM_NAME } from "@/lib/daraiMine";

export type DmineTakeAt = {
  op: string;
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
  /** Ёмкость рюкзака в ячейках (resolveBackpack). */
  capacity: number;
  /** Энергия «Забрать» (MUSHROOM_ENERGY). */
  cost: number;
  /** Подпись стопки вида в базе (MUSHROOM_ITEM_NAMES); нет — гриб DARAI. */
  name?: string;
};

/** Итог вызова: повтор того же нажатия, id забранной шахты, сколько заплачено. */
export type DmineTakeRes = { was: boolean; id: string; paid: number };

const n = (v: number): string => String(Number.isFinite(v) ? Math.max(0, v) : 0);

export function takeDmineSql(o: DmineTakeAt): string {
  return `SELECT yuplink.raid_dmine_take(${sqlStr(o.op)}, ${sqlStr(o.mapId)}, ${Math.floor(o.q)},
            ${Math.floor(o.r)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)}, ${sqlStr(o.heroId)},
            ${n(o.capacity)}, ${CELL_SIZE}, ${n(o.cost)}, ${sqlStr(o.name ?? DMINE_ITEM_NAME)}) AS res`;
}

/** Ответ базы (jsonb приезжает объектом или строкой) → итог; не разобрали — null. */
export function takeResOf(rows: unknown): DmineTakeRes | null {
  const row = Array.isArray(rows) ? (rows[0] as { res?: unknown } | undefined) : undefined;
  let res = row?.res;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch {
      return null;
    }
  }
  if (!res || typeof res !== "object") return null;
  const o = res as { was?: unknown; id?: unknown; paid?: unknown };
  if (typeof o.id !== "string" || !o.id) return null;
  return { was: o.was === true, id: o.id, paid: Number(o.paid) || 0 };
}

/**
 * Исключение функции базы → текст ошибки для игрока (ключ словаря или
 * «ключ|{json}»). Незнакомое — как есть.
 */
export function takeErrorOf(e: unknown, cost: number): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not_enough_energy/.test(msg)) {
    return new Error(`mineplace.no_energy|${JSON.stringify({ need: cost })}`);
  }
  const room = /dmine_room:(\d+)/.exec(msg);
  if (room) return new Error(`market.backpack_need:1:${room[1]}`);
  if (/dmine_guarded/.test(msg)) return new Error("braid.mine_guarded");
  // Хозяин свою не поднимает; поднявший — второй раз до чужого размещения.
  if (/dmine_own/.test(msg)) return new Error("dmine.own");
  if (/dmine_once/.test(msg)) return new Error("dmine.once");
  // Созревает (защита на час, mushroom-04): «Гриб ещё не созрел», энергия цела.
  if (/dmine_unripe/.test(msg)) return new Error("dmine.unripe");
  if (/dmine_not_darai/.test(msg)) return new Error("dmine.not_darai");
  if (/dmine_gone/.test(msg)) return new Error("dmine.gone");
  return e instanceof Error ? e : new Error(msg);
}
