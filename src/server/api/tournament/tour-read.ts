// Окно турниров у постройки «Турнир»: плашки и таблица.
//
// Только у постройки (tour-gate): плашки идущих турниров с моим местом в углу,
// условия и призы по местам, таблица по 20 строк с догрузкой; прошлые —
// последние 20 завершённых, по записанным местам. Черновики без времени не
// видны; запланированные (черновик со временем начала, 04.10.2026) — полкой
// «Скоро» с записью. На плашке — записан ли я и цена записи; участники до
// финиша — все оплатившие запись (05.10.2026: и у идущего, а не только
// набравшие очки), в таблице — они же, без очков — без места (tour-board).
// Запись, плата за которую ещё идёт или сорвалась (paid=false), не считается
// ни моей, ни в участниках.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "../beta-raid/gate";
import { raidOwner } from "../beta-raid/owner";
import {
  TOUR_LIVE,
  type TourLeaderPage,
  type TourPlate,
  type TourPlates,
  type TourStatus,
} from "@/lib/tournament/types";
import {
  TOUR_COLS,
  isoOf,
  metricOf,
  parseBands,
  parseStrList,
  type TourDbRow,
} from "@/server/api/tournament/tour-rows";
import { requireTourHere } from "./tour-gate";
import { loadLeaderPage } from "./tour-board";
import { isAdminWallet } from "../../auth";
import { parseEntryPrice } from "@/lib/tournament/entryPrice";

/** Прошлых турниров в окне. */
const PAST_LIMIT = 20;

type PlateRow = TourDbRow & {
  my_score: number | string | null;
  my_place: number | string | null;
  joined: boolean | null;
  entries: number | string | null;
};

/**
 * Плашки: идущие, запланированные и последние завершённые, с моим местом,
 * счётом и записью. Место до финиша — 1 + сколько набрали больше: равные по
 * счёту стоят на одном месте (PLACE_RANK, tour-finish-sql). Проверки (dry)
 * видит только админ — игрокам турниры не показываем до боевого запуска.
 * Запланированный черновик ещё не помечен боевым (dry ставит старт) — его
 * видно, если запуск боевой (TOUR_LIVE).
 */
export function platesSql(account: string, admin = false): string {
  const acc = sqlStr(account);
  const seen = admin
    ? "true"
    : `(CASE WHEN t.status = 'draft' THEN ${TOUR_LIVE} ELSE NOT t.dry END)`;
  return `SELECT ${TOUR_COLS},
          EXISTS (SELECT 1 FROM yuplink.tournament_entry e
                   WHERE e.tournament_id = t.id AND e.account_id = ${acc} AND e.paid) AS joined,
          (SELECT count(*) FROM yuplink.tournament_entry e
            WHERE e.tournament_id = t.id AND e.paid)::int AS entries,
          me.score::float8 AS my_score,
          CASE WHEN t.status = 'done'
               THEN (SELECT p.place FROM yuplink.tournament_place p
                      WHERE p.tournament_id = t.id AND p.account_id = ${acc} LIMIT 1)
               WHEN me.score > 0
               THEN 1 + (SELECT count(*) FROM yuplink.tournament_score o
                          WHERE o.tournament_id = t.id AND o.score > me.score)
          END AS my_place
     FROM yuplink.tournament t
     LEFT JOIN yuplink.tournament_score me
            ON me.tournament_id = t.id AND me.account_id = ${acc} AND me.score > 0
    WHERE ${seen}
      AND (t.status IN ('running', 'paying')
       OR (t.status = 'draft' AND t.start_at IS NOT NULL)
       OR t.id IN (SELECT d.id FROM yuplink.tournament d WHERE d.status = 'done'
                    AND ${admin ? "true" : "NOT d.dry"}
                    ORDER BY d.finished_at DESC LIMIT ${PAST_LIMIT}))`;
}

const numOrNull = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

export function toPlate(r: PlateRow): TourPlate {
  return {
    id: r.id,
    name: r.name,
    metric: metricOf(r.metric),
    status: r.status,
    startedAt: isoOf(r.started_ms),
    endsAt: isoOf(r.ends_ms),
    finishedAt: isoOf(r.finished_ms),
    // Участники до финиша — оплатившие запись (очки идут только им, а у кого
    // их пока нет — тоже участник); после — сколько мест (TOUR_COLS.players).
    players: Number(r.status === "done" ? r.players : r.entries) || 0,
    myPlace: numOrNull(r.my_place),
    myScore: numOrNull(r.my_score),
    bands: parseBands(r.bands),
    startAt: isoOf(r.start_ms),
    endAt: isoOf(r.end_ms),
    joined: r.joined === true,
    entryPrice: parseEntryPrice(r.entry_price),
    items: parseStrList(r.item_names),
  };
}

/** Часы турниров — и отсюда: автостарт по расписанию не ждёт чтения подарков. */
const ensureTicker = () => void import("./tour-tick").then((m) => m.startTourTicker());

const cell = z.object({ q: z.number().int(), r: z.number().int() });

export const getTourPlates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }): Promise<TourPlates> => {
    const wallet = await requireBetaRaid();
    await requireTourHere(wallet, data.q, data.r);
    ensureTicker();
    const account = await raidOwner(wallet);
    const rows = ((await mcpExec(platesSql(account, isAdminWallet(wallet)), { wrapJson: true })) ??
      []) as PlateRow[];
    const plates = rows.map(toPlate);
    const at = (v: string | null) => (v ? Date.parse(v) : 0);
    const live = (p: TourPlate) => p.status === "running" || p.status === "paying";
    return {
      // Идущие — ближайший конец первым; скоро — ближайший старт; прошлые — свежие первыми.
      active: plates.filter(live).sort((a, b) => at(a.endsAt) - at(b.endsAt)),
      soon: plates
        .filter((p) => p.status === "draft")
        .sort((a, b) => at(a.startAt) - at(b.startAt)),
      past: plates
        .filter((p) => p.status === "done")
        .sort((a, b) => at(b.finishedAt) - at(a.finishedAt)),
    };
  });

export const getTourTable = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    cell
      .extend({ id: z.string().min(1).max(64), offset: z.number().int().min(0).max(100_000) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TourLeaderPage> => {
    const wallet = await requireBetaRaid();
    await requireTourHere(wallet, data.q, data.r);
    const rows = (await mcpExec(
      `SELECT status, dry, start_at IS NOT NULL AS planned
         FROM yuplink.tournament WHERE id = ${sqlStr(data.id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ status: TourStatus; dry: boolean | null; planned: boolean | null }> | null;
    const status = rows?.[0]?.status;
    const admin = isAdminWallet(wallet);
    if (!status) throw new Error("tour.err.not_found");
    // Запланированный — таблица записавшихся (очков до старта нет); черновик
    // без времени игроку не турнир. Проверку (dry) видит только админ.
    const seen =
      status === "draft"
        ? rows?.[0]?.planned === true && (TOUR_LIVE || admin)
        : rows?.[0]?.dry === false || admin;
    if (!seen) throw new Error("tour.err.not_found");
    const account = await raidOwner(wallet);
    return loadLeaderPage(data.id, status, data.offset, account);
  });
