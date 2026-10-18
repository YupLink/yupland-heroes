// Таблица турнира: страница мест, всего участников и моя строка.
//
// Идущий турнир — живой счёт (tournament_score, порядок строк RANK_ORDER), завершённый —
// записанные места (tournament_place): после финиша расклад не плывёт.
// Место — по счёту (PLACE_RANK): равные стоят на одном месте, как и на финише
// (владелец, 06.10.2026: «при равном счёте призы делятся поровну»).
// Игроку до финиша (запланированный, идущий, итоги) — все записавшиеся
// (оплаченная запись, владелец 05.10.2026: «этот же турнир и запись даёт, и
// инфо про твоё место и всех участников»): сначала набравшие очки с местами
// 1..N, за ними записавшиеся без очков — без места, по времени записи.
// Админке — только набравшие очки, как было.
// Имя — как в доске урона: @username, иначе id<tg>, иначе кошелёк.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { TOUR_PAGE, type TourLeaderPage, type TourStatus } from "@/lib/tournament/types";
import { RANK_ORDER, namesSql } from "./tour-sql";
import { PLACE_RANK } from "@/server/api/tournament/tour-finish-sql";

/** ord — номер строки в общем порядке (у записавшихся без очков места нет, а порядок есть). */
type Line = {
  place: number | string | null;
  ord?: number | string | null;
  account_id: string;
  score: number | string;
};

/** Строка таблицы с аккаунтом — админке нужен id, чтобы открыть очки участника. */
export type BoardLine = { place: number | null; accountId: string; name: string; score: number };

const n = (v: unknown): number => Number(v) || 0;

/**
 * Оплатившие запись со своим счётом. Без очков — счёт 0, а вместо времени
 * очков время записи: общий RANK_ORDER ставит их после всех набравших
 * (0 меньше любого счёта), а между собой — по времени записи, затем по аккаунту.
 */
const entrantsSql = (tid: string): string =>
  `SELECT e.account_id, COALESCE(s.score, 0) AS score,
          COALESCE(s.last_at, e.joined_at) AS last_at,
          COALESCE(s.first_at, e.joined_at) AS first_at
     FROM yuplink.tournament_entry e
     LEFT JOIN yuplink.tournament_score s
            ON s.tournament_id = e.tournament_id AND s.account_id = e.account_id AND s.score > 0
    WHERE e.tournament_id = ${tid} AND e.paid`;

/**
 * Страница мест: из записанных мест (завершённый), из записавшихся (игроку до
 * финиша — entrants) или из живого счёта (админке).
 */
export function pageSql(id: string, status: TourStatus, offset: number, entrants = false): string {
  const tid = sqlStr(id);
  const off = Math.max(0, Math.floor(offset));
  if (status === "done") {
    // Равные — на одном месте; между собой — по аккаунту, чтобы страницы не путались.
    return `SELECT place, account_id, score::float8 AS score,
                   row_number() OVER (ORDER BY place, account_id) AS ord
              FROM yuplink.tournament_place
             WHERE tournament_id = ${tid} ORDER BY place, account_id OFFSET ${off} LIMIT ${TOUR_PAGE};`;
  }
  if (entrants) {
    // Без очков счёт 0 — их ранг ниже всех набравших и места им не даём.
    return `SELECT account_id, score::float8 AS score, ord,
                   CASE WHEN score > 0 THEN rnk END AS place
              FROM (SELECT b.*, row_number() OVER (ORDER BY ${RANK_ORDER}) AS ord,
                           ${PLACE_RANK} AS rnk
                      FROM (${entrantsSql(tid)}) b) r
             ORDER BY ord OFFSET ${off} LIMIT ${TOUR_PAGE};`;
  }
  return `SELECT account_id, score::float8 AS score,
                 row_number() OVER (ORDER BY ${RANK_ORDER}) AS ord,
                 ${PLACE_RANK} AS place
            FROM yuplink.tournament_score
           WHERE tournament_id = ${tid} AND score > 0
           ORDER BY ${RANK_ORDER} OFFSET ${off} LIMIT ${TOUR_PAGE};`;
}

/** Всего в таблице: места, оплаченные записи (entrants) или набравшие очки. */
export function totalSql(id: string, status: TourStatus, entrants = false): string {
  const tid = sqlStr(id);
  if (status === "done") {
    return `SELECT count(*)::int AS n FROM yuplink.tournament_place WHERE tournament_id = ${tid};`;
  }
  if (entrants) {
    return `SELECT count(*)::int AS n FROM yuplink.tournament_entry
             WHERE tournament_id = ${tid} AND paid;`;
  }
  return `SELECT count(*)::int AS n FROM yuplink.tournament_score
           WHERE tournament_id = ${tid} AND score > 0;`;
}

/**
 * Моё место: после финиша — записанное, до — 1 + сколько набрали больше меня
 * (равные стоят на одном месте — как PLACE_RANK).
 * Записан, но очков нет — строка без места со счётом 0; не записан и без
 * очков — строки нет.
 */
export function mineSql(id: string, status: TourStatus, account: string): string {
  const [tid, acc] = [sqlStr(id), sqlStr(account)];
  if (status === "done") {
    return `SELECT place, account_id, score::float8 AS score FROM yuplink.tournament_place
             WHERE tournament_id = ${tid} AND account_id = ${acc} LIMIT 1;`;
  }
  return `SELECT ${acc} AS account_id, COALESCE(me.score, 0)::float8 AS score,
                 CASE WHEN me.score > 0
                      THEN 1 + (SELECT count(*) FROM yuplink.tournament_score o
                                 WHERE o.tournament_id = ${tid} AND o.score > me.score)
                 END AS place
            FROM (SELECT 1) one
            LEFT JOIN yuplink.tournament_score me
                   ON me.tournament_id = ${tid} AND me.account_id = ${acc} AND me.score > 0
           WHERE me.account_id IS NOT NULL
              OR EXISTS (SELECT 1 FROM yuplink.tournament_entry e
                          WHERE e.tournament_id = ${tid} AND e.account_id = ${acc} AND e.paid)
           LIMIT 1;`;
}

/** Имена аккаунтов; нет имени — короткий acc-id, как в доске урона. */
export async function namesOf(accounts: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(accounts.filter(Boolean))];
  if (uniq.length > 0) {
    const rows = (await mcpExec(namesSql(uniq), { wrapJson: true }).catch(() => [])) as Array<{
      account_id: string;
      name: string | null;
    }>;
    for (const r of rows ?? []) {
      const nm = (r.name ?? "").trim();
      if (nm) out.set(r.account_id, nm);
    }
  }
  for (const a of uniq) if (!out.has(a)) out.set(a, `${a.slice(0, 7)}…${a.slice(-4)}`);
  return out;
}

/** Страница таблицы с аккаунтами (админке — только набравшие очки, игроку — entrants). */
export async function loadBoard(
  id: string,
  status: TourStatus,
  offset: number,
  me?: string | null,
  entrants = false,
): Promise<{ lines: BoardLine[]; mine: BoardLine | null; total: number }> {
  const [page, total, mine] = await Promise.all([
    mcpExec(pageSql(id, status, offset, entrants), { wrapJson: true }) as Promise<Line[] | null>,
    mcpExec(totalSql(id, status, entrants), { wrapJson: true }) as Promise<Array<{
      n: number;
    }> | null>,
    me
      ? (mcpExec(mineSql(id, status, me), { wrapJson: true }) as Promise<Line[] | null>)
      : Promise.resolve(null),
  ]);
  // Порядок наружной обёртки row_to_json не гарантирован — сортируем сами:
  // по номеру строки, а где его нет — по месту.
  const lines = [...(page ?? [])].sort((a, b) => n(a.ord ?? a.place) - n(b.ord ?? b.place));
  const my = mine?.[0] ?? null;
  const names = await namesOf([...lines.map((l) => l.account_id), ...(my ? [my.account_id] : [])]);
  const line = (l: Line): BoardLine => ({
    place: l.place == null ? null : n(l.place),
    accountId: l.account_id,
    name: names.get(l.account_id) ?? l.account_id,
    score: n(l.score),
  });
  return { lines: lines.map(line), mine: my ? line(my) : null, total: n(total?.[0]?.n) };
}

/**
 * Страница для игрока: все записавшиеся (до финиша) или места (после), без
 * чужих аккаунтов; моя строка — если она вне страницы.
 */
export async function loadLeaderPage(
  id: string,
  status: TourStatus,
  offset: number,
  me: string | null,
): Promise<TourLeaderPage> {
  const b = await loadBoard(id, status, offset, me, true);
  const rows = b.lines.map((l) => ({
    place: l.place,
    name: l.name,
    score: l.score,
    mine: !!me && l.accountId === me,
  }));
  const inPage = rows.some((r) => r.mine);
  const mine =
    b.mine && !inPage
      ? { place: b.mine.place, name: b.mine.name, score: b.mine.score, mine: true }
      : null;
  return { rows, mine, total: b.total };
}
