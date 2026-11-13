// Подмены для тестов укладки жилы (vein-place.test): игрок, рюкзак, журнал карты
// и модель оператора укладки (vein-place-sql) — ровно его смысл: повтор по ключу
// нажатия ничего не пишет, жила ложится только на годную клетку без жилы, штука
// уходит вместе с жилой, ключ пишется тем же «коммитом». Текст оператора
// проверяет vein-place-sql.test; здесь — что ручка делает с его ответами.
// В тесте: vi.mock("<модуль>", async () => (await import("./vein.fake")).<имя>).
import { VEIN_REFUSALS, type VeinRefusal } from "@/lib/veinPlace";
import { factCol } from "./vein-rules-sql";

type Vein = { kind: string; rot: number };
type Op = { mapId: string; q: number; r: number; kind: string; rot: number };

const fresh = () => ({
  mapId: "rmap_1",
  pos: { q: 0, r: 0 },
  hero: "hero_1" as string | null,
  /** Стопки рюкзака героя: ключ → штук. */
  stacks: new Map<string, number>([["vein:gold", 3]]),
  /** Клетки карты: «q,r» → признаки, что мешают (нет записи — клетки нет). */
  cells: new Map<string, Partial<Record<VeinRefusal, boolean>>>(),
  veins: new Map<string, Vein>(),
  ops: new Map<string, Op>(),
  /** Оператор закоммитился, а ответ потерялся (мост бросил ошибку). */
  commitThenLose: false,
  placeCalls: 0,
  /** Что ушло в журнал карты (recordMapChange). */
  changes: [] as Array<{ mapId: string; change: unknown }>,
});

export const s = fresh();
export const resetFake = (): void => void Object.assign(s, fresh());

export const startFn = {
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) =>
        h({ data: check ? check(a.data) : a.data }),
    };
    return fn;
  },
};
export const actor = {
  pchestActor: async () => ({ wallet: "w_me", account: "acc_me", mapId: s.mapId }),
};
export const where = {
  playerCell: async () => s.pos,
  // Главный мир (vein-main) — «Мир Альфа».
  activeBetaMapId: async () => "rmap_UthOURxc",
};
export const backpack = {
  resolveBackpack: async () => (s.hero ? { heroId: s.hero, capacity: 10 } : null),
};
export const journal = {
  recordMapChange: async (mapId: string, change: unknown) => {
    s.changes.push({ mapId, change });
    return s.changes.length;
  },
};

const str = (sql: string, re: RegExp): string => re.exec(sql)?.[1] ?? "";

/** Модель оператора укладки: смысл vein-place-sql над состоянием s. */
function place(sql: string): unknown[] {
  s.placeCalls++;
  const op = str(sql, /raid_vein_place_op WHERE op = '([^']+)'/);
  const hero = str(sql, /b\.hero_id = '([^']+)'/);
  const stack = str(sql, /b\.stack_key = '([^']+)'/);
  const m = /SELECT '([^']+)', (-?\d+), (-?\d+), '(gold|diamonds)', (\d+), '[^']+' FROM go/.exec(
    sql,
  );
  if (!m) throw new Error("не оператор укладки");
  const [mapId, q, r, kind, rot] = [m[1], Number(m[2]), Number(m[3]), m[4], Number(m[5])];
  const key = `${q},${r}`;
  const was = s.ops.has(op);
  const count = hero === s.hero ? (s.stacks.get(stack) ?? 0) : 0;
  const cell = s.cells.get(key);
  const facts: Record<string, boolean> = {};
  for (const k of VEIN_REFUSALS) facts[factCol(k)] = false;
  if (!cell) facts[factCol("vein.no_cell")] = true;
  else for (const k of VEIN_REFUSALS) facts[factCol(k)] = cell[k] === true;
  if (s.veins.has(key)) facts[factCol("vein.taken")] = true;
  const ok = Object.values(facts).every((v) => !v);
  const placed = !was && count >= 1 && ok;
  if (placed) {
    s.veins.set(key, { kind, rot });
    if (count > 1) s.stacks.set(stack, count - 1);
    else s.stacks.delete(stack);
    s.ops.set(op, { mapId, q, r, kind, rot });
  }
  if (s.commitThenLose) {
    s.commitThenLose = false;
    throw new Error("socket hang up");
  }
  const row = { was, placed, box: count >= 1, rot: placed ? rot : null, ok, ...facts };
  return [{ _row: row }];
}

export const mcp = {
  mcpExec: async (sql: string) => {
    if (sql.includes("INSERT INTO yuplink.raid_map_vein")) return place(sql);
    // Главный мир (vein-main): у фейка — «Мир Альфа».
    if (sql.includes("s.key = 'beta_raid_map'")) return [{ id: "rmap_UthOURxc" }];
    if (sql.includes("FROM yuplink.raid_vein_place_op")) {
      const row = s.ops.get(str(sql, /WHERE op = '([^']+)'/));
      return row ? [{ map_id: row.mapId, q: row.q, r: row.r, kind: row.kind, rot: row.rot }] : [];
    }
    throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
  },
};

export type PlaceFn = (a: {
  data: { stackKey: string; q: number; r: number; op: string };
}) => Promise<{ ok: true; q: number; r: number }>;
