// Источник генератора «Письмо о турнирах» (админка писем и турниров).
//
// Слово владельца (04.10.2026): письмо — по турнирам, которые скоро начнутся.
// Отдаём запланированные (черновик со временем начала впереди — стартует сам)
// и идущие: галочки по умолчанию стоят только у запланированных, идущий админ
// добавит сам. Время у идущего — фактическое (started_at/ends_at), у
// запланированного — расписание (start_at/end_at; нет конца — «на N дней»).
// Арены — имена построек с поведением «Турнир», которые стоят на карте:
// там игрок записывается, это и пишем в письме.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import type { TourLetterSource, TourLetterSourceRow } from "@/lib/tourLetter";
import type { TourMetric } from "@/lib/tournament/types";
import { TOUR_COLS, toAdminRow, type TourDbRow } from "../tournament/tour-rows";

/**
 * Порядок категорий в письме при равном начале (эталон «9 королей»: урон,
 * добивания, потом ресурсы, шаги, фарм). Без него у турниров, созданных одной
 * пачкой (равны и начало, и created_at), пункты шли бы как Postgres выдаст.
 */
export const LETTER_METRIC_ORDER: readonly TourMetric[] = [
  "damage",
  "boss_kills",
  "gold",
  "wood",
  "stone",
  "chop",
  "steps",
  "step_energy",
  "farm",
  "fish_catch",
  "fish_sell",
  "potion_drink",
];

const TOURS_SQL = `SELECT ${TOUR_COLS}
  FROM yuplink.tournament t
 WHERE (t.status = 'draft' AND t.start_at > now()) OR t.status = 'running'
 ORDER BY coalesce(t.started_at, t.start_at), t.created_at,
          array_position(ARRAY[${LETTER_METRIC_ORDER.map((m) => `'${m}'`).join(", ")}]::text[], t.metric),
          t.id;`;

// 'tournament' — эффект постройки «Турнир» (tour-gate.TOUR_EFFECT). Сам модуль
// гейта не тянем: за ним идёт половина рейда, а этот файл импортирует клиент.
const ARENAS_SQL = `SELECT DISTINCT t.name
  FROM yuplink.mystic_item_template t
 WHERE t.kind = 'building' AND t.active AND t.meta->>'effect' = 'tournament'
   AND EXISTS (SELECT 1 FROM yuplink.raid_map_cells c WHERE c.building_id = t.id)
 ORDER BY t.name;`;

export function toLetterSourceRow(r: TourDbRow): TourLetterSourceRow | null {
  const row = toAdminRow(r);
  if (row.status !== "draft" && row.status !== "running") return null;
  const running = row.status === "running";
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    metric: row.metric,
    startAt: running ? (row.startedAt ?? row.startAt) : row.startAt,
    endAt: running ? (row.endsAt ?? row.endAt) : row.endAt,
    days: row.days,
    fundDarai: row.fundDarai,
    bands: row.bands,
    entryPrice: row.entryPrice,
  };
}

export const adminTourLetterSource = createServerFn({ method: "GET" }).handler(
  async (): Promise<TourLetterSource> => {
    requireAdmin();
    const [tours, arenas] = await Promise.all([
      mcpExec(TOURS_SQL, { wrapJson: true }) as Promise<TourDbRow[] | null>,
      mcpExec(ARENAS_SQL, { wrapJson: true }) as Promise<Array<{ name: string | null }> | null>,
    ]);
    return {
      tours: (tours ?? []).map(toLetterSourceRow).filter((r): r is TourLetterSourceRow => !!r),
      arenas: (arenas ?? []).map((a) => String(a.name ?? "").trim()).filter(Boolean),
    };
  },
);
