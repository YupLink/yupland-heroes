// Ленивая уборка убитых/собранных объектов клетки из БД (через 5с после смерти).
//
// Клиент их и так снимает с карты сразу (players.expired → useBetaRaidData), но
// в БД object_id и строка beta_raid_object_hp оставались навсегда: наборы
// defeated/expired в полле росли вечно и грузили ВСЕХ игроков. Здесь физически
// чистим клетку и hp-строку, чтобы они выпадали из этих наборов.
//
// Крона под это нет — уборка при чтении карты, не чаще раза в 30с на карту.
// Матчим object_id: если на клетке уже стоит НОВЫЙ объект (респавн/скаттер), его
// не трогаем. После уборки сбрасываем кэш карты (dropMapBase).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { dropMapBase } from "./map-base";

const lastSwept = new Map<string, number>();

export async function sweepDeadObjects(mapId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastSwept.get(mapId) ?? 0) < 30_000) return;
  lastSwept.set(mapId, now);
  const m = sqlStr(mapId);
  const rows = (await mcpExec(
    `WITH dead AS (
       SELECT h.id, h.q, h.r, h.object_id
         FROM yuplink.beta_raid_object_hp h
        WHERE h.map_id = ${m} AND h.cycle_no = 0
          AND h.killed_at IS NOT NULL AND h.killed_at < now() - interval '5 seconds'
     ), cleared AS (
       UPDATE yuplink.raid_map_cells c SET object_id = NULL, object_config = NULL
         FROM dead d
        WHERE c.map_id = ${m} AND c.q = d.q AND c.r = d.r
          -- object_id в клетке С ПРЕФИКСОМ ('boss:rbt_…'), а в hp — чистый
          -- ('rbt_…'). Без учёта префикса совпадения НЕТ, клетка не чистилась, а
          -- hp удалялась → убитый босс оставался живым на клетке (воскрешение).
          AND (c.object_id = d.object_id OR split_part(c.object_id, ':', 2) = d.object_id)
       RETURNING c.q, c.r
     ), delhp AS (
       -- Удаляем ВСЕ убитые строки по id, а не только те, чью клетку сейчас
       -- очистили: осиротевшие (клетку уже занял другой / очистил скаттер) прежде
       -- не удалялись НИКОГДА и копились тысячами (1085 на живой карте) — набор
       -- «повержено» в полле рос, грузя всех.
       DELETE FROM yuplink.beta_raid_object_hp h
        USING dead d
        WHERE h.id = d.id
       RETURNING 1
     ), dead_run AS (
       -- Убитые БЕГЛЕЦЫ (слой 1): прежде sweep их не трогал вовсе, и мёртвые
       -- грибы копились в beta_raid_runner тысячами (3954 на живой карте),
       -- вися трупиком и грузя всех. Чистим так же — через 5с после смерти.
       SELECT h.q, h.r
         FROM yuplink.beta_raid_object_hp h
        WHERE h.map_id = ${m} AND h.cycle_no = 1
          AND h.killed_at IS NOT NULL AND h.killed_at < now() - interval '5 seconds'
     ), del_run AS (
       DELETE FROM yuplink.beta_raid_runner rn
        USING dead_run d
        WHERE rn.map_id = ${m} AND rn.q = d.q AND rn.r = d.r
       RETURNING 1
     ), del_run_hp AS (
       DELETE FROM yuplink.beta_raid_object_hp h
        USING dead_run d
        WHERE h.map_id = ${m} AND h.q = d.q AND h.r = d.r AND h.cycle_no = 1
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT count(*) FROM delhp) + (SELECT count(*) FROM del_run) AS n,
              (SELECT array_agg(q || ',' || r) FROM cleared) AS cells,
              (SELECT array_agg(q || ',' || r) FROM dead_run) AS runner_cells
     ) _t;`,
    // Без обёртки: wrapJson/wrapJsonCte добавляют внешний WITH, и UPDATE/DELETE
    // съезжают на второй уровень — Postgres отказывает, а .catch глотал отказ,
    // и убитые объекты оставались висеть на карте. JSON собираем сами.
  ).catch(() => [])) as Array<{ _row?: SweepRow } | SweepRow>;
  const raw = rows?.[0];
  const row = (raw && "_row" in raw ? raw._row : (raw as SweepRow | undefined)) ?? undefined;
  const n = Number(row?.n ?? 0);
  if (n > 0) {
    dropMapBase(mapId);
    // Беглецов чистим этой же уборкой — снимок слоя беглецов протух.
    const { dropFleeCache } = await import("./flee-cells");
    dropFleeCache(mapId);
    // Убранные клетки — в журнал карты: у игроков они гаснут дельтой, а не
    // «воскресают» из старого снимка соседнего процесса.
    const keys = [...(row?.cells ?? []), ...(row?.runner_cells ?? [])].filter(Boolean);
    const { noteCellsChanged } = await import("./map-change-hooks");
    void noteCellsChanged(mapId, keys.map(String));
  }
}

type SweepRow = { n: number; cells: string[] | null; runner_cells: string[] | null };

const sweepers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Периодическая уборка карты. Раньше её звал каждый опрос карты
 * (getBetaRaidMap), а карту теперь берут снимком с версией — уборку никто не
 * дёргал, и трупы копились бы вечно. Раз в минуту на карту, в каждом процессе
 * (внутри — свой стоп «не чаще раза в 30 с»); таймер процесс не держит.
 */
export function startDeadSweeper(mapId: string): void {
  if (sweepers.has(mapId) || typeof setInterval !== "function") return;
  const timer = setInterval(() => {
    void sweepDeadObjects(mapId).catch(() => {});
  }, 60_000);
  (timer as unknown as { unref?: () => void }).unref?.();
  sweepers.set(mapId, timer);
}
