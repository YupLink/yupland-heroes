// Турниры в сводке для газеты (владелец, 07.11.2026: «в апи газеты — данные о
// турнире, который будет, если запрограммирован ближайший, или который идёт»).
//
// Идущие боевые (проверку dry игрокам не показываем) и ближайшие
// запланированные: черновики со временем начала впереди — все, кто стартует в
// самый ранний такой момент (серия турниров начинается разом). Предложения —
// те же, что в письме о турнирах; лидеры — первые места героями, без ников
// (как у досок газеты, news-heroes).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { TOUR_COLS, toAdminRow, type TourDbRow } from "@/server/api/tournament/tour-rows";
import { TOUR_LIVE, type TourAdminRow } from "@/lib/tournament/types";
import { farmSnapClock } from "@/lib/tournament/metricSources";
import { METRIC_GOAL, hasCyrillic, termText } from "@/lib/tourLetterText";
import { priceSentence, prizesSentence } from "@/lib/tourLetterPrizes";
import { dict as tourDict } from "@/lib/translations/tournament";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { NewsLang, NewsTour, NewsTourLeader, NewsTours } from "@/lib/news/types";
import { heroesSql } from "./news-sql";
import { heroShortName, twinLabel } from "./news-heroes";

/** Сколько первых мест идущего турнира отдаём. */
export const NEWS_TOUR_TOP = 3;

export const NEWS_TOURS_SQL = `SELECT ${TOUR_COLS},
  (SELECT count(*) FROM yuplink.tournament_entry e
    WHERE e.tournament_id = t.id AND e.paid)::int AS entries
  FROM yuplink.tournament t
 WHERE (t.status = 'running' AND NOT t.dry)
    OR (${TOUR_LIVE} AND t.status = 'draft' AND t.start_at = (
         SELECT min(d.start_at) FROM yuplink.tournament d
          WHERE d.status = 'draft' AND d.start_at > now()))
 ORDER BY coalesce(t.started_at, t.start_at), t.created_at, t.id;`;

/** Первые места идущих турниров: место — rank (ничья — одно место), не больше top строк. */
export function newsTourLeadersSql(ids: readonly string[], top = NEWS_TOUR_TOP): string {
  return `SELECT tournament_id, account_id, score, place FROM (
    SELECT s.tournament_id, s.account_id, s.score::float8 AS score,
           rank() OVER (PARTITION BY s.tournament_id ORDER BY s.score DESC) AS place,
           row_number() OVER (PARTITION BY s.tournament_id ORDER BY s.score DESC, s.account_id) AS rn
      FROM yuplink.tournament_score s
     WHERE s.tournament_id IN (${ids.map(sqlStr).join(", ")}) AND s.score > 0
  ) x WHERE rn <= ${Math.max(1, Math.floor(top))}
  ORDER BY tournament_id, rn;`;
}

type Row = TourDbRow & { entries?: number | string | null };
type LeaderRow = {
  tournament_id: string;
  account_id: string;
  score: number | string;
  place: number | string;
};
type HeroRow = { account_id: string; name: string };

const metricLabel = (m: TourAdminRow["metric"], lang: NewsLang): string =>
  tourDict[`tour.metric.${m}`]?.[lang] ?? m;

/** Имя турнира админ пишет по-русски — в английской сводке берём категорию (как письмо). */
function tourName(r: TourAdminRow, lang: NewsLang): string {
  const name = r.name.trim();
  if (lang === "ru") return name || metricLabel(r.metric, "ru");
  return name && !hasCyrillic(name) ? name : metricLabel(r.metric, "en");
}

/** Строка базы → турнир газеты (лидеры — отдельно). */
export function toNewsTour(r: Row, lang: NewsLang): NewsTour | null {
  const row = toAdminRow(r);
  if (row.status !== "running" && row.status !== "draft") return null;
  const running = row.status === "running";
  const startAt = running ? (row.startedAt ?? row.startAt) : row.startAt;
  const endAt = running ? (row.endsAt ?? row.endAt) : row.endAt;
  const snapAt =
    row.metric === "farm"
      ? farmSnapClock({ startedAt: row.startedAt, startAt: row.startAt, endAt: row.endAt })
      : null;
  return {
    status: running ? "running" : "soon",
    name: tourName(row, lang),
    metric: row.metric,
    category: metricLabel(row.metric, lang),
    goal: METRIC_GOAL[row.metric]?.[lang] ?? "",
    startAt,
    endAt,
    term: termText({ startAt, endAt, days: row.days }, lang),
    fundDarai: row.fundDarai,
    prizes: prizesSentence(row, lang, false),
    bands: row.bands,
    entry: priceSentence(row.entryPrice, lang, false),
    players: Number(r.entries) || 0,
    ...(snapAt && { snapAt }),
    leaders: [],
  };
}

/** Подписи лидеров героями: одно имя у разных игроков — «брат-близнец». */
export function leaderNames(
  accounts: readonly string[],
  heroes: Map<string, string>,
  lang: NewsLang,
): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const id of accounts) {
    if (out.has(id)) continue;
    const hero = heroes.get(id);
    const base = hero
      ? heroShortName(localizeAssetName(hero, lang))
      : lang === "en"
        ? "Nameless"
        : "Безымянный";
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    out.set(id, twinLabel(base, k, lang));
  }
  return out;
}

async function leadersOf(ids: string[], lang: NewsLang): Promise<Map<string, NewsTourLeader[]>> {
  const out = new Map<string, NewsTourLeader[]>();
  if (ids.length === 0) return out;
  const rows = ((await mcpExec(newsTourLeadersSql(ids), { wrapJson: true })) ?? []) as LeaderRow[];
  const accounts = [...new Set(rows.map((r) => r.account_id))];
  const heroes = accounts.length
    ? (((await mcpExec(heroesSql(accounts), { wrapJson: true }).catch(() => [])) ??
        []) as HeroRow[])
    : [];
  const names = leaderNames(accounts, new Map(heroes.map((h) => [h.account_id, h.name])), lang);
  for (const r of rows) {
    const list = out.get(r.tournament_id) ?? [];
    list.push({
      place: Number(r.place) || list.length + 1,
      name: names.get(r.account_id) ?? "",
      score: Number(r.score) || 0,
    });
    out.set(r.tournament_id, list);
  }
  return out;
}

/** Турниры сейчас: идущие (с лидерами) и ближайшие запланированные. */
export async function newsTours(lang: NewsLang): Promise<NewsTours> {
  const rows = ((await mcpExec(NEWS_TOURS_SQL, { wrapJson: true })) ?? []) as Row[];
  const running = rows.filter((r) => r.status === "running").map((r) => r.id);
  const leaders = await leadersOf(running, lang);
  const tours = rows
    .map((r) => {
      const t = toNewsTour(r, lang);
      return t && { ...t, leaders: leaders.get(r.id) ?? [] };
    })
    .filter((t): t is NewsTour => !!t);
  return {
    active: tours.filter((t) => t.status === "running"),
    soon: tours.filter((t) => t.status === "soon"),
  };
}
