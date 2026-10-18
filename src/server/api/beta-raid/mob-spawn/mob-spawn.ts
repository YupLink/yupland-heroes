// Точки возрождения мобов (владелец, 15.10.2026): «расставил мобов — и они сами
// возрождаются и бродят, чтобы не респавнить руками».
//
// Админ в режиме бога открывает клетку с мобом и включает «Возрождение»: через
// сколько встаёт убитый, на сколько клеток бродит от родной, как часто шагает.
// Раз в минуту один процесс (аренда минуты в settings):
//   1. запоминает свежие настройки живого моба (что админ поправил — с тем и
//      возродится);
//   2. отмечает смерть: моба нет там, где точка его видела (убит, убран);
//   3. возрождает созревших на РОДНОЙ клетке — если она свободна по тем же
//      правилам, что перенос объекта в режиме бога; занята — ждёт. Награда в
//      Darai закладывается в пул, как при «Восстановить» (map-darai-hold);
//   4. шагает: живой, не раненый, срок шага вышел — на случайную свободную
//      соседнюю клетку в радиусе от родной, не на дорогу (проход не перекрывает).
//      Шаг — тем же переносом, что в режиме бога (урон, расписка Darai едут с
//      мобом), и точка отмечает новую клетку той же транзакцией.
// Игроки видят всё дельтой карты; новый моб — со словарём картинок.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  moveObjectSql,
  parseObjectRow,
  type ObjectRow,
} from "@/server/api/beta-raid/god-move/move-object-sql";
import {
  deathsSql,
  dueSql,
  leaseSql,
  respawnSql,
  stepClockSql,
  stepMarkSql,
  stepsSql,
  syncConfigSql,
  type DueSpawn,
  type StepSpawn,
} from "./mob-spawn-sql";
import { usdtOfObjects } from "@/server/api/usdt-objects";
import { spendableUsdt } from "@/server/api/usdt-guard";

const EVERY_MS = 60_000;

const key = (q: number, r: number) => `${Number(q)},${Number(r)}`;

function byMap<T extends { map_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(row.map_id, [...(out.get(row.map_id) ?? []), row]);
  return out;
}

/** Бюджет USDT на проход: свободное с запасом спрашиваем один раз и только при нужде. */
function usdtBudget() {
  let left: number | null = null;
  return {
    async fits(s: DueSpawn): Promise<boolean> {
      const need = await usdtOfObjects([s]).catch(() => Infinity);
      if (need <= 0) return true;
      if (left === null) left = (await spendableUsdt().catch(() => null)) ?? -1;
      if (need > left) return false;
      left -= need;
      return true;
    },
  };
}

/** Встать на родных клетках. Отдаёт клетки, где моб встал, по картам. */
async function respawn(): Promise<Map<string, string[]>> {
  const due = ((await mcpExec(dueSql(), { wrapJson: true })) ?? []) as DueSpawn[];
  const placed = new Map<string, string[]>();
  const { readDaraiHold, settleDaraiHold } = await import("../map-darai-hold");
  const usdt = usdtBudget();
  for (const [mapId, list] of byMap(due)) {
    const cells = list.map((s) => ({ q: Number(s.home_q), r: Number(s.home_r) }));
    const hold = await readDaraiHold(mapId, cells);
    const keys: string[] = [];
    for (const s of list) {
      // Моб с USDT в награде встаёт, только пока его деньги есть в свободном (§8.49а).
      if (!(await usdt.fits(s))) continue;
      const row = sqlRow<{ placed?: number }>(
        await mcpExec(respawnSql(s), { wrapJson: false }).catch(() => []),
      );
      if (Number(row?.placed) > 0) keys.push(key(s.home_q, s.home_r));
    }
    // Каждый вставший снова обещает свою награду — номинал закладывается в пул.
    await settleDaraiHold(hold);
    if (keys.length > 0) placed.set(mapId, keys);
  }
  return placed;
}

/** Шаги бродящих. Отдаёт клетки «откуда» и «куда» по картам. */
async function walk(): Promise<Map<string, string[]>> {
  const steps = ((await mcpExec(stepsSql(), { wrapJson: true })) ?? []) as StepSpawn[];
  await mcpExec(stepClockSql());
  const moved = new Map<string, string[]>();
  for (const s of steps) {
    const from = { q: Number(s.cur_q), r: Number(s.cur_r) };
    const to = { q: Number(s.to_q), r: Number(s.to_r) };
    const sql = moveObjectSql(
      { mapId: s.map_id, from, to, ref: s.object_id },
      stepMarkSql(s.id, to),
    );
    const row = sqlRow<ObjectRow>(await mcpExec(sql, { wrapJson: false }).catch(() => []));
    if (!parseObjectRow(row)?.ok) continue;
    moved.set(s.map_id, [...(moved.get(s.map_id) ?? []), key(from.q, from.r), key(to.q, to.r)]);
  }
  return moved;
}

/** Разослать: вставших — со словарём картинок, шаги — дельтой клеток. */
async function announce(placed: Map<string, string[]>, moved: Map<string, string[]>) {
  const hooks = await import("../map-change-hooks");
  const { dropFleeCache } = await import("../flee-cells");
  for (const mapId of new Set([...placed.keys(), ...moved.keys()])) {
    try {
      const up = placed.get(mapId) ?? [];
      if (up.length > 0) {
        await hooks.noteAdminPatches(mapId, await hooks.cellTruthPatches(mapId, up));
        // У игроков клетка могла остаться в списке «повержено» с прошлой жизни.
        publishRaid({ mapId, type: "restored" });
      }
      const walked = moved.get(mapId) ?? [];
      if (walked.length > 0) await hooks.noteCellsChanged(mapId, walked);
      dropFleeCache(mapId);
    } catch (e) {
      console.warn("[mob-spawn] рассылка не прошла:", e instanceof Error ? e.message : e);
    }
  }
}

/** Один проход. Отдаёт, сколько встало и сколько шагнуло. */
export async function mobSpawnPass(): Promise<{ placed: number; moved: number }> {
  const lease = (await mcpExec(leaseSql(), { wrapJson: false }).catch(() => [])) as unknown[];
  if (!lease?.length) return { placed: 0, moved: 0 };
  await mcpExec(syncConfigSql());
  await mcpExec(deathsSql());
  const placed = await respawn();
  const moved = await walk();
  await announce(placed, moved);
  const count = (m: Map<string, string[]>, per: number) =>
    [...m.values()].reduce((n, l) => n + l.length / per, 0);
  return { placed: count(placed, 1), moved: count(moved, 2) };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await mobSpawnPass();
  } catch (e) {
    console.warn("[mob-spawn] проход не удался:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить сборщик в этом процессе: раз в минуту; зовёт отдача карты (map-serve). */
export function startMobSpawner(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
