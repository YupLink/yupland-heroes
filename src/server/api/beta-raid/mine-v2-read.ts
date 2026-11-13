// Шахта одной клетки с учётом v2 (ПРАВИЛА §8.59): владелец, накопленное,
// запас службы, поломка. Читают окно шахты, перехват, охрана и починка.
//
// Ничья v2 (сломалась — строки владения нет) отдаётся как broken: забрать её
// можно только починкой. Строка без accrue_from ещё не переведена на v2 —
// для неё всё по-старому (view = null).
//
// Остров новичка (§8.59 п. 11): числа добычи (стандарт, шаг выплаты) — по
// флагу клетки, как считает база; правила (цена починки, только «База», без
// охраны) — по флагу И карте острова, как берёт сервер (mine-v2.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { cellStateSql, type V2Cols } from "@/server/api/beta-raid/mine-v2-sql";
import {
  mineMode,
  mineRepairCost,
  mineStdYield,
  mineV2Of,
  mineV2Step,
  natureNOf,
} from "@/lib/mineV2";
import { mineLevelOf } from "@/lib/mineLevels";
import { mineV2Life, mineV2PendingArgs } from "@/lib/mineV2Row";
import type { MineV2Stamped } from "@/lib/mineV2Clock";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { mineWeatherOf } from "@/lib/mineWeather";

/** Строка cellStateSql. */
export type MineCellRow = V2Cols & {
  cell_std: number | string | null;
  /** Уровень шахты (raid_mine_level, §8.74). */
  level?: number | string | null;
  /** Деревьев (гор) рядом — natureN настройки клетки (§8.80). */
  nature_n?: number | string | null;
  /** Флаг шахты острова у клетки; spent — клетку уже чинили (только остров). */
  island?: boolean | null;
  spent?: boolean | null;
  resource: string | null;
  owner_account: string | null;
  claimed_hours: number | string | null;
  cap: number | string | null;
  pending: number | string | null;
};

export type MineCellState = {
  /** Владелец (аккаунт); null — ничья. Сломанная v2 — тоже null. */
  owner: string | null;
  claimedHours: number;
  /** Секундомер для livePendingAmount (у v2 — начало отрезка), мс. */
  capturedAt: number | null;
  /** Готовая к сбору добыча (снимок raid_mine_pending). */
  pending: number;
  /**
   * Шахта v2; null — старого образца. serverNow — часы сервера в момент снимка:
   * по ним окно поправляет часы телефона (lib/mineV2Clock).
   */
  view: MineV2Stamped | null;
  /** Выход в час и предел часов для livePendingAmount (только у v2-строки). */
  live: { yield: number; maxHours: number | null } | null;
};

const EMPTY: MineCellState = {
  owner: null,
  claimedHours: 0,
  capturedAt: null,
  pending: 0,
  view: null,
  live: null,
};

/** Разбор строки cellStateSql (чистая функция — для тестов). mapId — карта клетки. */
export function mineCellState(
  row: MineCellRow | undefined,
  now = Date.now(),
  mapId = "",
): MineCellState {
  if (!row) return EMPTY;
  const owner = row.owner_account ?? null;
  const base: MineCellState = {
    owner,
    claimedHours: Number(row.claimed_hours) || 0,
    capturedAt: row.cap != null ? Number(row.cap) : null,
    pending: Number(row.pending) || 0,
    view: null,
    live: null,
  };
  const kind = row.cell_std != null ? mineV2Of({ resource: row.resource }) : null;
  if (!kind) return base;
  const flag = row.island === true;
  const island = flag && isIslandMapId(mapId);
  const isle = {
    island,
    spent: row.spent === true,
    stepHours: mineV2Step(kind, flag),
    repairCost: mineRepairCost(kind, island),
    level: mineLevelOf({ mineLevel: row.level }),
    // Окружение — только лесопилке и каменоломне мира (§8.80).
    nature: !flag && (kind === "wood" || kind === "stone") ? natureNOf(row.nature_n) : null,
  };
  // Стандарт — из базы (с уровнем и окружением); ноль — настоящий (§8.80); нет — по виду.
  const std = Number(row.cell_std);
  const stdYield = Number.isFinite(std) && std >= 0 ? std : mineStdYield(kind, flag);
  if (!owner) {
    // Ничья — ставка по соседям на лету: столько она даст тому, кто её заберёт.
    const fresh =
      isle.nature != null ? mineStdYield(kind, flag, isle.level, isle.nature) : stdYield;
    const at = new Date(now).toISOString();
    const view = { mode: "base" as const, lifeLeft: 0, lifeAt: at, breakAt: now, broken: true };
    return { ...base, view: { ...view, stdYield: fresh, mult: 1, ...isle, serverNow: now } };
  }
  // Строка ещё не переведена на v2 — по-старому.
  if (row.v2_std == null || row.v2_accrue == null) return base;
  const life = mineV2Life(
    { mode: row.v2_mode, lifeLeft: row.v2_life_left, lifeAtMs: row.v2_life_at },
    now,
  );
  const args = mineV2PendingArgs({
    resource: kind,
    mode: life.mode,
    accrueFromMs: Number(row.v2_accrue),
    breakAt: life.breakAt,
    island: flag,
    std: stdYield,
  });
  // Погода (weather-02): слоты несобранной части — живой счёт окна (MineAction).
  const weather = mineWeatherOf(row.v2_weather);
  const view: MineV2Stamped = {
    ...life,
    stdYield,
    mult: mineMode(life.mode).mult,
    ...isle,
    serverNow: now,
    ...(weather ? { weather } : {}),
  };
  return {
    // Сломалась — ничья (накопленное до поломки обход начислит прежнему).
    owner: life.broken ? null : owner,
    claimedHours: base.claimedHours,
    capturedAt: args.capturedAt,
    pending: life.broken ? 0 : base.pending,
    view,
    live: { yield: args.yield, maxHours: args.maxHours },
  };
}

/** Шахта клетки (запрос к базе). Сбой чтения — «ничья, не v2». */
export async function loadMineCell(mapId: string, q: number, r: number): Promise<MineCellState> {
  const rows = (await mcpExec(cellStateSql(mapId, q, r), { wrapJson: true }).catch(
    () => [],
  )) as MineCellRow[];
  return mineCellState(rows?.[0], Date.now(), mapId);
}

/** Шахта v2 на клетке сломана (или ничья) — бой, охрана и захват ей не нужны. */
export async function mineCellBroken(mapId: string, q: number, r: number): Promise<boolean> {
  return (await loadMineCell(mapId, q, r)).view?.broken === true;
}

/**
 * Отказ базы по шахте v2 → ключ словаря (braid-mine-v2-err.ts). Незнакомое —
 * как было. Мост дописывает к тексту исключения свой префикс — ищем подстроку.
 */
export function mineV2ErrorKey(msg: string): string {
  if (/mine_broken/.test(msg)) return "braid.mine_broken";
  if (/mine_owned/.test(msg)) return "braid.mine_owned";
  if (/mine_not_owner/.test(msg)) return "braid.mine_not_owner";
  if (/mine_not_v2/.test(msg)) return "braid.mine_not_v2";
  if (/mine_spent/.test(msg)) return "braid.mine_spent";
  if (/mine_island_mode/.test(msg)) return "braid.mine_island_mode";
  if (/mine_island_level/.test(msg)) return "braid.mine_island_level";
  if (/mine_level_max/.test(msg)) return "braid.mine_level_max";
  if (/mine_level_changed/.test(msg)) return "braid.mine_level_changed";
  if (/res_move: в минус/.test(msg)) return "braid.mine_repair_no_res";
  return msg;
}
