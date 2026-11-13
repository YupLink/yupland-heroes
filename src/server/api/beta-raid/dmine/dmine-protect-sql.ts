// «Защита на час» гриба: вызов функции базы raid_mushroom_protect (migrations/
// mushroom-04) и её отказы — ключами словаря. Чистые функции без базы: текст
// вызова, разбор ответа и ошибки гоняют тесты.
import { sqlStr } from "@/server/api/raid-shared";
import { ripeAtMs } from "@/lib/mushroomRipe";

/** Ключ ручной посадки — тот же, что кладёт «Посадить» (dmine-place). */
export const placeOpKey = (account: string, op: string): string => `dmplace:${account}:${op}`;

export type DmineProtectAt = {
  /** Ключ посадки (placeOpKey): защищается только эта посадка. */
  placeOp: string;
  account: string;
  wallet: string;
  /** Энергия «Защиты на час» (MUSHROOM_PROTECT_ENERGY). */
  cost: number;
};

/** Итог: повтор (защита уже стоит), до какой минуты созревает, сколько списано, клетка. */
export type DmineProtectRes = {
  was: boolean;
  ripeAt: number | null;
  paid: number;
  q: number;
  r: number;
};

export function protectDmineSql(o: DmineProtectAt): string {
  const cost = Number.isFinite(o.cost) ? Math.max(0, Math.floor(o.cost)) : 0;
  return `SELECT yuplink.raid_mushroom_protect(${sqlStr(o.placeOp)}, ${sqlStr(o.account)},
            ${sqlStr(o.wallet)}, ${cost}) AS res`;
}

/** Защита этой посадки до запроса: стоит ли уже (ripeAt не пуст) и где гриб. */
export const protectStateSql = (placeOp: string): string =>
  `SELECT d.ripe_at AS "ripeAt", o.q, o.r
     FROM yuplink.raid_dmine_op o
     JOIN yuplink.raid_dmine d ON d.id = o.dmine_id
    WHERE o.op = ${sqlStr(placeOp)} AND o.kind = 'place'
    LIMIT 1`;

/** Ответ базы (jsonb объектом или строкой) → итог; не разобрали — null. */
export function protectResOf(rows: unknown, now = Date.now()): DmineProtectRes | null {
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
  const o = res as { was?: unknown; ripeAt?: unknown; paid?: unknown; q?: unknown; r?: unknown };
  if (o.ripeAt == null) return null;
  return {
    was: o.was === true,
    ripeAt: ripeAtMs(o.ripeAt, now),
    paid: Number(o.paid) || 0,
    q: Number(o.q) || 0,
    r: Number(o.r) || 0,
  };
}

/** Исключение функции базы → текст для игрока (ключ словаря); незнакомое — как есть. */
export function protectErrorOf(e: unknown, cost: number): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not_enough_energy/.test(msg)) {
    return new Error(`mineplace.no_energy|${JSON.stringify({ need: cost })}`);
  }
  if (/dmine_protect_late/.test(msg)) return new Error("dmine.protect_late");
  if (/dmine_protect_gone/.test(msg)) return new Error("dmine.gone");
  return e instanceof Error ? e : new Error(msg);
}
