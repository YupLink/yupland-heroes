// SQL отнятых шахт (migrations/minecap-01): сбор строки, список своих строк к
// «Собрать со всех шахт», строки для письма и тоста. Чистые функции без базы —
// текст запросов и разбор ответов гоняют тесты.
import { sqlStr } from "@/server/api/raid-shared";
import { lostKindOf, lostMushroomOf, type MineLostNote } from "@/lib/mineLost";

/** «Собрать со всех шахт» за один вызов — не больше стольких отнятых строк (остальное — следующим). */
export const LOST_CLAIM_BATCH = 200;

/** Итог «Забрать» одной строки: повтор (was) ничего не начислил. */
export type LostClaimRes = {
  was: boolean;
  amount: number;
  resource: string | null;
  token: string | null;
};

/** «Забрать» строку: своя, под локом, тем же ключом, отметка той же транзакцией. */
export const claimLostSql = (id: string, account: string, wallet: string): string =>
  `SELECT yuplink.raid_mine_lost_claim(${sqlStr(id)}, ${sqlStr(account)}, ${sqlStr(wallet)}) AS res`;

/** Свои незабранные строки к «Собрать со всех шахт» (и пустые — закрываются без денег). */
export const myLostIdsSql = (account: string): string =>
  `SELECT l.id FROM yuplink.raid_mine_capture_log l
    WHERE l.old_account = ${sqlStr(account)} AND l.claimed_at IS NULL
    ORDER BY l.seized_at
    LIMIT ${LOST_CLAIM_BATCH}`;

/** Ответ базы (jsonb объектом или строкой) → итог; не разобрали — null. */
export function claimResOf(rows: unknown): LostClaimRes | null {
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
  const o = res as { was?: unknown; amount?: unknown; resource?: unknown; token?: unknown };
  return {
    was: o.was === true,
    amount: Number(o.amount) || 0,
    resource: typeof o.resource === "string" ? o.resource : null,
    token: typeof o.token === "string" ? o.token : null,
  };
}

/** Строки для письма и тоста (отметка «уведомлён» — тем же вызовом, раз в минуту на игрока). */
export const lostDueSql = (limit: number): string =>
  `SELECT * FROM yuplink.raid_mine_lost_due(${Math.max(0, Math.floor(limit))})`;

type DueRow = {
  n_id?: string | null;
  n_account: string;
  n_kind: string;
  n_q: number | string;
  n_r: number | string;
  n_resource?: string | null;
  n_token?: string | null;
};

/** Строки обхода → потери по игрокам (нового хозяина в ответе базы нет вовсе). */
export function notesByAccount(rows: unknown): Map<string, MineLostNote[]> {
  const out = new Map<string, MineLostNote[]>();
  for (const x of (Array.isArray(rows) ? rows : []) as DueRow[]) {
    if (!x || typeof x.n_account !== "string" || !x.n_account) continue;
    // Уведомлению — только что случилось и клетка (владелец: «краткость»);
    // у гриба — ещё его вид по ресурсу строки (игрок: «какой гриб»).
    const kind = lostKindOf(x.n_kind);
    const note: MineLostNote = { kind, q: Number(x.n_q), r: Number(x.n_r) };
    const mushroom = lostMushroomOf(kind, x.n_resource, x.n_token);
    if (mushroom) note.mushroom = mushroom;
    // Вид шахты (§8.106: «Каменную шахту захватили») и строка — кнопке «Показать».
    if (typeof x.n_resource === "string" && x.n_resource) note.resource = x.n_resource;
    if (x.n_id) note.id = String(x.n_id);
    out.set(x.n_account, [...(out.get(x.n_account) ?? []), note]);
  }
  return out;
}

/** Мир каждой строки (§8.106): имя этажа, иначе имя карты; ids — из обхода. */
export const lostWorldsSql = (ids: readonly string[]): string =>
  `SELECT l.id, COALESCE(
       (SELECT f.name FROM yuplink.raid_floor f WHERE f.map_id = l.map_id LIMIT 1), m.name) AS world
     FROM yuplink.raid_mine_capture_log l
     LEFT JOIN yuplink.raid_maps m ON m.id = l.map_id
    WHERE l.id IN (${ids.map((id) => sqlStr(id)).join(",")})`;

/** Ответ lostWorldsSql → id → мир (пустые имена отбрасываем). */
export function worldsOf(rows: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const x of (Array.isArray(rows) ? rows : []) as Array<{ id?: unknown; world?: unknown }>) {
    if (typeof x?.id === "string" && typeof x.world === "string" && x.world.trim()) {
      out.set(x.id, x.world.trim());
    }
  }
  return out;
}
