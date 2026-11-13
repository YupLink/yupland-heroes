// Фейк базы для тестов основного инструмента (§8.24): герои (что в руках),
// рюкзаки, справочник товаров, ключи ударов, клетки карты и ключи копки.
//
// Операторы узнаются по тексту и исполняются по смыслу — как их выполнил бы
// Postgres под локом героя: удар (tool-wear hitSql) с гардом основного
// (mainOkModel — зеркало main-tool-sql mainOkSql; что SQL считает так же,
// сверено SELECT-ом на живой базе, см. main-tool-sql.test), откат, закрытие
// ключа, выбор основного, чтения; копка пустой земли — ground-dig.fake.
import { hitStack, undoHit } from "@/lib/raid/toolWear";
import { groundRun, resetGround } from "./ground-dig.fake";

export type { FakeCell } from "./ground-dig.fake";

type Stack = { count: number; wear: number };
type Op = {
  heroId: string;
  key: string;
  taken: number;
  undone: boolean;
  settled: boolean;
  at: number;
};
export const fx = {
  /** Герой → записанный основной (hero_instance.main_tool). */
  main: new Map<string, string | null>(),
  /** Герой → ключ стопки → стопка. */
  packs: new Map<string, Map<string, Stack>>(),
  /** Справочник: id товара → имя, лопата ли, «Износ за удар». */
  catalog: new Map<string, { name: string; shovel?: boolean; wear?: number | null }>(),
  /** Декор с инструментом: id товара-инструмента (канон). */
  decorTools: [] as string[],
  wearOps: new Map<string, Op>(),
  sql: [] as string[],
  clock: 0,
  /** Ответ этого оператора потеряется (применён, попытка — ошибка). */
  loseOn: null as string | null,
  /** Этот оператор применится, а ответ придёт пустым (мост: не JSON). */
  emptyOn: null as string | null,
  /** Этот оператор упадёт до записи. */
  failOn: null as string | null,
};

export function resetFx(): void {
  Object.assign(fx, {
    main: new Map(),
    packs: new Map(),
    catalog: new Map(),
    decorTools: [],
    wearOps: new Map(),
    sql: [],
    clock: 0,
    loseOn: null,
    emptyOn: null,
    failOn: null,
  });
  resetGround();
}

export const packOf = (hero: string): Map<string, Stack> => {
  if (!fx.packs.has(hero)) fx.packs.set(hero, new Map());
  return fx.packs.get(hero)!;
};
const idOf = (key: string) => key.slice(key.indexOf(":") + 1);
export const isShovel = (key: string | null | undefined): boolean =>
  !!key && fx.catalog.get(idOf(key))?.shovel === true;
const alive = (hero: string, key: string | null | undefined) =>
  !!key && (packOf(hero).get(key)?.count ?? 0) >= 1;

/** Зеркало mainOkSql: можно ли бить стопкой key как основным. */
export function mainOkModel(hero: string, key: string, need: "item" | "shovel"): boolean {
  const stored = fx.main.get(hero) ?? null;
  const same = stored === key;
  const storedShovel = isShovel(stored);
  const shovels = [...packOf(hero)].filter(([k, s]) => isShovel(k) && s.count >= 1).length;
  if (need === "item") {
    return same || (!alive(hero, stored) && (!storedShovel || shovels === 0 || isShovel(key)));
  }
  return isShovel(key) && (same || (!alive(hero, stored) && (storedShovel || shovels === 1)));
}

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
const row = (v: unknown) => [{ _row: v }];

function hit(sql: string): unknown[] {
  const op = pick(sql, /WHERE op = '([^']+)'/);
  const [hero, key] = [pick(sql, /b\.hero_id = '([^']+)'/), pick(sql, /b\.stack_key = '([^']+)'/)];
  const step = Number(pick(sql, /s\.wear \+ (\d+) >= 100/));
  // Гард лопаты начинается с «ключ удара — лопата», гард декора — с «записан он».
  const need = sql.includes("AND (EXISTS (SELECT 1 FROM yuplink.raid_custom_item mci")
    ? "shovel"
    : "item";
  const cur = fx.wearOps.get(op);
  const [was, dead] = [!!cur && !cur.undone, !!cur && cur.undone];
  const busy = [...fx.wearOps].some(
    ([k, o]) =>
      k !== op &&
      o.heroId === hero &&
      o.key === key &&
      !o.settled &&
      !o.undone &&
      fx.clock - o.at < 30_000,
  );
  const main = mainOkModel(hero, key, need);
  const have = alive(hero, key);
  const s = packOf(hero).get(key);
  const next = s && !was && !dead && !busy && main ? hitStack(s, step) : null;
  if (!s || !next) return row({ was, dead, hit: false, busy, main, have, adopted: false });
  Object.assign(s, { count: next.count, wear: next.wear });
  fx.wearOps.set(op, {
    heroId: hero,
    key,
    taken: next.taken,
    undone: false,
    settled: false,
    at: fx.clock,
  });
  const adopted = (fx.main.get(hero) ?? null) !== key;
  fx.main.set(hero, key);
  return row({ was, hit: true, busy, main, have, adopted });
}

function undo(sql: string): unknown[] {
  const op = pick(sql, /WHERE op = '([^']+)'/);
  const cur = fx.wearOps.get(op);
  if (!cur) {
    const [, hero, key] = /SELECT '[^']+', '([^']+)', '([^']+)', 0, true/.exec(sql) ?? [];
    fx.wearOps.set(op, { heroId: hero, key, taken: 0, undone: true, settled: false, at: fx.clock });
    return row({ flipped: false, back: false, tomb: true });
  }
  if (cur.undone || cur.settled) return row({ flipped: false, back: false, tomb: false });
  cur.undone = true;
  const s = packOf(cur.heroId).get(cur.key);
  if (s && cur.taken > 0) Object.assign(s, undoHit(s, cur.taken));
  return row({ flipped: true, back: !!s, tomb: false });
}

function toolState(sql: string): unknown[] {
  const hero = pick(sql, /hi\.id = '([^']+)'/);
  const key = fx.main.get(hero) ?? null;
  const stacks = [...packOf(hero)]
    .filter(([, s]) => s.count >= 1)
    .map(([stackKey, s]) => {
      const c = fx.catalog.get(idOf(stackKey));
      return {
        stackKey,
        count: s.count,
        wear: s.wear,
        shovel: c?.shovel === true,
        name: c?.name ?? stackKey,
        toolWear: c?.wear ?? null,
      };
    });
  return [{ mainKey: key, mainShovel: isShovel(key), stacks }];
}

function setMain(sql: string): unknown[] {
  const hero = pick(sql, /WHERE hi\.id = '([^']+)'/);
  const key = /SET main_tool = NULL/.test(sql) ? null : pick(sql, /SET main_tool = '([^']+)'/);
  const ok = key === null || alive(hero, key);
  if (ok) fx.main.set(hero, key);
  return row({ set: ok });
}

function run(sql: string): unknown[] {
  if (sql.includes("INSERT INTO yuplink.raid_tool_wear_op (op, hero_id, stack_key, taken, mob"))
    return hit(sql);
  if (sql.includes("tomb AS (")) return undo(sql);
  if (sql.includes("SET settled = true")) {
    const cur = fx.wearOps.get(pick(sql, /WHERE op = '([^']+)'/));
    if (cur) cur.settled = true;
    return [];
  }
  if (sql.includes('AS "mainKey"')) return toolState(sql);
  if (sql.includes("SELECT hi.main_tool AS key")) {
    const hero = pick(sql, /hi\.id = '([^']+)'/);
    const key = fx.main.get(hero) ?? null;
    return [{ key, shovel: isShovel(key) }];
  }
  if (sql.includes("SET main_tool =") && sql.includes("WITH upd AS")) return setMain(sql);
  const dug = groundRun(sql);
  if (dug) return dug;
  if (sql.includes("meta->'interact' AS interact")) {
    return fx.decorTools.map((toolId) => ({
      id: `decoration_${toolId}`,
      name: "Декор",
      interact: { on: true, cost: 3, itemId: "cst_wood", amount: "1", toolItemId: toolId },
      item_name: "Дерево",
      item_image: null,
      tools: fx.catalog.has(toolId)
        ? [
            {
              id: toolId,
              name: fx.catalog.get(toolId)?.name,
              image: null,
              wear: fx.catalog.get(toolId)?.wear ?? null,
            },
          ]
        : null,
    }));
  }
  return [];
}

/** mcpExec фейка: сбой до записи (failOn) и потерянный ответ (loseOn) — по метке оператора. */
export async function fakeExec(sql: string): Promise<unknown[]> {
  fx.sql.push(sql);
  await Promise.resolve();
  const tag = fx.failOn && sql.includes(fx.failOn) ? fx.failOn : null;
  if (tag) {
    fx.failOn = null;
    throw new Error("MCP timeout");
  }
  const out = run(sql);
  if (fx.emptyOn && sql.includes(fx.emptyOn)) {
    fx.emptyOn = null;
    return [];
  }
  if (fx.loseOn && sql.includes(fx.loseOn)) {
    fx.loseOn = null;
    throw new Error("MCP timeout");
  }
  return out;
}
