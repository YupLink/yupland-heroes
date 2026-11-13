// «Починить всё» в «Управлении шахтами»: что чинить, что пропустить и почём.
// Чистая часть без сети — запросы строит, строки базы раскладывает; серверные
// функции — mine-office-repair-all.ts.
//
// Решает одна функция planRepairAll и для цены, и для проверки перед починкой —
// цена, показанная игроку, и списание не разъедутся. Окончательно «чинить или
// пропустить» решает база под локом шахты (raid_mine_repair_all, миграция
// mine-repair-all-01): клетки пачки — одной транзакцией той же raid_mine_repair,
// что у одной шахты (цена §8.59 п. 6); не хватило ресурсов — не спишется ничего.
//
// Ключ повтора клетки — аккаунт + клетка + отметка запаса, которую видел игрок:
// повтор того же подтверждения (двойное нажатие, две вкладки, потерянный ответ)
// — тот же ключ, база отвечает прежним ответом и денег не берёт.
import {
  mineBreakAt,
  mineIslandOf,
  mineLifeNow,
  mineMode,
  mineRepairCost,
  mineV2Of,
  MINE_REPAIR_ALL_BELOW,
  MINE_V2_RESOURCES,
  type MineMode,
  type MineV2Resource,
} from "@/lib/mineV2";
import { isIslandMapId } from "@/lib/raid/island/ids";

export type RepairCost = Partial<Record<MineV2Resource, number>>;

/** Клетка пачки; lifeAt — отметка последней записи запаса (мс) из ответа с ценой. */
export type RepairAllCell = { mapId: string; q: number; r: number; lifeAt: number };

/**
 * Почему шахту пропустили: full — запас не ниже выбранного порога, broken —
 * сломана (или ломается прямо сейчас), island — шахта острова (из «Управления
 * шахтами» её не чинят, §8.77), spent — шахта острова уже чинилась (ответ базы),
 * void — под куполом, not_owner — уже не своя, changed — после показа цены шахту
 * уже чинили или запас переписан (повтор старого подтверждения не платит).
 */
export type RepairSkip = "full" | "broken" | "island" | "spent" | "void" | "not_owner" | "changed";

/** Порог по умолчанию — 90 % (lib/mineV2); игрок двигает его ползунком. */
export const REPAIR_ALL_BELOW = MINE_REPAIR_ALL_BELOW;

/** Строка базы по клетке (stateSql). */
export type RepairStateRow = {
  map_id: string;
  q: number | string;
  r: number | string;
  owner: string | null;
  mode: string | null;
  life_left: number | string | null;
  life_at: number | string | null;
  v2: boolean | null;
  cfg: unknown;
  void: boolean | null;
  /** Флаг острова клетки — как его читает база (raid_mine_is_island). */
  island_flag?: boolean | null;
  /** Остров: клетку уже чинили (raid_mine_op). */
  island_spent: boolean | null;
  /** Этот ключ повтора уже проведён — база вернёт прежний ответ, ничего не списав. */
  done: boolean | null;
};

export type RepairPlanItem = {
  mapId: string;
  q: number;
  r: number;
  kind: MineV2Resource;
  mode: MineMode;
  /** Запас сейчас, 0..1. */
  lifeNow: number;
  lifeAt: number;
  cost: RepairCost;
  op: string | null;
};

export type RepairPlan = {
  /** Чинить (и платить). */
  repair: RepairPlanItem[];
  /** Этим же ключом уже починены — повтор, без денег. */
  again: RepairPlanItem[];
  skipped: Array<{ mapId: string; q: number; r: number; reason: RepairSkip }>;
  total: RepairCost;
};

/** Шахта, которой до поломки меньше этого, считается сломанной: база сломала бы её внутри починки. */
export const BREAK_SLACK_MS = 5_000;

export const cellKey = (mapId: string, q: number, r: number): string => `${mapId}:${q},${r}`;

/** Ключ повтора клетки: аккаунт + клетка + отметка запаса из показанной цены (см. шапку). */
export const repairAllOp = (
  account: string,
  c: { mapId: string; q: number; r: number },
  seen: number,
) => `rep:${account}:all:${cellKey(c.mapId, c.q, c.r)}:${Math.trunc(seen)}`;

/** Сложить цены. */
export function addCost(into: RepairCost, cost: RepairCost): RepairCost {
  const out: RepairCost = { ...into };
  for (const res of MINE_V2_RESOURCES) {
    const n = cost[res] ?? 0;
    if (n > 0) out[res] = (out[res] ?? 0) + n;
  }
  return out;
}

/**
 * Разложить клетки: чинить / уже починено этим ключом / пропустить.
 * seen — отметки запаса из ответа с ценой (только при починке): чужая отметка —
 * шахту уже перечинили, второй раз не платим.
 */
export function planRepairAll(o: {
  rows: readonly RepairStateRow[];
  account: string;
  seesVoid: boolean;
  now: number;
  seen?: ReadonlyMap<string, number>;
  /** Чинить шахты с запасом ниже этой доли (ползунок); нет — REPAIR_ALL_BELOW. */
  below?: number;
}): RepairPlan {
  const below = o.below ?? REPAIR_ALL_BELOW;
  const plan: RepairPlan = { repair: [], again: [], skipped: [], total: {} };
  const rows = [...o.rows].sort(
    (a, b) =>
      a.map_id.localeCompare(b.map_id) || Number(a.q) - Number(b.q) || Number(a.r) - Number(b.r),
  );
  for (const x of rows) {
    const mapId = String(x.map_id);
    const q = Number(x.q);
    const r = Number(x.r);
    const skip = (reason: RepairSkip) => plan.skipped.push({ mapId, q, r, reason });
    const kind = x.v2 ? mineV2Of(x.cfg) : null;
    // Флаг клетки: база по нему требует «Базу» и одну починку навсегда; цена
    // острова — флаг вместе с картой острова (как у одной шахты, requireMineV2).
    const flag = x.island_flag ?? mineIslandOf(x.cfg);
    const island = flag && isIslandMapId(mapId);
    const mode: MineMode = flag ? "base" : mineMode(x.mode).id;
    const lifeAt = Number(x.life_at);
    const life = {
      mode: mineMode(x.mode).id,
      lifeLeft: Number(x.life_left) || 0,
      lifeAt: new Date(Number.isFinite(lifeAt) && lifeAt > 0 ? lifeAt : 0).toISOString(),
    };
    const item = (): RepairPlanItem | null =>
      kind
        ? {
            mapId,
            q,
            r,
            kind,
            mode,
            lifeNow: mineLifeNow(life, o.now),
            lifeAt,
            cost: mineRepairCost(kind, island),
            op: null,
          }
        : null;
    const key = cellKey(mapId, q, r);
    if (x.done) {
      const it = item();
      if (it) plan.again.push(it);
      else skip("not_owner");
      continue;
    }
    // Сломанная шахта ничья: строки владения нет — пропускаем как сломанную.
    if (!x.owner) {
      skip("broken");
      continue;
    }
    if (x.owner !== o.account || !kind) {
      skip("not_owner");
      continue;
    }
    if (o.seen && o.seen.get(key) !== lifeAt) {
      skip("changed");
      continue;
    }
    if (mineBreakAt(life) <= o.now + BREAK_SLACK_MS) {
      skip("broken");
      continue;
    }
    if (flag) {
      skip("island");
      continue;
    }
    if (x.void && !o.seesVoid) {
      skip("void");
      continue;
    }
    const it = item();
    if (!it) continue;
    if (it.lifeNow >= below) {
      skip("full");
      continue;
    }
    plan.repair.push(it);
    plan.total = addCost(plan.total, it.cost);
  }
  return plan;
}

/** Сколько не хватает до цены; всё есть — пустой объект. */
export function shortOf(total: RepairCost, have: ReadonlyMap<string, number>): RepairCost {
  const out: RepairCost = {};
  for (const res of MINE_V2_RESOURCES) {
    const need = total[res] ?? 0;
    const got = have.get(res) ?? 0;
    if (need > got) out[res] = need - Math.floor(got);
  }
  return out;
}
