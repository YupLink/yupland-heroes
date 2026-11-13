// Замок шахтёра в базе (lib/mineWard.ts, migrations/mineward-01-lock.sql).
// Живой замок — срок не вышел И шахтой владеет тот, кто его поставил, с того же
// владения (owner_since = captured_at): смена хозяина (поломка, разборка, снос,
// захват после срока) гасит замок навсегда, даже если шахта вернулась к нему.
import { sqlStr } from "@/server/api/raid-shared";

type Cell = { mapId: string; q: number; r: number };

const where = (o: Cell) =>
  `w.map_id = ${sqlStr(o.mapId)} AND w.q = ${Math.floor(o.q)} AND w.r = ${Math.floor(o.r)}`;

const live = `w.until > now() AND w.account_id = s.owner_account AND w.owner_since = s.captured_at`;

const fromWard = `FROM yuplink.raid_mine_ward w
  JOIN yuplink.raid_mine_state s ON s.map_id = w.map_id AND s.q = w.q AND s.r = w.r`;

/** Условие «на шахте живой замок» — для захвата (под локом шахты). */
export const wardActiveSql = (o: Cell): string =>
  `EXISTS (SELECT 1 ${fromWard} WHERE ${where(o)} AND ${live})`;

/** Сколько ещё держит живой замок, мс (wrapJson); нет — пусто. */
export const wardLeftSql = (o: Cell): string =>
  `SELECT (extract(epoch FROM (w.until - now())) * 1000)::float8 AS "leftMs"
     ${fromWard} WHERE ${where(o)} AND ${live} LIMIT 1;`;

/** Поставить замок одним вызовом функции базы (энергия и строка — вместе). */
export function wardPutSql(
  o: Cell & { op: string; account: string; buildingId: string; energy: number; hours: number },
): string {
  const energy = Math.max(0, Number(o.energy) || 0);
  return `SELECT yuplink.raid_mine_ward_put(${sqlStr(o.op)}, ${sqlStr(o.mapId)},
            ${Math.floor(o.q)}, ${Math.floor(o.r)}, ${sqlStr(o.account)}, ${sqlStr(o.buildingId)},
            ${energy}::numeric, ${Number(o.hours)}::numeric) AS res;`;
}
