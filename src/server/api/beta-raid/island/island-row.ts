// Строка острова игрока: чей, где что стоит, что засчитано, куда вернуть.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { parsePlaces, type IslandPlaces } from "@/lib/raid/island/steps";

export type IslandRow = {
  account: string;
  /** null — карту острова снесли после выхода порталом; строка — «был, прошёл». */
  mapId: string | null;
  places: IslandPlaces;
  done: string[];
  back: { mapId: string; q: number; r: number } | null;
  finishedAt: string | null;
};

/** Строка живого острова — карта есть. */
export type LiveIslandRow = IslandRow & { mapId: string };

export const isLive = (row: IslandRow | null): row is LiveIslandRow => !!row?.mapId;

const strings = (v: unknown): string[] => {
  const raw = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
};

export async function loadIsland(account: string): Promise<IslandRow | null> {
  const rows = (await mcpExec(
    `SELECT account_id, map_id, places, done, back_map, back_q, back_r, finished_at
       FROM yuplink.raid_island WHERE account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  const r = rows?.[0];
  if (!r) return null;
  const places = parsePlaces(typeof r.places === "string" ? JSON.parse(r.places) : r.places);
  if (!places) return null;
  const backMap = typeof r.back_map === "string" ? r.back_map : null;
  return {
    account: String(r.account_id),
    mapId: typeof r.map_id === "string" && r.map_id ? r.map_id : null,
    places,
    done: strings(r.done),
    back:
      backMap && r.back_q != null && r.back_r != null
        ? { mapId: backMap, q: Number(r.back_q), r: Number(r.back_r) }
        : null,
    finishedAt: r.finished_at ? String(r.finished_at) : null,
  };
}

/** Дописать засчитанные шаги (объединение, порядок не важен). */
export async function markDone(account: string, steps: readonly string[]): Promise<void> {
  if (steps.length === 0) return;
  await mcpExec(
    `UPDATE yuplink.raid_island
        SET done = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(
                      done || ${sqlStr(JSON.stringify(steps))}::jsonb) x)
      WHERE account_id = ${sqlStr(account)};`,
  );
}

/** Запомнить, откуда админ пришёл на остров (новичку не нужно — он выйдет к замку). */
export async function saveBack(account: string, at: { mapId: string; q: number; r: number }) {
  await mcpExec(
    `UPDATE yuplink.raid_island
        SET back_map = ${sqlStr(at.mapId)}, back_q = ${Math.trunc(at.q)}, back_r = ${Math.trunc(at.r)}
      WHERE account_id = ${sqlStr(account)};`,
  );
}

/** Задание пройдено: портал вывел в основной мир. */
export async function markFinished(account: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_island
        SET finished_at = COALESCE(finished_at, now()),
            done = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(
                      done || '["leave"]'::jsonb) x)
      WHERE account_id = ${sqlStr(account)};`,
  );
}
