// Корабли под синим динамитом (§8.75а, владелец 26.10.2026): что сбито (итог
// raid_dynamite_blast, migrations/dynamite-05), кого из экипажа ещё не отнесли в
// основной город, и SQL ключа нажатия для этого: отметка «отнесён» (detail.homed)
// и флаг «экипаж ждёт» (crew_due). Чистые функции — без базы (dynamite-ships.test.ts).
import { sqlStr } from "@/server/api/raid-shared";

/** Сбитый корабль: id, вид и экипаж до взрыва (аккаунт; null — стоял пустой). */
export type BlastShip = { id: string; kind: "small" | "big"; crew: string | null };

type Hex = { q: number; r: number };

/** Обход не трогает свежие ключи: их экипаж ещё несёт само нажатие. */
export const CREW_RESEND_AFTER_SEC = 30;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** detail.ships → корабли; мусор — мимо. */
export function shipsOf(v: unknown): BlastShip[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      id: String(x.id ?? ""),
      kind: x.kind === "big" ? "big" : "small",
      crew: str(x.crew),
    }));
}

/** detail.homed → аккаунты, которых уже отнесли. */
export const homedOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];

/** Экипаж, которого ещё не отнесли домой, без повторов. */
export function crewToHome(d: { ships: readonly BlastShip[]; homed: readonly string[] }): string[] {
  const done = new Set(d.homed);
  const crew = d.ships.map((s) => s.crew).filter((c): c is string => !!c && !done.has(c));
  return [...new Set(crew)];
}

/**
 * Игрок всё ещё на клетке взрыва и не в лодке — его надо отнести. Ушёл (отнесли,
 * а отметка не легла; сел в другое судно) — второй раз не носим.
 */
export const strandedSql = (account: string, mapId: string, at: Hex): string =>
  `SELECT (EXISTS (
            SELECT 1 FROM yuplink.beta_raid_positions p
             WHERE p.account_id = ${sqlStr(account)}
               AND p.q = ${Math.trunc(at.q)} AND p.r = ${Math.trunc(at.r)}
               AND COALESCE(p.map_id, (SELECT (st.value::jsonb)->>'mapId' FROM yuplink.settings st
                                        WHERE st.key = 'beta_raid_map')) = ${sqlStr(mapId)})
          AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                           WHERE s.crew_account = ${sqlStr(account)})) AS stranded;`;

/** Отметка в ключе: этот аккаунт отнесён (повтор и обход его пропустят). */
export const homedSql = (op: string, account: string): string =>
  `UPDATE yuplink.raid_dynamite_op
      SET detail = jsonb_set(detail, '{homed}',
            (COALESCE(detail->'homed', '[]'::jsonb) - ${sqlStr(account)})
              || to_jsonb(${sqlStr(account)}::text))
    WHERE op = ${sqlStr(op)};`;

/** Весь экипаж отнесён — ключ больше не ждёт обхода. */
export const crewDoneSql = (op: string): string =>
  `UPDATE yuplink.raid_dynamite_op SET crew_due = false
    WHERE op = ${sqlStr(op)} AND crew_due;`;

/** Обход: ключи, чей экипаж ещё не отнесён (не свежие и не старше 2 суток). */
export const crewDueSql = (): string =>
  `SELECT o.op, o.map_id, o.detail
     FROM yuplink.raid_dynamite_op o
    WHERE o.crew_due
      AND o.created_at < now() - interval '${CREW_RESEND_AFTER_SEC} seconds'
      AND o.created_at > now() - interval '2 days'
    ORDER BY o.created_at
    LIMIT 50;`;
